/** Browser-authenticated alert operations. Cookies never leave Chrome; webhook
 * endpoints are configuration values, never contacted by this MCP process.
 * Protocol references are recorded in SOURCES.md; implementation is independent.
 */
import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';
import { validateWebhook, redact } from '../core/security.mjs';

const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const label = { type: 'string', minLength: 1, maxLength: 200 };
const idSchema = { type: 'string', pattern: '^[0-9]{1,16}$' };
const idsSchema = { type: 'array', items: idSchema, minItems: 1, maxItems: 50, uniqueItems: true };
const operationKey = { type: 'string', minLength: 6, maxLength: 160 };
const pageLimit = { type: 'integer', minimum: 1, maximum: 500, default: 100 };
const pageOffset = { type: 'integer', minimum: 0, maximum: 10000000, default: 0 };
const resolutionSchema = { type: 'string', pattern: '^([1-9][0-9]{0,4}|[1-9]?[DWM]|[1-9][0-9]?[SHT])$' };
const inputMap = { type: 'object', maxProperties: 500, additionalProperties: { type: ['string', 'number', 'boolean', 'null'] } };
const canonical = value => JSON.stringify(value, (_key, val) => val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.keys(val).sort().map(key => [key, val[key]])) : val);
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const byteLength = value => Buffer.byteLength(value, 'utf8');

export const alertConditionSchema = object({
  kind: { type: 'string', enum: ['price', 'strategy', 'indicator'] },
  comparison: { type: 'string', enum: ['cross', 'cross_up', 'cross_down', 'greater', 'less'] },
  price: { type: 'number' },
  study_id: label,
  study_name: label,
  alert_condition_id: label,
  frequency: { type: 'string', enum: ['on_first_fire', 'on_bar_close'], default: 'on_bar_close' },
  input_overrides: inputMap,
  offsets_by_plot: { type: 'object', maxProperties: 500, additionalProperties: { type: 'integer', minimum: -5000, maximum: 5000 } },
}, ['kind']);

export const createAlertProperties = {
  name: label,
  idempotency_key: operationKey,
  condition: alertConditionSchema,
  symbol: { type: 'string', minLength: 3, maxLength: 150, pattern: '^[^\\s:]+:[^\\s]+$' },
  resolution: resolutionSchema,
  message: { type: 'string', maxLength: 32768, default: '' },
  message_format: { type: 'string', enum: ['text', 'json'], default: 'text' },
  webhook_url: { type: ['string', 'null'], maxLength: 4096 },
  active: { type: 'boolean', default: false },
  expiration_days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
  notifications: object({ popup: { type: 'boolean' }, email: { type: 'boolean' }, mobile_push: { type: 'boolean' } }),
};
export const createAlertSchema = object(createAlertProperties, ['name', 'idempotency_key', 'condition']);

export function normalizeAlertId(value) {
  const id = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id <= 0) throw new ToolError('INVALID_ALERT_ID', 'Alert IDs must be positive safe integers represented as strings.');
  return String(id);
}

/** Validate the JSON template structure without modifying the original bytes.
 * Substitution is TradingView's responsibility; placeholders can change types.
 */
export function validateAlertMessage(message = '', format = 'text') {
  if (typeof message !== 'string' || byteLength(message) > 32768) throw new ToolError('INVALID_MESSAGE', 'Alert message must be text of at most 32768 UTF-8 bytes.');
  const placeholders = [];
  let quoted = false, escaped = false, surrogate = '';
  for (let i = 0; i < message.length; i++) {
    if (message.slice(i, i + 2) === '{{') {
      const end = message.indexOf('}}', i + 2);
      if (end < 0) throw new ToolError('INVALID_PLACEHOLDER', 'An alert placeholder is missing its closing braces.');
      const token = message.slice(i + 2, end);
      if (!token.trim() || token.includes('{{')) throw new ToolError('INVALID_PLACEHOLDER', 'An alert placeholder is empty or nested.');
      placeholders.push(token);
      surrogate += quoted ? 'TV_PLACEHOLDER' : 'null';
      i = end + 1;
      escaped = false;
      continue;
    }
    const ch = message[i];
    surrogate += ch;
    if (quoted && escaped) { escaped = false; continue; }
    if (quoted && ch === '\\') { escaped = true; continue; }
    if (ch === '"') quoted = !quoted;
  }
  let validJson = null;
  if (format === 'json') {
    try { JSON.parse(surrogate); validJson = true; }
    catch { throw new ToolError('INVALID_JSON_TEMPLATE', 'The alert message is not structurally valid JSON after placeholder substitution. Original text was not changed.'); }
  }
  return { utf8_bytes: byteLength(message), sha256: hash(message), message_preserved_exactly: true,
    format, template_structure_valid: validJson, placeholders: [...new Set(placeholders)],
    delivery_payload_json_guaranteed: placeholders.length ? false : validJson };
}

