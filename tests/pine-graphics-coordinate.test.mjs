import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeCdp } from './fake-cdp.mjs';
import { dataPage } from '../src/features/data.mjs';

function fixture({
  lines = [[ 'L1', { x1: 5, y1: 5000, x2: 7, y2: 5005, st: 2 } ]],
  labels = [[ 'A1', { x: 6, y: 5002, t: 'SMT' } ]],
  missingCollectionData = false,
  missingLineCollectionData = false,
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
        dwglines: { get: () => (missingCollectionData || missingLineCollectionData)
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
    read: (op, options = {}) => h.browser.evaluate('chart-1', dataPage, { op, ...options }),
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


test('graphics coverage complete means available, not necessarily fully paginated', async () => {
  const f = fixture({ lines: [
    ['a', { x1: 1, x2: 2 }],
    ['b', { x1: 3, x2: 4 }],
    ['c', { x1: 5, x2: 6 }]
  ] });
  try {
    const r = await f.read('lines', { offset: 0, limit: 2 });
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'complete');
    assert.equal(r.coverage_scope, 'native_collection_availability_not_pagination');
    assert.equal(r.all_items_returned_in_this_call, false);
    assert.equal(r.studies[0].total, 3);
    assert.equal(r.studies[0].returned, 2);
    assert.equal(r.studies[0].next_offset, 2);
    assert.equal(r.studies[0].all_items_returned_in_this_call, false);
  } finally { await f.close(); }
});

test('second graphics page cannot be mistaken for a complete snapshot', async () => {
  const f = fixture({ labels: [
    ['a', { x: 1, t: 'a' }],
    ['b', { x: 2, t: 'b' }],
    ['c', { x: 3, t: 'c' }]
  ] });
  try {
    const r = await f.read('labels', { offset: 2, limit: 2 });
    assert.equal(r.ok, true);
    assert.equal(r.studies[0].returned, 1);
    assert.equal(r.studies[0].next_offset, null);
    assert.equal(r.studies[0].all_items_returned_in_this_call, false);
    assert.equal(r.all_items_returned_in_this_call, false);
  } finally { await f.close(); }
});

test('fully returned graphics have explicit single-call completeness', async () => {
  const f = fixture();
  try {
    const r = await f.read('lines', { limit: 10 });
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'complete');
    assert.equal(r.all_items_returned_in_this_call, true);
    assert.equal(r.studies[0].all_items_returned_in_this_call, true);
    assert.equal(r.studies[0].next_offset, null);
  } finally { await f.close(); }
});

test('empty exposed graphics map is a complete zero-item read', async () => {
  const f = fixture({ lines: [] });
  try {
    const r = await f.read('lines');
    assert.equal(r.ok, true);
    assert.equal(r.studies[0].total, 0);
    assert.equal(r.studies[0].returned, 0);
    assert.equal(r.all_items_returned_in_this_call, true);
  } finally { await f.close(); }
});

test('unavailable study prevents claiming a complete graphics response', async () => {
  const f = fixture({ extraUnavailableStudy: true });
  try {
    const r = await f.read('lines');
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'partial');
    assert.equal(r.studies[0].all_items_returned_in_this_call, true);
    assert.equal(r.all_items_returned_in_this_call, false);
    assert.equal(r.unavailable.length, 1);
  } finally { await f.close(); }
});


test('qa snapshot captures both graphics classes in one bounded read', async () => {
  const f = fixture();
  try {
    const r = await f.read('qa_snapshot', { entity_id: 'study1', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.ok, true);
    assert.equal(r.layout_id, 'QA_READ_1');
    assert.equal(r.study.entity_id, 'study1');
    assert.equal(r.capture_mode, 'single_synchronous_chart_page_evaluation');
    assert.equal(r.coverage, 'complete');
    assert.equal(r.all_graphics_returned_in_this_call, true);
    assert.equal(r.graphics.lines.items[0].x1, 5);
    assert.equal(r.graphics.labels.items[0].text, 'SMT');
    assert.equal(r.graphics.lines.items[0].x1_time_unix_seconds, null);
    assert.equal(r.graphics.labels.items[0].x_time_unix_seconds, null);
  } finally { await f.close(); }
});

test('qa snapshot identifies truncated graphics without claiming full collection', async () => {
  const f = fixture({ lines: [
    ['a', { x1: 1, x2: 2 }], ['b', { x1: 3, x2: 4 }], ['c', { x1: 5, x2: 6 }]
  ] });
  try {
    const r = await f.read('qa_snapshot', { entity_id: 'study1', expected_layout_id: 'QA_READ_1', max_items_per_kind: 2 });
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'partial');
    assert.equal(r.all_graphics_returned_in_this_call, false);
    assert.equal(r.graphics.lines.status, 'truncated');
    assert.equal(r.graphics.lines.total, 3);
    assert.equal(r.graphics.lines.next_offset, 2);
    assert.equal(r.graphics.labels.status, 'complete');
  } finally { await f.close(); }
});

