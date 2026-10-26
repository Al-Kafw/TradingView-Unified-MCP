import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertQaReplayRunnerEnvironment,
  assertQaReplayRunnerTargets
} from '../src/core/qa-replay-runner.mjs';

import { createMutationPolicy } from
  '../src/core/mutation-policy.mjs';

import { buildRuntime } from '../src/runtime.mjs';

const approved = {
  TV_READONLY: '0',
  TV_ENABLE_WRITES: '1',
  TV_ALLOW_QA_REPLAY: '1',
  TV_QA_REPLAY_LAYOUT_ID: 'AIibRZIx',
  TV_ALLOWED_LAYOUT_IDS: 'AIibRZIx',
  TV_ALLOWED_LAYOUT_NAMES:
    'MCP QA Recovery RestoreLab e8150714',
  TV_QA_CANARY_RUN:
    'I_APPROVE_ES_QA_REPLAY_NO_RELOAD'
};

test('exact opt-in environment is approved', () => {
  assert.equal(
    assertQaReplayRunnerEnvironment(approved),
    true
  );
});

test('read-only or disabled writes cannot run', () => {
  for (const changes of [
    { TV_READONLY: '1' },
    { TV_ENABLE_WRITES: '0' }
  ]) {
    assert.throws(
      () => assertQaReplayRunnerEnvironment({
        ...approved, ...changes
      }),
      /QA_CANARY_ENV_NOT_APPROVED/
    );
  }
});

test('additional layout authorization is rejected', () => {
  assert.throws(
    () => assertQaReplayRunnerEnvironment({
      ...approved,
      TV_ALLOWED_LAYOUT_IDS: 'AIibRZIx,KrnVg2oE'
    }),
    /QA_CANARY_ENV_NOT_APPROVED/
  );
});

test('missing explicit canary opt-in is rejected', () => {
  const { TV_QA_CANARY_RUN, ...env } = approved;

  assert.throws(
    () => assertQaReplayRunnerEnvironment(env),
    /QA_CANARY_ENV_NOT_APPROVED/
  );
});

test('wrong Replay QA binding is rejected', () => {
  assert.throws(
    () => assertQaReplayRunnerEnvironment({
      ...approved,
      TV_QA_REPLAY_LAYOUT_ID: 'KrnVg2oE'
    }),
    /QA_CANARY_ENV_NOT_APPROVED/
  );
});

test('other writable QA capabilities cannot be enabled', () => {
  for (const flag of [
    'TV_ALLOW_QA_LAYOUT_COPY',
    'TV_ALLOW_QA_PINE_DRAFT',
    'TV_ALLOW_QA_PINE_COMPILE',
    'TV_ALLOW_QA_PINE_ROLLBACK',
    'TV_ENABLE_GENERIC_UI'
  ]) {
    assert.throws(
      () => assertQaReplayRunnerEnvironment({
        ...approved, [flag]: '1'
      }),
      /QA_CANARY_ENV_NOT_APPROVED/,
      flag
    );
  }
});

test('identical or malformed tab targets fail closed', () => {
  for (const pair of [
    { qaTargetId: 'same-tab', protectedTargetId: 'same-tab' },
    { qaTargetId: 'bad/tab', protectedTargetId: 'protected-tab' },
    { qaTargetId: '', protectedTargetId: 'protected-tab' }
  ]) {
    assert.throws(
      () => assertQaReplayRunnerTargets(pair),
      /QA_CANARY_TARGETS_INVALID/
    );
  }
});

test('real registered descriptors obey QA mutation policy', () => {
  const policy = createMutationPolicy(approved);

  const runtime = buildRuntime({
    browser: {},
    readonly: false,
    genericUi: false,
    mutationPolicy: policy
  });

  const registry = runtime.registry;
  const start = registry.get('replay_start');
  const step = registry.get('replay_step');
  const stop = registry.get('replay_stop');

  assert.equal(start.mutates, true);
  assert.equal(step.mutates, true);
  assert.equal(stop.mutates, true);

  assert.doesNotThrow(() => policy.assert(start, {
    expected_layout_id: 'AIibRZIx',
    time: 1792769400,
    allow_relocation: false,
    maximum_relocation_seconds: 1800
  }));

  assert.doesNotThrow(() => policy.assert(step, {
    expected_layout_id: 'AIibRZIx',
    bars: 1
  }));

  assert.throws(
    () => policy.assert(step, {
      expected_layout_id: 'AIibRZIx',
      bars: 2
    }),
    e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
  );

  assert.throws(
    () => policy.assert(stop, {
      expected_layout_id: 'KrnVg2oE'
    }),
    e => e.code === 'MUTATION_QA_REPLAY_ARGS_INVALID'
  );

  assert.throws(
    () => policy.assert(
      registry.get('replay_trade'),
      { expected_layout_id: 'AIibRZIx' }
    ),
    e => e.code === 'MUTATION_TOOL_NOT_APPROVED'
  );
});


test('explicit discard consent remains QA scoped', () => {
  const consent = {
    ...approved,
    TV_QA_CANARY_RUN:
      'I_APPROVE_ES_QA_REPLAY_AND_DISCARD_UNSAVED_CHANGES'
  };

  assert.equal(assertQaReplayRunnerEnvironment(consent), true);

  assert.throws(
    () => assertQaReplayRunnerEnvironment({
      ...consent,
      TV_ALLOWED_LAYOUT_IDS: 'KrnVg2oE'
    }),
    /QA_CANARY_ENV_NOT_APPROVED/
  );
});

test('similar but invalid discard consent is rejected', () => {
  assert.throws(
    () => assertQaReplayRunnerEnvironment({
      ...approved,
      TV_QA_CANARY_RUN:
        'I_APPROVE_ES_QA_REPLAY_AND_DISCARD'
    }),
    /QA_CANARY_ENV_NOT_APPROVED/
  );
});