/** Fixed browser program. All endpoint choices are a closed literal allowlist. */
export async function alertPage({ operation, data = {} }) {
  const plain = (value, depth = 12, seen = new WeakSet()) => {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value ?? null;
    if (typeof value === 'function' || depth <= 0 || seen.has(value)) return null;
    seen.add(value);
    const result = Array.isArray(value) ? value.map(v => plain(v, depth - 1, seen))
      : Object.fromEntries(Object.keys(value).filter(k => k !== 'presentationData' && k !== 'presentation_data').map(k => [k, plain(value[k], depth - 1, seen)]));
    seen.delete(value);
    return result;
  };
  const request = async (endpoint, payload) => {
    if (!['list_alerts', 'list_fires', 'create_alert', 'stop_alerts', 'restart_alerts', 'delete_alerts'].includes(endpoint)) throw new Error('INVALID_OPERATION: endpoint not allowed.');
    const destination = new URL(`https://pricealerts.tradingview.com/${endpoint}`);
    if (payload !== undefined) {
      // Match the native request's build/account routing metadata, entirely
      // inside Chrome. Neither the session object nor its headers leave here.
      try {
        const col = await collection();
        const native = col?._restRequestsHandler?._restApi;
        const build = native?._options?.buildTime;
        if (typeof build === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.+-]{8,30}Z?$/.test(build)) destination.searchParams.set('build_time', build);
        const username = native?._session?.user?.value?.()?.username;
        if (typeof username === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(username)) destination.searchParams.set('log_username', username);
        if (endpoint === 'create_alert' && native?._session?.sendLegacyExpiration === false && typeof payload.expiration === 'string') {
          const { expiration, ...definition } = payload;
          payload = { ...definition, expiration_policy: { policy: 'fixed_date', time: expiration } };
        }
      } catch { /* Older builds may not expose this optional metadata. */ }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(destination.href, {
        method: payload === undefined ? 'GET' : 'POST', credentials: 'include', redirect: 'error', signal: controller.signal,
        ...(payload === undefined ? {} : { body: JSON.stringify({ payload }) }),
      });
      const decoded = await response.json();
      if (!response.ok || decoded?.s !== 'ok') {
        const code = decoded?.err?.code ?? decoded?.errmsg ?? 'request_rejected';
        throw new Error(`TRADINGVIEW_ALERT_REJECTED: ${String(code).slice(0, 140)} (HTTP ${response.status})`);
      }
      return decoded.r;
    } finally { clearTimeout(timer); }
  };
  const rawList = async () => {
    const rows = await request('list_alerts');
    if (!Array.isArray(rows)) throw new Error('UNEXPECTED_RESPONSE: alert list is not an array.');
    return rows;
  };
  const decodeSymbol = value => {
    if (value && typeof value === 'object') return value.symbol ?? null;
    if (typeof value !== 'string') return null;
    if (!value.startsWith('=')) return value;
    try { return JSON.parse(value.slice(1)).symbol ?? null; } catch { return null; }
  };
  const collection = async () => {
    let requireModule;
    const chunk = window.webpackChunktradingview;
    if (!chunk?.push) throw new Error('CAPABILITY_UNAVAILABLE: TradingView alert collection is not loaded.');
    chunk.push([[`unified_alerts_${Math.random().toString(36).slice(2)}`], {}, r => { requireModule = r; }]);
    if (!requireModule?.c) throw new Error('CAPABILITY_UNAVAILABLE: TradingView module registry is unavailable.');
    for (const module of Object.values(requireModule.c)) {
      let getter;
      try { getter = module?.exports?.getAlertsCollection; } catch { continue; }
      if (typeof getter !== 'function') continue;
      const col = getter();
      await col.ensureLoadedAlerts?.();
      return col;
    }
    throw new Error('CAPABILITY_UNAVAILABLE: getAlertsCollection is unavailable on this browser build.');
  };
  const project = (row, model = null) => {
    let condition = row.conditions ?? row.condition ?? model?.conditions ?? null;
    if (typeof condition === 'string') { try { condition = JSON.parse(condition); } catch { condition = null; } }
    if (condition && !Array.isArray(condition)) condition = [condition];
    const known = (snake, camel) => Object.hasOwn(row, snake) ? row[snake]
      : model && Object.hasOwn(model, camel ?? snake) ? model[camel ?? snake] : undefined;
    const out = { alert_id: String(row.alert_id ?? row.id), name: known('name'),
      symbol: decodeSymbol(row.pro_symbol ?? row.symbol ?? model?.proSymbol ?? model?.symbol),
      resolution: known('resolution'), active: known('active'), conditions: condition == null ? undefined : plain(condition),
      message: known('message'), webhook_url: known('web_hook', 'webhook'),
      popup: known('popup'), email: known('email'), mobile_push: known('mobile_push', 'mobilePush'),
      expiration: known('expiration'), last_fire_time: known('last_fire_time'), last_stop_reason: known('last_stop_reason'),
      last_error: known('last_error'), source: 'TradingView independent alert list',
      details_source: model ? 'list plus native alert detail model' : 'list only' };
    return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined));
  };
  if (operation === 'list') return (await rawList()).map(row => project(row));
  if (operation === 'get') {
    const row = (await rawList()).find(item => String(item.alert_id) === String(data.alert_id));
    if (!row) return null;
    let model = null;
    try { const col = await collection(); model = await col.requestAlert?.(Number(data.alert_id)) ?? col.getAlerts?.().get(Number(data.alert_id)); }
    catch { /* The raw list remains authoritative; missing detail fields stay unknown. */ }
    return project(row, model);
  }
  if (operation === 'fires') {
    const rows = await request('list_fires');
    return plain(Array.isArray(rows) ? rows : rows?.fires ?? []);
  }
  if (operation === 'create') return plain(await request('create_alert', data.payload));
  if (operation === 'pause') return plain(await request('stop_alerts', { alert_ids: data.alert_ids.map(Number) }));
  if (operation === 'resume') return plain(await request('restart_alerts', { alert_ids: data.alert_ids.map(Number) }));
  if (operation === 'delete') return plain(await request('delete_alerts', { alert_ids: data.alert_ids.map(Number) }));
  if (operation === 'clone') {
    const col = await collection();
    if (typeof col.cloneAlerts !== 'function') throw new Error('CAPABILITY_UNAVAILABLE: native alert clone is unavailable.');
    await col.cloneAlerts([Number(data.alert_id)]);
    return { submitted: true };
  }
  if (operation === 'update') {
    const col = await collection();
    if (typeof col.modifyRestartAlert !== 'function') throw new Error('CAPABILITY_UNAVAILABLE: native alert modify is unavailable.');
    const id = Number(data.alert_id);
    const model = await col.requestAlert?.(id) ?? col.getAlerts?.().get(id);
    if (!model) throw new Error('NOT_FOUND: alert model not found.');
    const updated = { ...model };
    for (const key of ['name', 'message', 'webhook', 'popup', 'email', 'mobilePush']) {
      if (Object.hasOwn(data.patch, key)) updated[key] = data.patch[key];
    }
    await col.modifyRestartAlert(id, updated);
    return { submitted: true, rearmed_by_native_api: true };
  }
  if (operation === 'source' || operation === 'sources') {
    const api = window.TradingViewApi;
    const chart = api?.activeChart?.() ?? api?._activeChartWidgetWV?.value?.();
    if (!chart) throw new Error('CAPABILITY_UNAVAILABLE: active chart unavailable.');
    const main = chart._chartWidget?.model?.().mainSeries?.();
    const rawSymbol = main?.proSymbol?.() ?? main?.symbol?.() ?? chart.symbol?.();
    let token = { symbol: chart.symbol?.() };
    if (typeof rawSymbol === 'string' && rawSymbol.startsWith('=')) { try { token = JSON.parse(rawSymbol.slice(1)); } catch { /* use chart symbol */ } }
    else if (rawSymbol && typeof rawSymbol === 'object' && rawSymbol.symbol) token = { ...rawSymbol };
    else if (typeof rawSymbol === 'string') token.symbol = rawSymbol;
    // A quote's native currency is not a requested currency conversion. Keep
    // conversion/session modifiers only when present in the actual symbol.
    const out = { symbol: chart.symbol?.(), symbol_token: plain(token), resolution: String(chart.resolution?.()), studies: [] };
    const all = chart.getAllStudies?.();
    if (!Array.isArray(all)) throw new Error('CAPABILITY_UNAVAILABLE: chart studies could not be enumerated.');
    const sources = chart._chartWidget?.model?.().model?.().dataSources?.() ?? [];
    for (const study of all) {
      const name = study.name ?? study.title;
      let matches = sources.filter(source => { try { return typeof study.id === 'string' && source.id?.() === study.id; } catch { return false; } });
      if (!matches.length) matches = sources.filter(source => { try { return source.metaInfo?.().description === name; } catch { return false; } });
      const entry = { study_id: typeof study.id === 'string' ? study.id : null, name, available: false };
      if (matches.length !== 1) { entry.unavailable_reason = 'Study metadata is missing or ambiguous.'; out.studies.push(entry); continue; }
      try {
        const source = matches[0], meta = source.metaInfo();
        const handle = chart.getStudyById(study.id);
        const values = handle.getInputValues();
        if (!Array.isArray(values)) throw new Error('Current study inputs unavailable.');
        const liveInputs = Object.fromEntries(values.map(input => [input.id, input.value]));
        const userDefinitions = (meta.inputs ?? []).filter(input => /^in_\d+$/.test(input.id));
        if (userDefinitions.some(input => !Object.hasOwn(liveInputs, input.id))) throw new Error('Some current input values were not read; defaults will not be substituted.');
        const inputs = { ...(meta.defaults?.inputs ?? {}), ...liveInputs };
        const pineId = meta.scriptIdPart ?? inputs.pineId;
        const pineVersion = inputs.pineVersion ?? meta.scriptVersion ?? meta.pineVersion;
        const isStrategy = !!meta.is_strategy || !!meta.isStrategy || typeof source.reportData === 'function' || String(meta.id).startsWith('StrategyScript');
        const alertConditions = (meta.plots ?? []).filter(plot => ['alertcondition', 'alert_cond'].includes(plot.type)).map(plot => ({ id: plot.id, title: meta.styles?.[plot.id]?.title ?? plot.title ?? plot.id }));
        let offsets = null;
        const liveOffsets = typeof source.plotOffsets === 'function' ? source.plotOffsets() : source._plotOffsets;
        if (liveOffsets && typeof liveOffsets === 'object') offsets = plain(liveOffsets);
        Object.assign(entry, { available: !!pineId && pineVersion != null, kind: isStrategy ? 'strategy' : 'indicator',
          pine_id: pineId ?? null, pine_version: pineVersion == null ? null : String(pineVersion),
          inputs: plain(inputs), input_definitions: plain(userDefinitions), alert_conditions: alertConditions,
          plot_ids: (meta.plots ?? []).map(plot => plot.id), offsets_by_plot: offsets });
        if (!entry.available) entry.unavailable_reason = 'No exact Pine script ID/version could be read; no version is guessed.';
      } catch (error) { entry.unavailable_reason = String(error.message).slice(0, 200); }
      out.studies.push(entry);
    }
    return out;
  }
  throw new Error('INVALID_OPERATION: unknown alert operation.');
}

