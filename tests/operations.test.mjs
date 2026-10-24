import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { ToolError } from '../src/core/errors.mjs';
import { ToolRegistry } from '../src/core/registry.mjs';
import { assertFixedFunction } from '../src/core/security.mjs';
import drawingTools, { drawingPage } from '../src/features/drawings.mjs';
import jobTools, { closeJobs } from '../src/features/jobs.mjs';
import browserTools from '../src/features/browser-tools.mjs';
import paperTools, { applyPaperTrade, paperValue } from '../src/features/paper.mjs';

const clone = value => structuredClone(value);
const emptySchema = { type: 'object', properties: {}, additionalProperties: false };
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `Expected ${actual} to equal ${expected} within numeric tolerance`);

function memoryStore() {
  const areas = new Map(), checkpoints = new Map(), audit = [];
  return { areas, checkpoints, auditRecords: audit,
    async read(area, key) { return clone(areas.get(area)?.get(key) ?? null); },
    async write(area, key, value) { if (!areas.has(area)) areas.set(area, new Map()); areas.get(area).set(key, clone(value)); return `${area}/${key}`; },
    async records(area, limit) { return [...(areas.get(area)?.values() ?? [])].slice(0, limit).map(clone); },
    async checkpoint(key, value) { checkpoints.set(key, clone(value)); },
    async loadCheckpoint(key) { return clone(checkpoints.get(key) ?? null); },
    async audit(value) { audit.push(clone(value)); },
    async exportJson(name, data) { return { name, data: clone(data) }; },
    async exportCsv(name, data) { return { name, data: clone(data) }; },
  };
}

function drawingFixture(options = {}) {
  const rows = new Map(), writes = []; let nextId = 1;
  const add = (name = 'trend_line', points = [{ time: 1, price: 0 }, { time: 2, price: 5 }]) => {
    const id = String(nextId++); rows.set(id, { id, name, points: clone(points), properties: { linecolor: '#112233' }, visible: true, locked: false, selectable: true }); return id;
  };
  const create = (points, spec) => {
    const list = Array.isArray(points) ? points : [points];
    const name = options.wrongSecondShape && nextId === 2 ? 'rectangle' : spec.shape;
    const id = add(name, options.extraPoint ? [...list, { time: 3, price: 8 }] : list);
    if (spec.overrides) Object.assign(rows.get(id).properties, spec.overrides);
    writes.push({ operation: 'create', id }); return Promise.resolve(id);
  };
  const chart = { getAllShapes: () => [...rows.values()].map(({ id, name }) => ({ id, name })),
    getShapeById: id => {
      const row = rows.get(id); if (!row) throw new Error('Missing fixture shape');
      return { getPoints: () => clone(row.points), getProperties: () => clone(row.properties), isVisible: () => row.visible,
        isLocked: () => row.locked, isSelectionEnabled: () => row.selectable,
        setPoints: value => { writes.push({ operation: 'points', id }); if (!options.ignorePointWrite) row.points = clone(value); },
        setProperties: value => { writes.push({ operation: 'properties', id }); Object.assign(row.properties, value); },
        setVisible: value => { row.visible = value; }, setLocked: value => { row.locked = value; }, setSelectionEnabled: value => { row.selectable = value; } };
    },
    createShape: create, createMultipointShape: create,
    removeEntity: id => { writes.push({ operation: 'remove', id }); if (options.failSecondRemove && id === '2') throw new ToolError('FIXTURE_REMOVE_FAILED', 'Second removal rejected.', { submitted_drawing_id: id }); rows.delete(id); },
  };
  const environment = vm.createContext({ window: { TradingViewApi: { _activeChartWidgetWV: { value: () => chart } } } });
  const ctx = { signal: undefined, async assertLayout() {},
    async callPage(fn, args) { assert.equal(fn, drawingPage); environment.args = args; return vm.runInContext(`(${fn.toString()})(args)`, environment); },
    async poll(read, predicate) { for (let n = 0; n < 4; n++) { const result = await read(); if (predicate(result)) return result; } throw new ToolError('VERIFICATION_TIMEOUT', 'Fixture did not converge.'); },
    async exportJson(name, data) { return { name, data }; },
  };
  return { ctx, rows, writes, add, tool: (name, args) => drawingTools.find(tool => tool.name === name).handler(args, ctx) };
}

test('drawing adapter passes security gate and supports the active watched chart API', async () => {
  assert.equal(typeof assertFixedFunction(drawingPage), 'string');
  const f = drawingFixture(); f.add();
  const result = await f.tool('drawing_list', {}); assert.equal(result.drawings.length, 1); assert.equal(result.drawings[0].id, '1');
});

