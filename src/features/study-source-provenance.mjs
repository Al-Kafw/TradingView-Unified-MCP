import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

const sha256 = source => createHash('sha256').update(source, 'utf8').digest('hex');
const scriptIdPattern = /^[A-Za-z0-9_.$:;-]+$/;
const versionPattern = /^\d+(?:\.\d+)*$/;
const hexPattern = /^[a-f0-9]{64}$/i;

/**
 * The native study's getInputValues() contains pineId and pineVersion alongside
 * other inputs, including a potentially huge opaque compiled `text` field.
 * Extract ONLY the two identity fields. Never return the raw inputs or text.
 */
export function studyPineIdentity(result, entityId) {
  if (result?.ok !== true || result.entity_id !== entityId || !Array.isArray(result.inputs)) {
    return { status: 'inputs_unavailable', pine_id: null, pine_version: null };
  }
  const values = {};
  for (const id of ['pineId', 'pineVersion']) {
    const matches = result.inputs.filter(item => item?.id === id);
    if (matches.length !== 1 || typeof matches[0].value !== 'string') {
      return { status: 'native_fields_missing_or_ambiguous', pine_id: null, pine_version: null };
    }
    values[id] = matches[0].value;
  }
  if (values.pineId.length > 300 || values.pineVersion.length > 50 ||
      !scriptIdPattern.test(values.pineId) || !versionPattern.test(values.pineVersion)) {
    return { status: 'native_fields_malformed', pine_id: null, pine_version: null };
  }
  return { status: 'native_fields_observed', pine_id: values.pineId, pine_version: values.pineVersion };
}

/** Strict, exact study identity. Do not accept an approximate title or stale ID. */
export function checkedStudyIdentity(result, expectedLayout, expectedEntity, expectedName) {
  if (result?.ok !== true || result.layout_id !== expectedLayout ||
      typeof result.symbol !== 'string' || typeof result.timeframe !== 'string' ||
      !Array.isArray(result.studies)) {
    throw new ToolError('CHART_IDENTITY_UNAVAILABLE', 'Exact chart identity unavailable; no study/source provenance asserted.');
  }
  const exact = result.studies.filter(s => s?.entity_id === expectedEntity);
  if (exact.length !== 1 || exact[0].name !== expectedName || exact[0].addressable !== true) {
    throw new ToolError('STUDY_IDENTITY_MISMATCH', 'Exact study ID/name not uniquely present and addressable.');
  }
  return {
    layout_id: result.layout_id, symbol: result.symbol,
    resolved_symbol: result.resolved_symbol ?? null,
    timeframe: result.timeframe, session: result.session ?? null,
    entity_id: exact[0].entity_id, study_name: exact[0].name
  };
}

function checkRequest(a, ctx) {
  if (typeof a.target_id !== 'string' || !a.target_id ||
      typeof a.expected_layout_id !== 'string' || !a.expected_layout_id ||
      typeof a.entity_id !== 'string' || !a.entity_id ||
      typeof a.expected_study_name !== 'string' || !a.expected_study_name ||
      typeof a.saved_script_id !== 'string' || !scriptIdPattern.test(a.saved_script_id) ||
      !versionPattern.test(String(a.saved_version ?? '')) ||
      typeof a.expected_saved_source_sha256 !== 'string' ||
      !hexPattern.test(a.expected_saved_source_sha256)) {
    throw new ToolError('INVALID_PROVENANCE_REQUEST', 'Require exact chart/study/script/version and pinned 64-hex source SHA-256.');
  }
  if (ctx.targetId !== a.target_id) {
    throw new ToolError('TARGET_MISMATCH', 'Resolved browser target differs from exact requested target.');
  }
}

/**
 * Source-level provenance, not binary/compiler attestation.
 * Reads chart, native study inputs, saved source, native inputs, chart in order.
 * Deny any study-source binding claim if state/metadata changes mid-read.
 */
