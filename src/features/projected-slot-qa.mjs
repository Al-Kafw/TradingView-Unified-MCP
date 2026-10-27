import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

const MAX_ITEMS = 200;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validClock = text => {
  if (typeof text !== 'string' || !/^\d{2}:\d{2}$/.test(text)) return false;
  const hh = Number(text.slice(0,2)), mm = Number(text.slice(3));
  return hh <= 23 && mm <= 59;
};
const roleOf = text => typeof text === 'string' && /^(C1|C2|C2↑|C2↓|C3)$/.test(text) ? text : null;

/**
 * Same-study native-X co-location only: never infer chart timestamps, pixels,
 * event-group identity, missing signal absence, or source-to-study binding.
 */
export function correlateProjectedSlots(labels) {
  const clocks = new Map();
  const roles = [];
  for (const label of labels) {
    if (!label || !Number.isFinite(label.x)) continue;
    if (validClock(label.text)) {
      const list = clocks.get(label.x) ?? [];
      list.push({ id: label.id, text: label.text });
      clocks.set(label.x, list);
    }
    const role = roleOf(label.text);
    if (role) roles.push({ id: label.id, role, x: label.x });
  }
  const matches = roles.map(role => {
    const matchesAtX = clocks.get(role.x) ?? [];
    const status = matchesAtX.length === 1 ? 'unique_clock' :
      matchesAtX.length === 0 ? 'clock_missing' : 'ambiguous_clock';
    return {
      role_label_id: role.id,
      role: role.role,
      native_x: role.x,
      status,
      clock_text: status === 'unique_clock' ? matchesAtX[0].text : null,
      clock_label_id: status === 'unique_clock' ? matchesAtX[0].id : null,
      matching_clock_count: matchesAtX.length,
      native_x_to_unix_time: null,
      screenshot_pixel_x: null
    };
  });
  const unique = matches.filter(m => m.status === 'unique_clock').length;
  const missing = matches.filter(m => m.status === 'clock_missing').length;
  const ambiguous = matches.filter(m => m.status === 'ambiguous_clock').length;
  const status = roles.length === 0 ? 'no_role_labels_observed' :
    missing || ambiguous ? 'alignment_incomplete_or_ambiguous' :
    'all_observed_roles_uniquely_aligned';
  return {
    status,
    role_label_count: roles.length,
    projected_clock_label_count: [...clocks.values()].reduce((sum, a) => sum + a.length, 0),
    unique_clock_alignments: unique,
    missing_clock_alignments: missing,
    ambiguous_clock_alignments: ambiguous,
    alignments: matches,
    interpretation: 'Exact same-study native-X slot co-location only. Clock text is a rendered caption, not an independently certified timestamp. Role labels are not grouped into unique C123 events.'
  };
}