test('drawing create reports extra returned points as unverified instead of matching an array prefix', async () => {
  const f = drawingFixture({ extraPoint: true });
  const result = await f.tool('drawing_create', { shape: 'trend_line', points: [{ time: 1, price: 0 }, { time: 2, price: 5 }] });
  assert.equal(result.created, true); assert.equal(result.points_verified, false); assert.equal(result.drawing.points.length, 3);
});

test('drawing update cannot verify a requested two-point result against three unchanged points', async () => {
  const f = drawingFixture({ ignorePointWrite: true }); const id = f.add('trend_line', [{ time: 1, price: 0 }, { time: 2, price: 5 }, { time: 3, price: 8 }]);
  const before = await f.tool('drawing_get', { id });
  await assert.rejects(f.tool('drawing_update', { id, expected_fingerprint: before.fingerprint, points: [{ time: 1, price: 0 }, { time: 2, price: 5 }] }), error => error.code === 'VERIFICATION_TIMEOUT');
});

test('drawing import preserves successful IDs and the failing creation receipt', async () => {
  const f = drawingFixture({ wrongSecondShape: true });
  const item = { shape: 'trend_line', points: [{ time: 1, price: 0 }, { time: 2, price: 5 }] };
  await assert.rejects(f.tool('drawing_import', { drawings: [item, item] }), error => {
    assert.equal(error.code, 'PARTIAL_IMPORT'); assert.equal(error.details.created[0].id, '1'); assert.equal(error.details.failed_index, 1);
    assert.equal(error.details.cause, 'DRAWING_TYPE_MISMATCH'); assert.equal(error.details.cause_details.id, '2'); return true;
  });
  assert.equal(f.rows.size, 2);
});

test('drawing clear preserves already-removed IDs and the failed ID without rollback claims', async () => {
  const f = drawingFixture({ failSecondRemove: true }); f.add(); f.add();
  await assert.rejects(f.tool('drawing_clear', { expected_ids: ['1', '2'] }), error => {
    assert.equal(error.code, 'PARTIAL_CLEAR'); assert.deepEqual(error.details.removed_ids, ['1']); assert.equal(error.details.failed_id, '2'); return true;
  });
  assert.equal(f.rows.has('1'), false); assert.equal(f.rows.has('2'), true);
});

test('changed drawing inventory and stale fingerprints both fail before mutation', async () => {
  const f = drawingFixture(); f.add(); f.add();
  await assert.rejects(f.tool('drawing_clear', { expected_ids: ['1'] }), error => error.code === 'PREIMAGE_MISMATCH');
  await assert.rejects(f.tool('drawing_update', { id: '1', expected_fingerprint: 'stale', visible: false }), error => error.code === 'PREIMAGE_MISMATCH');
  assert.equal(f.writes.length, 0);
});

test('emergency stop arriving during target resolution prevents dispatch after resolution completes', async () => {
  const started = deferred(), release = deferred(); let writes = 0;
  const browser = { async resolveTarget() { started.resolve(); await release.promise; return { id: 'tab-1' }; } };
  const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {}, assertVerifiedLayout() {} },  browser, store: memoryStore() });
  registry.addAll(browserTools.filter(tool => tool.name.startsWith('emergency_')));
  registry.add({ name: 'fixture_write', mutates: true, requiresLayout: false, inputSchema: emptySchema, handler: async () => { writes++; return { written: true }; } });
  const pending = registry.execute('fixture_write', { target_id: 'tab-1' });
  await started.promise; await registry.execute('emergency_stop', {}); release.resolve();
  await assert.rejects(pending, error => error.code === 'EMERGENCY_STOP'); assert.equal(writes, 0);
});

test('emergency stop during native-layout precondition reading prevents handler dispatch', async () => {
  const started = deferred(), release = deferred(); let writes = 0;
  const browser = { async resolveTarget() { return { id: 'tab-1' }; }, async evaluate() { started.resolve(); await release.promise; return { layout_id: 'Layout01' }; } };
  const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {}, assertVerifiedLayout() {} },  browser, store: memoryStore() });
  registry.addAll(browserTools.filter(tool => tool.name.startsWith('emergency_')));
  registry.add({ name: 'fixture_write', mutates: true, inputSchema: emptySchema, handler: async () => { writes++; return { written: true }; } });
  const pending = registry.execute('fixture_write', { target_id: 'tab-1', expected_layout_id: 'Layout01' });
  await started.promise; await registry.execute('emergency_stop', {}); release.resolve();
  await assert.rejects(pending, error => ['CANCELLED', 'EMERGENCY_STOP'].includes(error.code)); assert.equal(writes, 0);
});

