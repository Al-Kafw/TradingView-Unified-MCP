import { ToolError, checkAbort } from '../core/errors.mjs';
import { O, S, B } from '../core/schema.mjs';
import { sha256 } from '../core/security.mjs';

/** Browser-only, fixed request adapter. API shapes are documented in
 * FerroxLabs/tvcontrol a8d3dfc97621e22b8b7c71e617b134c5e35882ee
 * src/core/watchlist.js. No credential loader or upstream module is imported.
 * See THIRD_PARTY_NOTICES.md. Rename/delete endpoints are deliberately absent.
 */
export async function watchlistPage(a) {
  const fail = (code, message, details = {}) => ({ ok: false, code, message, ...details });
  const operations = ['list', 'active', 'get', 'create', 'append', 'remove'];
  if (!operations.includes(a.op)) return fail('INVALID_ARGUMENT', 'Unsupported watchlist operation.');
  const hasId = ['get', 'append', 'remove'].includes(a.op);
  if (hasId && (typeof a.watchlist_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(a.watchlist_id))) {
    return fail('INVALID_ARGUMENT', 'An exact, valid watchlist ID is required.');
  }
  const isWrite = ['create', 'append', 'remove'].includes(a.op);
  const endpoint = a.op === 'active' ? 'active/'
    : a.op === 'list' || a.op === 'create' ? 'custom/'
      : `custom/${encodeURIComponent(a.watchlist_id)}/${a.op === 'get' ? '' : a.op + '/'}`;
  const normalize = row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('UNEXPECTED_WATCHLIST_SHAPE');
    if ((typeof row.id !== 'string' && !Number.isSafeInteger(row.id)) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(row.id))) throw new Error('UNEXPECTED_WATCHLIST_ID');
    if (typeof row.name !== 'string' || row.name.length > 1000 || !Array.isArray(row.symbols) || row.symbols.length > 10000) throw new Error('UNEXPECTED_WATCHLIST_SHAPE');
    if (!row.symbols.every(v => typeof v === 'string' && v.length <= 500 && !/[\u0000-\u001f]/.test(v))) throw new Error('UNEXPECTED_WATCHLIST_ENTRIES');
    const entries = [...row.symbols];
    return { watchlist_id: String(row.id), name: row.name, entries,
      entry_count: entries.length, symbol_count: entries.filter(v => !v.startsWith('###')).length,
      sections: entries.flatMap((v, index) => v.startsWith('###') ? [{ name: v.slice(3), entry: v, index }] : []) };
  };
  try {
    // `fetch` is the lexical, destination-checked browser wrapper supplied by
    // BrowserManager. Authentication remains managed by the logged-in page.
    const response = await fetch('https://www.tradingview.com/api/v1/symbols_list/' + endpoint, {
      method: isWrite ? 'POST' : 'GET', cache: 'no-store', redirect: 'error',
      ...(isWrite ? { headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a.op === 'create' ? { name: a.name, symbols: a.entries } : a.entries) } : {}),
    });
    if (!response.ok) return fail(response.status === 401 || response.status === 403 ? 'SESSION_UNAVAILABLE' : 'WATCHLIST_HTTP_ERROR',
      'TradingView did not accept the watchlist request.', { status: response.status, mutation_attempted: isWrite });
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) return fail('PAYLOAD_LIMIT', 'Watchlist response exceeds the supported limit.', { mutation_attempted: isWrite });
    let body;
    try { body = text ? JSON.parse(text) : null; } catch {
      return fail('ADAPTER_MISMATCH', 'TradingView returned a non-JSON watchlist response.', { mutation_attempted: isWrite });
    }
    if (body?.s === 'error' || body?.success === false || body?.ok === false || body?.error) {
      return fail('WATCHLIST_API_ERROR', 'TradingView returned an error envelope.', { mutation_attempted: isWrite });
    }
    if (a.op === 'list') {
      if (!Array.isArray(body) || body.length > 5000) return fail('ADAPTER_MISMATCH', 'Watchlist listing has an unexpected shape or size.');
      const lists = body.map(normalize);
      const seen = new Set();
      if (lists.some(row => seen.has(row.watchlist_id) || !seen.add(row.watchlist_id))) return fail('ADAPTER_MISMATCH', 'Watchlist listing contains duplicate IDs.');
      return { ok: true, lists };
    }
    if (a.op === 'append' || a.op === 'remove') return { ok: true, submitted: true, watchlist_id: a.watchlist_id };
    const list = normalize(body);
    if (a.op === 'get' && list.watchlist_id !== a.watchlist_id) return fail('WATCHLIST_ID_MISMATCH', 'TradingView returned a different watchlist than requested.');
    return { ok: true, ...list };
  } catch {
    return fail('WATCHLIST_ADAPTER_ERROR', 'The browser watchlist request failed or returned an unsupported shape.', { mutation_attempted: isWrite, reconcile_before_retry: isWrite });
  }
}