test('qa snapshot marks missing native graphics as unavailable not empty', async () => {
  const f = fixture({ missingCollectionData: true });
  try {
    const r = await f.read('qa_snapshot', { entity_id: 'study1', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'unavailable');
    assert.equal(r.all_graphics_returned_in_this_call, false);
    assert.equal(r.graphics.lines.total, null);
    assert.equal(r.graphics.labels.status, 'unavailable');
  } finally { await f.close(); }
});

test('qa snapshot refuses mismatched protected layout identity', async () => {
  const f = fixture();
  try {
    const r = await f.read('qa_snapshot', { entity_id: 'study1', expected_layout_id: 'WRONG_LAYOUT' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'LAYOUT_MISMATCH');
    assert.equal(r.observed_layout_id, 'QA_READ_1');
  } finally { await f.close(); }
});

test('qa snapshot refuses unknown study rather than selecting another', async () => {
  const f = fixture();
  try {
    const r = await f.read('qa_snapshot', { entity_id: 'not-present', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'TARGET_NOT_FOUND');
  } finally { await f.close(); }
});

test('qa snapshot correctly reports exposed zero-line collection as complete', async () => {
  const f = fixture({ lines: [] });
  try {
    const r = await f.read('qa_snapshot', { entity_id: 'study1', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.ok, true);
    assert.equal(r.coverage, 'complete');
    assert.equal(r.graphics.lines.total, 0);
    assert.equal(r.graphics.lines.status, 'complete');
  } finally { await f.close(); }
});


test('study diagnostics sees exact present study and complete native collections', async () => {
  const f = fixture();
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'study1', expected_layout_id: 'QA_READ_1', expected_name: 'SMT fixture' });
    assert.equal(r.ok, true);
    assert.equal(r.study_status, 'present');
    assert.equal(r.exact_name_match, true);
    assert.equal(r.graphics.lines.status, 'complete');
    assert.equal(r.graphics.labels.status, 'complete');
    assert.equal(r.graphics.lines.total, 1);
    assert.equal(r.graphics_coverage, 'complete');
    assert.equal(r.readiness.bars_present, true);
  } finally { await f.close(); }
});

test('stale study ID is only not observed; graphics are not declared empty', async () => {
  const f = fixture();
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'stale-id', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.ok, true);
    assert.equal(r.study_status, 'not_observed_at_capture');
    assert.equal(r.observed_study_count, 1);
    assert.equal(r.observed_studies[0].entity_id, 'study1');
    assert.equal(r.graphics, null);
    assert.equal(r.graphics_coverage, 'not_checked');
  } finally { await f.close(); }
});

test('exact study-name candidate does not silently replace a stale entity ID', async () => {
  const f = fixture();
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'stale-id', expected_layout_id: 'QA_READ_1', expected_name: 'SMT fixture' });
    assert.equal(r.study_status, 'not_observed_at_capture');
    assert.deepEqual(r.same_name_candidates, [{ entity_id: 'study1', name: 'SMT fixture' }]);
    assert.equal(r.graphics, null);
  } finally { await f.close(); }
});

test('unavailable line primitives are distinct from readable labels', async () => {
  const f = fixture({ missingLineCollectionData: true });
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'study1', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.study_status, 'present');
    assert.equal(r.graphics.lines.status, 'unavailable');
    assert.equal(r.graphics.lines.total, null);
    assert.equal(r.graphics.labels.status, 'complete');
    assert.equal(r.graphics.labels.total, 1);
    assert.equal(r.graphics_coverage, 'partial');
  } finally { await f.close(); }
});

test('exposed empty native line map is confirmed zero, unlike unavailable', async () => {
  const f = fixture({ lines: [] });
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'study1', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.graphics.lines.status, 'complete');
    assert.equal(r.graphics.lines.total, 0);
    assert.equal(r.graphics.labels.total, 1);
  } finally { await f.close(); }
});

test('study diagnostics fail closed on layout mismatch', async () => {
  const f = fixture();
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'study1', expected_layout_id: 'wrong' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'LAYOUT_MISMATCH');
    assert.equal(r.observed_layout_id, 'QA_READ_1');
  } finally { await f.close(); }
});

test('diagnostic graphics remain explicitly truncated when object cap is reached', async () => {
  const f = fixture({ lines: [['a', {x1:1, x2:2}], ['b', {x1:3, x2:4}]] });
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'study1', expected_layout_id: 'QA_READ_1', max_items_per_kind: 1 });
    assert.equal(r.graphics.lines.status, 'truncated');
    assert.equal(r.graphics.lines.total, 2);
    assert.equal(r.graphics.lines.next_offset, 1);
    assert.equal(r.all_graphics_returned_in_this_call, false);
  } finally { await f.close(); }
});

test('zero currently observed studies means no observed ID, not removed indicator', async () => {
  const f = fixture({ noStudies: true });
  try {
    const r = await f.read('study_diagnostics', { entity_id: 'study1', expected_layout_id: 'QA_READ_1' });
    assert.equal(r.ok, true);
    assert.equal(r.observed_study_count, 0);
    assert.equal(r.study_status, 'not_observed_at_capture');
    assert.equal(r.graphics, null);
    assert.match(r.inference_limit, /not proven removed/);
  } finally { await f.close(); }
});
