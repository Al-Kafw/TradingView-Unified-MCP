/** Native saved-layout operations. No Desktop shell access or caller-supplied code.
 * Protocol research: TradingView's Save-As controller, as documented by
 * pbajkovic-hub/tv-cdp-mcp; independently implemented with identity verification.
 */
import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

const text = { type: 'string', minLength: 1, maxLength: 200 };
const layoutId = { type: 'string', pattern: '^[A-Za-z0-9_-]{6,64}$' };
const keySchema = { type: 'string', minLength: 6, maxLength: 160 };
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const canonical = value => JSON.stringify(value, (_key, val) => val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.keys(val).sort().map(key => [key, val[key]])) : val);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

export function chartUrl(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new ToolError('INVALID_ARGUMENT', 'A saved TradingView layout ID is required.');
  return `https://www.tradingview.com/chart/${id}/`;
}

/** All code crossing the browser boundary is this fixed, reviewed function. */
export async function layoutPage({ operation, data = {} }) {
  const api = window.TradingViewApi;
  if (!api) throw new Error('CAPABILITY_UNAVAILABLE: TradingView chart API is not loaded.');
  const watched = item => item && typeof item.value === 'function' ? item.value() : item ?? null;
  const service = api.getSaveChartService?.();
  const collection = api._chartWidgetCollection;
  const chart = api.activeChart?.() || api._activeChartWidgetWV?.value?.();
  const meta = collection?.metaInfo;
  const id = service?.layoutId?.() ?? watched(meta?.uid);
  const current = () => ({
    layout_id: id == null ? null : String(id),
    name: watched(meta?.name) ?? api.layoutName?.() ?? null,
    read_only: typeof collection?.readOnly === 'function' ? !!collection.readOnly() : null,
    unsaved_changes: typeof service?.hasChanges === 'function' ? !!service.hasChanges() : null,
    symbol: chart?.symbol?.() ?? null,
    resolution: chart?.resolution?.() ?? null,
    chart_type: chart?.chartType?.() ?? null,
    href: location.origin + location.pathname,
  });
  const plain = (value, depth = 10, seen = new WeakSet()) => {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (value === undefined || typeof value === 'function') return null;
    if (depth === 0 || seen.has(value)) throw new Error('A chart setting is cyclic or exceeds the capture depth.');
    seen.add(value);
    const out = Array.isArray(value) ? value.map(v => plain(v, depth - 1, seen))
      : Object.fromEntries(Object.keys(value).map(k => [k, plain(value[k], depth - 1, seen)]));
    seen.delete(value);
    return out;
  };
  const saved = async () => {
    if (typeof api.getSavedCharts !== 'function') throw new Error('CAPABILITY_UNAVAILABLE: saved-layout listing is unavailable.');
    const rows = await api.getSavedCharts();
    if (!Array.isArray(rows)) throw new Error('UNEXPECTED_RESPONSE: saved-layout list was not an array.');
    return rows.map(row => ({
      numeric_id: row.id == null ? null : String(row.id),
      layout_id: row.url == null ? null : String(row.url),
      name: row.name ?? row.title ?? null,
      symbol: row.pro_symbol ?? row.symbol ?? null,
      resolution: row.resolution ?? row.interval ?? null,
      modified: row.modified_iso ?? row.modified ?? null,
      favorite: !!row.favorite,
    }));
  };
  if (operation === 'get') return current();
  if (operation === 'list') return saved();
  if (operation === 'snapshot') {
    const result = { ...current(), panes: [], unverified_fields: [] };
    const widgets = collection?.getAll?.();
    const activeWidget = chart?._chartWidget;
    const paneWidgets = Array.isArray(widgets) && widgets.length ? widgets : [activeWidget];
    for (let index = 0; index < paneWidgets.length; index++) {
      const widget = paneWidgets[index];
      const active = widget === activeWidget || paneWidgets.length === 1;
      const model = widget?.model?.();
      const main = model?.mainSeries?.();
      const pane = { index, symbol: main?.symbol?.() ?? (active ? chart?.symbol?.() : null),
        resolution: main?.interval?.() ?? (active ? chart?.resolution?.() : null),
        chart_type: active ? chart?.chartType?.() ?? null : null, studies: [], drawings: null };
      if (active && typeof chart?.getAllStudies === 'function') {
        for (const study of chart.getAllStudies()) {
          const entry = { name: study.name ?? study.title ?? null, inputs: null, properties: null };
          try {
            const handle = chart.getStudyById(study.id);
            if (typeof handle?.getInputValues === 'function') entry.inputs = plain(handle.getInputValues());
          } catch { /* Missing inputs are reported below. */ }
          if (entry.inputs === null) result.unverified_fields.push(`panes.${index}.study.${entry.name}.inputs`);
          try {
            const handle = chart.getStudyById(study.id);
            if (typeof handle?.getProperties === 'function') entry.properties = plain(handle.getProperties());
          } catch { /* A matching model source may provide a fallback. */ }
          if (entry.properties === null && study.id != null) {
            try {
              const sources = model?.model?.().dataSources?.();
              if (Array.isArray(sources)) {
                const matches = sources.filter(source => {
                  try { return typeof source.id === 'function' && String(source.id()) === String(study.id); }
                  catch { return false; }
                });
                if (matches.length === 1) {
                  const state = matches[0].properties?.()?.state?.();
                  if (state != null) entry.properties = plain(state);
                }
              }
            } catch { /* Unreadable properties remain unverified. */ }
          }
          if (entry.properties === null) result.unverified_fields.push(`panes.${index}.study.${entry.name}.properties`);
          pane.studies.push(entry);
        }
      } else {
        try {
          const sources = model?.model?.().dataSources?.();
          if (!Array.isArray(sources)) throw new Error('No sources');
          for (const source of sources) {
            if (typeof source.metaInfo !== 'function') continue;
            const info = source.metaInfo();
            const properties = source.properties?.().state?.();
            const inputs = source.properties?.().childs?.().inputs?.state?.() ?? properties?.inputs;
            pane.studies.push({ name: info.description ?? info.shortDescription ?? info.id ?? null,
              inputs: inputs == null ? null : plain(inputs), properties: properties == null ? null : plain(properties) });
            if (inputs == null) result.unverified_fields.push(`panes.${index}.study.${info.description}.inputs`);
            if (properties == null) result.unverified_fields.push(`panes.${index}.study.${info.description}.properties`);
          }
        } catch { result.unverified_fields.push(`panes.${index}.studies`); }
      }
      if (active && typeof chart?.getAllShapes === 'function') {
        try {
          pane.drawings = chart.getAllShapes().map(shape => {
            const handle = chart.getShapeById(shape.id);
            return { name: shape.name, points: plain(handle.getPoints()), properties: plain(handle.getProperties()) };
          });
        } catch { result.unverified_fields.push(`panes.${index}.drawings`); }
      } else result.unverified_fields.push(`panes.${index}.drawings`);
      result.panes.push(pane);
    }
    return result;
  }
  if (operation === 'copy') {
    const controller = service?.getSaveAsController?.();
    if (typeof controller?._actionHandler === 'function') await controller._actionHandler({ newValue: data.name, dialogClose() {} });
    else if (typeof controller?._doCloneCurrentLayout === 'function') await controller._doCloneCurrentLayout(data.name);
    else throw new Error('CAPABILITY_UNAVAILABLE: native Make a copy controller is unavailable.');
    return { submitted: true };
  }
  if (operation === 'create') {
    if (typeof api.createNewLayout !== 'function') throw new Error('CAPABILITY_UNAVAILABLE: native new-layout API is unavailable.');
    const newId = await api.createNewLayout();
    if (newId == null) throw new Error('UNCERTAIN_MUTATION: new-layout API returned no ID. Inspect saved layouts before retrying.');
    return { layout_id: String(newId) };
  }
  if (operation === 'save') {
    if (typeof api.saveChartToServer !== 'function') throw new Error('CAPABILITY_UNAVAILABLE: native layout save is unavailable.');
    api.saveChartToServer(undefined, undefined, data.name ? { chartName: data.name } : undefined);
    return { submitted: true, layout_id: current().layout_id };
  }
  if (operation === 'rename') {
    const controller = service?.getRenameController?.();
    if (typeof controller?._actionHandler !== 'function') throw new Error('CAPABILITY_UNAVAILABLE: native rename controller is unavailable.');
    await controller._actionHandler({ newValue: data.name, dialogClose() {} });
    return { submitted: true };
  }
  if (operation === 'delete') {
    if (typeof api.removeChartFromServer !== 'function') throw new Error('CAPABILITY_UNAVAILABLE: native layout deletion is unavailable.');
    await api.removeChartFromServer(data.layout_id);
    return { submitted: true };
  }
  if (operation === 'navigate') {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(data.layout_id)) throw new Error('INVALID_ARGUMENT: invalid layout ID.');
    location.assign(`https://www.tradingview.com/chart/${data.layout_id}/`);
    return { submitted: true };
  }
  throw new Error('INVALID_OPERATION: unknown layout operation.');
}

