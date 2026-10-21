import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { ToolError } from '../src/core/errors.mjs';
import { assertFixedFunction } from '../src/core/security.mjs';
import { validate, validateSchemaDefinition } from '../src/core/schema.mjs';
import layoutTools, { layoutPage, chartUrl, findLayoutContext, compareLayoutSnapshots, copyLayout, saveLayout } from '../src/features/layouts.mjs';
import alertTools, { alertPage, buildAlertPayload, validateAlertMessage, verifyStoredAlert, createAlert, updateAlert, cloneAlert, normalizeAlertId } from '../src/features/alerts.mjs';
import workflowTools, { copyChartCreateAlert, copyAlertWorkflowSchema } from '../src/features/workflow.mjs';
import { createFakeCdp } from './fake-cdp.mjs';

const clone = value => structuredClone(value);
const sourceId = 'Source01', copyId = 'Copied02';
const message = '{\n  "symbol":"{{ticker}}", "price":{{close}}, "action":"{{strategy.order.action}}", "literal":"` ${neverExecuted} \\\""\n}';
const baseAlert = () => ({ name: 'Exact strategy alert', idempotency_key: 'native-alert-001',
  condition: { kind: 'strategy', study_id: 'study-source' }, message, message_format: 'json',
  webhook_url: 'https://example.com/hooks/token-value?key=private-example', active: false });
const study = (id = 'study-source') => ({ study_id: id, name: 'Example strategy', kind: 'strategy', available: true,
  pine_id: 'USER;exact-script-id', pine_version: '7', inputs: { in_0: 14, in_1: false, pineId: 'USER;exact-script-id', pineVersion: '7' },
  input_definitions: [{ id: 'in_0', type: 'integer', min: 1, max: 100 }, { id: 'in_1', type: 'bool' }],
  alert_conditions: [], plot_ids: [], offsets_by_plot: {} });
const source = (options = {}) => ({ symbol: 'NASDAQ:AAPL', resolution: '60',
  symbol_token: { symbol: 'NASDAQ:AAPL', 'currency-id': 'USD' }, studies: [study()], ...options });
const snapshot = (id = sourceId) => ({ layout_id: id, name: id === sourceId ? 'Source' : 'Copy', read_only: false,
  unsaved_changes: false, symbol: 'NASDAQ:AAPL', resolution: '60', chart_type: 1,
  panes: [{ index: 0, symbol: 'NASDAQ:AAPL', resolution: '60', chart_type: 1,
    studies: [{ name: 'Example strategy', inputs: [{ id: 'in_0', value: 14 }, { id: 'in_1', value: false }], properties: { visible: true } }],
    drawings: [{ name: 'trend_line', points: [{ time: 1000, price: 0 }, { time: 2000, price: 5 }], properties: { linecolor: '#00ff00' } }] }], unverified_fields: [] });

