
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFakeCdp } from './fake-cdp.mjs';
import { pinePage } from '../src/features/pine.mjs';
import {
  createMutationPolicy,
  QA_PINE_DRAFT_SOURCE,
  QA_PINE_DRAFT_SHA256
} from '../src/core/mutation-policy.mjs';

const id = 'LabQA001';
const name = 'MCP QA Recovery RestoreLab Fixture1';
const bindingHash = 'a'.repeat(64);

const descriptor = {
  name: 'pine_compile_qa_draft',
  scope: 'browser',
  mutates: true
};

const args = {
  expected_layout_id: id,
  expected_source_sha256: QA_PINE_DRAFT_SHA256,
  expected_binding_sha256: bindingHash
};

const env = enabled => ({
  TV_ALLOWED_LAYOUT_IDS: id,
  TV_ALLOWED_LAYOUT_NAMES: name,
  TV_ALLOW_QA_PINE_COMPILE: enabled ? '1' : '0',
  TV_QA_PINE_COMPILE_LAYOUT_ID: id,
  TV_QA_PINE_COMPILE_BINDING_SHA256: bindingHash
});

test('fixed QA source hash is correct', () => {
  assert.equal(
    createHash('sha256').update(QA_PINE_DRAFT_SOURCE).digest('hex'),
    QA_PINE_DRAFT_SHA256
  );
});

test('compilation permission disabled by default', () => {
  assert.throws(
    () => createMutationPolicy(env(false)).assert(descriptor, args),
    e => e.code === 'MUTATION_TOOL_NOT_APPROVED'
  );
});

test('exact permission and clean QA layout accepted', () => {
  const policy = createMutationPolicy(env(true));
  assert.doesNotThrow(() => policy.assert(descriptor, args));
  assert.doesNotThrow(() => policy.assertVerifiedLayout(
    descriptor, args, { layout_id: id, name, has_changes: false }
  ));
});

test('wrong source hash is rejected', () => {
  assert.throws(
    () => createMutationPolicy(env(true)).assert(descriptor, {
      ...args, expected_source_sha256: 'b'.repeat(64)
    }),
    e => e.code === 'MUTATION_PINE_COMPILE_ARGS_INVALID'
  );
});

test('wrong binding hash or layout is rejected', () => {
  const policy = createMutationPolicy(env(true));

  for (const changed of [
    { expected_binding_sha256: 'b'.repeat(64) },
    { expected_layout_id: 'OtherQA01' }
  ]) assert.throws(
    () => policy.assert(descriptor, { ...args, ...changed }),
    e => e.code === 'MUTATION_PINE_COMPILE_ARGS_INVALID'
  );
});

test('dirty or renamed QA layout is rejected', () => {
  const policy = createMutationPolicy(env(true));

  assert.throws(() => policy.assertVerifiedLayout(
    descriptor, args, { layout_id: id, name, has_changes: true }
  ), e => e.code === 'MUTATION_SOURCE_NOT_CLEAN');

  assert.throws(() => policy.assertVerifiedLayout(
    descriptor, args,
    { layout_id: id, name: 'Protected', has_changes: false }
  ), e => e.code === 'MUTATION_LAYOUT_NAME_MISMATCH');
});

function fixture({
  draft = true,
  duplicateButtons = false,
  addStudy = true,
  existingIndicator = false
} = {}) {
  let clicks = 0;
  let saves = 0;

  const box = {
    isConnected: true,
    getBoundingClientRect: () => ({ width: 800, height: 400 }),
    getAttribute: () => null
  };

  const studies = existingIndicator
    ? [{ id: 'existing', name: 'MCP QA Disposable Draft' }]
    : [{ id: 'volume', name: 'Volume' }];

  const addButton = {
    ...box,
    disabled: false,
    click() {
      clicks++;
      if (addStudy)
        studies.push({
          id: 'qa-indicator',
          name: 'MCP QA Disposable Draft'
        });
    }
  };

  const saveButton = {
    ...box,
    click() { saves++; }
  };

  const widget = {
    ...box,
    querySelectorAll(selector) {
      if (selector === 'button[title="Add to chart"]')
        return duplicateButtons ? [addButton, {...addButton}] : [addButton];
      if (selector === 'button[title="Save script"]')
        return [saveButton];
      return [];
    }
  };

  const dom = {
    ...box,
    closest: selector =>
      selector === '.tv-script-widget' ? widget : null,
    contains(other) { return other === dom; }
  };

  const editor = {
    getDomNode: () => dom,
    getValue: () => QA_PINE_DRAFT_SOURCE
  };

  const facade = {
    getSource: () => QA_PINE_DRAFT_SOURCE,
    getScriptIdVersion: () => ({
      scriptIdPart: draft ? null : 'USER;protected',
      version: draft ? null : '1.0'
    }),
    isModified: () => false,
    isDraft: () => draft
  };

  const h = createFakeCdp({
    page: {
      document: {
        querySelectorAll: selector =>
          selector === '.monaco-editor.pine-editor-monaco'
            ? [dom] : []
      },
      monaco: {
        editor: { getEditors: () => [editor] }
      },
      TradingViewApi: {
        pineEditorApi: () => ({
          getDialogFacade: () => facade,
          getBottomFacade: () => null
        }),
        _chartWidgetCollection: {
          metaInfo: { uid: { value: () => id } }
        },
        getSaveChartService: () => ({
          hasChanges: () => false
        }),
        _activeChartWidgetWV: {
          value: () => ({
            getAllStudies: () => studies
          })
        }
      }
    }
  });

  const call = () => h.browser.evaluate(
    'chart-1',
    pinePage,
    {
      op: 'qa_compile_draft',
      expected_layout_id: id,
      expected_source: QA_PINE_DRAFT_SOURCE,
      expected_binding_json: JSON.stringify({
        host: 'dialog',
        script_id: draft ? null : 'USER;protected',
        version: draft ? null : '1.0',
        is_modified: false,
        is_draft: draft
      }),
      timeout_ms: 500
    }
  );

  return {
    ...h, call,
    clicks: () => clicks,
    saves: () => saves
  };
}

test('unique draft control adds exactly one QA study', async () => {
  const h = fixture();
  try {
    const result = await h.call();
    assert.equal(result.ok, true);
    assert.equal(result.compiled, true);
    assert.equal(result.study_id, 'qa-indicator');
    assert.equal(h.clicks(), 1);
    assert.equal(h.saves(), 0);
  } finally { await h.close(); }
});

test('saved script cannot reach compile click', async () => {
  const h = fixture({ draft: false });
  try {
    const result = await h.call();
    assert.equal(result.ok, false);
    assert.equal(h.clicks(), 0);
    assert.equal(h.saves(), 0);
  } finally { await h.close(); }
});

test('duplicate Add to chart buttons block compilation', async () => {
  const h = fixture({ duplicateButtons: true });
  try {
    assert.equal((await h.call()).ok, false);
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('existing QA study prevents duplicate submission', async () => {
  const h = fixture({ existingIndicator: true });
  try {
    assert.equal((await h.call()).ok, false);
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('no new chart study cannot count as compile success', async () => {
  const h = fixture({ addStudy: false });
  try {
    const result = await h.call();
    assert.equal(result.ok, false);
    assert.equal(result.code, 'COMPILE_OUTCOME_UNVERIFIED');
    assert.equal(h.clicks(), 1);
    assert.equal(h.saves(), 0);
  } finally { await h.close(); }
});
