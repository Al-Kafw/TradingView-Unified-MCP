import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserManager } from '../src/core/browser.mjs';
import { ToolRegistry } from '../src/core/registry.mjs';
import { LocalStore } from '../src/core/storage.mjs';
import layoutTools from '../src/features/layouts.mjs';
import alertTools from '../src/features/alerts.mjs';
import chartTools from '../src/features/chart.mjs';
import workflowTools from '../src/features/workflow.mjs';

/** Two genuinely separate page contexts behind the real CDP, browser, registry
 * and context implementations. All sockets and network responses are local
 * fixtures; this test never opens Chrome, logs in, or sends a webhook.
 */
function multiPageFixture() {
  const pages = new Map(), targets = [], saves = [], mutations = [], requests = [], alerts = [];
  let copyCount = 0, createCount = 0;
  const addPage = (targetId, layoutId, name, copiedFrom = null) => {
    const state = { targetId, layoutId, name, symbol: copiedFrom?.symbol ?? 'NASDAQ:AAPL', timeframe: copiedFrom?.timeframe ?? '60', dirty: false, inputs: { in_0: 21, in_1: false } };
    const entityId = `${targetId}-study`;
    const main = { symbol: () => state.symbol, proSymbol: () => `=${JSON.stringify({ symbol: state.symbol })}`,
      interval: () => state.timeframe, symbolInfo: () => ({ ticker: state.symbol, pro_name: state.symbol, currency_id: 'USD' }), bars: () => ({ size: () => 1000 }) };
    const meta = { id: 'StrategyScript@tv-scripting-101', description: 'Acceptance strategy', scriptIdPart: 'USER;acceptance-script', scriptVersion: '5', is_strategy: true,
      inputs: [{ id: 'in_0', type: 'integer' }, { id: 'in_1', type: 'bool' }], defaults: { inputs: { pineId: 'USER;acceptance-script', pineVersion: '5' } }, plots: [] };
    const strategy = { id: () => entityId, metaInfo: () => meta, reportData: () => ({}) };
    const model = { mainSeries: () => main, dataSources: () => [strategy] };
    const widget = { model: () => ({ mainSeries: () => main, model: () => model }) };
    const studyHandle = { getInputValues: () => Object.entries(state.inputs).map(([id, value]) => ({ id, value })), getProperties: () => ({ visible: true }) };
    const chart = { _chartWidget: widget, symbol: () => state.symbol, resolution: () => state.timeframe, chartType: () => 1,
      getAllStudies: () => [{ id: entityId, name: 'Acceptance strategy' }], getStudyById: id => id === entityId ? studyHandle : null,
      getAllShapes: () => [],
      setSymbol: async symbol => { mutations.push({ type: 'symbol', target: targetId, layout: state.layoutId }); state.symbol = symbol; state.dirty = true; },
      setResolution: async timeframe => { mutations.push({ type: 'timeframe', target: targetId, layout: state.layoutId }); state.timeframe = timeframe; state.dirty = true; } };
    const saved = { id: String(100 + saves.length), url: layoutId, name, pro_symbol: state.symbol, resolution: state.timeframe }; saves.push(saved);
    const api = { activeChart: () => chart, _activeChartWidgetWV: { value: () => chart },
      _chartWidgetCollection: { metaInfo: { uid: { value: () => state.layoutId }, name: { value: () => state.name } }, getAll: () => [widget], readOnly: () => false },
      getSavedCharts: async () => structuredClone(saves),
      getSaveChartService: () => ({ layoutId: () => state.layoutId, hasChanges: () => state.dirty,
        getSaveAsController: () => ({ _actionHandler: async ({ newValue }) => {
          copyCount++; mutations.push({ type: 'copy', target: targetId, layout: state.layoutId });
          addPage('copy-tab', 'Copied02', newValue, state);
        } }) }),
      saveChartToServer: (_a, _b, options) => { mutations.push({ type: 'save', target: targetId, layout: state.layoutId });
        if (options?.chartName) state.name = options.chartName;
        state.dirty = false; Object.assign(saved, { name: state.name, pro_symbol: state.symbol, resolution: state.timeframe }); },
    };
    const location = new URL(`https://www.tradingview.com/chart/${layoutId}/`);
    const context = vm.createContext({ TradingViewApi: api, location, URL, Headers, Response, Request, AbortController,
      setTimeout, clearTimeout, Date, Math, JSON, console: { log() {}, error() {} } });
    context.window = context;
    context.fetch = async (url, options = {}) => {
      requests.push({ url: String(url), credentials: options.credentials, method: options.method, target: targetId });
      assert.equal(new URL(url).hostname, 'pricealerts.tradingview.com');
      let result;
      if (new URL(url).pathname === '/list_alerts') result = structuredClone(alerts);
      else if (new URL(url).pathname === '/create_alert') {
        createCount++; const payload = JSON.parse(options.body).payload;
        mutations.push({ type: 'alert_create', target: targetId, layout: state.layoutId, payload });
        const alert = { ...payload, alert_id: 9011, symbol: payload.symbol }; alerts.push(alert); result = { alert_id: 9011 };
      } else throw new Error(`Unexpected fixture request ${url}`);
      return new Response(JSON.stringify({ s: 'ok', r: result }), { status: 200 });
    };
    pages.set(targetId, { context, state });
    targets.push({ id: targetId, type: 'page', title: name, url: location.href, webSocketDebuggerUrl: `ws://127.0.0.1:9222/devtools/page/${targetId}` });
  };
  addPage('source-tab', 'Source01', 'Original strategy');
  class Socket extends EventTarget {
    constructor(url) { super(); this.url = url; this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send(raw) {
      const packet = JSON.parse(raw);
      const page = pages.get(new URL(this.url).pathname.split('/').at(-1));
      const run = async () => {
        assert.equal(packet.method, 'Runtime.evaluate');
        try { const value = await vm.runInContext(packet.params.expression, page.context, { timeout: 3000 }); return { result: { type: value === undefined ? 'undefined' : typeof value, value } }; }
        catch (error) { return { exceptionDetails: { exception: { description: String(error) } } }; }
      };
      run().then(result => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: packet.id, result }) })));
    }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url); assert.equal(parsed.origin, 'http://127.0.0.1:9222'); assert.equal(options.credentials, 'omit');
    if (parsed.pathname === '/json/list') return new Response(JSON.stringify(targets));
    throw new Error(`Unexpected CDP discovery path ${parsed.pathname}`);
  };
  const browser = new BrowserManager({ endpoint: 'http://127.0.0.1:9222', fetchImpl, WebSocketImpl: Socket });
  return { browser, pages, saves, mutations, requests, counts: () => ({ copies: copyCount, alerts: createCount }) };
}