function harness(options = {}) {
  const state = { snapshots: new Map([['source-tab', snapshot()]]),
    targets: [{ id: 'source-tab', url: chartUrl(sourceId) }],
    layouts: [{ numeric_id: '100', layout_id: sourceId, name: 'Source', symbol: 'NASDAQ:AAPL', resolution: '60' }],
    alerts: [], checkpoints: new Map(), events: [], writes: [], cloneCount: 0, createCount: 0, alertCloneCount: 0, layoutCreateCount: 0, saveAttempts: 0, pauseCount: 0 };
  const descriptors = new Map([...layoutTools, ...alertTools, ...workflowTools].map(item => [item.name, item]));
  function context(targetId = 'source-tab', expectedLayoutId = sourceId) {
    const ctx = { targetId, expectedLayoutId, signal: undefined,
      browser: {
        async listTargets() { return clone(state.targets); },
        async openTarget(url) {
          const id = `opened-${state.targets.length}`;
          const layoutId = new URL(url).pathname.split('/')[2];
          const existing = [...state.snapshots.values()].find(row => row.layout_id === layoutId);
          if (!existing) throw new Error('No fixture layout');
          state.targets.push({ id, url }); state.snapshots.set(id, clone(existing)); return { id };
        },
      },
      async forTarget(id, expected) { return context(id, expected); },
      async assertLayout(expected = expectedLayoutId) {
        state.events.push({ tool: 'assert', target: targetId, expected });
        if (state.snapshots.get(targetId)?.layout_id !== expected) throw new ToolError('LAYOUT_MISMATCH', 'Wrong fixture layout.');
        return clone(state.snapshots.get(targetId));
      },
      async checkpoint(key, value) { state.checkpoints.set(key, clone(value)); },
      async loadCheckpoint(key) { return clone(state.checkpoints.get(key)); },
      async exportJson(name, data) { return { name, data }; },
      async wait() {},
      async poll(read, predicate) {
        let last;
        for (let n = 0; n < 8; n++) { last = await read(); if (await predicate(last)) return last; }
        throw new ToolError('VERIFICATION_TIMEOUT', 'Offline fixture did not converge.');
      },
      async callPage(fn, { operation, data = {} }) {
        const snap = state.snapshots.get(targetId);
        state.events.push({ page: fn.name, operation, target: targetId });
        if (fn === layoutPage) {
          if (operation === 'get' || operation === 'snapshot') return clone(snap);
          if (operation === 'list') return clone(state.layouts);
          if (operation === 'copy') {
            state.cloneCount++; state.writes.push({ operation, target: targetId });
            const destination = clone(snap); destination.layout_id = options.sameId ? sourceId : copyId; destination.name = data.name;
            if (options.copyInputMismatch) destination.panes[0].studies[0].inputs[0].value = 99;
            state.snapshots.set('copy-tab', destination); state.targets.push({ id: 'copy-tab', url: chartUrl(destination.layout_id) });
            state.layouts.push({ numeric_id: options.sameNumericId ? '100' : '101', layout_id: destination.layout_id, name: data.name, symbol: destination.symbol, resolution: destination.resolution });
            if (options.ambiguousCopy) state.layouts.push({ numeric_id: '102', layout_id: 'Extra003', name: data.name });
            if (options.cloneAcknowledgementLost) throw new Error('Context destroyed after server accepted clone.');
            return { submitted: true };
          }
          if (operation === 'save') {
            state.saveAttempts++;
            if (options.firstSaveFails && state.saveAttempts === 1) throw new ToolError('FIXTURE_SAVE_FAILED', 'First save request failed.');
            state.writes.push({ operation, target: targetId }); snap.unsaved_changes = false;
            if (data.name) snap.name = data.name;
            if (!options.staleSavedMetadata) Object.assign(state.layouts.find(row => row.layout_id === snap.layout_id), { symbol: snap.symbol, resolution: snap.resolution, name: snap.name });
            return { submitted: true };
          }
          if (operation === 'create') {
            state.layoutCreateCount++;
            const destination = snapshot(copyId); destination.name = 'Untitled';
            state.snapshots.set('copy-tab', destination); state.targets.push({ id: 'copy-tab', url: chartUrl(copyId) });
            state.layouts.push({ numeric_id: '101', layout_id: copyId, name: 'Untitled', symbol: destination.symbol, resolution: destination.resolution });
            return { layout_id: copyId };
          }
          throw new Error(`Unimplemented fixture layout operation ${operation}`);
        }
        if (fn === alertPage) {
          if (operation === 'source' || operation === 'sources') return source({ symbol: snap.symbol, resolution: snap.resolution,
            symbol_token: { symbol: snap.symbol }, studies: [study(targetId === 'source-tab' ? 'study-source' : 'study-copy')] });
          if (operation === 'list') return clone(state.alerts);
          if (operation === 'get') {
            const row = clone(state.alerts.find(item => item.alert_id === data.alert_id) ?? null);
            if (row && options.missingStoredWebhook) delete row.webhook_url;
            return row;
          }
          if (operation === 'create') {
            state.createCount++; state.writes.push({ operation, target: targetId, payload: clone(data.payload) });
            const p = data.payload;
            state.alerts.push({ alert_id: '9001', name: p.name, symbol: p.symbol.startsWith('=') ? JSON.parse(p.symbol.slice(1)).symbol : p.symbol,
              resolution: p.resolution, active: options.ignorePausedCreate ? true : p.active,
              conditions: p.conditions, message: p.message, webhook_url: p.web_hook, popup: p.popup, email: p.email, mobile_push: p.mobile_push });
            if (options.unrelatedSameNameAlert) state.alerts[state.alerts.length - 1].message = 'Unrelated concurrent alert';
            if (options.alertAcknowledgementLost) throw new Error('Lost create response');
            return { alert_id: 9001 };
          }
          if (operation === 'pause' || operation === 'resume') {
            if (operation === 'pause') state.pauseCount++;
            state.writes.push({ operation, target: targetId });
            for (const id of data.alert_ids) state.alerts.find(row => row.alert_id === id).active = operation === 'resume';
            return { status: 'ok' };
          }
          if (operation === 'clone') {
            state.alertCloneCount++;
            const original = state.alerts.find(row => row.alert_id === data.alert_id);
            state.alerts.push({ ...clone(original), alert_id: '9002', name: `${original.name} copy`,
              active: !!options.unrelatedClone, ...(options.unrelatedClone ? { message: 'Someone else created this alert' } : {}) });
            return { submitted: true };
          }
          if (operation === 'update') { state.writes.push({ operation, target: targetId }); return { submitted: true }; }
          throw new Error(`Unimplemented fixture alert operation ${operation}`);
        }
        throw new Error('Unknown fixed page program');
      },
      async callTool(name, args = {}) {
        state.events.push({ tool: name, target: targetId });
        const snap = state.snapshots.get(targetId);
        if (name === 'chart_get_state') return { ok: true, layout_id: snap.layout_id, symbol: snap.symbol, timeframe: snap.resolution,
          studies: [{ entity_id: targetId === 'source-tab' ? 'study-source' : 'study-copy', name: 'Example strategy' }] };
        if (name === 'chart_wait_ready') return { ok: true, ready: true };
        if (name === 'chart_set_symbol') {
          state.writes.push({ operation: name, target: targetId }); snap.symbol = args.symbol; snap.panes[0].symbol = args.symbol; snap.unsaved_changes = true; return { ok: true };
        }
        if (name === 'chart_set_timeframe') {
          state.writes.push({ operation: name, target: targetId }); snap.resolution = args.timeframe; snap.panes[0].resolution = args.timeframe; snap.unsaved_changes = true; return { ok: true };
        }
        const descriptor = descriptors.get(name);
        if (!descriptor) throw new Error(`Unknown fixture tool ${name}`);
        return descriptor.handler(args, ctx);
      },
    };
    return ctx;
  }
  return { ctx: context(), context, state };
}