const call = (ctx, operation, data = {}) => ctx.callPage(alertPage, { operation, data }, { timeoutMs: 22000 });
const getAlert = (ctx, alertId) => call(ctx, 'get', { alert_id: normalizeAlertId(alertId) });
const slicePage = (rows, args) => {
  const offset = args.offset ?? 0, limit = args.limit ?? 100;
  const items = rows.slice(offset, offset + limit);
  const hasMore = offset + items.length < rows.length;
  return { items, offset, limit, returned: items.length, matched: rows.length,
    next_offset: hasMore ? offset + items.length : null, has_more: hasMore,
    truncated: offset > 0 || hasMore };
};

export function buildAlertPayload(args, source, now = Date.now()) {
  const message = args.message ?? '';
  const messageValidation = validateAlertMessage(message, args.message_format ?? 'text');
  if (args.webhook_url != null) validateWebhook(args.webhook_url);
  const condition = args.condition;
  if (!condition || !['price', 'strategy', 'indicator'].includes(condition.kind)) throw new ToolError('INVALID_CONDITION', 'Choose price, strategy or indicator alert kind.');
  const symbol = args.symbol ?? source.symbol;
  const resolution = args.resolution ?? source.resolution;
  if (!symbol || !resolution || !/^[^\s:]+:[^\s]+$/.test(symbol)) throw new ToolError('CHART_NOT_READY', 'An exchange-qualified symbol and resolution are required.');
  const frequency = condition.frequency ?? 'on_bar_close';
  let trigger;
  let selected = null;
  if (condition.kind === 'price') {
    if (!Number.isFinite(condition.price)) throw new ToolError('INVALID_PRICE', 'A finite price is required for a price alert.');
    if (!['cross', 'cross_up', 'cross_down', 'greater', 'less'].includes(condition.comparison)) throw new ToolError('INVALID_CONDITION', 'A supported price comparison is required.');
    trigger = { type: condition.comparison, frequency, series: [{ type: 'barset' }, { type: 'value', value: condition.price }] };
  } else {
    if (symbol !== source.symbol || String(resolution) !== String(source.resolution)) throw new ToolError('SOURCE_MISMATCH', 'Study alerts must use the attached chart symbol and resolution. Change the chart first, then read its current study configuration.');
    let matches = source.studies.filter(study => study.kind === condition.kind);
    if (condition.study_id) matches = matches.filter(study => study.study_id === condition.study_id);
    if (condition.study_name) matches = matches.filter(study => study.name === condition.study_name);
    if (matches.length !== 1) throw new ToolError('AMBIGUOUS_STUDY', 'Select exactly one attached study using its stable ID or exact unique name.', { candidates: matches.map(study => ({ study_id: study.study_id, name: study.name })) });
    selected = matches[0];
    if (!selected.available) throw new ToolError('STUDY_METADATA_UNAVAILABLE', selected.unavailable_reason ?? 'Exact study metadata is unavailable.');
    const inputs = { ...selected.inputs };
    for (const [key, value] of Object.entries(condition.input_overrides ?? {})) {
      if (!Object.hasOwn(inputs, key) || !/^in_\d+$/.test(key)) throw new ToolError('INVALID_INPUT', 'Only observed user input IDs can be overridden.', { input_id: key });
      const definition = selected.input_definitions?.find(input => input.id === key);
      if (definition?.type === 'integer' && !Number.isInteger(value)) throw new ToolError('INVALID_INPUT', 'Integer input requires an integer.', { input_id: key });
      if (['float', 'number', 'price'].includes(definition?.type) && !Number.isFinite(value)) throw new ToolError('INVALID_INPUT', 'Numeric input requires a finite number.', { input_id: key });
      if (definition?.type === 'bool' && typeof value !== 'boolean') throw new ToolError('INVALID_INPUT', 'Boolean input requires true or false.', { input_id: key });
      if (['text', 'string', 'symbol', 'resolution', 'session'].includes(definition?.type) && typeof value !== 'string') throw new ToolError('INVALID_INPUT', 'Text input requires a string.', { input_id: key });
      if (Array.isArray(definition?.options) && !definition.options.includes(value)) throw new ToolError('INVALID_INPUT', 'Input is not one of the observed options.', { input_id: key });
      if (definition?.min != null && value < definition.min || definition?.max != null && value > definition.max) throw new ToolError('INVALID_INPUT', 'Input is outside its observed range.', { input_id: key });
      inputs[key] = value;
    }
    const series = { type: 'study', study: condition.kind === 'strategy' ? 'StrategyScript@tv-scripting-101' : 'Script@tv-scripting-101',
      inputs, pine_id: selected.pine_id, pine_version: selected.pine_version };
    if (condition.kind === 'strategy') trigger = { type: 'strategy', strategy_mode: 'strategy', series: [series] };
    else {
      if (!selected.alert_conditions.some(item => item.id === condition.alert_condition_id)) throw new ToolError('UNKNOWN_ALERT_CONDITION', 'Select an alert condition ID observed on this study. Plot indices are never guessed.', { available: selected.alert_conditions });
      const offsets = condition.offsets_by_plot ?? selected.offsets_by_plot;
      if (!offsets || typeof offsets !== 'object') throw new ToolError('PLOT_OFFSETS_UNAVAILABLE', 'Current plot offsets could not be read. Supply offsets_by_plot from this study; no zero-offset default is assumed.');
      for (const [key, value] of Object.entries(offsets)) if (!selected.plot_ids.includes(key) || !Number.isInteger(value)) throw new ToolError('INVALID_PLOT_OFFSET', 'Plot offset must refer to an observed plot and be an integer.');
      series.offsets_by_plot = offsets;
      trigger = { type: 'alert_cond', alert_cond_id: condition.alert_condition_id, frequency, series: [series] };
    }
  }
  const symbolToken = symbol === source.symbol ? { ...source.symbol_token, symbol } : { symbol };
  const encodedSymbol = Object.keys(symbolToken).length === 1 && typeof symbolToken.symbol === 'string'
    ? symbolToken.symbol : `=${JSON.stringify(symbolToken)}`;
  const payload = { conditions: [trigger], symbol: encodedSymbol, resolution: String(resolution),
    name: args.name, message, web_hook: args.webhook_url ?? '',
    popup: args.notifications?.popup ?? false, email: args.notifications?.email ?? false,
    mobile_push: args.notifications?.mobile_push ?? false, sms_over_email: false,
    sound_file: null, sound_duration: 0, active: args.active === true,
    auto_deactivate: condition.kind === 'price' && frequency === 'on_first_fire',
    expiration: new Date(now + (args.expiration_days ?? 30) * 86400000).toISOString(), ignore_warnings: false };
  return { payload, expected: { name: args.name, symbol, resolution: String(resolution), active: args.active === true,
    conditions: [trigger], message, webhook_url: args.webhook_url ?? null,
    popup: payload.popup, email: payload.email, mobile_push: payload.mobile_push }, messageValidation,
    source_study: selected ? { study_id: selected.study_id, name: selected.name, pine_id: selected.pine_id, pine_version: selected.pine_version, inputs_sha256: hash(payload.conditions[0].series[0].inputs) } : null };
}