const id = { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$', description: 'Exact custom watchlist ID from watchlist_list; names are not IDs.' };
const entry = { type: 'string', minLength: 1, maxLength: 200, description: 'Exact exchange-qualified symbol, or a ###section header. Bare tickers are refused.' };
const entriesSchema = (min = 0) => ({ type: 'array', items: entry, minItems: min, maxItems: 2000 });
const operationKey = { type: 'string', minLength: 1, maxLength: 128, description: 'Unique durable request key. Reuse only to reconcile the same request.' };
const hashSchema = { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Optional optimistic concurrency guard from watchlist_get.' };
const timeout = { type: 'integer', minimum: 1000, maximum: 30000, default: 10000 };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function normalizeWatchlistEntries(values, { allowEmpty = true } = {}) {
  if (!Array.isArray(values) || values.length > 2000 || (!allowEmpty && values.length === 0)) throw new ToolError('INVALID_ARGUMENT', 'Expected a bounded, nonempty list of entries.');
  for (const value of values) {
    if (typeof value !== 'string' || value.length > 200 || value !== value.trim() || value.includes('://') || /[\u0000-\u001f]/.test(value) ||
        !(value.startsWith('###') ? value.length > 3 : /^[A-Za-z0-9_-]+:[A-Za-z0-9_.$^=+!\/-]+$/.test(value))) {
      throw new ToolError('INVALID_ARGUMENT', 'Use exact exchange-qualified symbols or nonempty ###section headers; URL, bare ticker and control-character values are refused.');
    }
  }
  const symbols = values.filter(v => !v.startsWith('###'));
  if (new Set(symbols).size !== symbols.length) throw new ToolError('DUPLICATE_SYMBOL', 'A requested watchlist cannot contain the same instrument more than once.');
  return [...values];
}

async function call(ctx, op, args = {}) {
  const result = await ctx.callPage(watchlistPage, { ...args, op });
  if (!result?.ok) throw new ToolError(result?.code ?? 'WATCHLIST_ADAPTER_ERROR', result?.message ?? 'Watchlist operation returned no usable result.', result);
  return result;
}

function view(row) {
  return { watchlist_id: row.watchlist_id, name: row.name, entries: row.entries,
    entry_count: row.entry_count, symbol_count: row.symbol_count, sections: row.sections,
    entries_sha256: sha256(row.entries), source: 'tradingview_symbols_list_api' };
}

async function get(ctx, watchlistId) { return call(ctx, 'get', { watchlist_id: watchlistId }); }

function precondition(before, args) {
  if (args.expected_entries_sha256 && sha256(before.entries) !== args.expected_entries_sha256) {
    throw new ToolError('WATCHLIST_CHANGED', 'The watchlist differs from the supplied entries fingerprint; no change was submitted.',
      { watchlist_id: before.watchlist_id, actual_entries_sha256: sha256(before.entries) });
  }
}

async function stableBefore(ctx, before) {
  const current = await get(ctx, before.watchlist_id);
  if (current.name !== before.name || !same(current.entries, before.entries)) throw new ToolError('WATCHLIST_CHANGED', 'The watchlist changed during preflight; no further change was submitted.',
    { watchlist_id: before.watchlist_id, actual_entries_sha256: sha256(current.entries) });
  await ctx.assertLayout();
}

async function verify(ctx, before, expected, timeoutMs = 10000) {
  try {
    return await ctx.poll(() => get(ctx, before.watchlist_id), row => row.name === before.name && same(row.entries, expected),
      { timeoutMs, intervalMs: 300, description: 'watchlist membership, name and exact order read-back' });
  } catch (error) {
    if (ctx.signal?.aborted || error.code === 'CANCELLED') throw error;
    throw new ToolError('WATCHLIST_VERIFICATION_FAILED', 'A submitted watchlist change was not independently verified. Reconcile before retrying.',
      { watchlist_id: before.watchlist_id, expected_entries_sha256: sha256(expected), mutation_attempted: true, last_observation: error.details?.last_observation });
  }
}

export async function changeWatchlistEntries(args, ctx, operation) {
  const wanted = normalizeWatchlistEntries(args.entries, { allowEmpty: false });
  const before = await get(ctx, args.watchlist_id); precondition(before, args);
  const stored = new Set(before.entries);
  const requested = [...new Set(wanted)];
  if (operation === 'remove') {
    const missing = requested.filter(v => !stored.has(v));
    if (missing.length) throw new ToolError('ENTRY_NOT_FOUND', 'Every requested entry must already exist; no entries were removed.', { missing });
  }
  const changed = operation === 'append' ? requested.filter(v => !stored.has(v)) : requested;
  const expected = operation === 'append' ? [...before.entries, ...changed] : before.entries.filter(v => !changed.includes(v));
  if (!changed.length) return { ...view(before), changed: false, verified: true, already_present: requested };
  await stableBefore(ctx, before);
  await call(ctx, operation, { watchlist_id: before.watchlist_id, entries: changed });
  const after = await verify(ctx, before, expected, args.timeout_ms);
  return { ...view(after), changed: true, verified: true, added: operation === 'append' ? changed : [], removed: operation === 'remove' ? changed : [],
    before_entries_sha256: sha256(before.entries) };
}

export async function createWatchlist(args, ctx) {
  if (typeof args.idempotency_key !== 'string' || !args.idempotency_key) throw new ToolError('IDEMPOTENCY_KEY_REQUIRED', 'Creation requires a durable idempotency key.');
  const name = args.name?.trim();
  if (!name || name.length > 200) throw new ToolError('INVALID_ARGUMENT', 'A nonempty watchlist name up to 200 characters is required.');
  const entries = normalizeWatchlistEntries(args.entries ?? []);
  const key = 'watchlist-create-' + sha256(args.idempotency_key);
  const requestHash = sha256({ name, entries });
  const prior = await ctx.loadCheckpoint(key);
  if (prior && prior.request_hash !== requestHash) throw new ToolError('IDEMPOTENCY_CONFLICT', 'This key belongs to another watchlist creation request.');
  if (prior?.watchlist_id) {
    const current = await get(ctx, prior.watchlist_id);
    if (current.name !== name || !same(current.entries, entries)) throw new ToolError('IDEMPOTENCY_STATE_CHANGED', 'The previously created list no longer matches this request. No new list was created.', { watchlist_id: prior.watchlist_id });
    return { ...view(current), replayed: true, verified: true, independently_created: true };
  }
  if (prior) throw new ToolError('UNCERTAIN_MUTATION', 'A create request with this key was already submitted. Inspect watchlist_list before retrying; a duplicate was not created.', { idempotency_key_hash: sha256(args.idempotency_key) });
  const before = await call(ctx, 'list');
  if (before.lists.some(row => row.name === name)) throw new ToolError('DUPLICATE_NAME', 'A watchlist with this exact name already exists. Use its ID or choose another name.');
  const oldIds = before.lists.map(row => row.watchlist_id);
  await ctx.assertLayout();
  const checkpoint = { request_hash: requestHash, known_ids: oldIds, name, desired_entries: entries };
  await ctx.checkpoint(key, { ...checkpoint, stage: 'submitted' });
  const created = await call(ctx, 'create', { name, entries });
  if (oldIds.includes(created.watchlist_id)) throw new ToolError('WATCHLIST_ID_REUSED', 'The create response returned an existing ID; an independent list was not established.', { watchlist_id: created.watchlist_id });
  await ctx.checkpoint(key, { ...checkpoint, stage: 'created', watchlist_id: created.watchlist_id });
  const checked = await verify(ctx, { watchlist_id: created.watchlist_id, name }, entries, args.timeout_ms);
  await ctx.poll(() => call(ctx, 'list'), listing => listing.lists.some(row => row.watchlist_id === created.watchlist_id && row.name === name),
    { timeoutMs: args.timeout_ms ?? 10000, intervalMs: 300, description: 'new watchlist ID in independent account listing' });
  await ctx.checkpoint(key, { ...checkpoint, stage: 'verified', watchlist_id: created.watchlist_id });
  return { ...view(checked), verified: true, independently_created: true };
}

function sameMultiset(a, b) {
  const count = values => { const map = new Map(); for (const v of values) map.set(v, (map.get(v) ?? 0) + 1); return map; };
  const left = count(a), right = count(b);
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

/** Reordering uses only the observed remove/append operations. There is a
 * temporary empty-list interval. Durable stages prevent blind resubmission
 * after interruption; failures return an explicit uncertain/partial outcome.
 */
export async function replaceWatchlistEntries(args, ctx, { reorderOnly = false } = {}) {
  if (typeof args.idempotency_key !== 'string' || !args.idempotency_key) throw new ToolError('IDEMPOTENCY_KEY_REQUIRED', 'Replacement/reorder requires a durable idempotency key.');
  const entries = normalizeWatchlistEntries(args.entries);
  const key = 'watchlist-replace-' + sha256(args.idempotency_key);
  const requestHash = sha256({ watchlist_id: args.watchlist_id, entries, reorderOnly });
  const prior = await ctx.loadCheckpoint(key);
  if (prior && prior.request_hash !== requestHash) throw new ToolError('IDEMPOTENCY_CONFLICT', 'This key belongs to a different watchlist replacement request.');
  const before = await get(ctx, args.watchlist_id);
  if (prior) {
    if (before.name === prior.name && same(before.entries, entries)) {
      await ctx.checkpoint(key, { ...prior, stage: 'verified' });
      return { ...view(before), replayed: true, recovered: prior.stage !== 'verified', verified: true, checkpoint_key: key };
    }
    throw new ToolError(prior.stage === 'verified' ? 'IDEMPOTENCY_STATE_CHANGED' : 'UNCERTAIN_MUTATION',
      'A replacement with this key was already attempted. No more writes were sent. Inspect the current list and saved checkpoint before making a new request.',
      { watchlist_id: before.watchlist_id, current_entries_sha256: sha256(before.entries), checkpoint_key: key, stage: prior.stage, partial_change_possible: true });
  }
  precondition(before, args);
  if (reorderOnly && !sameMultiset(before.entries, entries)) throw new ToolError('REORDER_MEMBERSHIP_MISMATCH', 'Reorder must preserve every current symbol and section header, including duplicate headers. No changes were submitted.');
  if (same(before.entries, entries)) return { ...view(before), changed: false, verified: true, exact_order_verified: true };
  if (before.entries.length > 2000) throw new ToolError('LIMIT_EXCEEDED', 'This watchlist exceeds the supported replacement size. No changes were submitted.');
  const checkpoint = { request_hash: requestHash, watchlist_id: before.watchlist_id, name: before.name, before_entries: before.entries, desired_entries: entries };
  await stableBefore(ctx, before);
  await ctx.checkpoint(key, { ...checkpoint, stage: 'prepared' });
  let phase = 'prepared';
  try {
    if (before.entries.length) {
      phase = 'clear_submitted'; await ctx.checkpoint(key, { ...checkpoint, stage: phase });
      await call(ctx, 'remove', { watchlist_id: before.watchlist_id, entries: [...new Set(before.entries)] });
      await verify(ctx, before, [], args.timeout_ms);
    }
    phase = 'cleared'; await ctx.checkpoint(key, { ...checkpoint, stage: phase });
    if (entries.length) {
      checkAbort(ctx.signal); await ctx.assertLayout();
      const empty = await get(ctx, before.watchlist_id);
      if (empty.name !== before.name || empty.entries.length !== 0) throw new ToolError('WATCHLIST_CHANGED', 'The list changed after clearing; append was not submitted.');
      phase = 'append_submitted'; await ctx.checkpoint(key, { ...checkpoint, stage: phase });
      await call(ctx, 'append', { watchlist_id: before.watchlist_id, entries });
    }
    const after = await verify(ctx, before, entries, args.timeout_ms);
    await ctx.checkpoint(key, { ...checkpoint, stage: 'verified' });
    return { ...view(after), changed: true, verified: true, exact_order_verified: true, checkpoint_key: key,
      before_entries_sha256: sha256(before.entries), replacement_method: 'verified_remove_then_append', temporary_empty_list: before.entries.length > 0 };
  } catch (error) {
    // Preserve the existing stage if writing the diagnostic checkpoint fails.
    await ctx.checkpoint(key, { ...checkpoint, stage: phase, last_error_code: error.code ?? 'UNKNOWN' }).catch(() => {});
    throw new ToolError(ctx.signal?.aborted || error.code === 'CANCELLED' ? 'CANCELLED' : 'WATCHLIST_REPLACEMENT_INCOMPLETE',
      'Watchlist replacement may be partial. It was not automatically retried or rolled back. Reconcile the current list with the saved before/desired checkpoint.',
      { watchlist_id: before.watchlist_id, checkpoint_key: key, stage: phase, cause_code: error.code ?? 'UNKNOWN', partial_change_possible: true });
  }
}

export function watchlistImportPlan(before, incoming, mode) {
  const requested = normalizeWatchlistEntries(incoming);
  const current = new Set(before.entries);
  const additions = [...new Set(requested)].filter(v => !current.has(v));
  const expected = mode === 'replace' ? requested : [...before.entries, ...additions];
  return { watchlist_id: before.watchlist_id, mode, before_entries_sha256: sha256(before.entries),
    desired_entries_sha256: sha256(expected), requested_count: requested.length,
    added: mode === 'replace' ? requested.filter(v => !current.has(v)) : additions,
    removed: mode === 'replace' ? before.entries.filter(v => !requested.includes(v)) : [],
    already_present: [...new Set(requested)].filter(v => current.has(v)), changed: !same(before.entries, expected),
    exact_order: mode === 'replace' ? 'requested order after verified clear-and-append' : 'existing order retained; missing entries appended',
    desired_entries: expected, temporary_empty_list: mode === 'replace' && before.entries.length > 0 && !same(before.entries, expected) };
}

const modifyProperties = { watchlist_id: id, expected_entries_sha256: hashSchema, timeout_ms: timeout };
const listTools = [
  { name: 'watchlist_list', description: 'List custom watchlists by exact ID with counts and duplicate-name diagnostics. Does not choose a list by name.', inputSchema: O(), mutates: false,
    handler: async (_a, c) => { const data = await call(c, 'list'); const counts = new Map(); for (const row of data.lists) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
      return { count: data.lists.length, lists: data.lists.map(({ entries, sections, ...row }) => ({ ...row, section_count: sections.length, entries_sha256: sha256(entries) })),
        duplicate_names: [...counts].filter(([, count]) => count > 1).map(([name]) => name) }; } },
  { name: 'watchlist_get', description: 'Read every stored symbol and section in exact order from one custom watchlist ID, including a concurrency fingerprint.', inputSchema: O({ watchlist_id: id }, ['watchlist_id']), mutates: false, handler: async (a, c) => view(await get(c, a.watchlist_id)) },
  { name: 'watchlist_get_active', description: 'Read the API-designated active watchlist. It may differ from the currently rendered sidebar; use exact IDs for mutations.', inputSchema: O(), mutates: false, handler: async (_a, c) => ({ ...view(await call(c, 'active')), active_source: 'TradingView symbols_list API; visible sidebar selection not verified' }) },
  { name: 'watchlist_create', description: 'Create an independent named custom watchlist; verify its new ID, exact entries/order and account listing. Uses durable idempotency and refuses duplicate names.', inputSchema: O({ name: S('New custom watchlist name', 200), entries: entriesSchema(), idempotency_key: operationKey, timeout_ms: timeout }, ['name', 'idempotency_key']), mutates: true, handler: createWatchlist },
  { name: 'watchlist_add', description: 'Append one exact symbol or section to a named watchlist ID; independently verify membership, name and order.', inputSchema: O({ ...modifyProperties, entry }, ['watchlist_id', 'entry']), mutates: true, idempotent: true, handler: (a, c) => changeWatchlistEntries({ ...a, entries: [a.entry] }, c, 'append') },
  { name: 'watchlist_add_bulk', description: 'Append missing exact symbols/sections in order; independently verify the complete resulting watchlist.', inputSchema: O({ ...modifyProperties, entries: entriesSchema(1) }, ['watchlist_id', 'entries']), mutates: true, idempotent: true, handler: (a, c) => changeWatchlistEntries(a, c, 'append') },
  { name: 'watchlist_remove', description: 'Remove one exact stored entry from a named watchlist ID and verify the remaining order. Refuses a missing entry.', inputSchema: O({ ...modifyProperties, entry }, ['watchlist_id', 'entry']), mutates: true, destructive: true, handler: (a, c) => changeWatchlistEntries({ ...a, entries: [a.entry] }, c, 'remove') },
  { name: 'watchlist_remove_bulk', description: 'Preflight every requested entry, remove exact matches, then independently verify absence and remaining order.', inputSchema: O({ ...modifyProperties, entries: entriesSchema(1) }, ['watchlist_id', 'entries']), mutates: true, destructive: true, handler: (a, c) => changeWatchlistEntries(a, c, 'remove') },
  { name: 'watchlist_set_entries', description: 'Replace watchlist content/order using known remove then append endpoints. Temporarily empties the list; durable checkpoints and exact read-back expose partial failure.', inputSchema: O({ ...modifyProperties, entries: entriesSchema(), idempotency_key: operationKey }, ['watchlist_id', 'entries', 'idempotency_key']), mutates: true, destructive: true, handler: replaceWatchlistEntries },
  { name: 'watchlist_reorder', description: 'Reorder exactly the same symbols and section headers by verified clear-and-append, preserving the list ID/name. Temporarily empties the list; no guessed reorder endpoint.', inputSchema: O({ ...modifyProperties, entries: entriesSchema(), idempotency_key: operationKey }, ['watchlist_id', 'entries', 'idempotency_key']), mutates: true, destructive: true, handler: (a, c) => replaceWatchlistEntries(a, c, { reorderOnly: true }) },
  { name: 'watchlist_import_preview', description: 'Show membership/order changes for an import without writing. Merge appends missing entries; replace rebuilds exact requested order.', inputSchema: O({ watchlist_id: id, entries: entriesSchema(), mode: { type: 'string', enum: ['merge', 'replace'], default: 'merge' } }, ['watchlist_id', 'entries']), mutates: false,
    handler: async (a, c) => ({ ...watchlistImportPlan(await get(c, a.watchlist_id), a.entries, a.mode ?? 'merge'), dry_run: true }) },
  { name: 'watchlist_import', description: 'Import explicit entries without reading arbitrary local files. Merge appends missing entries; replace requires an idempotency key and verifies full requested order after clear-and-append.', inputSchema: O({ ...modifyProperties, entries: entriesSchema(), mode: { type: 'string', enum: ['merge', 'replace'], default: 'merge' }, dry_run: B('Calculate changes without writing'), idempotency_key: operationKey }, ['watchlist_id', 'entries']), mutates: true,
    handler: async (a, c) => { const before = await get(c, a.watchlist_id); precondition(before, a); const plan = watchlistImportPlan(before, a.entries, a.mode ?? 'merge');
      if (a.dry_run) return { ...plan, dry_run: true };
      const guarded = { ...a, expected_entries_sha256: sha256(before.entries) };
      if (a.mode === 'replace') return replaceWatchlistEntries(guarded, c);
      if (!plan.added.length) return { ...view(before), verified: true, changed: false, mode: 'merge', order_policy: plan.exact_order };
      return { ...await changeWatchlistEntries({ ...guarded, entries: plan.added }, c, 'append'), mode: 'merge', order_policy: plan.exact_order }; } },
  { name: 'watchlist_export', description: 'Export exact watchlist entries/section order as JSON or CSV through the safe local artifact store. No account session state is read or exported.', inputSchema: O({ watchlist_id: id, format: { type: 'string', enum: ['json', 'csv'], default: 'json' } }, ['watchlist_id']), mutates: false,
    handler: async (a, c) => { const data = view(await get(c, a.watchlist_id)); const name = 'watchlist-' + data.watchlist_id;
      const artifact = a.format === 'csv' ? await c.exportCsv(name, data.entries.map((value, index) => ({ index, kind: value.startsWith('###') ? 'section' : 'symbol', entry: value })))
        : await c.exportJson(name, { schema_version: 2, exported_at: new Date().toISOString(), ...data });
      return { watchlist_id: data.watchlist_id, name: data.name, entry_count: data.entry_count, entries_sha256: data.entries_sha256, artifact }; } },
  { name: 'watchlist_reconcile', description: 'Read a durable create/replace checkpoint and compare it with current account state. Exposes recovery entries but never resumes, retries or rolls back a mutation.', inputSchema: O({ operation: { type: 'string', enum: ['create', 'replace'] }, idempotency_key: operationKey }, ['operation', 'idempotency_key']), mutates: false,
    handler: async (a, c) => { const key = 'watchlist-' + a.operation + '-' + sha256(a.idempotency_key); const checkpoint = await c.loadCheckpoint(key);
      if (!checkpoint) return { found: false, changed: false };
      if (!checkpoint.watchlist_id) { const listing = await call(c, 'list'); const fresh = listing.lists.filter(row => !(checkpoint.known_ids ?? []).includes(row.watchlist_id));
        return { found: true, changed: false, stage: checkpoint.stage, matching_candidate_ids: fresh.filter(row => row.name === checkpoint.name && same(row.entries, checkpoint.desired_entries)).map(row => row.watchlist_id),
          candidate_ownership_verified: false, note: 'Matching new lists may have been created concurrently. No candidate was adopted or modified.' }; }
      const current = await get(c, checkpoint.watchlist_id); const matchesDesired = current.name === checkpoint.name && same(current.entries, checkpoint.desired_entries);
      const matchesBefore = current.name === checkpoint.name && Array.isArray(checkpoint.before_entries) && same(current.entries, checkpoint.before_entries);
      return { found: true, changed: false, stage: checkpoint.stage, checkpoint_key: key, current: view(current),
        state: matchesDesired ? 'matches_desired' : matchesBefore ? 'matches_before' : 'partial_or_changed', before_entries: checkpoint.before_entries, desired_entries: checkpoint.desired_entries }; } },
];

export default listTools;