const page = (ctx, operation, data = {}) => ctx.callPage(layoutPage, { operation, data }, { timeoutMs: 20000 });
const targetIdOf = item => typeof item === 'string' ? item : item?.targetId ?? item?.target_id ?? item?.id;
const targetsArray = rows => Array.isArray(rows) ? rows : rows?.targets ?? [];
const targetMatches = (item, id) => {
  try { const url = new URL(item.url); return url.protocol === 'https:' && ['www.tradingview.com', 'tradingview.com'].includes(url.hostname) && url.pathname === `/chart/${id}/`; }
  catch { return false; }
};

export async function findLayoutContext(ctx, id, { open = true } = {}) {
  const targets = targetsArray(await ctx.browser.listTargets());
  const match = targets.find(target => targetMatches(target, id));
  let targetId = targetIdOf(match);
  if (!targetId && open) targetId = targetIdOf(await ctx.browser.openTarget(chartUrl(id)));
  if (!targetId) throw new ToolError('LAYOUT_NOT_OPEN', 'No browser tab for this saved layout was found.', { layout_id: id });
  const next = await ctx.forTarget(targetId, id);
  await ctx.poll(async () => {
    try { return await page(next, 'get'); } catch { return null; }
  }, row => row?.layout_id === id && !!row.symbol && !!row.resolution,
  { timeoutMs: 45000, intervalMs: 500, description: 'wait for exact saved layout to load' });
  return next;
}