const subsetMatches = (expected, observed) => {
  if (expected === null) return observed === null || observed === '';
  if (Array.isArray(expected)) return Array.isArray(observed) && expected.length === observed.length && expected.every((item, index) => subsetMatches(item, observed[index]));
  if (expected && typeof expected === 'object') return observed && typeof observed === 'object' && Object.entries(expected).every(([key, value]) => Object.hasOwn(observed, key) && subsetMatches(value, observed[key]));
  return expected === observed;
};

export function verifyStoredAlert(observed, expected) {
  const fields = {};
  const unknown = [], mismatches = [];
  if (!observed) return { exists_verified: false, configuration_verified: false, active_verified: false, delivery_verified: null, fields, mismatches: ['alert missing'], unverified_fields: [] };
  for (const [key, wanted] of Object.entries(expected)) {
    if (wanted === undefined) continue;
    if (!Object.hasOwn(observed, key)) { fields[key] = null; unknown.push(key); }
    else { fields[key] = subsetMatches(wanted, key === 'resolution' ? String(observed[key]) : observed[key]); if (!fields[key]) mismatches.push(key); }
  }
  return { exists_verified: true,
    configuration_verified: Object.entries(fields).filter(([key]) => key !== 'active').every(([, value]) => value === true),
    active_verified: Object.hasOwn(expected, 'active') ? fields.active === true : null,
    delivery_verified: null, fields, mismatches, unverified_fields: unknown,
    delivery_note: 'Saved configuration and alert activation do not prove an HTTP webhook delivery. No test webhook was sent.' };
}