test('layout and alert page programs pass the fixed credential and dynamic-code scanner', () => {
  for (const fn of [layoutPage, alertPage]) assert.equal(typeof assertFixedFunction(fn), 'string');
  const tools = [...layoutTools, ...alertTools, ...workflowTools];
  assert.equal(new Set(tools.map(item => item.name)).size, tools.length);
  for (const descriptor of tools) validateSchemaDefinition(descriptor.inputSchema);
});

test('chart URL creation accepts only a saved-layout identifier, never a URL or script', () => {
  assert.equal(chartUrl('AbCd1234'), 'https://www.tradingview.com/chart/AbCd1234/');
  for (const bad of ['https://evil.example/chart/x', '../x', 'x?symbol=X', '${process.env}', 'javascript:alert(1)']) assert.throws(() => chartUrl(bad));
});

test('copy comparison detects changed user inputs and retains zero-priced drawings', () => {
  const original = snapshot(); const copied = snapshot(copyId);
  assert.equal(compareLayoutSnapshots(original, copied).chart_verified, true);
  assert.equal(compareLayoutSnapshots(original, copied).full_fidelity_verified, false);
  copied.panes[0].studies[0].inputs[0].value = 99;
  const comparison = compareLayoutSnapshots(original, copied);
  assert.equal(comparison.chart_verified, false);
  assert.match(comparison.mismatches[0].field, /inputs$/);
  assert.equal(original.panes[0].drawings[0].points[0].price, 0);
});

test('unreadable strategy inputs prevent chart verification, while unknown properties remain explicitly partial', () => {
  const a = snapshot(), b = snapshot(copyId);
  b.panes[0].studies[0].properties = null; b.unverified_fields = ['panes.0.study.Example.properties'];
  let v = compareLayoutSnapshots(a, b); assert.equal(v.chart_verified, true); assert.equal(v.full_fidelity_verified, false); assert.equal(v.readable_configuration_verified, false);
  b.panes[0].studies[0].inputs = null;
  v = compareLayoutSnapshots(a, b); assert.equal(v.chart_verified, false); assert.ok(v.unverified_fields.some(field => field.endsWith('inputs')));
});

test('a matching URL cannot substitute for a different actual widget layout ID', async () => {
  const f = harness(); f.state.targets.push({ id: 'stale-tab', url: chartUrl(copyId) });
  f.state.snapshots.set('stale-tab', snapshot(sourceId));
  await assert.rejects(findLayoutContext(f.ctx, copyId), error => error.code === 'VERIFICATION_TIMEOUT');
  assert.equal(f.state.writes.length, 0);
});

test('native copy reconciles a lost acknowledgement and reuses the confirmed ID on retry', async () => {
  const f = harness({ cloneAcknowledgementLost: true }); const args = { name: 'Unique copy', idempotency_key: 'copy-test-0001' };
  const first = await copyLayout(args, f.ctx);
  assert.equal(first.independent_layout_verified, true); assert.equal(first.chart_verified, true); assert.equal(first.layout_id, copyId);
  const replay = await copyLayout(args, f.ctx);
  assert.equal(replay.replayed, true); assert.equal(replay.layout_id, copyId); assert.equal(f.state.cloneCount, 1);
});

test('copy stops when a purported destination reuses the source URL ID or numeric saved ID', async () => {
  for (const options of [{ sameId: true }, { sameNumericId: true }]) {
    const f = harness(options);
    await assert.rejects(copyLayout({ name: 'Bad copy', idempotency_key: 'copy-test-bad' }, f.ctx), error => ['COPY_NOT_INDEPENDENT', 'UNCERTAIN_MUTATION'].includes(error.code));
    assert.equal(f.state.createCount, 0);
  }
});

test('ambiguous copy reconciliation never selects a destination and never submits a second clone', async () => {
  const f = harness({ ambiguousCopy: true }); const args = { name: 'Collision', idempotency_key: 'copy-ambiguous' };
  await assert.rejects(copyLayout(args, f.ctx), error => error.code === 'UNCERTAIN_MUTATION');
  await assert.rejects(copyLayout(args, f.ctx), error => error.code === 'UNCERTAIN_MUTATION');
  assert.equal(f.state.cloneCount, 1);
});