test('emergency stop during a nested target change prevents dispatch of a target-only mutation', async () => {
  const started = deferred(), release = deferred(); let writes = 0;
  const browser = { async resolveTarget(id) { if (id === 'tab-2') { started.resolve(); await release.promise; } return { id }; } };
  const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {}, assertVerifiedLayout() {} },  browser, store: memoryStore() });
  registry.addAll(browserTools.filter(tool => tool.name.startsWith('emergency_')));
  registry.add({ name: 'fixture_child', mutates: true, requiresLayout: false, inputSchema: emptySchema, handler: async () => { writes++; return { written: true }; } });
  registry.add({ name: 'fixture_parent', mutates: true, requiresLayout: false, inputSchema: emptySchema,
    handler: async (_args, ctx) => ctx.callTool('fixture_child', { target_id: 'tab-2' }) });
  const pending = registry.execute('fixture_parent', { target_id: 'tab-1', expected_layout_id: 'Layout01' });
  await started.promise; await registry.execute('emergency_stop', {}); release.resolve();
  await assert.rejects(pending, error => ['CANCELLED', 'EMERGENCY_STOP'].includes(error.code)); assert.equal(writes, 0);
});

function jobFixture() {
  const writes = [], waitStarted = deferred(); const store = memoryStore();
  const browser = { async resolveTarget(id) { return { id: id ?? 'tab-1' }; }, async evaluate() { return { layout_id: 'Layout01' }; } };
  const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {}, assertVerifiedLayout() {} },  browser, store }); registry.addAll(jobTools);
  const inputSchema = { type: 'object', properties: { message: { type: 'string' } }, additionalProperties: false };
  registry.add({ name: 'fixture_success', inputSchema, mutates: true, handler: async () => { writes.push('success'); return { receipt_id: 'success-1' }; } });
  registry.add({ name: 'fixture_failure', inputSchema, mutates: true, handler: async () => { writes.push('failure'); throw new ToolError('FIXTURE_FAILURE', 'Submitted operation could not verify.', { alert_id: '9011', layout_id: 'Copied02' }); } });
  registry.add({ name: 'fixture_wait', inputSchema, mutates: true, handler: async (_args, ctx) => { waitStarted.resolve(); await ctx.wait(60000); writes.push('after-wait'); return { written: true }; } });
  const call = tool => ({ tool, arguments: { target_id: 'tab-1', expected_layout_id: 'Layout01', message: 'private-job-input-marker' } });
  return { registry, writes, store, call, waitStarted };
}
async function finishedJob(registry, id) {
  for (let n = 0; n < 100; n++) {
    const state = await registry.execute('job_get', { id });
    if (!['queued', 'running'].includes(state.status)) return state;
    await new Promise(setImmediate);
  }
  throw new Error('Fixture job did not finish.');
}

test('job failure counts only successful steps and preserves failed-step mutation receipts', async () => {
  const f = jobFixture();
  try {
    const job = await f.registry.execute('job_submit', { calls: [f.call('fixture_success'), f.call('fixture_failure'), f.call('fixture_success')] });
    const state = await finishedJob(f.registry, job.job_id);
    assert.equal(state.status, 'failed'); assert.equal(state.completed, 1); assert.equal(state.attempted, 2); assert.equal(state.total, 3);
    assert.equal(state.results[1].details.alert_id, '9011'); assert.equal(state.error.details.layout_id, 'Copied02');
    assert.deepEqual(f.writes, ['success', 'failure']); assert.doesNotMatch(JSON.stringify(state), /private-job-input-marker/);
    assert.doesNotMatch(JSON.stringify(f.store.auditRecords), /private-job-input-marker/);
  } finally { closeJobs(); }
});

test('continuing after a failed job step yields partial status, never complete', async () => {
  const f = jobFixture();
  try {
    const job = await f.registry.execute('job_submit', { calls: [f.call('fixture_success'), f.call('fixture_failure'), f.call('fixture_success')], stop_on_error: false });
    const state = await finishedJob(f.registry, job.job_id);
    assert.equal(state.status, 'partial'); assert.equal(state.completed, 2); assert.equal(state.attempted, 3); assert.equal(state.results.length, 3);
  } finally { closeJobs(); }
});