export function summarizeAlert(observed, { include_message = false, include_webhook_url = false } = {}) {
  if (!observed) return null;
  const { message, webhook_url, conditions, ...metadata } = observed;
  let destinationOrigin = null;
  try { destinationOrigin = webhook_url ? new URL(webhook_url).origin : null; } catch { /* no URL echoed */ }
  return { ...metadata,
    ...(message === undefined ? {} : { message_sha256: hash(message ?? ''), message_utf8_bytes: byteLength(message ?? ''), ...(include_message ? { message } : {}) }),
    ...(webhook_url === undefined ? { webhook_configured: null } : { webhook_configured: !!webhook_url, webhook_origin: destinationOrigin,
      webhook_sha256: webhook_url ? hash(webhook_url) : null, ...(include_webhook_url ? { webhook_url } : {}) }),
    conditions: conditions?.map(condition => ({ ...condition, series: condition.series?.map(series => {
      const { inputs, ...other } = series;
      return { ...other, ...(inputs ? { inputs_count: Object.keys(inputs).length, inputs_sha256: hash(inputs) } : {}) };
    }) })),
  };
}

async function verifyWithPolling(ctx, id, expected, { timeoutMs = 12000 } = {}) {
  let observed = null, verification = verifyStoredAlert(null, expected), consecutive = 0;
  try {
    await ctx.poll(async () => {
      observed = await getAlert(ctx, id);
      verification = verifyStoredAlert(observed, expected);
      const complete = verification.configuration_verified && (expected.active === undefined || verification.active_verified);
      consecutive = complete ? consecutive + 1 : 0;
      return observed;
    }, () => consecutive >= 2, { timeoutMs, intervalMs: 500, description: 'independently verify stored alert configuration and activation' });
  } catch (error) {
    if (ctx.signal?.aborted || error.code === 'CANCELLED') throw error;
    verification.read_error = error.code ?? 'READ_FAILED';
  }
  return { observed, verification };
}

export async function createAlert(args, ctx) {
  const key = `alert-create-${hash(args.idempotency_key)}`;
  const requestHash = hash({ ...args, target_id: undefined, expected_layout_id: undefined, source_layout_id: ctx.expectedLayoutId });
  const prior = await ctx.loadCheckpoint(key);
  if (prior && prior.request_hash !== requestHash) throw new ToolError('IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to a different alert configuration.');
  const source = await call(ctx, 'source');
  const prepared = buildAlertPayload(args, source);
  if (prior?.alert_id) {
    const checked = await verifyWithPolling(ctx, prior.alert_id, prepared.expected);
    return { replayed: true, alert_id: prior.alert_id, created: checked.verification.exists_verified,
      alert: summarizeAlert(checked.observed), verification: checked.verification, delivery_verified: null };
  }
  const before = await call(ctx, 'list');
  if (prior) {
    const matches = before.filter(alert => !prior.known_ids.includes(alert.alert_id) && alert.name === args.name);
    if (matches.length === 1) {
      const observed = await getAlert(ctx, matches[0].alert_id);
      if (!verifyStoredAlert(observed, prepared.expected).configuration_verified) throw new ToolError('UNCERTAIN_MUTATION', 'A new same-name alert appeared, but its full stored configuration could not establish ownership. No alert was selected or changed.', { candidate_alert_ids: matches.map(row => row.alert_id) });
      await ctx.checkpoint(key, { ...prior, stage: 'created', alert_id: matches[0].alert_id });
      const checked = await verifyWithPolling(ctx, matches[0].alert_id, prepared.expected);
      return { reconciled: true, created: true, alert_id: matches[0].alert_id, alert: summarizeAlert(checked.observed), verification: checked.verification, delivery_verified: null };
    }
    throw new ToolError('UNCERTAIN_MUTATION', 'An alert creation was previously submitted. No second alert will be submitted automatically.', { candidate_alert_ids: matches.map(row => row.alert_id) });
  }
  if (before.some(alert => alert.name === args.name)) throw new ToolError('DUPLICATE_ALERT_NAME', 'An alert already has the requested name. Use a unique name or an explicit update.');
  await ctx.assertLayout(ctx.expectedLayoutId);
  await ctx.checkpoint(key, { stage: 'submitted', request_hash: requestHash, known_ids: before.map(row => row.alert_id),
    configuration_sha256: hash(prepared.expected), source_layout_id: ctx.expectedLayoutId });
  let response = null;
  let submissionError = null;
  let submissionMessage = null;
  try { response = await call(ctx, 'create', { payload: prepared.payload }); } catch (error) { submissionError = error.code ?? 'SUBMISSION_FAILED'; submissionMessage = redact(String(error.message ?? 'Submission failed.').slice(0, 300)); }
  let id = response?.alert_id != null ? normalizeAlertId(response.alert_id) : null;
  if (id && before.some(row => row.alert_id === id)) throw new ToolError('UNCERTAIN_MUTATION', 'TradingView returned a pre-existing alert ID for creation. That alert will not be selected or changed.', { returned_alert_id: id });
  if (!id) {
    try {
      const matches = await ctx.poll(async () => (await call(ctx, 'list')).filter(row => !before.some(old => old.alert_id === row.alert_id) && row.name === args.name), rows => rows.length > 0,
        { timeoutMs: 8000, intervalMs: 400, description: 'reconcile alert creation without an acknowledgement ID' });
      if (matches.length === 1) {
        const candidateId = normalizeAlertId(matches[0].alert_id);
        const observed = await getAlert(ctx, candidateId);
        if (verifyStoredAlert(observed, prepared.expected).configuration_verified) id = candidateId;
      }
    } catch { /* A failed acknowledgement must never invite an automatic duplicate. */ }
  }
  if (!id) throw new ToolError('UNCERTAIN_MUTATION', 'No unique new alert ID could be established. Reconcile the alert list before retrying.', { submission_error: submissionError, submission_message: submissionMessage, idempotency_key: args.idempotency_key });
  await ctx.checkpoint(key, { stage: 'created', request_hash: requestHash, alert_id: id, configuration_sha256: hash(prepared.expected), source_layout_id: ctx.expectedLayoutId });
  let activationWindowPossible = false;
  if (prepared.expected.active === false) {
    // Mitigate an ignored paused-create request immediately, before potentially
    // slow configuration polling. An unknown state also warrants a stop request.
    const first = await getAlert(ctx, id);
    if (first?.active !== false) {
      activationWindowPossible = true;
      await ctx.assertLayout(ctx.expectedLayoutId);
      await call(ctx, 'pause', { alert_ids: [id] });
    }
  }
  const checked = await verifyWithPolling(ctx, id, prepared.expected);
  await ctx.checkpoint(key, { stage: checked.verification.configuration_verified && checked.verification.active_verified ? 'verified' : 'created_needs_verification',
    request_hash: requestHash, alert_id: id, configuration_sha256: hash(prepared.expected), source_layout_id: ctx.expectedLayoutId });
  return { created: checked.verification.exists_verified, alert_id: id, alert: summarizeAlert(checked.observed), verification: checked.verification,
    source_study: prepared.source_study, message_validation: prepared.messageValidation,
    activation_window_possible: activationWindowPossible, delivery_verified: null };
}