test('a dirty source blocks native copy unless saving the source was explicitly requested', async () => {
  const f = harness(); f.state.snapshots.get('source-tab').unsaved_changes = true;
  await assert.rejects(copyLayout({ name: 'Copy', idempotency_key: 'dirty-source-key' }, f.ctx), error => error.code === 'UNSAVED_SOURCE');
  assert.equal(f.state.writes.length, 0);
});

test('an optimistic clean flag cannot verify a save whose persisted market and timeframe remain stale', async () => {
  const f = harness({ staleSavedMetadata: true }); const current = f.state.snapshots.get('source-tab');
  current.symbol = 'BINANCE:BTCUSDT'; current.resolution = '15'; current.unsaved_changes = true;
  await assert.rejects(saveLayout({}, f.ctx), error => error.code === 'VERIFICATION_TIMEOUT');
  assert.equal(current.unsaved_changes, false); assert.equal(f.state.layouts[0].symbol, 'NASDAQ:AAPL');
  assert.equal(f.state.createCount, 0);
});

test('new-layout recovery resumes the exact existing destination after its first name save failed', async () => {
  const f = harness({ firstSaveFails: true }); const create = layoutTools.find(tool => tool.name === 'layout_create').handler;
  const args = { name: 'Recovered blank layout', idempotency_key: 'new-layout-recovery' };
  await assert.rejects(create(args, f.ctx), error => error.code === 'FIXTURE_SAVE_FAILED');
  const recovered = await create(args, f.ctx);
  assert.equal(recovered.replayed, true); assert.equal(recovered.created, true); assert.equal(recovered.saved, true);
  assert.equal(recovered.layout_id, copyId); assert.equal(recovered.name, args.name); assert.equal(f.state.layoutCreateCount, 1);
  assert.equal(f.state.snapshots.get('source-tab').name, 'Source');
});

test('JSON placeholder validation preserves exact string and numeric templates without substitution', () => {
  const result = validateAlertMessage(message, 'json');
  assert.equal(result.template_structure_valid, true); assert.equal(result.message_preserved_exactly, true);
  assert.equal(result.sha256, createHash('sha256').update(message).digest('hex'));
  assert.deepEqual(result.placeholders, ['ticker', 'close', 'strategy.order.action']);
  assert.equal(result.delivery_payload_json_guaranteed, false);
  assert.throws(() => validateAlertMessage('{"x":{{close}}', 'json'), error => error.code === 'INVALID_JSON_TEMPLATE');
  assert.throws(() => validateAlertMessage('{{ticker', 'text'), error => error.code === 'INVALID_PLACEHOLDER');
  assert.throws(() => validateAlertMessage('€'.repeat(12000)), error => error.code === 'INVALID_MESSAGE');
});