test('batch partial failure keeps concrete error receipts and does not run later steps by default', async () => {
  const f = jobFixture();
  const result = await f.registry.execute('batch_execute', { target_id: 'tab-1', expected_layout_id: 'Layout01',
    calls: [f.call('fixture_success'), f.call('fixture_failure'), f.call('fixture_success')] });
  assert.equal(result.complete, false); assert.equal(result.completed, 1); assert.equal(result.results.length, 2);
  assert.equal(result.results[1].details.alert_id, '9011'); assert.deepEqual(f.writes, ['success', 'failure']);
});

test('job validation rejects an unbound later mutation before starting the first step', async () => {
  const f = jobFixture();
  await assert.rejects(f.registry.execute('job_submit', { calls: [f.call('fixture_success'), { tool: 'fixture_failure', arguments: {} }] }), error => error.code === 'EXPLICIT_JOB_TARGET_REQUIRED');
  assert.equal(f.writes.length, 0);
});

test('job cancellation interrupts a pending wait and prevents its later write', async () => {
  const f = jobFixture();
  try {
    const job = await f.registry.execute('job_submit', { calls: [f.call('fixture_wait')] });
    await f.waitStarted.promise; await f.registry.execute('job_cancel', { id: job.job_id });
    const state = await finishedJob(f.registry, job.job_id); assert.equal(state.status, 'cancelled'); assert.equal(f.writes.length, 0);
  } finally { closeJobs(); }
});

test('streams reject mutating tools and recursive job controls are refused', async () => {
  const f = jobFixture();
  await assert.rejects(f.registry.execute('stream_start', { tool: 'fixture_success', duration_seconds: 1 }), error => error.code === 'READ_ONLY_REQUIRED');
  await assert.rejects(f.registry.execute('job_submit', { calls: [{ tool: 'job_submit', arguments: { calls: [] } }] }), error => error.code === 'NESTED_JOB_BLOCKED');
  assert.equal(f.writes.length, 0);
});

const account = () => ({ id: 'account-1', initial_balance: 1000, cash: 1000, realized_pnl: 0, fees_paid: 0, revision: 0, positions: {}, trades: [] });
const trade = (a, side, quantity, price, extra = {}) => applyPaperTrade(a, { symbol: 'NASDAQ:AAPL', side, quantity, price, ...extra });

test('paper long fill and closure account for adverse slippage, both fees and equity consistently', () => {
  const opened = trade(account(), 'buy', 10, 10, { commission: 1, slippage_bps: 100 });
  near(opened.trade.execution_price, 10.1); near(opened.account.cash, 898); near(paperValue(opened.account).equity, 998);
  const closed = trade(opened.account, 'sell', 10, 12, { commission: 1, slippage_bps: 100 });
  near(closed.trade.execution_price, 11.88); near(closed.account.cash, 1015.8); near(closed.account.realized_pnl, 15.8); near(closed.account.fees_paid, 2);
  assert.equal(Object.keys(closed.account.positions).length, 0); assert.equal(paperValue(closed.account).simulation_only, true);
  assert.equal(paperValue(closed.account).native_tradingview_paper_account, false);
});

test('paper short partial cover separates realized and remaining unrealized gains', () => {
  const opened = trade(account(), 'sell', 5, 20).account;
  const covered = trade(opened, 'buy', 2, 15).account; const value = paperValue(covered);
  assert.equal(covered.positions['NASDAQ:AAPL'].quantity, -3); assert.equal(covered.positions['NASDAQ:AAPL'].average_price, 20);
  assert.equal(covered.realized_pnl, 10); assert.equal(value.positions[0].unrealized_pnl, 15); assert.equal(value.equity, 1025);
});

test('paper reversal realizes only the closed leg and reprices the newly opened direction', () => {
  const long = trade(account(), 'buy', 3, 10).account;
  const reversed = trade(long, 'sell', 5, 15).account;
  assert.equal(reversed.positions['NASDAQ:AAPL'].quantity, -2); assert.equal(reversed.positions['NASDAQ:AAPL'].average_price, 15); assert.equal(reversed.realized_pnl, 15);
  const flat = trade(reversed, 'buy', 2, 12).account; assert.equal(flat.cash, 1021); assert.equal(flat.realized_pnl, 21); assert.equal(paperValue(flat).equity, 1021);
});

test('paper weighted-average cost remains unchanged on a partial reduction', () => {
  const first = trade(account(), 'buy', 10, 10).account;
  const added = trade(first, 'buy', 5, 16).account; assert.equal(added.positions['NASDAQ:AAPL'].average_price, 12);
  const reduced = trade(added, 'sell', 5, 11).account;
  assert.equal(reduced.positions['NASDAQ:AAPL'].quantity, 10); assert.equal(reduced.positions['NASDAQ:AAPL'].average_price, 12);
  assert.equal(reduced.realized_pnl, -5); assert.equal(paperValue(reduced).equity, 985);
});

