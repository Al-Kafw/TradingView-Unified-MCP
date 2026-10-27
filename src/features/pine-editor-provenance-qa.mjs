import { pineRead } from './pine.mjs';

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

  const saved = await ctx.callTool('pine_get_saved_source',
    {...target,script_id:native.script_id,version:native.version});
  if (saved?.script_id !== native.script_id || String(saved.version) !== native.version ||
      typeof saved.source !== 'string' ||
      typeof saved.source_sha256_lf_normalized !== 'string')
    return refusal('SAVED_SCRIPT_ID_VERSION_UNVERIFIED');

  const second = await pineRead('native_binding', {}, ctx);
  const after = await ctx.callTool('layout_get',target);
  if (after?.layout_id !== layout.layout_id || after.unsaved_changes !== false ||
      second.binding_sha256 !== editor.binding_sha256 ||
      second.source_sha256 !== editor.source_sha256 ||
      second.source_sha256_lf_normalized !== editor.source_sha256_lf_normalized ||
      JSON.stringify(second.native_binding) !== JSON.stringify(native))
    return refusal('LAYOUT_OR_NATIVE_BINDING_CHANGED_DURING_READ');

  const equal = editor.source_sha256_lf_normalized === saved.source_sha256_lf_normalized;
  return {
    ok:true, status:equal?'matched':'source_mismatch', comparison_allowed:equal,
    read_only:true, no_chart_mutations:true,
    authorizes_pine_mutation:false, authorizes_pine_compile:false,
    compiled_runtime_verified:false, capture_atomic:false,
    layout_id:layout.layout_id, script_id:native.script_id,
    script_version:native.version, library_name:saved.name??null,
    visual_editor_title:editor.title??null,
    visual_editor_title_verified:typeof editor.title==='string'&&editor.title.trim().length>0,
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
  description:'Read-only verified Pine native editor ID/version and cloud-saved source parity; reports LF/CRLF differences, missing visual title and no mutation authorization. Does not return source or compile.',
  inputSchema:{type:'object',properties:{
    target_id:{type:'string',minLength:6,maxLength:128},
    expected_layout_id:{type:'string',minLength:6,maxLength:128}
  },required:['target_id','expected_layout_id'],additionalProperties:false},
  scope:'browser',needsTarget:true,requiresLayout:false,handler:inspectPineEditorProvenance
}];
