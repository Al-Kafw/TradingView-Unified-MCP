import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import watchlistTools, { watchlistPage, createWatchlist, changeWatchlistEntries, replaceWatchlistEntries, normalizeWatchlistEntries } from '../src/features/watchlists.mjs';
import { assertFixedFunction, sha256 } from '../src/core/security.mjs';
import { ToolError } from '../src/core/errors.mjs';
import { validate } from '../src/core/schema.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
function fixture(initial = ['###Technology', 'NASDAQ:AAPL', 'NASDAQ:MSFT'], options = {}) {
  const lists = new Map([['7', { id: 7, name: 'Research', symbols: [...initial] }], ['8', { id: 8, name: 'Other', symbols: ['NYSE:IBM'] }]]);
  const requests = [], checkpoints = new Map(), artifacts = [];
  let nextId = 20;
  const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
  const fetch = async (address, init = {}) => {
    const url = new URL(address);
    assert.equal(url.origin, 'https://www.tradingview.com');
    assert.ok(url.pathname.startsWith('/api/v1/symbols_list/'));
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(Object.keys(init.headers ?? {}).some(k => /cookie|authorization/i.test(k)), false);
    const route = url.pathname.slice('/api/v1/symbols_list/'.length);
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    requests.push({ route, method: init.method, body });
    if (options.rejectHttp) return json({ detail: 'dummy-auth-error' }, 403);
    if (options.errorEnvelope) return json({ s: 'error', arbitrary_secret: 'should-not-return' });
    if (route === 'active/') return json(lists.get('8'));
    if (route === 'custom/' && init.method === 'GET') return json([...lists.values()]);
    if (route === 'custom/' && init.method === 'POST') {
      assert.equal(Array.isArray(body), false); assert.ok(Array.isArray(body.symbols));
      const row = { id: nextId++, name: body.name, symbols: [...body.symbols] }; lists.set(String(row.id), row);
      if (options.failCreateAfterWrite) throw new Error('response lost after submission');
      return json(row);
    }
    const match = route.match(/^custom\/([A-Za-z0-9_-]+)\/(?:(append|remove)\/)?$/);
    if (!match) throw new Error('Unexpected endpoint: ' + route);
    const row = lists.get(match[1]); if (!row) return json({}, 404);
    if (init.method === 'GET') return json(options.wrongReadId ? { ...row, id: 8 } : row);
    assert.ok(Array.isArray(body), 'append/remove payload must be a bare array');
    if (match[2] === 'append') {
      if (!options.ignoreAppend) row.symbols.push(...body);
      if (options.failAppendAfterWrite) throw new Error('append response lost');
    } else if (match[2] === 'remove') {
      if (!options.ignoreRemove) row.symbols = row.symbols.filter(v => !body.includes(v));
      if (options.failRemoveAfterWrite) throw new Error('remove response lost');
    } else throw new Error('No mutation endpoint');
    return json(row);
  };
  const realm = vm.createContext({ fetch, URL, Date, setTimeout, clearTimeout });
  const ctx = {
    expectedLayoutId: 'layout-A', targetId: 'tab-A', signal: new AbortController().signal,
    assertLayout: async () => { if (options.layoutMismatch) throw new ToolError('LAYOUT_MISMATCH', 'wrong layout'); },
    callPage: async (fn, args) => { assertFixedFunction(fn); realm.args = plain(args); return plain(await vm.runInContext(`(${fn.toString()})(args)`, realm)); },
    poll: async (read, accept) => { let last; for (let i = 0; i < 3; i++) { last = await read(); if (await accept(last)) return last; } throw new ToolError('VERIFICATION_TIMEOUT', 'fixture poll exhausted', { last_observation: last }); },
    checkpoint: async (key, value) => { if (options.failCheckpoint) throw new Error('disk full'); checkpoints.set(key, plain(value)); },
    loadCheckpoint: async key => checkpoints.has(key) ? plain(checkpoints.get(key)) : null,
    exportJson: async (name, data) => { artifacts.push({ name, data: plain(data), format: 'json' }); return { format: 'json', path: '/safe/fake.json' }; },
    exportCsv: async (name, data) => { artifacts.push({ name, data: plain(data), format: 'csv' }); return { format: 'csv', path: '/safe/fake.csv' }; },
  };
  const run = async (name, args = {}) => { const tool = watchlistTools.find(t => t.name === name); validate(tool.inputSchema, args); return tool.handler(args, ctx); };
  return { ctx, lists, requests, checkpoints, artifacts, run, options };
}

