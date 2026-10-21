import { ToolError } from '../core/errors.mjs';

/** Browser-only chart adapter. Fixed code is sent to the selected TradingView tab.
 * Upstream interface references are recorded in SOURCES.md; no upstream code executes.
 */
export async function chartPage(a) {
  const fail = (code, message, details = {}) => ({ ok: false, code, message, ...details });
  const root = window.TradingViewApi;
  const chart = root?._activeChartWidgetWV?.value?.();
  if (!chart) return fail('CAPABILITY_UNAVAILABLE', 'The active TradingView chart API is unavailable.');
  const unwrap = v => v && typeof v.value === 'function' ? v.value() : v;
  const requireMethod = (obj, key) => typeof obj?.[key] === 'function';
  const nativeLayoutId = () => {
    const id = unwrap(root._chartWidgetCollection?.metaInfo?.uid);
    const service = typeof root.getSaveChartService === 'function' ? root.getSaveChartService() : null;
    const value = id || (typeof service?.layoutId === 'function' ? unwrap(service.layoutId()) : null);
    return value == null || value === '' ? null : String(value);
  };
  const read = () => ({
    layout_id: nativeLayoutId(),
    symbol: chart.symbol(), resolved_symbol: resolvedSymbol(), timeframe: chart.resolution(), chart_type: chart.chartType(), session: typeof mainSeries()?.sessionId === 'function' ? unwrap(mainSeries().sessionId()) : null,
    studies: chart.getAllStudies().map(s => ({ entity_id: typeof s.id === 'string' ? s.id : null, name: s.name ?? s.title ?? null, addressable: typeof s.id === 'string' && s.id.length > 0 }))
  });
  const model = () => chart._chartWidget?.model?.();
  const inner = () => model()?.model?.() ?? model();
  const sources = () => inner()?.dataSources?.() ?? [];
  const mainSeries = () => inner()?.mainSeries?.() ?? model()?.mainSeries?.();
  const resolvedSymbol = () => {
    const info = mainSeries()?.symbolInfo?.();
    return info?.pro_name ?? info?.full_name ?? info?.name ?? null;
  };
  const find = id => {
    const matches = chart.getAllStudies().filter(s => typeof s.id === 'string' && s.id === id);
    return matches.length === 1 ? chart.getStudyById(matches[0].id) : null;
  };
  const wait = async predicate => {
    const deadline = Date.now() + Math.min(a.timeout_ms ?? 15000, 30000);
    let observed;
    do { observed = predicate(); if (observed) return true; await new Promise(r => setTimeout(r, 150)); } while (Date.now() < deadline);
    return false;
  };
  const afterMutation = async (predicate, result) => {
    const verified = await wait(predicate);
    return { ok: verified, code: verified ? undefined : 'VERIFICATION_FAILED', mutation_attempted: true, verified, ...result, observed: read() };
  };
  try {
    if (a.op === 'state') return { ok: true, ...read() };
    if (a.op === 'session' || a.op === 'set_session') {
      const main = mainSeries();
      if (!requireMethod(main, 'sessionId')) return fail('CAPABILITY_UNAVAILABLE', 'The native trading-session identity is unavailable.');
      const current = () => unwrap(main.sessionId());
      const info = main.symbolInfo?.();
      const available = Array.isArray(info?.subsessions) ? info.subsessions.map(s => ({ id: s.id, description: s.description ?? null })) : null;
      if (a.op === 'session') return { ok: true, session: current(), available_sessions: available, ...read() };
      const replay = root._replayApi;
      if (requireMethod(replay, 'isReplayStarted') && unwrap(replay.isReplayStarted()) !== false) return fail('REPLAY_STATE_BLOCKS_CHANGE', 'Changing trading session requires confirmed stopped replay.');
      if (!requireMethod(model(), 'changeSessionId')) return fail('CAPABILITY_UNAVAILABLE', 'Native changeSessionId is unavailable.');
      if (available?.length && !available.some(s => s.id === a.session) && a.session !== current()) return fail('SESSION_UNAVAILABLE', 'The requested session is not in this symbol’s advertised native sessions.', { available_sessions: available });
      const before = read();
      if (current() === a.session) return { ok: true, verified: true, already_selected: true, observed: before, available_sessions: available };
      await model().changeSessionId(a.session, 'session_selector');
      return afterMutation(() => current() === a.session && resolvedSymbol() === before.symbol, { before, requested: { session: a.session }, available_sessions: available, note: 'Trading-session selection is verified; use a pre-change strategy_capture and strategy_wait for recalculated report evidence.' });
    }
    if (a.op === 'zoom_status' || a.op === 'zoom') {
      if (!requireMethod(chart, 'getVisibleBarsRange') || !requireMethod(chart, 'getVisibleRange')) return fail('CAPABILITY_UNAVAILABLE', 'Native visible bar-range inspection is unavailable.');
      const state = () => {
        const range = chart.getVisibleBarsRange();
        if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || range.to < range.from) throw new Error('Native visible bar range is invalid.');
        return { bars_range: { from: range.from, to: range.to }, visible_range: chart.getVisibleRange(), bars_per_screen: range.to - range.from + 1 };
      };
      const before = state();
      if (a.op === 'zoom_status') return { ok: true, ...before, time_unit: 'unix_seconds', bar_range_unit: 'logical_bar_index' };
      let requested;
      if (a.bars !== undefined) {
        const scale = model()?.timeScale?.(), bars = mainSeries()?.bars?.();
        if (!requireMethod(scale, 'zoomToBarsRange') || !requireMethod(bars, 'firstIndex') || !requireMethod(bars, 'lastIndex')) return fail('CAPABILITY_UNAVAILABLE', 'Native bar-count zoom is unavailable.');
        const end = a.right_index ?? bars.lastIndex(), start = end - a.bars + 1;
        if (start < bars.firstIndex() || end > bars.lastIndex()) return fail('RANGE_NOT_LOADED', 'The requested zoom range is outside loaded bars. No unrequested history load was started.', { first_index: bars.firstIndex(), last_index: bars.lastIndex() });
        requested = { from: start, to: end, bars: a.bars };
        await scale.zoomToBarsRange(start, end);
      } else {
        const method = a.direction === 'in' ? 'zoomIn' : 'zoomOut';
        if (!requireMethod(chart, method)) return fail('CAPABILITY_UNAVAILABLE', `Native ${method} is unavailable.`);
        await chart[method]();requested = { direction: a.direction };
      }
      const tolerance = a.tolerance_bars ?? 2;
      const verified = await wait(() => {
        const observed = state();
        return a.bars !== undefined ? Math.abs(observed.bars_range.from - requested.from) <= tolerance && Math.abs(observed.bars_range.to - requested.to) <= tolerance : a.direction === 'in' ? observed.bars_per_screen < before.bars_per_screen : observed.bars_per_screen > before.bars_per_screen;
      });
      return { ok: verified, code: verified ? undefined : 'VERIFICATION_FAILED', mutation_attempted: true, verified, before, requested, observed: state(), tolerance_bars: a.bars !== undefined ? tolerance : undefined };
    }
    if (a.op === 'symbol_info') {
      if (!requireMethod(chart, 'symbolExt')) return fail('CAPABILITY_UNAVAILABLE', 'symbolExt is unavailable.');
      const info = chart.symbolExt();
      return { ok: true, ...read(), info: { symbol: info.symbol, full_name: info.full_name, exchange: info.exchange, description: info.description, type: info.type, pro_name: info.pro_name, typespecs: info.typespecs } };
    }
    if (a.op === 'symbol_search') {
      if (!requireMethod(root, 'searchSymbols')) return fail('CAPABILITY_UNAVAILABLE', 'Native symbol search is unavailable.');
      const found = await root.searchSymbols(a.query);
      const results = Array.isArray(found) ? found : found?.symbols;
      if (!Array.isArray(results)) return fail('ADAPTER_MISMATCH', 'Native symbol search returned an unrecognised result.');
      return { ok: true, query: a.query, total: results.length, results: results.slice(0, a.limit ?? 30).map(r => ({ symbol: r.symbol, full_name: r.full_name, exchange: r.exchange, description: r.description, type: r.type })) };
    }
    if (a.op === 'set_symbol') {
      if (!requireMethod(chart, 'setSymbol')) return fail('CAPABILITY_UNAVAILABLE', 'setSymbol is unavailable.');
      const before = read();
      await chart.setSymbol(a.symbol, {});
      return afterMutation(() => chart.symbol() === a.symbol && resolvedSymbol() === a.symbol, { before, requested: { symbol: a.symbol } });
    }
    if (a.op === 'set_timeframe') {
      const replay = root._replayApi;
      if (replay && requireMethod(replay, 'isReplayStarted')) {
        const state = unwrap(replay.isReplayStarted());
        if (typeof state !== 'boolean') return fail('ADAPTER_MISMATCH', 'Cannot determine replay state; timeframe change refused.');
        if (state) return fail('REPLAY_ACTIVE', 'Stop replay before changing timeframe.');
      }
      if (!requireMethod(chart, 'setResolution')) return fail('CAPABILITY_UNAVAILABLE', 'setResolution is unavailable.');
      const before = read();
      await chart.setResolution(a.timeframe, {});
      return afterMutation(() => chart.resolution() === a.timeframe, { before, requested: { timeframe: a.timeframe } });
    }
    if (a.op === 'set_type') {
      if (!requireMethod(chart, 'setChartType')) return fail('CAPABILITY_UNAVAILABLE', 'setChartType is unavailable.');
      const before = chart.chartType();
      await chart.setChartType(a.chart_type);
      return afterMutation(() => chart.chartType() === a.chart_type, { before, requested: { chart_type: a.chart_type } });
    }
    if (a.op === 'get_range') {
      if (!requireMethod(chart, 'getVisibleRange')) return fail('CAPABILITY_UNAVAILABLE', 'getVisibleRange is unavailable.');
      return { ok: true, range: chart.getVisibleRange(), time_unit: 'unix_seconds' };
    }
    if (a.op === 'set_range' || a.op === 'scroll_to') {
      if (!requireMethod(chart, 'setVisibleRange') || !requireMethod(chart, 'getVisibleRange')) return fail('CAPABILITY_UNAVAILABLE', 'Visible-range API is unavailable.');
      const before = chart.getVisibleRange();
      const width = Math.max(60, before.to - before.from);
      const wanted = a.op === 'scroll_to' ? { from: a.time - width / 2, to: a.time + width / 2 } : { from: a.from, to: a.to };
      await chart.setVisibleRange(wanted);
      const observed = chart.getVisibleRange();
      const verified = a.op === 'scroll_to' ? observed.from <= a.time && observed.to >= a.time : Math.abs(observed.from - wanted.from) <= (a.tolerance_seconds ?? 60) && Math.abs(observed.to - wanted.to) <= (a.tolerance_seconds ?? 60);
      return { ok: verified, code: verified ? undefined : 'VERIFICATION_FAILED', mutation_attempted: true, verified, before, requested: wanted, observed, time_unit: 'unix_seconds' };
    }
    if (a.op === 'wait_ready') {
      const ready = await wait(() => {
        if (a.symbol && (chart.symbol() !== a.symbol || resolvedSymbol() !== a.symbol)) return false;
        if (a.timeframe && chart.resolution() !== a.timeframe) return false;
        const main = inner()?.mainSeries?.() ?? model()?.mainSeries?.();
        const bars = main?.bars?.();
        return main?.symbolInfo?.() != null && typeof bars?.size === 'function' && bars.size() > 0;
      });
      return { ok: ready, code: ready ? undefined : 'CHART_NOT_READY', chart_ready: ready, ...read(), note: 'Chart readiness does not establish strategy-report freshness.' };
    }
    if (a.op === 'health') {
      const all = read();
      const main = inner()?.mainSeries?.() ?? model()?.mainSeries?.();
      const session = chart._chartWidget?._chartSession;
      const bars = main?.bars?.();
      return { ok: true, ...all, loaded_bars: typeof bars?.size === 'function' ? bars.size() : null, symbol_resolved: main?.symbolInfo?.() != null, unaddressable_studies: all.studies.filter(s => !s.addressable), data_session_present: session ? Boolean(session._sessionId) : null, capabilities: { symbol: requireMethod(chart, 'setSymbol'), timeframe: requireMethod(chart, 'setResolution'), studies: requireMethod(chart, 'createStudy'), range: requireMethod(chart, 'setVisibleRange'), sources: sources().length, replay: Boolean(root._replayApi) } };
    }
    if (a.op === 'study_add') {
      if (!requireMethod(chart, 'createStudy')) return fail('CAPABILITY_UNAVAILABLE', 'createStudy is unavailable.');
      const before = new Set(chart.getAllStudies().filter(s => typeof s.id === 'string').map(s => s.id));
      const id = await chart.createStudy(a.name, Boolean(a.force_overlay), false, a.inputs ?? {});
      if (typeof id !== 'string' || !id) return fail('VERIFICATION_FAILED', 'Study creation did not return a registered entity ID; do not retry blindly.', { mutation_attempted: true });
      const verified = !before.has(id) && await wait(() => chart.getAllStudies().some(s => s.id === id));
      return { ok: verified, code: verified ? undefined : 'VERIFICATION_FAILED', entity_id: id, mutation_attempted: true, verified, observed: read() };
    }
    if (a.op === 'study_remove') {
      if (!find(a.entity_id)) return fail('TARGET_NOT_FOUND', 'No exact study entity ID matched.');
      if (!requireMethod(chart, 'removeEntity')) return fail('CAPABILITY_UNAVAILABLE', 'removeEntity is unavailable.');
      await chart.removeEntity(a.entity_id);
      return afterMutation(() => !chart.getAllStudies().some(s => s.id === a.entity_id), { entity_id: a.entity_id });
    }
    if (a.op === 'study_list') return { ok: true, studies: read().studies };
    if (a.op === 'study_inputs' || a.op === 'study_set_inputs' || a.op === 'study_visibility') {
      const study = find(a.entity_id);
      if (!study) return fail('TARGET_NOT_FOUND', 'No exact study entity ID matched.');
      if (a.op === 'study_visibility') {
        if (!requireMethod(study, 'isVisible') || !requireMethod(study, 'setVisible')) return fail('CAPABILITY_UNAVAILABLE', 'Study visibility API is unavailable.');
        const before = study.isVisible();
        await study.setVisible(a.visible);
        const observed = study.isVisible();
        return { ok: observed === a.visible, code: observed === a.visible ? undefined : 'VERIFICATION_FAILED', entity_id: a.entity_id, mutation_attempted: true, before, visible: observed, verified: observed === a.visible };
      }
      if (!requireMethod(study, 'getInputValues')) return fail('CAPABILITY_UNAVAILABLE', 'Study input API is unavailable.');
      const before = study.getInputValues();
      if (!Array.isArray(before)) return fail('ADAPTER_MISMATCH', 'Study inputs are not an array.');
      const info = requireMethod(study, 'getInputsInfo') ? study.getInputsInfo() : [];
      if (a.op === 'study_inputs') return { ok: true, entity_id: a.entity_id, inputs: before.map(v => ({ id: v.id, value: v.value, name: info?.find(i => i.id === v.id)?.name ?? null })) };
      const keys = Object.keys(a.inputs);
      const unknown = keys.filter(k => !before.some(i => i.id === k));
      if (unknown.length) return fail('INVALID_ARGUMENT', 'Unknown input IDs; nothing was changed.', { unknown_inputs: unknown });
      if (!requireMethod(study, 'setInputValues')) return fail('CAPABILITY_UNAVAILABLE', 'setInputValues is unavailable.');
      const next = before.map(v => ({ ...v, value: Object.hasOwn(a.inputs, v.id) ? a.inputs[v.id] : v.value }));
      await study.setInputValues(next);
      const observed = study.getInputValues();
      const verified = keys.every(k => JSON.stringify(observed.find(v => v.id === k)?.value) === JSON.stringify(a.inputs[k]));
      return { ok: verified, code: verified ? undefined : 'VERIFICATION_FAILED', entity_id: a.entity_id, mutation_attempted: true, verified, before, inputs: observed, note: 'Input readback is verified; use strategy_wait for report freshness.' };
    }
    return fail('INVALID_ARGUMENT', 'Unknown chart operation.');
  } catch (error) {
    return fail('BROWSER_OPERATION_FAILED', String(error?.message ?? error).slice(0,600), { mutation_attempted: !['state','session','zoom_status','symbol_info','symbol_search','get_range','wait_ready','health','study_list','study_inputs'].includes(a.op), verification_required: true });
  }
}