test('native payload preserves webhook and message bytes, current inputs, false values and exact Pine version', () => {
  const args = baseAlert(); const prepared = buildAlertPayload(args, source(), 0);
  assert.equal(prepared.payload.message, message); assert.equal(prepared.payload.web_hook, args.webhook_url);
  assert.equal(prepared.payload.active, false); assert.equal(prepared.payload.ignore_warnings, false);
  const series = prepared.payload.conditions[0].series[0];
  assert.equal(series.inputs.in_0, 14); assert.equal(series.inputs.in_1, false); assert.equal(series.pine_version, '7');
  assert.equal(series.study, 'StrategyScript@tv-scripting-101');
  assert.equal(prepared.payload.conditions[0].strategy_mode, 'strategy');
  assert.deepEqual(JSON.parse(prepared.payload.symbol.slice(1)), { symbol: 'NASDAQ:AAPL', 'currency-id': 'USD' });
});
test('A disabled webhook is serialized as the native empty string and verified as absent',()=>{
 const args={...baseAlert(),webhook_url:null};const prepared=buildAlertPayload(args,source(),0);
 assert.equal(prepared.payload.web_hook,'');assert.equal(prepared.expected.webhook_url,null);
 const checked=verifyStoredAlert({...prepared.expected,webhook_url:''},prepared.expected);assert.equal(checked.fields.webhook_url,true);
 assert.equal(prepared.payload.resolution,'60');assert.equal(Object.hasOwn(prepared.payload.conditions[0],'resolution'),false);
});
test('Plain alert symbols stay plain and quote currency does not invent a conversion modifier',async()=>{
 const prepared=buildAlertPayload(baseAlert(),source({symbol_token:{symbol:'NASDAQ:AAPL'}}),0);assert.equal(prepared.payload.symbol,'NASDAQ:AAPL');
 const main={proSymbol:()=> 'NASDAQ:AAPL',symbolInfo:()=>({currency_id:'USD'})};
 const chart={symbol:()=> 'NASDAQ:AAPL',resolution:()=> '60',getAllStudies:()=>[],_chartWidget:{model:()=>({mainSeries:()=>main})}};
 const h=createFakeCdp({page:{TradingViewApi:{activeChart:()=>chart}}});
 try{const data=await h.browser.evaluate('chart-1',alertPage,{operation:'source'});assert.deepEqual(data.symbol_token,{symbol:'NASDAQ:AAPL'});}finally{await h.close();}
});
test('Alert POST includes only validated public build metadata from the native request options',async()=>{
 const col={_restRequestsHandler:{_restApi:{_options:{buildTime:'2026-10-19T17:32:06',user:'PRIVATE_USER_CANARY',token:'PRIVATE_TOKEN_CANARY'},_session:{user:{value:()=>({username:'mcp-fixture-user',token:'PRIVATE_SESSION_CANARY'})}}}}};
 const h=createFakeCdp({page:{webpackChunktradingview:{push(chunk){chunk[2]({c:{fixture:{exports:{getAlertsCollection:()=>col}}}});}}}});
 try{
  await h.browser.evaluate('chart-1',alertPage,{operation:'pause',data:{alert_ids:['123']}});
  const traffic=h.pageTraffic[0],url=new URL(traffic.url);assert.equal(url.origin,'https://pricealerts.tradingview.com');assert.equal(url.pathname,'/stop_alerts');
  assert.equal(url.searchParams.get('build_time'),'2026-10-19T17:32:06');assert.equal(url.searchParams.get('log_username'),'mcp-fixture-user');assert.deepEqual([...url.searchParams.keys()],['build_time','log_username']);assert.equal(JSON.stringify(traffic).includes('CANARY'),false);
  col._restRequestsHandler._restApi._options.buildTime='https://collector.example/?secret=CANARY';
  await h.browser.evaluate('chart-1',alertPage,{operation:'pause',data:{alert_ids:['123']}});
  assert.equal(new URL(h.pageTraffic[1].url).searchParams.has('build_time'),false);
  col._restRequestsHandler._restApi._session.sendLegacyExpiration=false;
  await h.browser.evaluate('chart-1',alertPage,{operation:'create',data:{payload:{name:'fixture',expiration:'2026-10-22T12:00:00.000Z'}}});
  const sent=JSON.parse(h.pageTraffic[2].body).payload;assert.equal(Object.hasOwn(sent,'expiration'),false);
  assert.deepEqual(sent.expiration_policy,{policy:'fixed_date',time:'2026-10-22T12:00:00.000Z'});
 }finally{await h.close();}
});

test('native payload rejects ambiguous studies, unsafe webhooks and invalid input overrides before a write', () => {
  const args = baseAlert(); delete args.condition.study_id;
  assert.throws(() => buildAlertPayload(args, source({ studies: [study(), study('other')] })), error => error.code === 'AMBIGUOUS_STUDY');
  assert.throws(() => buildAlertPayload({ ...baseAlert(), webhook_url: 'https://127.0.0.1/hook' }, source()));
  for (const override of [{ in_0: 1.1 }, { in_0: 101 }, { in_1: 'false' }, { unknown: 1 }, { pineVersion: 'latest' }]) {
    const config = baseAlert(); config.condition.input_overrides = override;
    assert.throws(() => buildAlertPayload(config, source()), error => error.code === 'INVALID_INPUT');
  }
});

test('study alerts cannot silently retarget a symbol whose chart source was not read', () => {
  assert.throws(() => buildAlertPayload({ ...baseAlert(), symbol: 'BINANCE:BTCUSDT' }, source()), error => error.code === 'SOURCE_MISMATCH');
  const config = { ...baseAlert(), condition: { kind: 'price', comparison: 'greater', price: 0 }, symbol: 'BINANCE:BTCUSDT' };
  const price = buildAlertPayload(config, source());
  assert.equal(price.payload.conditions[0].series[1].value, 0);
  assert.equal(price.payload.symbol, 'BINANCE:BTCUSDT');
});

test('indicator alert conditions and plot offsets must be observed, never guessed', () => {
  const indicator = { ...study(), kind: 'indicator', alert_conditions: [{ id: 'plot_3', title: 'Buy' }], plot_ids: ['plot_0', 'plot_3'], offsets_by_plot: null };
  const config = { ...baseAlert(), condition: { kind: 'indicator', study_id: 'study-source', alert_condition_id: 'plot_3' } };
  assert.throws(() => buildAlertPayload(config, source({ studies: [indicator] })), error => error.code === 'PLOT_OFFSETS_UNAVAILABLE');
  config.condition.offsets_by_plot = { plot_0: 0, plot_3: 0 };
  assert.equal(buildAlertPayload(config, source({ studies: [indicator] })).payload.conditions[0].alert_cond_id, 'plot_3');
  config.condition.alert_condition_id = 'plot_4';
  assert.throws(() => buildAlertPayload(config, source({ studies: [indicator] })), error => error.code === 'UNKNOWN_ALERT_CONDITION');
});