const normalInputs = inputs => Array.isArray(inputs)
  ? Object.fromEntries(inputs.map(input => [input.id, input.value])) : inputs;

export function compareLayoutSnapshots(source, destination) {
  const mismatches = [];
  const unverified = [...(source.unverified_fields ?? []), ...(destination.unverified_fields ?? [])];
  const check = (field, a, b, required = true) => {
    if (a === null || a === undefined || b === null || b === undefined) {
      if (required) unverified.push(field);
    } else if (canonical(a) !== canonical(b)) mismatches.push({ field, source: a, destination: b });
  };
  check('symbol', source.symbol, destination.symbol);
  check('resolution', source.resolution == null ? null : String(source.resolution), destination.resolution == null ? null : String(destination.resolution));
  check('chart_type', source.chart_type, destination.chart_type);
  check('pane_count', source.panes?.length, destination.panes?.length);
  for (let index = 0; index < (source.panes?.length ?? 0); index++) {
    const a = source.panes[index], b = destination.panes?.[index];
    if (!b) { mismatches.push({ field: `panes.${index}`, source: 'present', destination: 'missing' }); continue; }
    check(`panes.${index}.symbol`, a.symbol, b.symbol);
    check(`panes.${index}.resolution`, a.resolution, b.resolution);
    check(`panes.${index}.study_count`, a.studies?.length, b.studies?.length);
    for (let n = 0; n < (a.studies?.length ?? 0); n++) {
      const x = a.studies[n], y = b.studies?.[n];
      if (!y) { mismatches.push({ field: `panes.${index}.studies.${n}`, source: x.name, destination: 'missing' }); continue; }
      check(`panes.${index}.studies.${n}.name`, x.name, y.name);
      check(`panes.${index}.studies.${n}.inputs`, normalInputs(x.inputs), normalInputs(y.inputs));
      check(`panes.${index}.studies.${n}.properties`, x.properties, y.properties, false);
    }
    check(`panes.${index}.drawings`, a.drawings, b.drawings, false);
  }
  const criticalMissing = unverified.filter(field => !/\.properties$|\.drawings$/.test(field));
  return { chart_verified: mismatches.length === 0 && criticalMissing.length === 0,
    full_fidelity_verified: false,
    readable_configuration_verified: mismatches.length === 0 && unverified.length === 0,
    full_fidelity_note: 'The native clone preserves the saved layout, but this comparison does not inspect every serialized layout field, synchronization option or internal strategy property.',
    mismatches, unverified_fields: [...new Set(unverified)],
    checked: ['layout independence separately', 'symbols', 'resolutions', 'chart type', 'pane count', 'study names', 'study inputs', 'readable properties and drawings'] };
}