export async function captureProjectedSlotQa(a, ctx) {
  if (!a.target_id || !a.expected_layout_id || !a.entity_id || !a.expected_study_name)
    throw new ToolError('EXACT_IDENTITY_REQUIRED', 'Exact target, layout, study ID and expected study name are required.');
  if (ctx.targetId !== a.target_id)
    throw new ToolError('TARGET_MISMATCH', 'Resolved target differs from requested target.');
  const limit = a.max_items_per_kind ?? MAX_ITEMS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ITEMS)
    throw new ToolError('INVALID_ARGUMENT', `max_items_per_kind must be an integer 1-${MAX_ITEMS}.`);
  const provenanceKeys = ['saved_script_id','saved_version','expected_saved_source_sha256'];
  const provided = provenanceKeys.filter(k => a[k] !== undefined);
  if (provided.length > 0 && provided.length !== provenanceKeys.length)
    throw new ToolError('SOURCE_PROVENANCE_INCOMPLETE', 'Provide all three saved-source fields together or omit all.');
  if (provided.length && !/^[a-f0-9]{64}$/i.test(a.expected_saved_source_sha256))
    throw new ToolError('SOURCE_SHA_INVALID', 'Expected saved source SHA-256 must be 64 hex characters.');

  const args = {target_id:a.target_id, expected_layout_id:a.expected_layout_id,
    entity_id:a.entity_id, max_items_per_kind:limit};
  let sourceEvidence = {
    status:'not_checked',
    saved_source_to_loaded_study_binding_verified:false
  };
  if (provided.length) {
    const result = await ctx.callTool('pine_get_saved_source', {
      target_id:a.target_id, expected_layout_id:a.expected_layout_id,
      script_id:a.saved_script_id, version:a.saved_version
    });
    if (result?.ok !== true || result.script_id !== a.saved_script_id ||
        String(result.version) !== String(a.saved_version) ||
        result.source_sha256?.toLowerCase() !== a.expected_saved_source_sha256.toLowerCase() ||
        result.title !== a.expected_study_name) {
      throw new ToolError('SAVED_SOURCE_MISMATCH', 'Saved Pine source/version/title cannot be independently matched; no slot QA asserted.');
    }
    sourceEvidence = {
      status:'saved_source_version_sha_and_title_verified',
      script_id:a.saved_script_id,
      version:String(a.saved_version),
      source_sha256:result.source_sha256,
      saved_source_to_loaded_study_binding_verified:false,
      limitation:'Saved-source identity is verified independently; the active chart study-to-saved-version binding is not proven.'
    };
  }

  const before = await ctx.callTool('data_get_qa_snapshot',args);
  if (before?.ok !== true || before.layout_id !== a.expected_layout_id ||
      before.study?.entity_id !== a.entity_id || before.study.name !== a.expected_study_name)
    throw new ToolError('STUDY_IDENTITY_MISMATCH', 'Native study does not match the exact requested chart ID and name.');
  const after = await ctx.callTool('data_get_qa_snapshot',args);
  if (after?.ok !== true)
    throw new ToolError('SNAPSHOT_UNAVAILABLE', 'Second graphics read unavailable; no evidence asserted.');
  const identity = s => ({layout_id:s.layout_id,symbol:s.symbol,resolved_symbol:s.resolved_symbol,
    timeframe:s.timeframe,session:s.session,study:s.study});
  const identityConsistent = digest(identity(before)) === digest(identity(after));
  const graphicsConsistent = digest(before.graphics) === digest(after.graphics) &&
    before.coverage === after.coverage &&
    before.all_graphics_returned_in_this_call === after.all_graphics_returned_in_this_call;
  const consistent = identityConsistent && graphicsConsistent &&
    after.layout_id === a.expected_layout_id && after.study?.entity_id === a.entity_id &&
    after.study.name === a.expected_study_name;
  const summary = {
    ok:true, target_id:a.target_id, layout_id:a.expected_layout_id, entity_id:a.entity_id,
    expected_study_name:a.expected_study_name,
    identity_consistent_at_both_reads:identityConsistent,
    graphics_consistent_at_both_reads:graphicsConsistent,
    capture_consistency:consistent ? 'matching_bracket_reads' : 'mismatch_no_correlated_evidence',
    graphics_coverage:consistent ? before.coverage : 'not_claimed',
    all_native_graphics_returned:consistent && before.all_graphics_returned_in_this_call === true,
    label_collection_status:consistent ? before.graphics?.labels?.status ?? 'unavailable' : 'not_checked',
    source_evidence:sourceEvidence,
    slot_alignment_verified:false,
    projected_slot_correspondence:null,
    native_drawing_to_absolute_time:'unverified',
    native_drawing_to_screenshot_pixels:'unverified',
    screenshot_captured:false,
    note:'Same-study drawing/clock native X matching only. Not atomic, not proof of absolute candle times, source-to-study binding, visual completeness, or signal correctness.'
  };
  if (!consistent) return summary;
  const labelData = before.graphics?.labels;
  if (labelData?.status !== 'complete' || labelData?.all_items_returned_in_this_call !== true ||
      !Array.isArray(labelData.items) || labelData.items.length !== labelData.total) {
    return {...summary, slot_check_status:'labels_not_complete'};
  }
  const correspondence = correlateProjectedSlots(labelData.items);
  return { ...summary,
    slot_check_status:correspondence.status,
    slot_alignment_verified:correspondence.status === 'all_observed_roles_uniquely_aligned',
    projected_slot_correspondence:correspondence
  };
}

export default [{
  name:'data_get_projected_slot_qa',
  description:'Read-only same-study C1/C2/C3-to-projected-clock native-X correspondence. Detect missing/ambiguous clocks without guessing timestamps or screen pixels.',
  inputSchema:{type:'object',properties:{
    entity_id:{type:'string',minLength:1,maxLength:300},
    expected_study_name:{type:'string',minLength:1,maxLength:300},
    max_items_per_kind:{type:'integer',minimum:1,maximum:MAX_ITEMS},
    saved_script_id:{type:'string',minLength:1,maxLength:300},
    saved_version:{anyOf:[{type:'string',minLength:1,maxLength:40},{type:'integer',minimum:0}]},
    expected_saved_source_sha256:{type:'string',minLength:64,maxLength:64}
  },required:['target_id','expected_layout_id','entity_id','expected_study_name'],additionalProperties:false},
  mutates:false,handler:captureProjectedSlotQa
}];
