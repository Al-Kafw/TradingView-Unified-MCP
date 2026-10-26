import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeCdp } from './fake-cdp.mjs';
import { dataPage } from '../src/features/data.mjs';

function fixture({
  lines = [[ 'L1', { x1: 5, y1: 5000, x2: 7, y2: 5005, st: 2 } ]],
  labels = [[ 'A1', { x: 6, y: 5002, t: 'SMT' } ]],
  missingCollectionData = false,
  extraUnavailableStudy = false,
  noStudies = false
} = {}) {
  const baseTime = 1792786500;
  const bars = {
    firstIndex: () => 5,
    lastIndex: () => 8,
    size: () => 4,
    valueAt: i => i >= 5 && i <= 8
      ? [baseTime + (i - 5) * 900, 1, 2, 0, 1, 4]
      : null
  };
  const first = {
    id: () => 'study1',
    metaInfo: () => ({ description: 'SMT fixture' }),
    _graphics: {
      _primitivesCollection: {
        dwglines: { get: () => missingCollectionData
          ? {} : { _primitivesDataById: new Map(lines) } },
        dwglabels: { get: () => missingCollectionData
          ? {} : { _primitivesDataById: new Map(labels) } }
      }
    }
  };
  const unavailable = {
    id: () => 'study2',
    metaInfo: () => ({ description: 'Unknown graphics' })
  };
  const sources = noStudies ? [] : [first, ...(extraUnavailableStudy ? [unavailable] : [])];
  const main = { bars: () => bars, symbolInfo: () => ({ pro_name: 'CME_MINI:ES1!' }) };
  const inner = { mainSeries: () => main, dataSources: () => sources };
  const chart = {
    symbol: () => 'CME_MINI:ES1!',
    resolution: () => '15',
    _chartWidget: { model: () => ({ model: () => inner }) }
  };
  const h = createFakeCdp({ page: { TradingViewApi: {
    _activeChartWidgetWV: { value: () => chart },
    _chartWidgetCollection: { metaInfo: { uid: { value: () => 'QA_READ_1' } } }
  } } });
  return {
    read: op => h.browser.evaluate('chart-1', dataPage, { op }),
    close: () => h.close()
  };
}

test('Pine lines preserve native X but do not infer times from coincident indexes', async () => {
  const f = fixture();
  try {
    const r = await f.read('lines');
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'complete');
    const item = r.studies[0].items[0];
    assert.equal(item.x1, 5);
    assert.equal(item.x2, 7);
    assert.equal(item.x1_time_unix_seconds, null);
    assert.equal(item.x2_time_unix_seconds, null);
    assert.equal(item.x1_coordinate_basis, 'unresolved_native_x');
    assert.equal(item.x2_coordinate_basis, 'unresolved_native_x');
  } finally { await f.close(); }
});

test('Pine labels leave timestamp unverified without coordinate provenance', async () => {
  const f = fixture();
  try {
    const r = await f.read('labels');
    assert.equal(r.ok, true);
    const item = r.studies[0].items[0];
    assert.equal(item.text, 'SMT');
    assert.equal(item.x, 6);
    assert.equal(item.x_time_unix_seconds, null);
    assert.equal(item.x_coordinate_basis, 'unresolved_native_x');
  } finally { await f.close(); }
});

test('future projections and epoch-like X values are not guessed into candle times', async () => {
  const f = fixture({ lines: [
    ['future', { x1: 8, x2: 25, y1: 1, y2: 2 }],
    ['epoch', { x1: 1792786500000, x2: 1792786500, y1: 1, y2: 2 }]
  ] });
  try {
    const r = await f.read('lines');
    assert.equal(r.ok, true);
    const future = r.studies[0].items[0];
    const epoch = r.studies[0].items[1];
    assert.equal(future.x1_time_unix_seconds, null);
    assert.equal(future.x2_time_unix_seconds, null);
    assert.equal(future.x2_coordinate_basis, 'unresolved_native_x');
    assert.equal(epoch.x1_time_unix_seconds, null);
    assert.equal(epoch.x2_time_unix_seconds, null);
    assert.equal(epoch.x1_coordinate_basis, 'unresolved_native_x');
  } finally { await f.close(); }
});

test('missing native primitive data is unavailable, never confirmed as zero objects', async () => {
  const f = fixture({ missingCollectionData: true });
  try {
    const r = await f.read('lines');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'CAPABILITY_UNAVAILABLE');
    assert.equal(r.unavailable.length, 1);
    assert.match(r.unavailable[0].reason, /cannot distinguish zero/);
  } finally { await f.close(); }
});

test('one unavailable study yields partial coverage without dropping readable study', async () => {
  const f = fixture({ extraUnavailableStudy: true });
  try {
    const r = await f.read('labels');
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'partial');
    assert.equal(r.studies.length, 1);
    assert.equal(r.unavailable.length, 1);
    assert.equal(r.studies[0].total, 1);
  } finally { await f.close(); }
});

test('no matching studies cannot be reported as complete graphics coverage', async () => {
  const f = fixture({ noStudies: true });
  try {
    const r = await f.read('lines');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'CAPABILITY_UNAVAILABLE');
  } finally { await f.close(); }
});


test('projected side-candle label never inherits a coincident chart-bar timestamp', async () => {
  // The native projected-label X can equal a loaded OHLC index while
  // representing a different coordinate plane (not the same candle).
  const f = fixture({ labels: [[
    'projected', { x: 6, y: 5002, t: '12:30' }
  ]] });
  try {
    const r = await f.read('labels');
    assert.equal(r.ok, true);
    const item = r.studies[0].items[0];
    assert.equal(item.text, '12:30');
    assert.equal(item.x, 6);
    assert.equal(item.x_time_unix_seconds, null);
    assert.equal(item.x_coordinate_basis, 'unresolved_native_x');
    assert.equal(r.coverage, 'complete');
  } finally { await f.close(); }
});