const workflowArgs = () => ({ target_id: 'source-tab', expected_layout_id: 'Source01', idempotency_key: 'registry-acceptance-001',
  layout_name: 'BTC strategy acceptance copy', symbol: 'BINANCE:BTCUSDT', timeframe: '15',
  alert: { name: 'Acceptance native alert', condition: { kind: 'strategy', study_id: 'source-tab-study' }, active: false,
    message_format: 'json', message: '{"ticker":"{{ticker}}","value":{{close}},"secret":"fixture-only-message"}',
    webhook_url: 'https://example.com/hooks/fixture-only-path?token=fixture-only-token' } });

test('actual registry + guarded CDP + two page adapters complete and reconcile the exact copy workflow', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'tv-workflow-acceptance-'));
  const fixture = multiPageFixture(); const store = new LocalStore(temp);
  const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {} },  browser: fixture.browser, store });
  registry.addAll([...layoutTools, ...alertTools, ...chartTools, ...workflowTools]);
  try {
    const args = workflowArgs(); const result = await registry.execute('workflow_copy_chart_create_alert', args);
    assert.equal(result.completed, true); assert.equal(result.layout_id, 'Copied02'); assert.equal(result.alert_id, '9011');
    assert.equal(result.symbol, 'BINANCE:BTCUSDT'); assert.equal(result.timeframe, '15');
    assert.equal(result.verification.configuration_verified, true); assert.equal(result.verification.active_verified, true);
    assert.equal(result.delivery_verified, null); assert.equal(result.full_copy_fidelity_verified, false);
    assert.deepEqual(fixture.mutations.map(row => [row.type, row.target, row.layout]), [
      ['copy', 'source-tab', 'Source01'], ['symbol', 'copy-tab', 'Copied02'],
      ['timeframe', 'copy-tab', 'Copied02'], ['save', 'copy-tab', 'Copied02'], ['alert_create', 'copy-tab', 'Copied02'],
    ]);
    assert.equal(fixture.pages.get('source-tab').state.symbol, 'NASDAQ:AAPL');
    const payload = fixture.mutations.find(row => row.type === 'alert_create').payload;
    assert.equal(payload.message, args.alert.message); assert.equal(payload.web_hook, args.alert.webhook_url);
    assert.equal(payload.conditions[0].series[0].inputs.in_0, 21); assert.equal(payload.conditions[0].series[0].inputs.in_1, false);
    assert.ok(fixture.requests.length > 0); assert.ok(fixture.requests.every(row => row.credentials === 'include'));
    const before = fixture.mutations.length;
    const replay = await registry.execute('workflow_copy_chart_create_alert', args);
    assert.equal(replay.completed, true); assert.equal(fixture.mutations.length, before); assert.deepEqual(fixture.counts(), { copies: 1, alerts: 1 });
    for (const name of await store.list('checkpoints')) {
      const text = await readFile(join(temp, 'checkpoints', name), 'utf8');
      assert.doesNotMatch(text, /fixture-only-message|fixture-only-path|fixture-only-token|\{\{ticker\}\}/);
    }
  } finally { await fixture.browser.close(); await rm(temp, { recursive: true, force: true }); }
});

test('actual registry rejects a matching URL with mismatched native widget identity before the first write', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'tv-workflow-precondition-'));
  const fixture = multiPageFixture(); const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {} },  browser: fixture.browser, store: new LocalStore(temp) });
  registry.addAll([...layoutTools, ...alertTools, ...chartTools, ...workflowTools]);
  fixture.pages.get('source-tab').state.layoutId = 'Other003';
  try {
    await assert.rejects(registry.execute('workflow_copy_chart_create_alert', workflowArgs()), error => error.code === 'LAYOUT_MISMATCH');
    assert.equal(fixture.mutations.length, 0); assert.equal(fixture.requests.length, 0);
  } finally { await fixture.browser.close(); await rm(temp, { recursive: true, force: true }); }
});