test('watchlist page adapter passes the fixed-code gate; no raw-code or arbitrary path inputs', () => {
  assert.equal(typeof assertFixedFunction(watchlistPage), 'string');
  assert.equal(new Set(watchlistTools.map(t => t.name)).size, watchlistTools.length);
  assert.equal(watchlistTools.some(t => /rename|delete/.test(t.name)), false);
  for (const tool of watchlistTools) assert.equal(tool.inputSchema.additionalProperties, false);
});

test('exact custom ID is independent of API active selection; sections/order are preserved', async () => {
  const f = fixture(); const result = await f.run('watchlist_get', { watchlist_id: '7' });
  assert.equal(result.name, 'Research'); assert.equal(result.symbol_count, 2);
  assert.deepEqual(result.sections, [{ name: 'Technology', entry: '###Technology', index: 0 }]);
  assert.deepEqual(result.entries, ['###Technology', 'NASDAQ:AAPL', 'NASDAQ:MSFT']);
  assert.equal(result.entries_sha256, sha256(result.entries));
  assert.equal((await f.run('watchlist_get_active')).watchlist_id, '8');
});

test('HTTP 200 error envelopes and mismatched list IDs are not healthy empty watchlists', async () => {
  const f = fixture(undefined, { errorEnvelope: true });
  await assert.rejects(() => f.run('watchlist_get', { watchlist_id: '7' }), e => e.code === 'WATCHLIST_API_ERROR' && !JSON.stringify(e).includes('should-not-return'));
  f.options.errorEnvelope = false; f.options.wrongReadId = true;
  await assert.rejects(() => f.run('watchlist_get', { watchlist_id: '7' }), e => e.code === 'WATCHLIST_ID_MISMATCH');
});

test('ID traversal and arbitrary fetch options are rejected before any network operation', async () => {
  const f = fixture();
  await assert.rejects(() => f.run('watchlist_get', { watchlist_id: '../active' }), e => e.code === 'INVALID_ARGUMENT');
  await assert.rejects(() => f.run('watchlist_get', { watchlist_id: '7', headers: { token: 'dummy' } }), e => e.code === 'INVALID_ARGUMENT');
  assert.equal(f.requests.length, 0);
});

test('malformed entries, bare tickers and duplicate symbols fail without submitting requests', () => {
  for (const entries of [['AAPL'], ['https://example.invalid'], ['NASDAQ:AAPL\n'], ['###'], ['NASDAQ:AAPL', 'NASDAQ:AAPL']]) assert.throws(() => normalizeWatchlistEntries(entries));
  assert.deepEqual(normalizeWatchlistEntries(['###Section', 'NASDAQ:AAPL', '###Section']), ['###Section', 'NASDAQ:AAPL', '###Section']);
});

test('append uses an array payload and independently re-reads exact resulting order', async () => {
  const f = fixture(); const result = await f.run('watchlist_add_bulk', { watchlist_id: '7', entries: ['NASDAQ:AAPL', 'NYSE:IBM'] });
  assert.equal(result.verified, true); assert.deepEqual(result.added, ['NYSE:IBM']);
  const index = f.requests.findIndex(r => r.route.endsWith('/append/'));
  assert.deepEqual(f.requests[index].body, ['NYSE:IBM']);
  assert.equal(f.requests.slice(index + 1).some(r => r.route === 'custom/7/' && r.method === 'GET'), true);
  assert.equal(f.lists.get('8').symbols.length, 1);
});

test('a successful HTTP append that did not change membership fails verification', async () => {
  const f = fixture(undefined, { ignoreAppend: true });
  await assert.rejects(() => f.run('watchlist_add', { watchlist_id: '7', entry: 'NYSE:IBM' }), e => e.code === 'WATCHLIST_VERIFICATION_FAILED');
});