async function setActive(args, ctx, active) {
  const ids = args.alert_ids.map(normalizeAlertId);
  const rows = await call(ctx, 'list');
  const missing = ids.filter(id => !rows.some(row => row.alert_id === id));
  if (missing.length) throw new ToolError('NOT_FOUND', 'Some requested alert IDs do not exist. Nothing was changed.', { missing });
  await ctx.assertLayout(ctx.expectedLayoutId);
  await call(ctx, active ? 'resume' : 'pause', { alert_ids: ids });
  let last = rows, verified = false, consecutive = 0;
  try {
    await ctx.poll(async () => { last = await call(ctx, 'list'); consecutive = ids.every(id => last.find(row => row.alert_id === id)?.active === active) ? consecutive + 1 : 0; return last; },
      () => consecutive >= 2, { timeoutMs: args.timeout_ms ?? (active ? 90000 : 15000), intervalMs: 600, description: 'verify eventual alert activation state' });
    verified = true;
  } catch (error) { if (ctx.signal?.aborted || error.code === 'CANCELLED') throw error; }
  return { verified, desired_active: active, results: ids.map(id => ({ alert_id: id, previous_active: rows.find(row => row.alert_id === id).active,
    current_active: last.find(row => row.alert_id === id)?.active ?? null })), delivery_verified: null };
}

async function deleteAlerts(args, ctx) {
  const ids = args.alert_ids.map(normalizeAlertId);
  const before = await call(ctx, 'list');
  const missing = ids.filter(id => !before.some(row => row.alert_id === id));
  if (missing.length) throw new ToolError('NOT_FOUND', 'Some alert IDs do not exist. No alerts were deleted.', { missing });
  await ctx.assertLayout(ctx.expectedLayoutId); await call(ctx, 'delete', { alert_ids: ids });
  const after = await ctx.poll(() => call(ctx, 'list'), rows => ids.every(id => !rows.some(row => row.alert_id === id)),
    { timeoutMs: 20000, intervalMs: 400, description: 'verify exact alert IDs disappeared' });
  return { verified_absent: true, deleted: before.filter(row => ids.includes(row.alert_id)).map(row => summarizeAlert(row)), remaining_count: after.length };
}

const patchSchema = object({ name: label, message: createAlertProperties.message, message_format: createAlertProperties.message_format,
  webhook_url: createAlertProperties.webhook_url, active: { type: 'boolean' }, notifications: createAlertProperties.notifications });

export async function updateAlert(args, ctx) {
  const id = normalizeAlertId(args.alert_id);
  const before = await getAlert(ctx, id);
  if (!before) throw new ToolError('NOT_FOUND', 'Alert not found.');
  const patch = args.patch;
  const stateOnly = Object.keys(patch).length === 1 && Object.hasOwn(patch, 'active');
  if (stateOnly) return setActive({ alert_ids: [id] }, ctx, patch.active);
  if (before.active !== true && !args.allow_temporary_activation) throw new ToolError('UPDATE_WOULD_REARM', 'TradingView native modify re-arms paused alerts. Use a new paused alert, or explicitly allow_temporary_activation for this update. No change was submitted.');
  if (patch.message !== undefined) validateAlertMessage(patch.message, patch.message_format ?? 'text');
  if (patch.webhook_url != null) validateWebhook(patch.webhook_url);
  const modelPatch = {}, expected = {};
  for (const key of ['name', 'message']) if (Object.hasOwn(patch, key)) { modelPatch[key] = patch[key]; expected[key] = patch[key]; }
  if (Object.hasOwn(patch, 'webhook_url')) { modelPatch.webhook = patch.webhook_url; expected.webhook_url = patch.webhook_url; }
  for (const [wire, model] of [['popup', 'popup'], ['email', 'email'], ['mobile_push', 'mobilePush']]) if (Object.hasOwn(patch.notifications ?? {}, wire)) { modelPatch[model] = patch.notifications[wire]; expected[wire] = patch.notifications[wire]; }
  if (!Object.keys(modelPatch).length) throw new ToolError('EMPTY_PATCH', 'Patch has no configuration changes.');
  const desiredActive = patch.active ?? before.active;
  expected.active = desiredActive;
  await ctx.assertLayout(ctx.expectedLayoutId); await call(ctx, 'update', { alert_id: id, patch: modelPatch });
  if (desiredActive === false) await call(ctx, 'pause', { alert_ids: [id] });
  const checked = await verifyWithPolling(ctx, id, expected);
  return { alert_id: id, verification: checked.verification, alert: summarizeAlert(checked.observed),
    previous_configuration_sha256: hash(before), temporary_activation_possible: before.active !== true, delivery_verified: null };
}

