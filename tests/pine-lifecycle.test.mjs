import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ToolRegistry } from '../src/core/registry.mjs';
import { LocalStore } from '../src/core/storage.mjs';
import { assertFixedFunction } from '../src/core/security.mjs';
import tools, { pinePage, pineLibraryPage, sourceHash } from '../src/features/pine.mjs';
import { createFakeCdp } from './fake-cdp.mjs';

async function fixture(t) {
  const scripts = new Map([
    ['USER;first', { scriptIdPart: 'USER;first', scriptName: 'First', version: '1', source: '//@version=6\nindicator("First")\nplot(close)' }],
    ['USER;second', { scriptIdPart: 'USER;second', scriptName: 'Second', version: '3', source: '//@version=6\nindicator("Second")\nplot(open)' }]
  ]);
  const state = { source: scripts.get('USER;first').source, title: 'First', id: 'USER;first', version: '1', draft: false, modified: false, next: 0, calls: [], nativeOpenCalls: 0, refuseBinding: false, skipVersionAdvance: false, versionResponse: undefined };
  const dom = { isConnected: true, getBoundingClientRect: () => ({ width: 800, height: 400 }), contains(other) { return other === this; } };
  const heading = { ...dom, get textContent() { return state.title; } };
  const editor = { getDomNode: () => dom, getValue: () => state.source, setValue: text => { state.source = text; state.modified = true; } };
  const facade = {
    getSource: () => state.source, getScriptIdVersion: () => ({ scriptIdPart: state.id, version: state.version }),
    isDraft: () => state.draft, isModified: () => state.modified,
    openScript: async value => {
      state.nativeOpenCalls++;const saved = scripts.get(value.scriptIdPart);
      state.source = saved.source;state.title = saved.scriptName;
      if (!state.refuseBinding) { state.id = value.scriptIdPart; state.version = String(value.version); state.draft = false; state.modified = false; }
    },
    openNewScript: async () => { state.nativeOpenCalls++;state.id = null;state.version = null;state.draft = true;state.modified = false;state.source = '';state.title = 'Untitled'; }
  };
  const pe = { getDialogFacade: () => null, getBottomFacade: () => facade };
  const nativeFetch = async options => {
    state.calls.push(structuredClone(options));const path = options.urlPath;
    if (path === 'list') return [...scripts.values()].map(({ source, ...metadata }) => ({ ...metadata }));
    if (path.startsWith('get/')) { const [, id, version] = path.split('/');const record = scripts.get(id);if (!record || record.version !== version) throw new Error('Wrong script ID/version requested');return { source: record.source, version: record.version, scriptIdPart: id }; }
    if (path.startsWith('versions/')) return state.versionResponse ?? [{ version: scripts.get(path.slice(9)).version, modified: 1700000 }];
    if (path.startsWith('is_auth_to_write/')) return true;
    if (path === 'save/new') {
      const id = 'USER;new' + ++state.next;
      scripts.set(id, { scriptIdPart: id, scriptName: options.urlParams.name, version: '1', source: options.data.source });
      return { success: true, result: { metaInfo: { scriptIdPart: id } } };
    }
    if (path.startsWith('save/next/')) { const record = scripts.get(path.slice(10));record.source = options.data.source;if (!state.skipVersionAdvance) record.version = String(Number(record.version) + 1);return { success: true }; }
    if (path.startsWith('rename/')) { scripts.get(path.slice(7)).scriptName = options.urlParams.name;return { success: true }; }
    if (path.startsWith('delete/')) { scripts.delete(path.slice(7));return { success: true }; }
    throw new Error('Fixture rejected unknown Pine facade endpoint');
  };
  const h = createFakeCdp({ page: {
    URLSearchParams,
    TradingViewApi: { pineEditorApi: () => pe, _chartWidgetCollection: { metaInfo: { uid: { value: () => 'source01' } } } },
    document: { querySelectorAll: selector => selector === '.monaco-editor.pine-editor-monaco' ? [dom] : selector === '[data-name="scriptTitle"]' ? [heading] : [], querySelector: () => null },
    monaco: { editor: { getEditors: () => [editor] } },
    webpackChunktradingview: { push: parts => parts[2]({ c: { pine: { exports: { pineFacadeFetch: nativeFetch } } } }) }
  } });
  const dir = await mkdtemp(join(tmpdir(), 'tv-pine-lifecycle-'));
  const store = new LocalStore(dir), registry = new ToolRegistry({ browser: h.browser, store });registry.addAll(tools);
  t.after(async () => { await h.close();await rm(dir, { recursive: true, force: true }); });
  return { ...h, state, scripts, facade, pe, registry, execute: (name, args = {}) => registry.execute(name, { target_id: 'chart-1', expected_layout_id: 'source01', ...args }) };
}