test('one absent remove target prevents the entire removal', async () => {
  const f = fixture();
  await assert.rejects(() => f.run('watchlist_remove_bulk', { watchlist_id: '7', entries: ['NASDAQ:AAPL', 'NYSE:NOTFOUND'] }), e => e.code === 'ENTRY_NOT_FOUND');
  assert.equal(f.requests.some(r => r.method === 'POST'), false);
  const removed = await f.run('watchlist_remove', { watchlist_id: '7', entry: 'NASDAQ:AAPL' });
  assert.equal(removed.verified, true); assert.deepEqual(removed.entries, ['###Technology', 'NASDAQ:MSFT']);
});

test('optimistic fingerprint or changed layout blocks a watchlist write', async () => {
  const f = fixture();
  await assert.rejects(() => changeWatchlistEntries({ watchlist_id: '7', entries: ['NYSE:IBM'], expected_entries_sha256: '0'.repeat(64) }, f.ctx, 'append'), e => e.code === 'WATCHLIST_CHANGED');
  f.options.layoutMismatch = true;
  await assert.rejects(() => changeWatchlistEntries({ watchlist_id: '7', entries: ['NYSE:IBM'] }, f.ctx, 'append'), e => e.code === 'LAYOUT_MISMATCH');
  assert.equal(f.requests.some(r => r.method === 'POST'), false);
});

test('create establishes a new ID, exact name/order and independent account listing; replay is read-only', async () => {
  const f = fixture(); const args = { name: 'New research', entries: ['###FX', 'FX:EURUSD'], idempotency_key: 'new-list-request' };
  const result = await createWatchlist(args, f.ctx); assert.equal(result.watchlist_id, '20'); assert.equal(result.verified, true);
  const posts = f.requests.filter(r => r.method === 'POST').length;
  assert.equal((await createWatchlist(args, f.ctx)).replayed, true);
  assert.equal(f.requests.filter(r => r.method === 'POST').length, posts);
  await assert.rejects(() => createWatchlist({ ...args, name: 'Different request' }, f.ctx), e => e.code === 'IDEMPOTENCY_CONFLICT');
});

test('create duplicate-name and checkpoint failures happen before any create POST', async () => {
  const f = fixture();
  await assert.rejects(() => createWatchlist({ name: 'Research', idempotency_key: 'key' }, f.ctx), e => e.code === 'DUPLICATE_NAME');
  f.options.failCheckpoint = true;
  await assert.rejects(() => createWatchlist({ name: 'Unique', idempotency_key: 'key2' }, f.ctx));
  assert.equal(f.requests.some(r => r.method === 'POST'), false);
});

test('lost create response is not blindly retried; reconciliation returns candidates without adoption', async () => {
  const f = fixture(undefined, { failCreateAfterWrite: true }); const args = { name: 'Created once', entries: ['FX:EURUSD'], idempotency_key: 'lost-create' };
  await assert.rejects(() => createWatchlist(args, f.ctx));
  const posts = f.requests.filter(r => r.method === 'POST').length;
  await assert.rejects(() => createWatchlist(args, f.ctx), e => e.code === 'UNCERTAIN_MUTATION');
  assert.equal(f.requests.filter(r => r.method === 'POST').length, posts);
  const state = await f.run('watchlist_reconcile', { operation: 'create', idempotency_key: 'lost-create' });
  assert.deepEqual(state.matching_candidate_ids, ['20']); assert.equal(state.candidate_ownership_verified, false); assert.equal(state.changed, false);
});

test('reorder preserves multiset and verifies exact order after separate clear read-back', async () => {
  const f = fixture(); const desired = ['NASDAQ:MSFT', '###Technology', 'NASDAQ:AAPL'];
  const result = await replaceWatchlistEntries({ watchlist_id: '7', entries: desired, idempotency_key: 'reorder' }, f.ctx, { reorderOnly: true });
  assert.equal(result.exact_order_verified, true); assert.deepEqual(result.entries, desired);
  const clear = f.requests.findIndex(r => r.route.endsWith('/remove/')); const append = f.requests.findIndex(r => r.route.endsWith('/append/'));
  assert.ok(clear < append); assert.ok(f.requests.slice(clear + 1, append).some(r => r.route === 'custom/7/' && r.method === 'GET'));
  assert.deepEqual([...f.checkpoints.values()][0].before_entries, ['###Technology', 'NASDAQ:AAPL', 'NASDAQ:MSFT']);
  assert.equal(f.lists.get('7').name, 'Research');
});

