import { verifyQaSavedBaseline } from './qa-recovery-verifier.mjs';

const refusal = (code, more = {}) => ({
  ok: false,
  status: 'unverified',
  code,
  browser_baseline_verified: false,
  persisted_cloud_state_verified: false,
  permission_to_reload: false,
  permission_to_compile: false,
  tradingview_writes: 0,
  ...more
});

/**
 * Read-only reconciliation after the separately gated QA study removal.
 * It never considers an in-memory rollback receipt proof of saved-chart state.
 * Three independent clean browser snapshots are required for a bounded pass.
 * This is *not* independent evidence of remote TradingView cloud persistence.
 */
export async function reconcilePineQaRollback({
  rollbackReceipt,
  browserFactory,
  qaTargetId,
  protectedTargetId,
  protectedLayoutId,
  expected,
  maxAttempts = 9,
  intervalMs = 0,
  sleep = async () => {}
} = {}) {
  if (
    rollbackReceipt?.ok !== true ||
    rollbackReceipt.verified !== true ||
    rollbackReceipt.mutation_attempted !== true ||
    rollbackReceipt.live_study_baseline_restored !== true ||
    rollbackReceipt.persisted_layout_restoration_verified !== false ||
    typeof rollbackReceipt.removed_entity_id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(rollbackReceipt.removed_entity_id) ||
    rollbackReceipt.rollback_layout_id !== expected?.layout_id ||
    rollbackReceipt.baseline_entity_id !== expected?.studies?.[0]?.id ||
    rollbackReceipt.removed_entity_id === rollbackReceipt.baseline_entity_id
  ) return refusal('ROLLBACK_RECEIPT_UNVERIFIED');

  if (
    !/^MCP QA Recovery RestoreLab [A-Za-z0-9]{8}$/.test(expected?.layout_name ?? '') ||
    !/^[A-Za-z0-9_-]{6,64}$/.test(expected?.layout_id ?? '') ||
    expected?.chart_type !== 1 ||
    !Array.isArray(expected?.drawings) || expected.drawings.length !== 0 ||
    !Array.isArray(expected?.studies) || expected.studies.length !== 1 ||
    expected.studies[0]?.name !== 'Volume' ||
    typeof expected.studies[0]?.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(expected.studies[0].id) ||
    // Missing inputs are not evidence of intact baseline settings.
    !Array.isArray(expected.studies[0].inputs) ||
    expected.studies[0].inputs.length === 0 ||
    expected.studies[0].inputs.length > 100 ||
    expected.studies[0].inputs.some(input =>
      !input || typeof input.id !== 'string' ||
      !/^[A-Za-z0-9_.-]{1,128}$/.test(input.id) ||
      !(typeof input.value === 'boolean' ||
        typeof input.value === 'number' && Number.isFinite(input.value) ||
        typeof input.value === 'string' && input.value.length <= 2048)
    ) ||
    new Set(expected.studies[0].inputs.map(input => input.id)).size !==
      expected.studies[0].inputs.length
  ) return refusal('RESTORELAB_BASELINE_UNVERIFIED');

  let observed;
  try {
    observed = await verifyQaSavedBaseline({
      browserFactory,
      qaTargetId,
      protectedTargetId,
      protectedLayoutId,
      expected,
      maxAttempts,
      intervalMs,
      sleep
    });
  } catch (error) {
    return refusal('BASELINE_RECONCILIATION_UNAVAILABLE', {
      diagnostic: String(error?.message ?? error).slice(0,150)
    });
  }

  if (observed?.ok !== true ||
      observed.code !== 'QA_SAVED_BASELINE_VERIFIED' ||
      observed.stable_reads < 3 || observed.tradingview_writes !== 0) {
    return refusal('CLEAN_BROWSER_BASELINE_NOT_VERIFIED', {
      verifier_code: observed?.code ?? 'UNAVAILABLE',
      stable_reads: observed?.stable_reads ?? 0
    });
  }

  return {
    ok: true,
    status: 'clean_browser_baseline_observed',
    browser_baseline_verified: true,
    stable_reads: observed.stable_reads,
    persisted_cloud_state_verified: false,
    permission_to_reload: false,
    permission_to_compile: false,
    tradingview_writes: 0,
    note: 'Three clean independent browser snapshots match the QA baseline; this does not verify remote cloud persistence or authorize mutation.'
  };
}