export async function saveLayout(args, ctx) {
  const before = await page(ctx, 'get');
  if (before.read_only) throw new ToolError('READ_ONLY_LAYOUT', 'This chart is read-only. Make a copy before saving.');
  await ctx.assertLayout(ctx.expectedLayoutId);
  await page(ctx, 'save', { name: args.name });
  const after = await ctx.poll(() => page(ctx, 'get'), row => row.layout_id === before.layout_id && row.unsaved_changes === false,
    { timeoutMs: 30000, intervalMs: 500, description: 'verify saved chart identity and cleared unsaved flag' });
  const listed = await ctx.poll(async () => (await page(ctx, 'list')).find(row => row.layout_id === before.layout_id),
    row => !!row && row.symbol === before.symbol && String(row.resolution) === String(before.resolution) &&
      (!args.name || row.name === args.name),
    { timeoutMs: 20000, intervalMs: 500, description: 'verify persisted layout symbol, resolution and requested name' });
  return { saved: true, layout_id: after.layout_id,
    previous_name: before.name, name: listed?.name ?? after.name, unsaved_changes: after.unsaved_changes,
    persisted_symbol: listed.symbol, persisted_resolution: listed.resolution,
    verified_from: 'native save service plus independent saved-layout list' };
}

async function completeCopy(ctx, source, copy, savedBefore, key, requestHash) {
  if (!copy.layout_id || copy.layout_id === source.layout_id) throw new ToolError('COPY_NOT_INDEPENDENT', 'Copy does not have a distinct saved layout ID.');
  const sourceSaved = savedBefore.find(row => row.layout_id === source.layout_id);
  if (!sourceSaved?.numeric_id || !copy.numeric_id || sourceSaved.numeric_id === copy.numeric_id) throw new ToolError('COPY_NOT_INDEPENDENT', 'Independent numeric saved IDs could not be verified.');
  const next = await findLayoutContext(ctx, copy.layout_id);
  let destination;
  let verification;
  try {
    let lastSignature = null, equalReads = 0;
    destination = await ctx.poll(async () => {
      const snap = await page(next, 'snapshot');
      const signature = digest({ symbol: snap.symbol, resolution: snap.resolution, panes: snap.panes });
      equalReads = signature === lastSignature ? equalReads + 1 : 0;
      lastSignature = signature;
      return snap;
    }, snap => equalReads >= 2 && compareLayoutSnapshots(source, snap).chart_verified,
    { timeoutMs: 30000, intervalMs: 700, description: 'verify copied chart studies and parameters' });
    verification = compareLayoutSnapshots(source, destination);
  } catch (error) {
    try { destination = await page(next, 'snapshot'); verification = compareLayoutSnapshots(source, destination); }
    catch { verification = { chart_verified: false, full_fidelity_verified: false, mismatches: [], unverified_fields: ['destination chart state'], reason: error.code ?? 'READ_FAILED' }; }
  }
  const finalList = await page(next, 'list');
  const originalBefore = savedBefore.find(row => row.layout_id === source.layout_id);
  const originalAfter = finalList.find(row => row.layout_id === source.layout_id);
  const fields = row => row && { layout_id: row.layout_id, name: row.name, symbol: row.symbol, resolution: row.resolution };
  const sourceMetadataUnchanged = originalBefore ? canonical(fields(originalBefore)) === canonical(fields(originalAfter)) : null;
  const result = { created: true, independent_layout_verified: true, source_layout_id: source.layout_id,
    layout_id: copy.layout_id, name: copy.name, url: chartUrl(copy.layout_id),
    target_id: next.targetId, expected_layout_id: copy.layout_id,
    chart_verified: verification.chart_verified, verification, source_metadata_unchanged: sourceMetadataUnchanged,
    source_full_content_unchanged_verified: null };
  await ctx.checkpoint(key, { stage: verification.chart_verified ? 'verified' : 'created_needs_verification', request_hash: requestHash,
    source_layout_id: source.layout_id, copy_layout_id: copy.layout_id, target_id: next.targetId,
    source_fingerprint: digest(source.panes), result: { ...result, verification: { ...verification, mismatches: verification.mismatches?.map(item => ({ field: item.field })) } } });
  return result;
}

