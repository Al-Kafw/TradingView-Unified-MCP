
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutationPolicy } from '../src/core/mutation-policy.mjs';
import { ToolRegistry } from '../src/core/registry.mjs';

const descriptor = name => ({
  name,
  scope: 'browser',
  mutates: true
});

const approved = () => createMutationPolicy({
  TV_ALLOWED_LAYOUT_IDS: 'TestQa01'
});

test('no configured layouts means no browser writes', () => {
  const policy = createMutationPolicy({});
  assert.throws(
    () => policy.assert(descriptor('chart_set_symbol'), {
      expected_layout_id: 'TestQa01'
    }),
    e => e.code === 'MUTATION_LAYOUT_NOT_APPROVED'
  );
});

test('approved chart operation on approved layout passes policy', () => {
  assert.doesNotThrow(() => approved().assert(
    descriptor('chart_set_symbol'),
    { expected_layout_id: 'TestQa01' }
  ));
  assert.doesNotThrow(() => approved().assert(
    descriptor('chart_set_timeframe'),
    { expected_layout_id: 'TestQa01' }
  ));
});

test('unapproved layout is blocked', () => {
  assert.throws(
    () => approved().assert(descriptor('chart_set_symbol'), {
      expected_layout_id: 'Another01'
    }),
    e => e.code === 'MUTATION_LAYOUT_NOT_APPROVED'
  );
});

test('Pine, layout, workflow and account mutations remain blocked', () => {
  for (const name of [
    'pine_save_next',
    'pine_save',
    'pine_set_source',
    'pine_compile',
    'pine_delete_script',
    'layout_delete',
    'layout_copy',
    'workflow_copy_chart_create_alert',
    'watchlist_create',
    'alert_create',
    'ui_click'
  ]) {
    assert.throws(
      () => approved().assert(descriptor(name), {
        expected_layout_id: 'TestQa01'
      }),
      e => e.code === 'MUTATION_TOOL_NOT_APPROVED',
      name
    );
  }
});

test('malformed allowlist configuration fails closed', () => {
  for (const value of ['*', 'TestQa01,TestQa01', '../private', ',']) {
    assert.throws(
      () => createMutationPolicy({
        TV_ALLOWED_LAYOUT_IDS: value
      }),
      e => e.code === 'MUTATION_POLICY_CONFIG_INVALID'
    );
  }
});

test('top-level denied mutation never resolves a browser target', async () => {
  let touched = 0;
  const registry = new ToolRegistry({
    readonly: false,
    mutationPolicy: approved(),
    browser: {
      async resolveTarget() {
        touched++;
        throw new Error('Should not resolve target');
      }
    },
    store: { async audit() {} }
  });

  registry.add({
    name: 'pine_save_next',
    mutates: true,
    handler: async () => { touched++; },
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  });

  await assert.rejects(
    registry.execute('pine_save_next', {
      target_id: 'tab-1',
      expected_layout_id: 'TestQa01'
    }),
    e => e.code === 'MUTATION_TOOL_NOT_APPROVED'
  );

  assert.equal(touched, 0);
});

test('nested mutation cannot bypass scope policy', async () => {
  let touched = 0;
  const registry = new ToolRegistry({
    readonly: false,
    mutationPolicy: approved()
  });

  registry.add({
    name: 'pine_save_next',
    mutates: true,
    handler: async () => { touched++; }
  });

  await assert.rejects(
    registry.executeNested(
      'pine_save_next',
      { target_id: 'tab-1', expected_layout_id: 'TestQa01' },
      { signal: undefined, targetId: 'tab-1',
        expectedLayoutId: 'TestQa01' }
    ),
    e => e.code === 'MUTATION_TOOL_NOT_APPROVED'
  );

  assert.equal(touched, 0);
});


test('writable registry always has a mutation policy', async () => {
  for (const mode of ['omitted', 'null']) {
    let touched = 0;

    const options = {
      readonly: false,
      browser: {
        async resolveTarget() {
          touched++;
          return { id: 'tab-1' };
        }
      },
      store: { async audit() {} }
    };

    if (mode === 'null') options.mutationPolicy = null;

    const registry = new ToolRegistry(options);

    registry.add({
      name: 'pine_save_next',
      mutates: true,
      handler: async () => {
        touched++;
        return { ok: true };
      }
    });

    await assert.rejects(
      registry.execute('pine_save_next', {
        target_id: 'tab-1',
        expected_layout_id: 'TestQa01'
      }),
      error => error.code === 'MUTATION_TOOL_NOT_APPROVED'
    );

    assert.equal(touched, 0);
  }
});