test('native Pine adapters pass fixed-code security audit and history preserves literal native script identifiers', async t => {
  for (const fn of [pinePage, pineLibraryPage]) assert.doesNotThrow(() => assertFixedFunction(fn));
  const f = await fixture(t);
  const versions = await f.execute('pine_get_versions', { script_id: 'USER;first' });
  assert.equal(versions.versions[0].version, '1');
  assert.equal((await f.execute('pine_can_write', { script_id: 'USER;first' })).can_write, true);
  assert.ok(f.state.calls.some(call => call.urlPath === 'versions/USER;first'));
  const count = f.state.calls.length;
  await assert.rejects(f.execute('pine_get_versions', { script_id: 'USER;first/../../delete/USER;second' }), e => e.code === 'INVALID_ARGUMENT');
  assert.equal(f.state.calls.length, count);
});

test('native document binding requires a unique matching facade and exact visible source', async t => {
  const f = await fixture(t);
  const binding = await f.execute('pine_get_binding');
  assert.equal(binding.native_binding.script_id, 'USER;first');
  assert.equal(binding.native_binding.version, '1');
  assert.match(binding.binding_sha256, /^[a-f0-9]{64}$/);
  f.pe.getDialogFacade = () => ({ ...f.facade, getScriptIdVersion: () => ({ scriptIdPart: 'USER;ambiguous', version: '1' }) });
  await assert.rejects(f.execute('pine_get_binding'), e => e.code === 'BINDING_UNVERIFIED');
});

test('opening a native saved script verifies ID, version and full source and preserves a before artifact', async t => {
  const f = await fixture(t);const before = await f.execute('pine_get_binding');
  const result = await f.execute('pine_open_script', { script_id: 'USER;second', expected_binding_sha256: before.binding_sha256 });
  assert.equal(result.native_binding.script_id, 'USER;second');
  assert.equal(result.native_binding.version, '3');
  assert.equal(result.source, f.scripts.get('USER;second').source);
  assert.equal(JSON.parse(await readFile(result.backup_file.path, 'utf8')).source, before.source);
});

test('changing only title and buffer cannot fake a successful native open', async t => {
  const f = await fixture(t);f.state.refuseBinding = true;const before = await f.execute('pine_get_binding');
  await assert.rejects(f.execute('pine_open_script', { script_id: 'USER;second', expected_binding_sha256: before.binding_sha256, timeout_ms: 500 }), e => e.code === 'BINDING_UNVERIFIED' && e.details.mutation_attempted === true);
  assert.equal(f.state.nativeOpenCalls, 1);
  assert.equal(f.state.id, 'USER;first');
  assert.equal(f.scripts.get('USER;first').source, before.source);
});

test('a modified native buffer blocks document switching before openScript is called', async t => {
  const f = await fixture(t);f.state.modified = true;const before = await f.execute('pine_get_binding');
  await assert.rejects(f.execute('pine_open_script', { script_id: 'USER;second', expected_binding_sha256: before.binding_sha256 }), e => e.code === 'UNSAVED_EDITOR');
  assert.equal(f.state.nativeOpenCalls, 0);
});

test('new-buffer creation proves a native draft identity before setting its source', async t => {
  const f = await fixture(t);const before = await f.execute('pine_get_binding');
  const result = await f.execute('pine_new_buffer', { source: '//@version=6\nindicator("New draft")\nplot(open)', expected_binding_sha256: before.binding_sha256 });
  assert.equal(result.native_binding.is_draft, true);
  assert.equal(result.native_binding.script_id, null);
  assert.equal(result.saved_script_created, false);
  assert.equal(f.scripts.size, 2);
});

test('new cloud saves verify unique new identity and exact source while duplicate names cannot overwrite', async t => {
  const f = await fixture(t);const original = f.state.source;
  const source = '//@version=6\nindicator("New")\n// ); globalThis.COMPROMISED=true;\nplot(close)';
  const saved = await f.execute('pine_save_new', { name: 'New cloud script', source });
  assert.equal(saved.created, true);assert.equal(saved.script_id, 'USER;new1');assert.equal(saved.source, source);
  assert.equal(f.state.id, 'USER;first');assert.equal(f.state.source, original);assert.equal(f.context.COMPROMISED, undefined);
  await assert.rejects(f.execute('pine_save_new', { name: 'New cloud script', source: 'replacement' }), e => e.code === 'NAME_CONFLICT');
  assert.equal(f.state.calls.filter(call => call.urlPath === 'save/new').length, 1);
  assert.equal(f.scripts.get('USER;new1').source, source);
});

