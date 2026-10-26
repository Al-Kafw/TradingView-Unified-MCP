
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutationPolicy } from '../src/core/mutation-policy.mjs';

const id = 'LabQA001';
const name = 'MCP QA Recovery RestoreLab Fixture1';
const d = name => ({ name, scope: 'browser', mutates: true });

function policy(enabled = true, overrides = {}) {
  return createMutationPolicy({
    TV_ALLOWED_LAYOUT_IDS: id,
    TV_ALLOWED_LAYOUT_NAMES: name,
    TV_ALLOW_QA_REPLAY: enabled ? '1' : '0',
    TV_QA_REPLAY_LAYOUT_ID: id,
    ...overrides
  });
}

const args = {
  replay_start: {
    expected_layout_id: id,
    time: 1790000000,
    allow_relocation: false,
    maximum_relocation_seconds: 900
  },
  replay_step: { expected_layout_id: id, bars: 1 },
  replay_stop: { expected_layout_id: id },
  replay_autoplay: { expected_layout_id: id, enabled: false }
};

test('Replay mutations disabled by default', () => {
  const p = policy(false);
  for (const [tool, a] of Object.entries(args))
    assert.throws(
      () => p.assert(d(tool), a),
      e => e.code === 'MUTATION_TOOL_NOT_APPROVED'
    );
});

test('exact authorized QA Replay operations pass policy', () => {
  const p = policy();
  for (const [tool, a] of Object.entries(args))
    assert.doesNotThrow(() => p.assert(d(tool), a));
});

test('Replay trade remains forbidden even with QA enabled', () => {
  assert.throws(
    () => policy().assert(
      d('replay_trade'),
      { expected_layout_id: id, action: 'buy' }
    ),
    e => e.code === 'MUTATION_TOOL_NOT_APPROVED'
  );
});

test('start must have an exact safe Unix-second timestamp', () => {
  for (const time of [undefined, 0, 1790000000.5, Infinity]) {
    assert.throws(
      () => policy().assert(d('replay_start'), {
        ...args.replay_start, time
      }),
      e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
    );
  }
});

test('unrestricted Replay relocation is forbidden', () => {
  for (const modification of [
    { allow_relocation: true },
    { maximum_relocation_seconds: 1801 },
    { maximum_relocation_seconds: -1 }
  ]) {
    assert.throws(
      () => policy().assert(d('replay_start'), {
        ...args.replay_start, ...modification
      }),
      e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
    );
  }
});

test('Replay starts require a clean saved QA layout', () => {
  assert.throws(
    () => policy().assertVerifiedLayout(
      d('replay_start'), args.replay_start,
      { layout_id: id, name, has_changes: true }
    ),
    e => e.code === 'MUTATION_SOURCE_NOT_CLEAN'
  );
});

test('single-bar Replay step is accepted', () => {
  assert.doesNotThrow(
    () => policy().assert(d('replay_step'), args.replay_step)
  );
});

test('multi-bar or implicit Replay steps are rejected', () => {
  for (const bars of [undefined, 0, 2, 10]) {
    assert.throws(
      () => policy().assert(d('replay_step'), {
        expected_layout_id: id, bars
      }),
      e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
    );
  }
});

test('Replay autoplay can only be paused', () => {
  for (const a of [
    { expected_layout_id: id, enabled: true },
    { expected_layout_id: id, enabled: false, delay_ms: 100 }
  ]) {
    assert.throws(
      () => policy().assert(d('replay_autoplay'), a),
      e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
    );
  }
});

test('protected layouts cannot be approved as Replay QA', () => {
  assert.throws(
    () => policy(true, {
      TV_ALLOWED_LAYOUT_NAMES: 'Couto|Mentorship'
    }),
    e => e.code === 'MUTATION_POLICY_CONFIG_INVALID'
  );
});

test('incorrect or protected layout identity fails before Replay', () => {
  const p = policy();

  assert.throws(
    () => p.assert(d('replay_step'), {
      expected_layout_id: 'KrnVg2oE', bars: 1
    }),
    e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
  );

  assert.throws(
    () => p.assertVerifiedLayout(
      d('replay_step'), args.replay_step,
      { layout_id: 'KrnVg2oE', name: 'Couto|Mentorship' }
    ),
    e => e.code === 'MUTATION_LAYOUT_NAME_MISMATCH'
  );
});

test('missing exact Replay layout opt-in fails closed', () => {
  const p = policy(true, { TV_QA_REPLAY_LAYOUT_ID: '' });

  assert.throws(
    () => p.assert(d('replay_step'), args.replay_step),
    e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
  );
});
