import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_ITEMS_PER_KIND = 200;
const pngHeader = '89504e470d0a1a0a';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Guarded read-only evidence pack. Bracketing the screenshot with two native
 * reads is not atomic: a transient change between reads may go undetected.
 * Never infer a native X -> time/pixel transformation from numerical equality.
 */
export async function captureVisualQaEvidence(a, ctx) {
  if (!a.target_id || !a.expected_layout_id || !a.entity_id)
    throw new ToolError('EXACT_TARGET_REQUIRED', 'Specify exact target, layout and study IDs.');
  if (!Number.isInteger(a.max_items_per_kind ?? 100) ||
      (a.max_items_per_kind ?? 100) < 1 || (a.max_items_per_kind ?? 100) > MAX_ITEMS_PER_KIND)
    throw new ToolError('INVALID_ARGUMENT', `Limit must be 1-${MAX_ITEMS_PER_KIND} per graphics kind.`);
  if (ctx.targetId !== a.target_id)
    throw new ToolError('TARGET_MISMATCH', 'The resolved browser target differs from the requested target.');

  const params = {
    target_id: a.target_id,
    expected_layout_id: a.expected_layout_id,
    entity_id: a.entity_id,
    max_items_per_kind: a.max_items_per_kind ?? 100
  };
  const before = await ctx.callTool('data_get_qa_snapshot', params);
  if (!before?.ok) throw new ToolError('SNAPSHOT_UNAVAILABLE', 'The before-capture snapshot was not confirmed.');
  if (before.layout_id !== a.expected_layout_id || before.study?.entity_id !== a.entity_id)
    throw new ToolError('LAYOUT_OR_STUDY_MISMATCH', 'The native snapshot does not match the requested chart and study. No screenshot was taken.');

  // Existing capture intentionally foregrounds the requested browser tab. It
  // does not change the saved layout, indicator settings, chart or Replay.
  const captureStartedAt = new Date().toISOString();
  const picture = await ctx.browser.capture(ctx.targetId);
  const captureCompletedAt = new Date().toISOString();
  if (picture?.mimeType !== 'image/png' || typeof picture.data !== 'string')
    throw new ToolError('SCREENSHOT_UNAVAILABLE', 'Browser capture did not return a PNG.');
  const raw = Buffer.from(picture.data, 'base64');
  if (raw.length < 8 || raw.length > MAX_IMAGE_BYTES || raw.subarray(0, 8).toString('hex') !== pngHeader)
    throw new ToolError('SCREENSHOT_UNUSABLE', 'PNG is missing, malformed or exceeds the image size limit.');

  const after = await ctx.callTool('data_get_qa_snapshot', params);
  if (!after?.ok) throw new ToolError('SNAPSHOT_UNAVAILABLE', 'The after-capture snapshot was not confirmed.');

  const identityOf = s => ({layout_id:s.layout_id, symbol:s.symbol,
    resolved_symbol:s.resolved_symbol, timeframe:s.timeframe,
    session:s.session, study:s.study});
  const beforeIdentity = identityOf(before), afterIdentity = identityOf(after);
  const identityConsistent = hash(beforeIdentity) === hash(afterIdentity) &&
    beforeIdentity.layout_id === a.expected_layout_id &&
    beforeIdentity.study?.entity_id === a.entity_id;
  const nativeConsistent = hash(before.graphics) === hash(after.graphics) &&
    before.coverage === after.coverage &&
    before.all_graphics_returned_in_this_call === after.all_graphics_returned_in_this_call;
  const consistent = identityConsistent && nativeConsistent;
  const summary = {
    ok: true,
    target_id: a.target_id,
    expected_layout_id: a.expected_layout_id,
    requested_entity_id: a.entity_id,
    capture_started_at: captureStartedAt,
    capture_completed_at: captureCompletedAt,
    screenshot_format: 'image/png',
    screenshot_byte_count: raw.length,
    screenshot_sha256: createHash('sha256').update(raw).digest('hex'),
    screenshot_scope: 'current_browser_viewport_only',
    screenshot_foregrounds_tab: true,
    chart_identity_consistent_at_both_reads: identityConsistent,
    native_graphics_consistent_at_both_reads: nativeConsistent,
    capture_consistency: consistent ? 'matching_bracket_reads' : 'mismatch_do_not_correlate',
    screenshot_and_graphics_atomic: false,
    native_coordinate_mapping: 'unverified_no_pixel_or_time_inference',
    chart_identity: consistent ? beforeIdentity : null,
    graphics_coverage: consistent ? before.coverage : 'not_claimed',
    all_native_graphics_returned: consistent && before.all_graphics_returned_in_this_call === true,
    graphics: consistent ? before.graphics : null,
    limitations: 'Screenshot is viewport-only. Matching native reads bracket the PNG, but cannot exclude a transient change between reads. Screen pixels have not been mapped to native X/Y. Invisible/offscreen drawings, hover-only content and trading-signal accuracy are not certified.'
  };
  if (!consistent) return summary;
  return { ...summary, image: picture };
}

export default [{
  name: 'data_get_visual_qa_evidence',
  description: 'Read-only viewport PNG plus native line/label evidence bracketed by chart identity and graphics checks. No inferred pixel/time mapping.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_id: { type: 'string', minLength: 1, maxLength: 300 },
      max_items_per_kind: { type: 'integer', minimum: 1, maximum: MAX_ITEMS_PER_KIND }
    },
    required: ['target_id','expected_layout_id','entity_id'],
    additionalProperties: false
  },
  mutates: false,
  handler: captureVisualQaEvidence
}];