test('save-as preserves a modified buffer in a new saved ID and verifies actual editor rebinding', async t => {
  const f = await fixture(t);f.state.source += '\n// edited';f.state.modified = true;
  const before = await f.execute('pine_get_binding');
  const saved = await f.execute('pine_save_as', { name: 'Saved as copy', expected_binding_sha256: before.binding_sha256 });
  assert.equal(saved.saved_script_created, true);assert.equal(saved.created_script.script_id, 'USER;new1');
  assert.equal(saved.native_binding.script_id, 'USER;new1');assert.equal(saved.native_binding.is_modified, false);
  assert.equal(f.scripts.get('USER;new1').source, before.source);
  assert.notEqual(f.scripts.get('USER;first').source, before.source);
});

test('save-as returns a concrete created-script reconciliation receipt if rebinding fails after saving', async t => {
  const f = await fixture(t);f.state.refuseBinding = true;const before = await f.execute('pine_get_binding');
  await assert.rejects(f.execute('pine_save_as', { name: 'Created but not bound', expected_binding_sha256: before.binding_sha256, timeout_ms: 500 }), e => e.code === 'PINE_SAVED_BINDING_UNVERIFIED' && e.details.created_script.script_id === 'USER;new1');
  assert.equal(f.scripts.get('USER;new1').source, before.source);
  assert.equal(f.state.calls.filter(call => call.urlPath === 'save/new').length, 1);
});

test('save-next, rename and deletion independently verify exact native script state and each preserves a backup', async t => {
  const f = await fixture(t),original = f.scripts.get('USER;first').source,newSource = original + '\n// next version';
  const saved = await f.execute('pine_save_next', { script_id: 'USER;first', expected_version: '1', expected_saved_source_sha256: sourceHash(original), source: newSource });
  assert.equal(saved.version, '2');assert.equal(saved.version_created, true);
  assert.equal(JSON.parse(await readFile(saved.backup_file.path, 'utf8')).source, original);
  const renamed = await f.execute('pine_rename_script', { script_id: 'USER;first', expected_version: '2', expected_saved_source_sha256: sourceHash(newSource), expected_name: 'First', name: 'Renamed' });
  assert.equal(renamed.name, 'Renamed');assert.equal(renamed.source, newSource);
  const deleted = await f.execute('pine_delete_script', { script_id: 'USER;first', expected_version: '2', expected_saved_source_sha256: sourceHash(newSource), expected_name: 'Renamed' });
  assert.equal(deleted.deleted.script_id, 'USER;first');assert.equal(f.scripts.has('USER;first'), false);
  assert.equal(JSON.parse(await readFile(deleted.backup_file.path, 'utf8')).source, newSource);
  const submitted = f.state.calls.filter(call => call.method === 'POST');
  assert.deepEqual(submitted.map(call => call.urlPath), ['save/next/USER;first', 'rename/USER;first', 'delete/USER;first']);
  assert.equal(submitted[0].urlParams.allow_create_new, false);assert.equal(submitted[1].urlParams.force, false);
});

test('stale saved-source preconditions stop cloud changes before any POST', async t => {
  const f = await fixture(t);
  await assert.rejects(f.execute('pine_save_next', { script_id: 'USER;first', expected_version: '1', expected_saved_source_sha256: sourceHash('stale'), source: 'new' }), e => e.code === 'PRECONDITION_FAILED');
  assert.equal(f.state.calls.some(call => call.method === 'POST'), false);
});

test('changed saved source without version movement never qualifies as verified save-next', async t => {
  const f = await fixture(t);f.state.skipVersionAdvance = true;const original = f.scripts.get('USER;first').source;
  await assert.rejects(f.execute('pine_save_next', { script_id: 'USER;first', expected_version: '1', expected_saved_source_sha256: sourceHash(original), source: original + '\n// changed', timeout_ms: 500 }), e => e.code === 'PINE_MUTATION_UNVERIFIED');
});

test('malformed native version-history response fails closed instead of pretending no history exists', async t => {
  const f = await fixture(t);f.state.versionResponse = { status: 'unexpected' };
  await assert.rejects(f.execute('pine_get_versions', { script_id: 'USER;first' }), e => e.code === 'ADAPTER_MISMATCH');
});
