
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMutationPolicy,
  QA_PINE_DRAFT_SOURCE
} from '../src/core/mutation-policy.mjs';
import { ToolRegistry } from '../src/core/registry.mjs';
import pineTools from '../src/features/pine.mjs';

const name = 'MCP QA Recovery RestoreLab Fixture1';
const id = 'LabQA001';
const bindingHash = 'a'.repeat(64);

const descriptor = {
  name: 'pine_new_buffer',
  scope: 'browser',
  mutates: true
};

const args = {
  target_id: 'qa-tab',
  expected_layout_id: id,
  expected_binding_sha256: bindingHash,
  source: QA_PINE_DRAFT_SOURCE
};

const native = {
  layout_id: id,
  name,
  has_changes: false
};

const env = enabled => ({
  TV_ALLOWED_LAYOUT_IDS: id,
  TV_ALLOWED_LAYOUT_NAMES: name,
  TV_ALLOW_QA_PINE_DRAFT: enabled ? '1' : '0',
  TV_QA_PINE_DRAFT_LAYOUT_ID: id,
  TV_QA_PINE_DRAFT_BINDING_SHA256: bindingHash
});

test('Pine draft permission is disabled by default', () => {
  assert.throws(
    () => createMutationPolicy(env(false)).assert(descriptor, args),
    error => error.code === 'MUTATION_TOOL_NOT_APPROVED'
  );
});

test('explicit permission accepts exact lab, source and binding', () => {
  const policy = createMutationPolicy(env(true));
  assert.doesNotThrow(() => policy.assert(descriptor, args));
  assert.doesNotThrow(() =>
    policy.assertVerifiedLayout(descriptor, args, native)
  );
});

test('modified or unrelated Pine source is rejected', () => {
  const policy = createMutationPolicy(env(true));
  for (const source of [
    QA_PINE_DRAFT_SOURCE + '// modification',
    '//@version=6\nindicator("Production")\nplot(close)\n',
    ''
  ]) {
    assert.throws(
      () => policy.assert(descriptor, { ...args, source }),
      error => error.code === 'MUTATION_PINE_DRAFT_ARGS_INVALID'
    );
  }
});

test('wrong, missing or malformed binding hash is rejected', () => {
  for (const hash of ['b'.repeat(64), '', undefined]) {
    const policy = createMutationPolicy(env(true));
    assert.throws(
      () => policy.assert(descriptor, {
        ...args,
        expected_binding_sha256: hash
      }),
      error => error.code === 'MUTATION_PINE_DRAFT_ARGS_INVALID'
    );
  }
});

test('unapproved lab identity or name is rejected', () => {
  const policy = createMutationPolicy(env(true));
  assert.throws(
    () => policy.assert(descriptor, {
      ...args,
      expected_layout_id: 'OtherQA01'
    }),
    error => error.code === 'MUTATION_PINE_DRAFT_ARGS_INVALID'
  );

  assert.throws(
    () => policy.assertVerifiedLayout(descriptor, args, {
      ...native,
      name: 'Protected Production Layout'
    }),
    error => error.code === 'MUTATION_LAYOUT_NAME_MISMATCH'
  );
});

test('dirty restore lab is rejected', () => {
  const policy = createMutationPolicy(env(true));
  assert.throws(
    () => policy.assertVerifiedLayout(descriptor, args, {
      ...native,
      has_changes: true
    }),
    error => error.code === 'MUTATION_SOURCE_NOT_CLEAN'
  );
});

test('normal and nested registry calls reject disabled Pine drafts', async () => {
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

  registry.add(
    pineTools.find(tool => tool.name === 'pine_new_buffer')
  );

  await assert.rejects(
    registry.execute('pine_new_buffer', args),
    error => error.code === 'MUTATION_TOOL_NOT_APPROVED'
  );

  await assert.rejects(
    registry.executeNested('pine_new_buffer', args, {
      signal: undefined,
      targetId: 'qa-tab',
      expectedLayoutId: id
    }),
    error => error.code === 'MUTATION_TOOL_NOT_APPROVED'
  );

  assert.equal(resolved, 0);
});