test('paper fractional closure does not retain an uncloseable floating-point dust position', () => {
  let a = trade(account(), 'buy', 0.1, 10).account; a = trade(a, 'buy', 0.2, 10).account; a = trade(a, 'sell', 0.3, 10).account;
  assert.equal(Object.keys(a.positions).length, 0); near(paperValue(a).equity, 1000);
});

async function paperFixture() {
  const store = memoryStore(); const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {}, assertVerifiedLayout() {} },  store }); registry.addAll(paperTools);
  const created = await registry.execute('paper_account_create', { name: 'Arithmetic fixture', currency: 'USD', initial_balance: 1000, idempotency_key: 'paper-account-test' });
  return { store, registry, id: created.account.id };
}

test('paper trade retries reuse an atomic ledger receipt; stale revisions and key conflicts cannot duplicate fills', async () => {
  const f = await paperFixture(); const args = { account_id: f.id, expected_revision: 0, symbol: 'NASDAQ:AAPL', side: 'buy', quantity: 2, price: 10, idempotency_key: 'paper-fill-0001' };
  const first = await f.registry.execute('paper_trade', args); const replay = await f.registry.execute('paper_trade', args);
  assert.equal(replay.replayed, true); assert.equal(first.trade.trade_id, replay.trade.trade_id); assert.equal(replay.account.trades.length, 1); assert.equal(replay.account.revision, 1);
  await assert.rejects(f.registry.execute('paper_trade', { ...args, quantity: 3 }), error => error.code === 'IDEMPOTENCY_CONFLICT');
  await assert.rejects(f.registry.execute('paper_trade', { ...args, idempotency_key: 'paper-fill-0002' }), error => error.code === 'PREIMAGE_MISMATCH');
});

test('concurrent paper trades with the same revision cannot both execute', async () => {
  const f = await paperFixture(); const base = { account_id: f.id, expected_revision: 0, symbol: 'NASDAQ:AAPL', side: 'buy', quantity: 1, price: 10 };
  const results = await Promise.allSettled([f.registry.execute('paper_trade', { ...base, idempotency_key: 'paper-concurrent-1' }), f.registry.execute('paper_trade', { ...base, idempotency_key: 'paper-concurrent-2' })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(results.find(row => row.status === 'rejected').reason.code, 'PREIMAGE_MISMATCH');
  const after = await f.registry.execute('paper_account_get', { account_id: f.id }); assert.equal(after.account.trades.length, 1);
});

test('paper marking with a missing later position does not persist an earlier partial mark', async () => {
  const f = await paperFixture(); await f.registry.execute('paper_trade', { account_id: f.id, expected_revision: 0, symbol: 'NASDAQ:AAPL', side: 'buy', quantity: 1, price: 10, idempotency_key: 'paper-mark-fill' });
  await assert.rejects(f.registry.execute('paper_mark_prices', { account_id: f.id, expected_revision: 1, prices: { 'NASDAQ:AAPL': 20, 'NASDAQ:MISSING': 30 } }), error => error.code === 'POSITION_NOT_FOUND');
  const after = await f.registry.execute('paper_account_get', { account_id: f.id }); assert.equal(after.account.revision, 1); assert.equal(after.account.positions[0].mark_price, 10);
});

test('paper account retry after losing an atomic-write acknowledgement cannot create a second account', async () => {
  const store = memoryStore(); const write = store.write.bind(store); let fail = true;
  store.write = async (area, key, value) => { const saved = await write(area, key, value); if (area === 'paper' && fail) { fail = false; throw new Error('Injected failure after account was durably stored'); } return saved; };
  const registry = new ToolRegistry({ readonly: false, mutationPolicy: { assert() {}, assertVerifiedLayout() {} },  store }); registry.addAll(paperTools);
  const args = { name: 'Crash recovery fixture', initial_balance: 1000, currency: 'USD', idempotency_key: 'paper-recovery-account' };
  await assert.rejects(registry.execute('paper_account_create', args));
  const firstIds = [...store.areas.get('paper').keys()]; assert.equal(firstIds.length, 1);
  const replay = await registry.execute('paper_account_create', args);
  assert.equal(store.areas.get('paper').size, 1); assert.equal(replay.account.id, firstIds[0]);
});