export async function captureStudySourceProvenance(a, ctx) {
  checkRequest(a, ctx);
  const chartArgs = { target_id: a.target_id, expected_layout_id: a.expected_layout_id };
  const studyArgs = { ...chartArgs, entity_id: a.entity_id };
  const beforeChart = checkedStudyIdentity(await ctx.callTool('chart_get_state', chartArgs),
    a.expected_layout_id, a.entity_id, a.expected_study_name);
  const beforeNative = studyPineIdentity(await ctx.callTool('indicator_get_inputs', studyArgs), a.entity_id);

  const saved = await ctx.callTool('pine_get_saved_source', {
    ...chartArgs, script_id: a.saved_script_id, version: a.saved_version
  });
  const expectedHash = a.expected_saved_source_sha256.toLowerCase();
  if (saved?.ok !== true || saved.script_id !== a.saved_script_id ||
      String(saved.version) !== String(a.saved_version) ||
      saved.title !== a.expected_study_name ||
      typeof saved.source !== 'string' ||
      saved.source_sha256?.toLowerCase() !== expectedHash ||
      sha256(saved.source) !== expectedHash) {
    throw new ToolError('SAVED_SOURCE_MISMATCH', 'Pinned saved script/version/title/source SHA-256 did not match; no provenance claim.');
  }

  const afterNative = studyPineIdentity(await ctx.callTool('indicator_get_inputs', studyArgs), a.entity_id);
  const afterChart = checkedStudyIdentity(await ctx.callTool('chart_get_state', chartArgs),
    a.expected_layout_id, a.entity_id, a.expected_study_name);

  const chartStable = JSON.stringify(beforeChart) === JSON.stringify(afterChart);
  const fieldsObserved = beforeNative.status === 'native_fields_observed' &&
    afterNative.status === 'native_fields_observed';
  const fieldsStable = fieldsObserved &&
    beforeNative.pine_id === afterNative.pine_id &&
    beforeNative.pine_version === afterNative.pine_version;
  const nativeMatchesSaved = fieldsStable &&
    beforeNative.pine_id === a.saved_script_id &&
    beforeNative.pine_version === String(a.saved_version);
  const verified = chartStable && nativeMatchesSaved;
  const status = !chartStable ? 'chart_identity_changed_no_claim' :
    !fieldsObserved ? 'native_metadata_missing_or_invalid_no_claim' :
    !fieldsStable ? 'native_metadata_changed_no_claim' :
    !nativeMatchesSaved ? 'native_metadata_mismatch_no_claim' :
    'native_study_id_version_matches_verified_saved_source';
  return {
    ok: true, read_only: true, target_id: a.target_id,
    layout_id: a.expected_layout_id, entity_id: a.entity_id,
    expected_study_name: a.expected_study_name,
    observed_chart_identity: chartStable ? beforeChart : null,
    chart_identity_stable: chartStable,
    native_pine_metadata_observed: fieldsObserved,
    native_pine_metadata_stable: fieldsStable,
    native_pine_metadata_matches_saved: nativeMatchesSaved,
    source_provenance_status: status,
    native_study_to_saved_script_version_verified: verified,
    saved_source: {
      script_id: a.saved_script_id,
      version: String(a.saved_version),
      title: a.expected_study_name,
      source_sha256: expectedHash,
      content_hash_independently_recomputed: true
    },
    compiled_runtime_byte_equivalence_verified: false,
    compiled_runtime_source_sha256: null,
    native_drawing_to_absolute_time: 'unverified',
    native_drawing_to_screenshot_pixels: 'unverified',
    capture_atomic: false,
    note: 'The loaded study native input metadata names the independently verified saved script ID/version. This is observational source provenance, NOT an attestation that compiled chart runtime bytes equal saved Pine text. The multi-call capture is not atomic. No raw compiled text, raw study inputs or Pine source is returned.'
  };
}

export default [{
  name: 'data_get_study_source_provenance',
  description: 'Read-only guarded chart-study pineId/pineVersion readback with independently hashed saved Pine source; no compiled-runtime byte-equivalence claim.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_id: { type: 'string', minLength: 1, maxLength: 300 },
      expected_study_name: { type: 'string', minLength: 1, maxLength: 300 },
      saved_script_id: { type: 'string', minLength: 1, maxLength: 300, pattern: '^[A-Za-z0-9_.$:;-]+$' },
      saved_version: { anyOf: [
        { type: 'string', minLength: 1, maxLength: 50, pattern: '^\\d+(?:\\.\\d+)*$' },
        { type: 'integer', minimum: 0 }
      ] },
      expected_saved_source_sha256: { type: 'string', minLength: 64, maxLength: 64, pattern: '^[a-fA-F0-9]{64}$' }
    },
    required: ['target_id','expected_layout_id','entity_id','expected_study_name','saved_script_id','saved_version','expected_saved_source_sha256'],
    additionalProperties: false
  },
  mutates: false,
  handler: captureStudySourceProvenance
}];