test('alert existence cannot prove missing webhook configuration or delivery', () => {
  const expected = buildAlertPayload(baseAlert(), source()).expected;
  const observed = { ...clone(expected), alert_id: '9001' }; delete observed.webhook_url;
  const proof = verifyStoredAlert(observed, expected);
  assert.equal(proof.exists_verified, true); assert.equal(proof.configuration_verified, false);
  assert.equal(proof.fields.webhook_url, null); assert.equal(proof.active_verified, true); assert.equal(proof.delivery_verified, null);
  observed.webhook_url = `${expected.webhook_url}&unexpected=1`;
  assert.equal(verifyStoredAlert(observed, expected).fields.webhook_url, false);
  observed.webhook_url = expected.webhook_url; observed.message = expected.message.replace('ticker', 'exchange');
  assert.equal(verifyStoredAlert(observed, expected).fields.message, false);
});

test('direct alert creation reconciles a lost acknowledgement and does not create again on retry', async () => {
  const f = harness({ alertAcknowledgementLost: true }); const args = baseAlert();
  const first = await createAlert(args, f.ctx); const again = await createAlert(args, f.ctx);
  assert.equal(first.alert_id, '9001'); assert.equal(first.verification.configuration_verified, true);
  assert.equal(again.replayed, true); assert.equal(f.state.createCount, 1); assert.equal(again.delivery_verified, null);
});

test('ignored paused-create state is stopped immediately before repeated verification reads', async () => {
  const f = harness({ ignorePausedCreate: true }); const result = await createAlert(baseAlert(), f.ctx);
  assert.equal(result.activation_window_possible, true); assert.equal(result.verification.active_verified, true); assert.equal(f.state.pauseCount, 1);
  const createIndex = f.state.events.findIndex(item => item.operation === 'create');
  const pauseIndex = f.state.events.findIndex(item => item.operation === 'pause');
  assert.equal(f.state.events.slice(createIndex + 1, pauseIndex).filter(item => item.operation === 'get').length, 1);
});

test('lost acknowledgement never permits pausing a same-name alert with unrelated configuration', async () => {
  const f = harness({ alertAcknowledgementLost: true, unrelatedSameNameAlert: true, ignorePausedCreate: true });
  await assert.rejects(createAlert(baseAlert(), f.ctx), error => error.code === 'UNCERTAIN_MUTATION');
  assert.equal(f.state.pauseCount, 0); assert.equal(f.state.alerts[0].active, true);
  await assert.rejects(createAlert(baseAlert(), f.ctx), error => error.code === 'UNCERTAIN_MUTATION');
  assert.equal(f.state.createCount, 1); assert.equal(f.state.pauseCount, 0);
});

test('modifying a paused alert refuses the native re-arming API without explicit allowance', async () => {
  const f = harness(); f.state.alerts.push({ alert_id: '9001', active: false, message: 'old' });
  await assert.rejects(updateAlert({ alert_id: '9001', patch: { message: 'new' } }, f.ctx), error => error.code === 'UPDATE_WOULD_REARM');
  assert.equal(f.state.writes.length, 0);
});

test('native alert clone verifies copied configuration and replays the same ID without another clone', async () => {
  const f = harness(); f.state.alerts.push({ ...buildAlertPayload(baseAlert(), source()).expected, alert_id: '9001' });
  const args = { alert_id: '9001', idempotency_key: 'clone-alert-001' };
  const first = await cloneAlert(args, f.ctx); const again = await cloneAlert(args, f.ctx);
  assert.equal(first.alert_id, '9002'); assert.equal(first.verification.configuration_verified, true);
  assert.equal(again.replayed, true); assert.equal(again.verification.active_verified, true); assert.equal(f.state.alertCloneCount, 1);
});

test('an unrelated new alert cannot be selected or paused as a native clone', async () => {
  const f = harness({ unrelatedClone: true }); f.state.alerts.push({ ...buildAlertPayload(baseAlert(), source()).expected, alert_id: '9001' });
  const args = { alert_id: '9001', idempotency_key: 'clone-alert-002' };
  await assert.rejects(cloneAlert(args, f.ctx), error => error.code === 'UNCERTAIN_MUTATION');
  await assert.rejects(cloneAlert(args, f.ctx), error => error.code === 'UNCERTAIN_MUTATION');
  assert.equal(f.state.alertCloneCount, 1); assert.equal(f.state.pauseCount, 0);
});

test('batch preflight catches an invalid later alert before creating the first', async () => {
  const f = harness(); const first = baseAlert(); const second = { ...baseAlert(), name: 'Second', idempotency_key: 'second-key', message_format: 'json', message: '{broken' };
  await assert.rejects(alertTools.find(item => item.name === 'alert_create_bulk').handler({ items: [first, second] }, f.ctx), error => error.code === 'INVALID_JSON_TEMPLATE');
  assert.equal(f.state.createCount, 0);
});

