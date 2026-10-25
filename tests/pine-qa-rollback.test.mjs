
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeCdp } from './fake-cdp.mjs';
import { pinePage } from '../src/features/pine.mjs';
import { createMutationPolicy } from '../src/core/mutation-policy.mjs';

const id = 'LabQA001';
const name = 'MCP QA Recovery RestoreLab Fixture1';
const args = {
  expected_layout_id: id,
  entity_id: 'DraftQA1',
  baseline_entity_id: 'VolumeQA1'
};
const descriptor = {
  name: 'pine_remove_qa_study',
  scope: 'browser',
  mutates: true
};
const env = enabled => ({
  TV_ALLOWED_LAYOUT_IDS: id,
  TV_ALLOWED_LAYOUT_NAMES: name,
  TV_ALLOW_QA_PINE_ROLLBACK: enabled ? '1' : '0',
  TV_QA_PINE_ROLLBACK_LAYOUT_ID: id,
  TV_QA_PINE_ROLLBACK_STUDY_ID: 'DraftQA1',
  TV_QA_PINE_ROLLBACK_BASELINE_ID: 'VolumeQA1'
});

test('rollback disabled by default', () => {
  assert.throws(
    () => createMutationPolicy(env(false)).assert(descriptor, args),
    e => e.code === 'MUTATION_TOOL_NOT_APPROVED'
  );
});

test('exact rollback accepted even if QA layout is dirty', () => {
  const p = createMutationPolicy(env(true));
  assert.doesNotThrow(() => p.assert(descriptor, args));
  assert.doesNotThrow(() => p.assertVerifiedLayout(
    descriptor, args,
    { layout_id: id, name, has_changes: true }
  ));
});

test('wrong or identical study IDs rejected', () => {
  const p = createMutationPolicy(env(true));
  for (const changes of [
    { entity_id: 'VolumeQA1' },
    { entity_id: 'Wrong' },
    { baseline_entity_id: 'Wrong' }
  ]) assert.throws(
    () => p.assert(descriptor, { ...args, ...changes }),
    e => e.code === 'MUTATION_PINE_ROLLBACK_ARGS_INVALID'
  );
});

test('wrong layout or name rejected', () => {
  const p = createMutationPolicy(env(true));
  assert.throws(
    () => p.assert(descriptor, {
      ...args, expected_layout_id: 'WrongQA1'
    }),
    e => e.code === 'MUTATION_PINE_ROLLBACK_ARGS_INVALID'
  );
  assert.throws(
    () => p.assertVerifiedLayout(descriptor, args, {
      layout_id: id, name: 'Protected', has_changes: true
    }),
    e => e.code === 'MUTATION_LAYOUT_NAME_MISMATCH'
  );
});

function fixture({
  wrongName = false,
  extra = false,
  missingVolume = false,
  wrongLayout = false,
  noRemove = false
} = {}) {
  const removed = [];
  const studies = [
    ...(!missingVolume
      ? [{ id: 'VolumeQA1', name: 'Volume' }]
      : []),
    {
      id: 'DraftQA1',
      name: wrongName ? 'Protected Indicator' :
        'MCP QA Disposable Draft'
    },
    ...(extra ? [{ id: 'Other', name: 'Other Indicator' }] : [])
  ];

  const chart = { getAllStudies: () => studies };

  if (!noRemove) chart.removeEntity = entityId => {
    removed.push(entityId);
    const index = studies.findIndex(s => s.id === entityId);
    if (index >= 0) studies.splice(index, 1);
  };

  const h = createFakeCdp({
    page: {
      TradingViewApi: {
        _chartWidgetCollection: {
          metaInfo: {
            uid: { value: () => wrongLayout ? 'WrongQA1' : id }
          }
        },
        _activeChartWidgetWV: { value: () => chart }
      }
    }
  });

  return {
    ...h,
    removed,
    call: () => h.browser.evaluate('chart-1', pinePage, {
      op: 'qa_remove_study', ...args, timeout_ms: 500
    })
  };
}

test('removes only disposable QA study', async () => {
  const f = fixture();
  try {
    const r = await f.call();
    assert.equal(r.ok, true);
    assert.equal(r.live_study_baseline_restored, true);
    assert.equal(r.persisted_layout_restoration_verified, false);
    assert.deepEqual(f.removed, ['DraftQA1']);
  } finally { await f.close(); }
});

test('protected indicator name blocks removal', async () => {
  const f = fixture({ wrongName: true });
  try {
    assert.equal((await f.call()).ok, false);
    assert.equal(f.removed.length, 0);
  } finally { await f.close(); }
});

test('additional study blocks removal', async () => {
  const f = fixture({ extra: true });
  try {
    assert.equal((await f.call()).ok, false);
    assert.equal(f.removed.length, 0);
  } finally { await f.close(); }
});

test('missing original Volume blocks removal', async () => {
  const f = fixture({ missingVolume: true });
  try {
    assert.equal((await f.call()).ok, false);
    assert.equal(f.removed.length, 0);
  } finally { await f.close(); }
});

test('wrong native layout blocks removal', async () => {
  const f = fixture({ wrongLayout: true });
  try {
    const r = await f.call();
    assert.equal(r.code, 'LAYOUT_MISMATCH');
    assert.equal(f.removed.length, 0);
  } finally { await f.close(); }
});

test('missing native removal method blocks removal', async () => {
  const f = fixture({ noRemove: true });
  try {
    assert.equal((await f.call()).ok, false);
    assert.equal(f.removed.length, 0);
  } finally { await f.close(); }
});
