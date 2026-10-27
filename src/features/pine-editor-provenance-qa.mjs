import { pineRead } from './pine.mjs';

/** Observation only: never click or alter Pine. A unique active editor and
 * uniquely visible split-pane role button are necessary, not sufficient, to
 * identify a title. Saved-library name and native binding are checked later. */
export function pineVisualTitlePage() {
  const visible = element => {
    const rect = element?.getBoundingClientRect?.();
    return Boolean(element?.isConnected && rect?.width > 0 && rect?.height > 0);
  };
  const editors = [...document.querySelectorAll('.monaco-editor.pine-editor-monaco')].filter(visible);
  if (editors.length !== 1)
    return {ok:false,status:'blocked',reason_code:'VISIBLE_PINE_EDITOR_NOT_UNIQUE'};
  // The observed label and Monaco editor must belong to the same Pine widget.
  const pane = editors[0].closest?.('.tv-script-widget');
  if (!pane || !visible(pane))
    return {ok:true,status:'unavailable',title:null};
  const paneEditors = [...pane.querySelectorAll('.monaco-editor.pine-editor-monaco')].filter(visible);
  if (paneEditors.length !== 1 || paneEditors[0] !== editors[0])
    return {ok:false,status:'blocked',reason_code:'PINE_TITLE_PANEL_EDITOR_MISMATCH'};
  const editorTop = editors[0].getBoundingClientRect().top;
  const controls = [...pane.querySelectorAll('div[role="button"]')].filter(visible)
    .filter(element => element.getBoundingClientRect().bottom <= editorTop);
  if (controls.length === 0) return {ok:true,status:'unavailable',title:null};
  if (controls.length !== 1)
    return {ok:false,status:'blocked',reason_code:'VISUAL_PINE_TITLE_AMBIGUOUS'};
  const title = controls[0].textContent?.trim() ?? '';
  if (!title || title.length > 300 || /[\r\n]/.test(title))
    return {ok:false,status:'blocked',reason_code:'VISUAL_PINE_TITLE_INVALID'};
  return {ok:true,status:'candidate',title,source:'unique_visible_split_editor_role_button'};
}

const refusal = (reason_code, detail = {}) => ({
  ok: true,
  status: 'blocked',
  comparison_allowed: false,
  reason_code,
  read_only: true,
  no_chart_mutations: true,
  authorizes_pine_mutation: false,
  ...detail
});