test('alert IDs reject unsafe integer coercion instead of targeting a rounded account object', () => {
  assert.equal(normalizeAlertId('123456'), '123456');
  for (const id of ['9007199254740993', '1e3', '0', '-1', '1 OR 1=1']) assert.throws(() => normalizeAlertId(id), error => error.code === 'INVALID_ALERT_ID');
});

test('alert inventory pagination reaches every ID beyond 500 and applies filters before slicing', async () => {
  const f = harness();
  f.state.alerts = Array.from({ length: 731 }, (_, index) => ({ alert_id: String(index + 1), name: `Alert ${index}`,
    symbol: index % 2 ? 'NASDAQ:AAPL' : 'NASDAQ:MSFT', active: index % 3 === 0 }));
  const list = alertTools.find(item => item.name === 'alert_list').handler;
  const first = await list({ limit: 500 }, f.ctx); const second = await list({ limit: 500, offset: first.next_offset }, f.ctx);
  assert.equal(first.total, 731); assert.equal(first.returned, 500); assert.equal(first.has_more, true); assert.equal(first.next_offset, 500);
  assert.equal(second.returned, 231); assert.equal(second.next_offset, null); assert.equal(second.has_more, false);
  assert.equal(new Set([...first.alerts, ...second.alerts].map(row => row.alert_id)).size, 731);
  const expected = f.state.alerts.filter(row => row.symbol === 'NASDAQ:AAPL' && row.active);
  const filtered = await list({ symbol: 'NASDAQ:AAPL', active: true, offset: 20, limit: 7 }, f.ctx);
  assert.equal(filtered.matched, expected.length); assert.deepEqual(filtered.alerts.map(row => row.alert_id), expected.slice(20, 27).map(row => row.alert_id));
  const empty = await list({ offset: 1000, limit: 100 }, f.ctx);
  assert.equal(empty.returned, 0); assert.equal(empty.next_offset, null); assert.equal(empty.has_more, false);
});

test('alert fire pagination continues beyond 500 and reports unknown webhook delivery', async () => {
  const rows = Array.from({ length: 1100 }, (_, index) => ({ alert_id: String(index % 2 + 1), event_id: String(index) }));
  const ctx = { callPage: async (_fn, args) => { assert.equal(args.operation, 'fires'); return rows; } };
  const fires = alertTools.find(item => item.name === 'alert_fires').handler;
  const page = await fires({ alert_id: '1', limit: 500 }, ctx);
  assert.equal(page.total, 1100); assert.equal(page.matched, 550); assert.equal(page.next_offset, 500);
  const tail = await fires({ alert_id: '1', offset: page.next_offset, limit: 500 }, ctx);
  assert.equal(tail.returned, 50); assert.equal(tail.has_more, false); assert.equal(tail.delivery_verified, null);
  assert.equal(new Set([...page.events, ...tail.events].map(row => row.event_id)).size, 550);
});

test('fixed browser alert request uses only TradingView and preserves the structured POST body', async () => {
  const requests = []; const payload = buildAlertPayload(baseAlert(), source()).payload;
  const environment = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, window: {},
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => ({ s: 'ok', r: { alert_id: 9001 } }) }; },
    arg: { operation: 'create', data: { payload } } });
  const result = await vm.runInContext(`(${alertPage.toString()})(arg)`, environment);
  assert.equal(result.alert_id, 9001); assert.equal(requests[0].url, 'https://pricealerts.tradingview.com/create_alert');
  assert.equal(requests[0].options.credentials, 'include'); assert.equal(requests[0].options.redirect, 'error');
  assert.equal(JSON.parse(requests[0].options.body).payload.message, message);
  assert.equal(requests[0].options.headers, undefined);
});

test('native list projection leaves a missing webhook and condition unknown', async () => {
  const environment = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, window: {},
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ s: 'ok', r: [{ alert_id: 9001, name: 'Exists', active: false, symbol: 'NASDAQ:AAPL' }] }) }),
    arg: { operation: 'get', data: { alert_id: '9001' } } });
  const row = await vm.runInContext(`(${alertPage.toString()})(arg)`, environment);
  assert.equal(row.alert_id, '9001'); assert.equal(Object.hasOwn(row, 'webhook_url'), false); assert.equal(Object.hasOwn(row, 'conditions'), false);
});

function workflowArgs() {
  const { idempotency_key, ...alert } = baseAlert();
  return { idempotency_key: 'copy-alert-flow-001', layout_name: 'BTC copied strategy', symbol: 'BINANCE:BTCUSDT', timeframe: '15', alert };
}