export async function cloneAlert(args, ctx) {
  const sourceId = normalizeAlertId(args.alert_id);
  const key = `alert-clone-${hash(args.idempotency_key)}`;
  const requestHash = hash({ alert_id: sourceId });
  const prior = await ctx.loadCheckpoint(key);
  if (prior && prior.request_hash !== requestHash) throw new ToolError('IDEMPOTENCY_CONFLICT', 'Key belongs to a different clone request.');
  const source = await getAlert(ctx, sourceId);
  if (!source) throw new ToolError('NOT_FOUND', 'Source alert does not exist.');
  const expected = { active: false };
  const fields = ['symbol', 'resolution', 'conditions', 'message', 'webhook_url', 'popup', 'email', 'mobile_push'];
  const missing = fields.filter(field => !Object.hasOwn(source, field));
  if (missing.length) throw new ToolError('SOURCE_ALERT_CONFIGURATION_UNAVAILABLE', 'The source alert configuration is incomplete; a new clone could not be attributed safely. No clone was submitted.', { unverified_fields: missing });
  for (const field of fields) expected[field] = source[field];
  const sourceHash = hash(expected);
  if (prior?.source_configuration_sha256 && prior.source_configuration_sha256 !== sourceHash) throw new ToolError('SOURCE_ALERT_CHANGED', 'The source alert changed after this clone operation began. Existing IDs must be reconciled before another clone.');
  if (prior?.alert_id) {
    const checked = await verifyWithPolling(ctx, prior.alert_id, expected);
    return { replayed: true, cloned_from: sourceId, alert_id: prior.alert_id, alert: summarizeAlert(checked.observed), verification: checked.verification, delivery_verified: null };
  }
  const before = await call(ctx, 'list');
  const knownIds = prior?.known_ids ?? before.map(row => row.alert_id);
  if (!prior) {
    await ctx.assertLayout(ctx.expectedLayoutId);
    await ctx.checkpoint(key, { stage: 'submitted', request_hash: requestHash, known_ids: knownIds,
      source_alert_id: sourceId, source_configuration_sha256: sourceHash });
    try { await call(ctx, 'clone', { alert_id: sourceId }); }
    catch { /* Reconcile one submission; never issue a second native clone. */ }
  }
  let candidates = [];
  let owned;
  try {
    owned = await ctx.poll(async () => {
      candidates = (await call(ctx, 'list')).filter(row => !knownIds.includes(row.alert_id));
      if (candidates.length > 10) throw new ToolError('AMBIGUOUS_CLONE', 'Too many new alert IDs appeared to attribute a clone.');
      const matches = [];
      for (const candidate of candidates) {
        const observed = await getAlert(ctx, candidate.alert_id);
        if (verifyStoredAlert(observed, expected).configuration_verified) matches.push(observed);
      }
      if (matches.length > 1) throw new ToolError('AMBIGUOUS_CLONE', 'Multiple newly appearing alerts match the source configuration.');
      return matches[0] ?? null;
    }, row => !!row, { timeoutMs: 12000, intervalMs: 400, description: 'attribute one new clone by exact stored configuration' });
  } catch (error) {
    if (ctx.signal?.aborted || error.code === 'CANCELLED') throw error;
    throw new ToolError('UNCERTAIN_MUTATION', 'No unique clone could be attributed from stored configuration. No newly appearing alert was paused or modified.', { candidate_alert_ids: candidates.map(row => row.alert_id), reason: error.code ?? 'READ_FAILED' });
  }
  const id = normalizeAlertId(owned.alert_id);
  await ctx.checkpoint(key, { stage: 'created', request_hash: requestHash, source_alert_id: sourceId,
    alert_id: id, source_configuration_sha256: sourceHash });
  if (owned.active !== false) { await ctx.assertLayout(ctx.expectedLayoutId); await call(ctx, 'pause', { alert_ids: [id] }); }
  const checked = await verifyWithPolling(ctx, id, expected);
  return { cloned_from: sourceId, alert_id: id, alert: summarizeAlert(checked.observed), verification: checked.verification,
    note: 'Native clone name is retained. Renaming or retargeting a paused alert uses a re-arming API and is a separate explicit update.', delivery_verified: null };
}