const str = description => ({ type: 'string', minLength: 1, maxLength: 300, description });
const num = description => ({ type: 'number', description });
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const inputs = { type: 'object', minProperties: 1, maxProperties: 200, additionalProperties: { type: ['string','number','boolean'] } };
const s = (name, op, description, properties = {}, required = [], mutation = false) => ({ name, op, description, inputSchema: obj(properties, required), mutation });

export const chartDefinitions = [
  s('chart_get_state','state','Read the selected chart, saved layout ID and all registered study IDs.'),
  s('chart_get_session','session','Read the native trading-session ID and any symbol-advertised sessions such as regular and extended.'),
  s('chart_set_session','set_session','Set an advertised native trading session, verify exact session and resolved symbol, and refuse during replay.',{session:str('Exact native subsession ID from chart_get_session'),timeout_ms:{type:'integer',minimum:100,maximum:30000}},['session'],true),
  s('chart_get_zoom','zoom_status','Read the visible logical bar-index range, time range and bars per screen.'),
  s('chart_zoom','zoom','Zoom one native step in/out or to a bounded count of loaded bars, then verify actual range movement or requested bar endpoints.',{direction:{type:'string',enum:['in','out']},bars:{type:'integer',minimum:2,maximum:100000},right_index:{type:'integer'},tolerance_bars:{type:'number',minimum:0,maximum:10},timeout_ms:{type:'integer',minimum:100,maximum:30000}},[],true),
  s('chart_set_symbol','set_symbol','Set a full exchange:symbol and verify both the chart label and resolved main-series instrument identity.',{symbol:str('Full exchange:symbol')},['symbol'],true),
  s('chart_set_timeframe','set_timeframe','Set timeframe and verify readback; refuses during replay.',{timeframe:str('TradingView resolution, e.g. 60, 1D, 1W')},['timeframe'],true),
  s('chart_set_type','set_type','Set TradingView chart type numeric ID and verify readback.',{chart_type:{type:'integer',minimum:0,maximum:30}},['chart_type'],true),
  s('chart_get_visible_range','get_range','Read visible time range in Unix seconds.'),
  s('chart_set_visible_range','set_range','Set visible Unix-second time range and verify within the stated tolerance.',{from:num('Unix seconds'),to:num('Unix seconds'),tolerance_seconds:{type:'number',minimum:0,maximum:86400}},['from','to'],true),
  s('chart_scroll_to_date','scroll_to','Centre the existing visible span on a Unix-second timestamp and verify it is visible.',{time:num('Unix seconds')},['time'],true),
  s('chart_symbol_info','symbol_info','Read symbol metadata for the selected chart.'),
  s('chart_symbol_search','symbol_search','Search symbols through TradingView’s native browser API; no external lookup service.',{query:str('Symbol search query'),limit:{type:'integer',minimum:1,maximum:100}},['query']),
  s('chart_wait_ready','wait_ready','Wait for the intended symbol/timeframe and loaded bars; does not assert strategy freshness.',{symbol:str('Expected symbol'),timeframe:str('Expected resolution'),timeout_ms:{type:'integer',minimum:100,maximum:30000}}),
  s('chart_health','health','Read chart capabilities, bar availability and unaddressable studies without repair mutations.'),
  s('indicator_list','study_list','List every study on the selected pane with exact entity IDs.'),
  s('indicator_add','study_add','Create a study, await its promise, and verify a new registered entity ID.',{name:str('Study description/identifier'),force_overlay:{type:'boolean'},inputs},['name'],true),
  s('indicator_remove','study_remove','Remove exactly one entity and verify its absence.',{entity_id:str('Exact registered study ID')},['entity_id'],true),
  s('indicator_get_inputs','study_inputs','Read all input IDs, values and available display names for one exact study.',{entity_id:str('Exact registered study ID')},['entity_id']),
  s('indicator_set_inputs','study_set_inputs','Validate every input ID before changing anything; set and verify exact values.',{entity_id:str('Exact registered study ID'),inputs},['entity_id','inputs'],true),
  s('indicator_set_visibility','study_visibility','Set an explicit visibility target and verify it; never blindly toggle.',{entity_id:str('Exact registered study ID'),visible:{type:'boolean'}},['entity_id','visible'],true)
];

export default chartDefinitions.map(def => ({
  name: def.name, description: def.description, inputSchema: def.inputSchema, mutates: def.mutation,
  destructive: def.name === 'indicator_remove',
  handler: async (args, ctx) => {
    if (def.op === 'set_range' && !(args.to > args.from)) throw new ToolError('INVALID_ARGUMENT', 'to must be greater than from.');
    if (def.op === 'zoom' && Number(args.direction !== undefined) + Number(args.bars !== undefined) !== 1) throw new ToolError('INVALID_ARGUMENT', 'Provide exactly one zoom direction or bar count.');
    if (def.op === 'zoom' && args.bars === undefined && (args.right_index !== undefined || args.tolerance_bars !== undefined)) throw new ToolError('INVALID_ARGUMENT', 'A right_index or bar tolerance requires a requested bar count.');
    const result = await ctx.callPage(chartPage, { ...args, op: def.op }, { timeoutMs: (args.timeout_ms ?? 15000) + 5000 });
    if (!result?.ok) throw new ToolError(result?.code ?? 'ADAPTER_MISMATCH', result?.message ?? 'Chart operation did not verify.', result);
    return result;
  }
}));
