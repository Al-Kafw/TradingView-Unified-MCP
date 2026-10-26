import {
  qaBaselineSnapshotPage,
  matchesQaBaseline,
  verifyQaSavedBaseline
} from './qa-recovery-verifier.mjs';

import {
  consumeQaReplayRecoveryPermit
} from './qa-recovery-permit.mjs';

const pathname = tab => {
  try { return new URL(tab.url).pathname; }
  catch { return null; }
};

const errorText = error =>
  String(error?.code ?? error?.message ?? error).slice(0,200);

/*
 * QA-only recovery.
 *
 * No writes except an explicitly authorized reload of the exact QA tab.
 * Never saves, edits studies, operates Replay, or navigates protected tabs.
 * A navigation is attempted at most once.
 */
export async function recoverQaSavedLayout({
  browserFactory,
  qaTargetId,
  protectedTargetId,
  protectedLayoutId,
  authorizedQaLayoutId,
  expected,
  recoveryPermit = null,
  maxAttempts = 40,
  intervalMs = 500,
  sleep
}) {
  const valid =
    typeof browserFactory === 'function' &&
    typeof qaTargetId === 'string' &&
    typeof protectedTargetId === 'string' &&
    qaTargetId.length > 0 &&
    protectedTargetId.length > 0 &&
    qaTargetId !== protectedTargetId &&
    expected?.layout_id === authorizedQaLayoutId &&
    expected.layout_id !== protectedLayoutId &&
    /^[A-Za-z0-9_-]{6,64}$/.test(expected.layout_id) &&
    /^MCP QA Recovery RestoreLab [A-Za-z0-9]{8}$/.test(
      expected.layout_name ?? ''
    ) &&
    typeof expected.symbol === 'string' &&
    expected.symbol.length > 0 &&
    typeof expected.resolved_symbol === 'string' &&
    expected.resolved_symbol.length > 0 &&
    typeof expected.timeframe === 'string' &&
    expected.timeframe.length > 0 &&
    Array.isArray(expected.studies) &&
    expected.studies.length >= 1 &&
    expected.studies.length <= 30 &&
    expected.studies.every(s =>
      /^[A-Za-z0-9_-]{1,128}$/.test(s.id ?? '') &&
      typeof s.name === 'string' &&
      s.name.length > 0
    ) &&
    new Set(expected.studies.map(s => s.id)).size ===
      expected.studies.length;

  if (!valid) throw Error('INVALID_QA_RECOVERY_CONFIGURATION');

  const fail = (code, extra = {}) => ({
    ok: false,
    code,
    navigation_attempted: false,
    ...extra
  });

  const targetsValid = tabs => {
    const qa = tabs.filter(
      t => pathname(t) === `/chart/${expected.layout_id}/`
    );
    const protectedTabs = tabs.filter(
      t => pathname(t) === `/chart/${protectedLayoutId}/`
    );

    return (
      qa.length === 1 &&
      qa[0].id === qaTargetId &&
      protectedTabs.length === 1 &&
      protectedTabs[0].id === protectedTargetId
    );
  };

  const stateAllowed = snapshot =>
    snapshot &&
    typeof snapshot.unsaved_changes === 'boolean' &&
    matchesQaBaseline({
      ...snapshot,
      unsaved_changes: false
    }, expected);

  const browser = browserFactory();
  let navigationAttempted = false;
  let navigationError = null;

  try {
    if (!targetsValid(await browser.listTargets()))
      return fail('TARGET_IDENTITY_MISMATCH');

    const before = await browser.evaluate(
      qaTargetId, qaBaselineSnapshotPage, {}
    );

    if (!stateAllowed(before))
      return fail('QA_PREFLIGHT_UNSAFE');

    if (before.unsaved_changes === true) {
      if (!recoveryPermit)
        return fail('QA_REPLAY_PERMIT_REQUIRED');

      // Re-check the native state immediately before navigation.
      const second = await browser.evaluate(
        qaTargetId, qaBaselineSnapshotPage, {}
      );

      if (
        !stateAllowed(second) ||
        second.unsaved_changes !== true ||
        !targetsValid(await browser.listTargets())
      ) return fail('QA_PRENAVIGATION_STATE_CHANGED');

      if (!consumeQaReplayRecoveryPermit(recoveryPermit, {
        qaTargetId,
        protectedTargetId,
        protectedLayoutId,
        expected
      })) return fail('QA_REPLAY_PERMIT_INVALID');

      navigationAttempted = true;

      try {
        await browser.navigate(
          qaTargetId,
          `https://www.tradingview.com/chart/${expected.layout_id}/`
        );
      } catch (error) {
        // Navigation may have succeeded before CDP disconnected.
        // Reconcile using fresh connections; never navigate twice.
        navigationError = errorText(error);
      }
    }

  } catch (error) {
    if (!navigationAttempted)
      return fail('QA_PREFLIGHT_READ_FAILED', {
        error: errorText(error)
      });

    navigationError ??= errorText(error);

  } finally {
    await browser.close();
  }

  const verification = await verifyQaSavedBaseline({
    browserFactory,
    qaTargetId,
    protectedTargetId,
    protectedLayoutId,
    expected,
    maxAttempts,
    intervalMs,
    ...(sleep ? { sleep } : {})
  });

  return {
    ...verification,
    code: verification.ok
      ? navigationAttempted
        ? 'QA_SAVED_BASELINE_RESTORED'
        : 'QA_ALREADY_CLEAN_VERIFIED'
      : 'QA_RECOVERY_UNVERIFIED',
    navigation_attempted: navigationAttempted,
    navigation_acknowledged:
      navigationAttempted ? navigationError === null : null,
    navigation_error: navigationError,
    layout_saves: 0,
    protected_layout_operations: 0
  };
}