const tools = [
  { name: 'alert_list', description: 'Page through the complete server-returned alert inventory by stable ID with redacted summaries. Filters apply before offset/limit. Continue with next_offset until has_more=false; no 500-alert total cap.', inputSchema: object({ symbol: label, name: label, active: { type: 'boolean' }, limit: pageLimit, offset: pageOffset }), mutates: false,
    handler: async (args, ctx) => { const all = await call(ctx, 'list'); const rows = all.filter(row => (!args.symbol || row.symbol === args.symbol) && (!args.name || row.name?.includes(args.name)) && (args.active === undefined || row.active === args.active));
      const { items, ...pagination } = slicePage(rows, args); return { total: all.length, ...pagination, alerts: items.map(row => summarizeAlert(row)),
        pagination_note: 'Each page re-reads the server inventory. If alerts change while paging, deduplicate by alert_id and repeat an inventory pass.' }; } },
  { name: 'alert_get', description: 'Read one alert from the server and native detail model. Unknown webhook or condition fields remain unknown, never fabricated.', inputSchema: object({ alert_id: idSchema, include_message: { type: 'boolean' }, include_webhook_url: { type: 'boolean' } }, ['alert_id']), mutates: false,
    handler: async (args, ctx) => { const row = await getAlert(ctx, args.alert_id); if (!row) throw new ToolError('NOT_FOUND', 'Alert not found.'); return summarizeAlert(row, args); } },
  { name: 'alert_sources', description: 'Discover exact attached Pine study IDs, versions, input metadata and available alertcondition IDs. Does not guess plot indices.', inputSchema: object(), mutates: false,
    handler: async (_args, ctx) => { const source = await call(ctx, 'sources'); return { symbol: source.symbol, resolution: source.resolution,
      studies: source.studies.map(({ inputs, ...study }) => ({ ...study, inputs_count: inputs ? Object.keys(inputs).length : null, inputs_sha256: inputs ? hash(inputs) : null })) }; } },
  { name: 'alert_validate_message', description: 'Validate exact alert-message bytes and JSON template structure without substituting TradingView placeholders or sending a request.', inputSchema: object({ message: createAlertProperties.message, message_format: createAlertProperties.message_format }, ['message']), mutates: false, scope: 'local', requiresLayout: false,
    handler: async args => validateAlertMessage(args.message, args.message_format ?? 'text') },
  { name: 'alert_prepare', description: 'Build and validate a native price, strategy or indicator alert from current chart state without creating it. Returns hashes and inspectable routing metadata.', inputSchema: createAlertSchema, mutates: false,
    handler: async (args, ctx) => { const prepared = buildAlertPayload(args, await call(ctx, 'source')); return { ready_to_submit: true, name: args.name, kind: args.condition.kind,
      symbol: prepared.expected.symbol, resolution: prepared.expected.resolution, requested_active: prepared.expected.active,
      webhook_origin: args.webhook_url ? new URL(args.webhook_url).origin : null, configuration_sha256: hash(prepared.expected),
      source_study: prepared.source_study, message_validation: prepared.messageValidation,
      delivery_verified: null, live_compatibility_verified: false }; } },
  { name: 'alert_create', description: 'Create a native alert directly, without requiring a template. Supports price thresholds, attached Pine strategy order fills and discovered indicator alertconditions. Durable idempotency plus independent configuration verification; defaults to requesting paused state.', inputSchema: createAlertSchema, mutates: true, handler: createAlert },
  { name: 'alert_update', description: 'Update name, message, webhook or notifications through the native alert model. Refuses to re-arm a paused alert unless explicitly allowed; reports every unverified field.', inputSchema: object({ alert_id: idSchema, patch: patchSchema, allow_temporary_activation: { type: 'boolean', default: false } }, ['alert_id', 'patch']), mutates: true, handler: updateAlert },
  { name: 'alert_clone', description: 'Make one native alert clone and verify its independent ID and copied configuration. Keeps the native clone name and requests paused state.', inputSchema: object({ alert_id: idSchema, idempotency_key: operationKey }, ['alert_id', 'idempotency_key']), mutates: true, handler: cloneAlert },
  { name: 'alert_pause', description: 'Pause explicit alert IDs and independently poll their eventual server state.', inputSchema: object({ alert_ids: idsSchema, timeout_ms: { type: 'integer', minimum: 1000, maximum: 120000 } }, ['alert_ids']), mutates: true, handler: (args, ctx) => setActive(args, ctx, false) },
  { name: 'alert_resume', description: 'Resume explicit alert IDs and independently poll their eventual server state. Does not claim a trigger or delivery occurred.', inputSchema: object({ alert_ids: idsSchema, timeout_ms: { type: 'integer', minimum: 1000, maximum: 120000 } }, ['alert_ids']), mutates: true, handler: (args, ctx) => setActive(args, ctx, true) },
  { name: 'alert_delete', description: 'Permanently delete explicit alert IDs only after resolving them, then confirm those exact IDs disappeared.', inputSchema: object({ alert_ids: idsSchema }, ['alert_ids']), mutates: true, destructive: true, handler: deleteAlerts },
  { name: 'alert_fires', description: 'Page through server-returned firing history using offset/limit. Filters apply before pagination. A fire record does not prove a webhook endpoint received a request.', inputSchema: object({ alert_id: idSchema, limit: pageLimit, offset: pageOffset }), mutates: false,
    handler: async (args, ctx) => { const all = await call(ctx, 'fires'); const id = args.alert_id ? normalizeAlertId(args.alert_id) : null;
      const rows = id ? all.filter(row => String(row.alert_id ?? row.id) === id) : all;
      const { items, ...pagination } = slicePage(rows, args); return { total: all.length, ...pagination, events: items, delivery_verified: null,
        pagination_note: 'History is limited to what TradingView retains and returns. A changing history can shift offsets.' }; } },
  { name: 'alert_verify', description: 'Compare the independent stored alert with a desired native definition, including exact webhook URL, exact message bytes, conditions, symbol, timeframe and activation.', inputSchema: object({ alert_id: idSchema, definition: createAlertSchema }, ['alert_id', 'definition']), mutates: false,
    handler: async (args, ctx) => { const prepared = buildAlertPayload(args.definition, await call(ctx, 'source')); const checked = await verifyWithPolling(ctx, args.alert_id, prepared.expected); return { alert_id: args.alert_id, verification: checked.verification, alert: summarizeAlert(checked.observed) }; } },
  { name: 'alert_create_bulk', description: 'Preflight all requested native alert definitions, then create sequentially with per-item idempotency and an explicit partial-progress report.', inputSchema: object({ items: { type: 'array', items: createAlertSchema, minItems: 1, maxItems: 50 }, stop_on_error: { type: 'boolean', default: true } }, ['items']), mutates: true,
    handler: async (args, ctx) => {
      if (new Set(args.items.map(item => item.idempotency_key)).size !== args.items.length || new Set(args.items.map(item => item.name)).size !== args.items.length) throw new ToolError('DUPLICATE_BATCH_ITEM', 'Batch names and idempotency keys must be unique.');
      const source = await call(ctx, 'source'); for (const item of args.items) buildAlertPayload(item, source);
      const results = [];
      for (let index = 0; index < args.items.length; index++) {
        try { results.push({ index, result: await createAlert(args.items[index], ctx) }); }
        catch (error) { if (ctx.signal?.aborted || error.code === 'CANCELLED') throw error; results.push({ index, error: { code: error.code ?? 'FAILED', message: error.message } }); if (args.stop_on_error !== false) break; }
      }
      return { requested: args.items.length, attempted: results.length, results, skipped: args.items.length - results.length, delivery_verified: null };
    } },
  { name: 'alert_reconcile', description: 'Read-only comparison of multiple desired alert definitions against their exact server IDs; no automatic deletion, recreation or webhook tests.', inputSchema: object({ items: { type: 'array', items: object({ alert_id: idSchema, definition: createAlertSchema }, ['alert_id', 'definition']), minItems: 1, maxItems: 50 } }, ['items']), mutates: false,
    handler: async (args, ctx) => { const source = await call(ctx, 'source'); const results = []; for (const item of args.items) { const prepared = buildAlertPayload(item.definition, source); const observed = await getAlert(ctx, item.alert_id); results.push({ alert_id: item.alert_id, verification: verifyStoredAlert(observed, prepared.expected) }); } return { results, changed: false }; } },
];

export default tools;