test('reorder refuses changed membership before clearing anything', async () => {
  const f = fixture();
  await assert.rejects(() => replaceWatchlistEntries({ watchlist_id: '7', entries: ['NASDAQ:AAPL'], idempotency_key: 'bad' }, f.ctx, { reorderOnly: true }), e => e.code === 'REORDER_MEMBERSHIP_MISMATCH');
  assert.equal(f.requests.some(r => r.method === 'POST'), false);
});

test('an ignored clear never proceeds to append', async () => {
  const f = fixture(undefined, { ignoreRemove: true });
  await assert.rejects(() => replaceWatchlistEntries({ watchlist_id: '7', entries: ['NYSE:IBM'], idempotency_key: 'bad-clear' }, f.ctx), e => e.code === 'WATCHLIST_REPLACEMENT_INCOMPLETE' && e.details.stage === 'clear_submitted');
  assert.equal(f.requests.some(r => r.route.endsWith('/append/')), false);
});

test('partial replacement exposes durable recovery data and does not repeat a clear on retry', async () => {
  const f = fixture(undefined, { ignoreAppend: true }); const args = { watchlist_id: '7', entries: ['NYSE:IBM'], idempotency_key: 'partial' };
  await assert.rejects(() => replaceWatchlistEntries(args, f.ctx), e => e.code === 'WATCHLIST_REPLACEMENT_INCOMPLETE' && e.details.partial_change_possible);
  assert.deepEqual(f.lists.get('7').symbols, []); const posts = f.requests.filter(r => r.method === 'POST').length;
  await assert.rejects(() => replaceWatchlistEntries(args, f.ctx), e => e.code === 'UNCERTAIN_MUTATION');
  assert.equal(f.requests.filter(r => r.method === 'POST').length, posts);
  const state = await f.run('watchlist_reconcile', { operation: 'replace', idempotency_key: 'partial' });
  assert.equal(state.state, 'partial_or_changed'); assert.equal(state.before_entries.length, 3); assert.deepEqual(state.desired_entries, ['NYSE:IBM']);
});

test('a lost append response can reconcile a completed replacement without another mutation', async () => {
  const f = fixture(undefined, { failAppendAfterWrite: true }); const args = { watchlist_id: '7', entries: ['NYSE:IBM'], idempotency_key: 'append-lost' };
  await assert.rejects(() => replaceWatchlistEntries(args, f.ctx)); const posts = f.requests.filter(r => r.method === 'POST').length;
  const reconciled = await replaceWatchlistEntries(args, f.ctx); assert.equal(reconciled.recovered, true); assert.equal(reconciled.verified, true);
  assert.equal(f.requests.filter(r => r.method === 'POST').length, posts);
});

test('merge import preview is read-only, preserves existing order and appends only missing entries', async () => {
  const f = fixture(); const args = { watchlist_id: '7', entries: ['NASDAQ:MSFT', 'NYSE:IBM'], mode: 'merge' };
  const preview = await f.run('watchlist_import_preview', args); assert.equal(preview.dry_run, true); assert.equal(f.requests.some(r => r.method === 'POST'), false);
  const result = await f.run('watchlist_import', args); assert.deepEqual(result.entries, ['###Technology', 'NASDAQ:AAPL', 'NASDAQ:MSFT', 'NYSE:IBM']);
  assert.match(result.order_policy, /existing order retained/);
});

test('replace import requires a key and exports preserve header positions through the safe store', async () => {
  const f = fixture();
  await assert.rejects(() => f.run('watchlist_import', { watchlist_id: '7', entries: [], mode: 'replace' }), e => e.code === 'IDEMPOTENCY_KEY_REQUIRED');
  await f.run('watchlist_export', { watchlist_id: '7', format: 'json' }); await f.run('watchlist_export', { watchlist_id: '7', format: 'csv' });
  assert.equal(f.artifacts[0].data.schema_version, 2); assert.equal(f.artifacts[0].data.entries[0], '###Technology');
  assert.deepEqual(f.artifacts[1].data[0], { index: 0, kind: 'section', entry: '###Technology' });
});