export async function copyLayout(args, ctx) {
  const requestHash = digest({ name: args.name, source: ctx.expectedLayoutId, save_source: !!args.save_source });
  const key = `layout-copy-${digest(args.idempotency_key)}`;
  const prior = await ctx.loadCheckpoint(key);
  if (prior && prior.request_hash !== requestHash) throw new ToolError('IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to another copy request.');
  if (prior?.copy_layout_id) {
    if (prior.copy_layout_id === prior.source_layout_id) throw new ToolError('COPY_NOT_INDEPENDENT', 'Recorded copy ID is identical to its source.');
    const next = await findLayoutContext(ctx, prior.copy_layout_id);
    const listed = await page(next, 'list');
    const savedCopy = listed.find(row => row.layout_id === prior.copy_layout_id);
    const savedSource = listed.find(row => row.layout_id === prior.source_layout_id);
    if (!savedCopy) throw new ToolError('PREVIOUS_COPY_MISSING', 'The earlier copy no longer exists. Use a new operation key only if a new copy is intended.');
    if (!savedSource?.numeric_id || !savedCopy.numeric_id || savedSource.numeric_id === savedCopy.numeric_id) throw new ToolError('COPY_NOT_INDEPENDENT', 'Distinct source and destination saved numeric IDs could not be re-established.');
    const sourceCtx = await findLayoutContext(ctx, prior.source_layout_id);
    const currentSource = await page(sourceCtx, 'snapshot');
    const currentDestination = await page(next, 'snapshot');
    const verification = compareLayoutSnapshots(currentSource, currentDestination);
    const sourceStillMatches = !prior.source_fingerprint || prior.source_fingerprint === digest(currentSource.panes);
    if (!sourceStillMatches) {
      verification.chart_verified = false;
      verification.full_fidelity_verified = false;
      verification.unverified_fields.push('source changed since clone submission');
    }
    const result = { created: true, independent_layout_verified: true, source_layout_id: prior.source_layout_id,
      layout_id: prior.copy_layout_id, name: savedCopy.name, url: chartUrl(prior.copy_layout_id),
      replayed: true, chart_verified: verification.chart_verified, verification,
      verification_scope: 'Current source and destination comparison; no additional clone submitted.',
      target_id: next.targetId, expected_layout_id: prior.copy_layout_id, source_full_content_unchanged_verified: null };
    await ctx.checkpoint(key, { ...prior, stage: verification.chart_verified ? 'verified' : 'created_needs_verification',
      target_id: next.targetId, result: { ...result, verification: { ...verification, mismatches: verification.mismatches.map(item => ({ field: item.field })) } } });
    return result;
  }
  let source = await page(ctx, 'snapshot');
  if (!source.layout_id || source.layout_id !== ctx.expectedLayoutId) throw new ToolError('LAYOUT_MISMATCH', 'Source layout identity could not be verified.');
  if (source.unsaved_changes) {
    if (!args.save_source) throw new ToolError('UNSAVED_SOURCE', 'Save the desired source configuration first, or explicitly set save_source=true. Native copy may copy the saved version.');
    const result = await saveLayout({}, ctx);
    if (!result.saved) throw new ToolError('SOURCE_SAVE_UNVERIFIED', 'Source save could not be verified. No copy was submitted.');
    source = await page(ctx, 'snapshot');
  }
  const savedBefore = await page(ctx, 'list');
  if (!savedBefore.find(row => row.layout_id === source.layout_id)?.numeric_id) throw new ToolError('SOURCE_SAVED_ID_UNAVAILABLE', 'The exact source must be present in the saved-layout list with a stable numeric ID before copying.');
  if (prior?.stage === 'submitted') {
    const matches = savedBefore.filter(row => row.name === args.name && !prior.known_ids.includes(row.numeric_id));
    if (matches.length === 1) return completeCopy(ctx, source, matches[0], savedBefore, key, requestHash);
    throw new ToolError('UNCERTAIN_MUTATION', 'An earlier clone was submitted; it will not be submitted again automatically. Reconcile the saved-layout list.', { idempotency_key: args.idempotency_key, matches: matches.map(row => row.layout_id) });
  }
  if (savedBefore.some(row => row.name === args.name)) throw new ToolError('DUPLICATE_LAYOUT_NAME', 'A saved layout already has this name. Choose a unique destination name.');
  const knownIds = savedBefore.map(row => row.numeric_id);
  await ctx.assertLayout(source.layout_id);
  await ctx.checkpoint(key, { stage: 'submitted', request_hash: requestHash, known_ids: knownIds, source_layout_id: source.layout_id, source_fingerprint: digest(source.panes) });
  let submitError = null;
  try { await page(ctx, 'copy', { name: args.name }); } catch (error) { submitError = error.code ?? 'BROWSER_CONTEXT_CHANGED'; }
  let copy;
  try {
    const matches = await ctx.poll(async () => {
      try { return (await page(ctx, 'list')).filter(row => !knownIds.includes(row.numeric_id) && row.name === args.name); }
      catch { return []; }
    }, rows => rows.length > 0, { timeoutMs: args.timeout_ms ?? 120000, intervalMs: 700, description: 'confirm a new saved layout ID' });
    if (matches.length !== 1) throw new ToolError('AMBIGUOUS_COPY', 'Multiple new layouts have the requested name. No destination was selected.', { layout_ids: matches.map(row => row.layout_id) });
    copy = matches[0];
  } catch (error) {
    throw new ToolError('UNCERTAIN_MUTATION', 'The clone submission could not be reconciled. Do not repeat it with a different key before inspecting saved layouts.', { submission_error: submitError, verification_error: error.code ?? 'TIMEOUT', operation_key: args.idempotency_key });
  }
  await ctx.checkpoint(key, { stage: 'created', request_hash: requestHash, source_layout_id: source.layout_id, copy_layout_id: copy.layout_id, known_ids: knownIds, source_fingerprint: digest(source.panes) });
  return completeCopy(ctx, source, copy, savedBefore, key, requestHash);
}