/** Only source identity evidence. Never substitutes cloud name for an editor DOM title. */
export async function inspectPineEditorProvenance(a, ctx) {
  const target = {target_id: a.target_id, expected_layout_id: a.expected_layout_id};
  const layout = await ctx.callTool('layout_get', target);
  if (layout?.layout_id !== a.expected_layout_id || layout.unsaved_changes !== false)
    return refusal('LAYOUT_ID_OR_SAVED_STATE_UNVERIFIED');

  const editor = await pineRead('native_binding', {}, ctx);
  const native = editor?.native_binding;
  if (!native || native.is_draft !== false || native.is_modified !== false ||
      typeof native.script_id !== 'string' || !native.script_id ||
      typeof native.version !== 'string' || !native.version ||
      typeof editor.source !== 'string' ||
      typeof editor.source_sha256_lf_normalized !== 'string' ||
      typeof editor.binding_sha256 !== 'string')
    return refusal('NATIVE_EDITOR_BINDING_UNVERIFIED');

  const firstVisual = await ctx.callPage(pineVisualTitlePage,{op:'visual_title_probe'});
  if (firstVisual?.ok !== true)
    return refusal('VISUAL_EDITOR_TITLE_AMBIGUOUS_OR_UNAVAILABLE');

  const saved = await ctx.callTool('pine_get_saved_source',
    {...target,script_id:native.script_id,version:native.version});
  if (saved?.script_id !== native.script_id || String(saved.version) !== native.version ||
      typeof saved.source !== 'string' ||
      typeof saved.source_sha256_lf_normalized !== 'string')
    return refusal('SAVED_SCRIPT_ID_VERSION_UNVERIFIED');

  const second = await pineRead('native_binding', {}, ctx);
  const secondVisual = await ctx.callPage(pineVisualTitlePage,{op:'visual_title_probe'});
  const after = await ctx.callTool('layout_get',target);
  if (secondVisual?.ok !== true || JSON.stringify(firstVisual) !== JSON.stringify(secondVisual))
    return refusal('VISUAL_EDITOR_TITLE_CHANGED_DURING_READ');
  if (typeof editor.title === 'string' && typeof second.title === 'string' &&
      editor.title !== second.title)
    return refusal('LEGACY_EDITOR_TITLE_CHANGED_DURING_READ');
  if (firstVisual.status === 'candidate' && typeof editor.title === 'string' &&
      editor.title !== firstVisual.title)
    return refusal('VISUAL_EDITOR_TITLE_SELECTOR_CONFLICT');
  if (after?.layout_id !== layout.layout_id || after.unsaved_changes !== false ||
      second.binding_sha256 !== editor.binding_sha256 ||
      second.source_sha256 !== editor.source_sha256 ||
      second.source_sha256_lf_normalized !== editor.source_sha256_lf_normalized ||
      JSON.stringify(second.native_binding) !== JSON.stringify(native))
    return refusal('LAYOUT_OR_NATIVE_BINDING_CHANGED_DURING_READ');

  const equal = editor.source_sha256_lf_normalized === saved.source_sha256_lf_normalized;
  const splitTitle = firstVisual.status === 'candidate' ? firstVisual.title : null;
  const visibleTitle = splitTitle ?? (typeof editor.title === 'string' ? editor.title : null);
  const titleVerified = visibleTitle !== null &&
    typeof saved.name === 'string' && visibleTitle === saved.name;
  return {
    ok:true, status:equal?'matched':'source_mismatch', comparison_allowed:equal,
    read_only:true, no_chart_mutations:true,
    authorizes_pine_mutation:false, authorizes_pine_compile:false,
    compiled_runtime_verified:false, capture_atomic:false,
    layout_id:layout.layout_id, script_id:native.script_id,
    script_version:native.version, library_name:saved.name??null,
    visual_editor_title:visibleTitle,
    visual_editor_title_verified:titleVerified,
    visual_editor_title_matches_library_name:titleVerified,
    visual_editor_title_source:splitTitle !== null
      ? firstVisual.source : (visibleTitle !== null ? 'legacy_visible_title_selector' : null),
    library_name_is_not_visual_title:true,
    editor_source_sha256:editor.source_sha256,
    saved_source_sha256:saved.source_sha256,
    editor_source_sha256_lf_normalized:editor.source_sha256_lf_normalized,
    saved_source_sha256_lf_normalized:saved.source_sha256_lf_normalized,
    editor_source_line_endings:editor.source_line_endings,
    saved_source_line_endings:saved.source_line_endings,
    raw_hashes_equal:editor.source_sha256===saved.source_sha256,
    normalized_hashes_equal:equal,
    note:'Read-only identity check: cloud library name cannot replace an unavailable visual editor title for write or compile guards.'
  };
}

export default [{
  name:'pine_get_editor_provenance_qa',mutates:false,
  description:'Read-only verified Pine native ID/version, cloud source parity and uniquely visible split-editor title matching the saved library name. Reports ambiguity; never returns source or authorizes compilation.',
  inputSchema:{type:'object',properties:{
    target_id:{type:'string',minLength:6,maxLength:128},
    expected_layout_id:{type:'string',minLength:6,maxLength:128}
  },required:['target_id','expected_layout_id'],additionalProperties:false},
  scope:'browser',needsTarget:true,requiresLayout:false,handler:inspectPineEditorProvenance
}];
