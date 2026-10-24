
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutationPolicy } from '../src/core/mutation-policy.mjs';
import { ToolRegistry } from '../src/core/registry.mjs';
import layoutTools from '../src/features/layouts.mjs';

const descriptor = {
  name: 'layout_copy',
  scope: 'browser',
  mutates: true
};

const env = enabled => ({
  TV_ALLOWED_LAYOUT_IDS: 'TestQa01',
  TV_ALLOWED_LAYOUT_NAMES: 'MCP Test',
  TV_ALLOW_QA_LAYOUT_COPY: enabled ? '1' : '0'
});

const args = {
  expected_layout_id: 'TestQa01',
  name: 'MCP QA Recovery Fixture',
  idempotency_key: 'qa-recovery-fixture-0001',
  save_source: false
};

const native = {
  layout_id: 'TestQa01',
  name: 'MCP Test',
  has_changes: false
};

test('QA layout copying disabled by default', () => {
  assert.throws(
    () => createMutationPolicy(env(false)).assert(descriptor, args),
    error => error.code === 'MUTATION_TOOL_NOT_APPROVED'
  );
});

test('explicit QA permission accepts strictly scoped copy', () => {
  const policy = createMutationPolicy(env(true));
  assert.doesNotThrow(() => policy.assert(descriptor, args));
  assert.doesNotThrow(() =>
    policy.assertVerifiedLayout(descriptor, args, native)
  );
});

test('source-saving and missing explicit false are refused', () => {
  const policy = createMutationPolicy(env(true));
  for (const save_source of [true, undefined]) {
    assert.throws(
      () => policy.assert(descriptor, { ...args, save_source }),
      error => error.code === 'MUTATION_COPY_ARGS_INVALID'
    );
  }
});

test('non-QA destinations and insufficient operation keys refused', () => {
  const policy = createMutationPolicy(env(true));
  for (const change of [
    { name: 'Protected Production Layout' },
    { name: 'MCP Test' },
    { idempotency_key: 'short' }
  ]) {
    assert.throws(
      () => policy.assert(descriptor, { ...args, ...change }),
      error => error.code === 'MUTATION_COPY_ARGS_INVALID'
    );
  }
});

test('dirty source is rejected before copy dispatch', () => {
  const policy = createMutationPolicy(env(true));
  assert.throws(
    () => policy.assertVerifiedLayout(descriptor, args, {
      ...native,
      has_changes: true
    }),
    error => error.code === 'MUTATION_SOURCE_NOT_CLEAN'
  );
});

test('protected native identity cannot be copied', () => {
  const policy = createMutationPolicy(env(true));
  assert.throws(
    () => policy.assertVerifiedLayout(descriptor, args, {
      ...native,
      name: 'Protected Production Layout'
    }),
    error => error.code === 'MUTATION_LAYOUT_NAME_MISMATCH'
  );
});


test('registry refuses disabled QA copying before resolving a tab', async () => {
  let resolved = 0;

  const registry = new ToolRegistry({
    readonly: false,
    mutationPolicy: createMutationPolicy(env(false)),
    browser: {
      async resolveTarget() {
        resolved++;
        throw new Error('Browser must not be reached');
      }
    },
    store: { async audit() {} }
  });

  registry.add(layoutTools.find(tool => tool.name === 'layout_copy'));

  await assert.rejects(
    registry.execute('layout_copy', {
      ...args,
      target_id: 'dummy-tab'
    }),
    error => error.code === 'MUTATION_TOOL_NOT_APPROVED'
  );

  assert.equal(resolved, 0);
});

test('nested registry execution cannot bypass disabled copying', async () => {
  const registry = new ToolRegistry({
    readonly: false,
    mutationPolicy: createMutationPolicy(env(false))
  });

  registry.add(layoutTools.find(tool => tool.name === 'layout_copy'));

  await assert.rejects(
    registry.executeNested(
      'layout_copy',
      { ...args, target_id: 'dummy-tab' },
      {
        signal: undefined,
        targetId: 'dummy-tab',
        expectedLayoutId: 'TestQa01'
      }
    ),
    error => error.code === 'MUTATION_TOOL_NOT_APPROVED'
  );
});