test('copy-and-alert workflow writes only the verified copy after cloning and independently verifies alert configuration', async () => {
  const f = harness(); const args = workflowArgs(); validate(copyAlertWorkflowSchema, args);
  const result = await copyChartCreateAlert(args, f.ctx);
  assert.equal(result.completed, true); assert.equal(result.layout_id, copyId); assert.equal(result.alert_id, '9001');
  assert.equal(result.independent_layout_verified, true); assert.equal(result.verification.configuration_verified, true);
  assert.equal(result.full_copy_fidelity_verified, false); assert.equal(result.delivery_verified, null);
  assert.equal(f.state.snapshots.get('source-tab').symbol, 'NASDAQ:AAPL');
  assert.equal(f.state.snapshots.get('copy-tab').symbol, 'BINANCE:BTCUSDT');
  assert.equal(f.state.writes.filter(item => item.operation !== 'copy').every(item => item.target === 'copy-tab'), true);
  const writeOrder = f.state.writes.map(item => item.operation);
  assert.deepEqual(writeOrder, ['copy', 'chart_set_symbol', 'chart_set_timeframe', 'save', 'create']);
  const payload = f.state.writes.find(item => item.operation === 'create').payload;
  assert.equal(payload.message, message); assert.equal(payload.resolution, '15'); assert.equal(payload.symbol, 'BINANCE:BTCUSDT');
  assert.ok(f.state.events.some(item => item.tool === 'alert_verify' && item.target === 'copy-tab'));
  const persisted = JSON.stringify([...f.state.checkpoints.values()]);
  assert.equal(persisted.includes('private-example'), false); assert.equal(persisted.includes('{{ticker}}'), false); assert.equal(persisted.includes('token-value'), false);
});

test('workflow replay verifies exact existing IDs and produces no additional mutations', async () => {
  const f = harness(); const args = workflowArgs();
  await copyChartCreateAlert(args, f.ctx); const before = f.state.writes.length;
  const again = await copyChartCreateAlert(args, f.ctx);
  assert.equal(again.completed, true); assert.equal(again.alert_id, '9001'); assert.equal(f.state.cloneCount, 1); assert.equal(f.state.createCount, 1);
  assert.equal(f.state.writes.length, before);
});

test('workflow refuses all downstream writes when copied study inputs do not match', async () => {
  const f = harness({ copyInputMismatch: true });
  await assert.rejects(copyChartCreateAlert(workflowArgs(), f.ctx), error => error.code === 'COPY_CONFIGURATION_UNVERIFIED' && error.details.layout_id === copyId);
  assert.equal(f.state.createCount, 0); assert.deepEqual(f.state.writes.map(item => item.operation), ['copy']);
});

test('workflow invalid JSON is rejected before layout creation', async () => {
  const f = harness(); const args = workflowArgs(); args.alert.message = '{broken';
  await assert.rejects(copyChartCreateAlert(args, f.ctx), error => error.code === 'INVALID_JSON_TEMPLATE');
  assert.equal(f.state.writes.length, 0);
});

test('compound workflow requires webhook and JSON payload before any chart-copy side effect', async () => {
  const variants = [
    args => { delete args.alert.webhook_url; },
    args => { args.alert.webhook_url = ''; },
    args => { args.alert.webhook_url = null; },
    args => { args.alert.webhook_url = 'http://example.com/hooks/test'; },
    args => { delete args.alert.message; },
    args => { args.alert.message = ''; },
    args => { args.alert.message_format = 'text'; },
    args => { delete args.alert.message_format; },
  ];
  for (const change of variants) {
    const f = harness(), args = workflowArgs(); change(args);
    assert.throws(() => validate(copyAlertWorkflowSchema, args), error => error.code === 'INVALID_ARGUMENT');
    await assert.rejects(copyChartCreateAlert(args, f.ctx), error => ['WEBHOOK_REQUIRED', 'JSON_MESSAGE_REQUIRED', 'INVALID_WEBHOOK'].includes(error.code));
    assert.equal(f.state.cloneCount, 0); assert.equal(f.state.createCount, 0); assert.equal(f.state.writes.length, 0);
  }
});

test('workflow preserves IDs after incomplete stored-webhook verification and retry never duplicates', async () => {
  const f = harness({ missingStoredWebhook: true }); const args = workflowArgs();
  await assert.rejects(copyChartCreateAlert(args, f.ctx), error => error.code === 'ALERT_CONFIGURATION_UNVERIFIED' && error.details.alert_id === '9001');
  await assert.rejects(copyChartCreateAlert(args, f.ctx), error => error.code === 'ALERT_CONFIGURATION_UNVERIFIED');
  assert.equal(f.state.cloneCount, 1); assert.equal(f.state.createCount, 1);
});

test('workflow will not change a destination that drifted after alert preparation', async () => {
  const f = harness(); const args = workflowArgs(); await copyChartCreateAlert(args, f.ctx);
  f.state.snapshots.get('copy-tab').symbol = 'NASDAQ:MSFT'; const count = f.state.writes.length;
  await assert.rejects(copyChartCreateAlert(args, f.ctx), error => error.code === 'WORKFLOW_CHART_DRIFT');
  assert.equal(f.state.writes.length, count); assert.equal(f.state.createCount, 1);
});