const tools = [
  { name: 'layout_list', description: 'List saved layouts with stable IDs, symbols, resolutions and modification times.', inputSchema: schema({ filter: text }), mutates: false, requiresLayout: false,
    handler: async (args, ctx) => { const all = await page(ctx, 'list'); return { layouts: args.filter ? all.filter(row => row.name?.toLowerCase().includes(args.filter.toLowerCase())) : all }; } },
  { name: 'layout_get', description: 'Read the actual widget layout ID, name, dirty state, symbol and resolution.', inputSchema: schema(), mutates: false,
    handler: (_args, ctx) => page(ctx, 'get') },
  { name: 'layout_snapshot', description: 'Export a bounded chart configuration snapshot. Reports properties and drawings that could not be captured; never claims complete restoration.', inputSchema: schema({ name: text }, ['name']), mutates: false,
    handler: async (args, ctx) => { const snapshot = await page(ctx, 'snapshot'); const file = await ctx.exportJson(`layout-${args.name}`, snapshot); return { snapshot, file }; } },
  { name: 'layout_save', description: 'Save the current layout in place, optionally renaming it. This is not a duplicate operation.', inputSchema: schema({ name: text }), mutates: true, handler: saveLayout },
  { name: 'layout_copy', description: 'Native Make a copy with a unique name, new saved-ID verification, chart comparison and a durable idempotency key. Returns the destination browser target for subsequent operations.',
    inputSchema: schema({ name: text, idempotency_key: keySchema, save_source: { type: 'boolean', default: false }, timeout_ms: { type: 'integer', minimum: 1000, maximum: 180000, default: 120000 } }, ['name', 'idempotency_key']), mutates: true, handler: copyLayout },
  { name: 'layout_open', description: 'Open an exact saved TradingView layout ID in a new browser tab and verify the widget loaded that ID.', inputSchema: schema({ layout_id: layoutId }, ['layout_id']), mutates: true,
    handler: async (args, ctx) => { const next = await findLayoutContext(ctx, args.layout_id); return { ...(await page(next, 'get')), target_id: next.targetId, expected_layout_id: args.layout_id }; } },
  { name: 'layout_create', description: 'Create a blank saved layout, open it in a browser tab and save its name only after verifying the new widget ID.', inputSchema: schema({ name: text, idempotency_key: keySchema }, ['name', 'idempotency_key']), mutates: true,
    handler: async (args, ctx) => {
      const key = `layout-create-${digest(args.idempotency_key)}`;
      const requestHash = digest({ name: args.name, source: ctx.expectedLayoutId });
      const prior = await ctx.loadCheckpoint(key);
      if (prior && prior.request_hash !== requestHash) throw new ToolError('IDEMPOTENCY_CONFLICT', 'Key belongs to a different new-layout request.');
      if (prior?.layout_id) {
        const next = await findLayoutContext(ctx, prior.layout_id);
        if (prior.stage !== 'saved') {
          const saved = await saveLayout({ name: args.name }, next);
          await ctx.checkpoint(key, { ...prior, stage: 'saved' });
          return { ...saved, created: true, target_id: next.targetId, expected_layout_id: prior.layout_id, replayed: true };
        }
        const current = await page(next, 'get');
        return { ...current, created: true, requested_name_verified: current.name === args.name,
          target_id: next.targetId, expected_layout_id: prior.layout_id, replayed: true };
      }
      if (prior) throw new ToolError('UNCERTAIN_MUTATION', 'A creation was previously submitted without a confirmed ID. Inspect saved layouts before creating again.');
      const current = await page(ctx, 'get');
      if (current.unsaved_changes) throw new ToolError('UNSAVED_SOURCE', 'Save the current chart before creating a new layout.');
      if ((await page(ctx, 'list')).some(row => row.name === args.name)) throw new ToolError('DUPLICATE_LAYOUT_NAME', 'Layout name already exists.');
      await ctx.assertLayout(ctx.expectedLayoutId);
      await ctx.checkpoint(key, { stage: 'submitted', request_hash: requestHash });
      const made = await page(ctx, 'create');
      if (made.layout_id === current.layout_id) throw new ToolError('COPY_NOT_INDEPENDENT', 'New-layout API reused the current layout ID.');
      await ctx.checkpoint(key, { stage: 'created', request_hash: requestHash, layout_id: made.layout_id });
      const next = await findLayoutContext(ctx, made.layout_id);
      const saved = await saveLayout({ name: args.name }, next);
      await ctx.checkpoint(key, { stage: 'saved', request_hash: requestHash, layout_id: made.layout_id });
      return { ...saved, created: saved.saved, target_id: next.targetId, expected_layout_id: made.layout_id };
    } },
  { name: 'layout_rename', description: 'Rename the exact current saved layout and confirm the same ID has the new name.', inputSchema: schema({ name: text }, ['name']), mutates: true,
    handler: async (args, ctx) => {
      const before = await page(ctx, 'get');
      if (before.read_only) throw new ToolError('READ_ONLY_LAYOUT', 'A shared read-only chart must be copied first.');
      if ((await page(ctx, 'list')).some(row => row.name === args.name && row.layout_id !== before.layout_id)) throw new ToolError('DUPLICATE_LAYOUT_NAME', 'Another saved layout already has that name.');
      await ctx.assertLayout(ctx.expectedLayoutId); await page(ctx, 'rename', { name: args.name });
      const after = await ctx.poll(() => page(ctx, 'list'), rows => rows.some(row => row.layout_id === before.layout_id && row.name === args.name), { timeoutMs: 20000, description: 'verify renamed layout' });
      return { renamed: true, previous_name: before.name, layout: after.find(row => row.layout_id === before.layout_id) };
    } },
  { name: 'layout_delete', description: 'Delete one saved layout by exact ID and verify it disappeared. Refuses the layout currently bound to this tool.', inputSchema: schema({ layout_id: layoutId }, ['layout_id']), mutates: true, destructive: true,
    handler: async (args, ctx) => {
      const before = await page(ctx, 'list'); const hit = before.find(row => row.layout_id === args.layout_id);
      if (!hit) throw new ToolError('NOT_FOUND', 'No saved layout has this ID.');
      if (args.layout_id === ctx.expectedLayoutId) throw new ToolError('CURRENT_LAYOUT_PROTECTED', 'Bind a different chart before deleting this layout.');
      await ctx.assertLayout(ctx.expectedLayoutId); await page(ctx, 'delete', { layout_id: args.layout_id });
      await ctx.poll(() => page(ctx, 'list'), rows => !rows.some(row => row.layout_id === args.layout_id), { timeoutMs: 20000, description: 'verify layout deletion' });
      return { deleted: hit, verified_absent: true };
    } },
];

export default tools;
