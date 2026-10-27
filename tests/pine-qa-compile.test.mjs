
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
  existingIndicator = false,
  postScriptId = null,
  postVersion = null,
  draftAfter = true,
  removeVolumeOnAdd = false,
  extraStudy = false,
  zeroStudies = false,
  renamedBaseline = false,
  malformedVolumeId = false,
  replayStarted = false,
  autoplayStarted = false,
  unknownReplayState = false,
  drawingPresent = false,
  drawingStateUnknown = false
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
    : [{ id: malformedVolumeId ? 'bad/id' : 'volume',
      name: renamedBaseline ? 'Other Volume' : 'Volume' }];
  if (zeroStudies) studies.length = 0;
  if (extraStudy) studies.push({ id: 'unrelated', name: 'Unrelated' });

  const addButton = {
    ...box,
    disabled: false,
    click() {
      clicks++;
      if (addStudy) {
        if (removeVolumeOnAdd) studies.splice(0, 1);
        studies.push({
          id: 'qa-indicator',
          name: 'MCP QA Disposable Draft'
        });
      }
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
      scriptIdPart: draft
        ? (clicks > 0 ? postScriptId : null)
        : 'USER;protected',
      version: draft
        ? (clicks > 0 ? postVersion : null)
        : '1.0'
    }),
    isModified: () => false,
    isDraft: () => draft && (clicks === 0 || draftAfter)
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
        _replayApi: {
          isReplayStarted: () => unknownReplayState ? null : replayStarted,
          isAutoplayStarted: () => unknownReplayState ? null : autoplayStarted
        },
        _activeChartWidgetWV: {
          value: () => ({
            getAllStudies: () => studies,
            getAllShapes: () => drawingStateUnknown
              ? null : drawingPresent ? [{ id: 'user-drawing' }] : []
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


test('realistic draft-associated ID verifies successful compile', async () => {
  const id = 'USER;' + 'a'.repeat(32);
  const h = fixture({ postScriptId: id, postVersion: '0.4' });
  try {
    const r = await h.call();
    assert.equal(r.ok, true);
    assert.equal(r.compiled, true);
    assert.equal(r.study_id, 'qa-indicator');
    assert.equal(r.native_draft_verified, true);
    assert.equal(r.draft_associated_script_id, id);
    assert.equal(r.draft_associated_version, '0.4');
    assert.equal(r.saved_library_state_verified, false);
    assert.equal(h.clicks(), 1);
    assert.equal(h.saves(), 0);
  } finally { await h.close(); }
});

test('unexpected assigned script identity does not verify', async () => {
  const h = fixture({
    postScriptId: 'USER;protected',
    postVersion: '1.0'
  });
  try {
    const r = await h.call();
    assert.equal(r.ok, false);
    assert.equal(r.code, 'VERIFICATION_FAILED');
    assert.equal(h.clicks(), 1);
    assert.equal(h.saves(), 0);
  } finally { await h.close(); }
});

test('assigned script ID without version does not verify', async () => {
  const h = fixture({
    postScriptId: 'USER;' + 'b'.repeat(32),
    postVersion: null
  });
  try {
    const r = await h.call();
    assert.equal(r.ok, false);
    assert.equal(r.code, 'VERIFICATION_FAILED');
    assert.equal(h.clicks(), 1);
  } finally { await h.close(); }
});

test('draft changing to saved state does not verify', async () => {
  const h = fixture({
    postScriptId: 'USER;' + 'c'.repeat(32),
    postVersion: '0.4',
    draftAfter: false
  });
  try {
    const r = await h.call();
    assert.equal(r.ok, false);
    assert.equal(r.code, 'VERIFICATION_FAILED');
    assert.equal(h.clicks(), 1);
  } finally { await h.close(); }
});

test('removal of original Volume blocks compile verification', async () => {
  const h = fixture({ removeVolumeOnAdd: true });
  try {
    const r = await h.call();
    assert.equal(r.ok, false);
    assert.equal(r.code, 'VERIFICATION_FAILED');
    assert.equal(h.clicks(), 1);
    assert.equal(h.saves(), 0);
  } finally { await h.close(); }
});

// The disposable compile preflight must refuse without ever clicking.
test('active Replay refuses disposable compilation before click', async () => {
  const h = fixture({ replayStarted: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_REPLAY_STATE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
    assert.equal(h.saves(), 0);
  } finally { await h.close(); }
});

test('autoplay refuses disposable compilation before click', async () => {
  const h = fixture({ autoplayStarted: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_REPLAY_STATE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('unavailable native Replay state is not assumed stopped', async () => {
  const h = fixture({ unknownReplayState: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_REPLAY_STATE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('existing chart drawing refuses disposable compilation', async () => {
  const h = fixture({ drawingPresent: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_DRAWING_BASELINE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('unavailable drawing snapshot is not assumed empty', async () => {
  const h = fixture({ drawingStateUnknown: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_DRAWING_BASELINE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('an unrelated preexisting indicator refuses disposable compilation', async () => {
  const h = fixture({ extraStudy: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_STUDY_BASELINE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('empty study baseline refuses disposable compilation', async () => {
  const h = fixture({ zeroStudies: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_STUDY_BASELINE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('renamed Volume baseline refuses disposable compilation', async () => {
  const h = fixture({ renamedBaseline: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_STUDY_BASELINE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});

test('unaddressable baseline study ID refuses disposable compilation', async () => {
  const h = fixture({ malformedVolumeId: true });
  try {
    const r = await h.call();
    assert.equal(r.code, 'QA_STUDY_BASELINE_UNVERIFIED');
    assert.equal(h.clicks(), 0);
  } finally { await h.close(); }
});
