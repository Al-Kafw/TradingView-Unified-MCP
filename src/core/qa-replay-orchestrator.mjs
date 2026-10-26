import {
  qaBaselineSnapshotPage,
  matchesQaBaseline
} from './qa-recovery-verifier.mjs';

import {
  issueQaReplayRecoveryPermit
} from './qa-recovery-permit.mjs';

import {
  recoverQaSavedLayout
} from './qa-recovery-workflow.mjs';

import { replayPage } from '../features/replay.mjs';

export const ES_QA_BASELINE = Object.freeze({
  layout_id: 'AIibRZIx',
  layout_name: 'MCP QA Recovery RestoreLab e8150714',
  symbol: 'CME_MINI_DL:ES1!',
  resolved_symbol: 'CME_MINI:ES1!',
  timeframe: '15',
  studies: Object.freeze([
    Object.freeze({ id: 'aMROG1', name: 'Volume' })
  ])
});

const PROTECTED = 'KrnVg2oE';
const QA = ES_QA_BASELINE.layout_id;

const errorText = e =>
  String(e?.code ?? e?.message ?? e).slice(0, 250);

const path = tab => {
  try { return new URL(tab.url).pathname; }
  catch { return null; }
};

let activeRun = false;

/*
 * Internal QA orchestration core.
 * NOT registered as a caller-accessible MCP mutation tool.
 * The production entrypoint must bind a real, policy-enforced registry.
 */
export async function runQaReplayCanaryCore({
  browserFactory,
  registry,
  qaTargetId,
  protectedTargetId,
  maxAttempts = 40,
  intervalMs = 500,
  sleep
}) {
  if (
    activeRun ||
    typeof browserFactory !== 'function' ||
    typeof registry?.execute !== 'function' ||
    !qaTargetId ||
    !protectedTargetId ||
    qaTargetId === protectedTargetId
  ) throw Error('QA_CANARY_CONFIGURATION_OR_LOCK_FAILED');

  activeRun = true;

  let start = null;
  let step = null;
  let stop = null;
  let recovery = null;
  let stageError = null;
  let stopError = null;
  let recoveryError = null;
  let attempted = false;
  let before = null;
  let candleTime = null;

  const call = (name, args = {}) =>
    registry.execute(name, {
      target_id: qaTargetId,
      expected_layout_id: QA,
      ...args
    });

  const snapshot = async () => {
    const browser = browserFactory();

    try {
      return await browser.evaluate(
        qaTargetId, qaBaselineSnapshotPage, {}
      );
    } finally {
      await browser.close();
    }
  };

  try {
    // No Replay operation is allowed before these checks.
    try {
      const browser = browserFactory();

      try {
        const tabs = await browser.listTargets();

        if (
          tabs.length !== 2 ||
          tabs.filter(t =>
            t.id === qaTargetId &&
            path(t) === `/chart/${QA}/`
          ).length !== 1 ||
          tabs.filter(t =>
            t.id === protectedTargetId &&
            path(t) === `/chart/${PROTECTED}/`
          ).length !== 1
        ) throw Error('QA_TARGET_IDENTITY_FAILED');

        before = await browser.evaluate(
          qaTargetId, qaBaselineSnapshotPage, {}
        );

        if (!matchesQaBaseline(before, ES_QA_BASELINE))
          throw Error('QA_SAVED_BASELINE_FAILED');

        const native = await browser.evaluate(
          qaTargetId, replayPage, {
            op: 'qa_preflight',
            qa_replay_guard: true,
            expected_layout_id: QA
          }
        );

        if (
          native?.ok !== true ||
          native?.qa_guard_verified !== true ||
          native?.read_only !== true
        ) throw Error('QA_NATIVE_PREFLIGHT_FAILED');
      } finally {
        await browser.close();
      }

      const status = await call('replay_status');

      if (
        status?.available !== true ||
        status?.started !== false ||
        status?.autoplay !== false
      ) throw Error('QA_REPLAY_STATUS_FAILED');

      const history = await call('data_get_ohlcv', {
        offset: 80,
        limit: 1,
        order: 'desc'
      });

      candleTime = history?.bars?.[0]?.time;

      if (
        history?.delayed_feed_alias !== true ||
        history.symbol !== ES_QA_BASELINE.symbol ||
        history.timeframe !== ES_QA_BASELINE.timeframe ||
        !Number.isSafeInteger(candleTime) ||
        candleTime < 1262304000 ||
        candleTime > 4102444800
      ) throw Error('QA_CANDLE_IDENTITY_FAILED');

      // Recheck immediately before the first mutation.
      if (!matchesQaBaseline(
        await snapshot(), ES_QA_BASELINE
      )) throw Error('QA_BASELINE_CHANGED');

    } catch (error) {
      return {
        ok: false,
        code: 'QA_CANARY_PREFLIGHT_FAILED',
        error: errorText(error),
        replay_mutations_attempted: false,
        recovery_attempted: false
      };
    }

    try {
      attempted = true;

      start = await call('replay_start', {
        time: candleTime,
        allow_relocation: false,
        maximum_relocation_seconds: 1800
      });

      if (
        start?.verified !== true ||
        start?.mutation_attempted !== true ||
        start?.observed?.started !== true ||
        start?.observed?.autoplay !== false ||
        !Number.isSafeInteger(start.observed.current_time)
      ) throw Error('QA_REPLAY_START_UNVERIFIED');

      step = await call('replay_step', { bars: 1 });

      if (
        step?.verified !== true ||
        step?.advanced_bars !== 1 ||
        step?.cursor_times?.length !== 1 ||
        step.cursor_times[0] <= start.observed.current_time
      ) throw Error('QA_REPLAY_STEP_UNVERIFIED');

    } catch (error) {
      stageError = errorText(error);

    } finally {
      if (attempted) {
        try {
          stop = await call('replay_stop');

          if (
            stop?.verified !== true ||
            stop?.mutation_attempted !== true ||
            stop?.observed?.started !== false ||
            stop?.observed?.autoplay !== false
          ) throw Error('QA_REPLAY_STOP_UNVERIFIED');

        } catch (error) {
          stopError = errorText(error);
        }
      }
    }

    // No discard authorization after uncertain start or stop.
    if (
      start?.verified === true &&
      start?.mutation_attempted === true &&
      stop?.verified === true &&
      stop?.mutation_attempted === true &&
      stopError === null
    ) {
      try {
        const postStop = await snapshot();

        if (
          !matchesQaBaseline({
            ...postStop,
            unsaved_changes: false
          }, ES_QA_BASELINE) ||
          typeof postStop.unsaved_changes !== 'boolean'
        ) throw Error('QA_POST_STOP_IDENTITY_FAILED');

        const recoveryPermit = issueQaReplayRecoveryPermit({
          qaTargetId,
          protectedTargetId,
          protectedLayoutId: PROTECTED,
          expected: ES_QA_BASELINE,
          before,
          start,
          stop
        });

        recovery = await recoverQaSavedLayout({
          browserFactory,
          qaTargetId,
          protectedTargetId,
          protectedLayoutId: PROTECTED,
          authorizedQaLayoutId: QA,
          expected: ES_QA_BASELINE,
          recoveryPermit,
          maxAttempts,
          intervalMs,
          ...(sleep ? { sleep } : {})
        });

      } catch (error) {
        recoveryError = errorText(error);
      }
    }

    const ok =
      stageError === null &&
      stopError === null &&
      recoveryError === null &&
      start?.verified === true &&
      step?.verified === true &&
      stop?.verified === true &&
      recovery?.ok === true;

    return {
      ok,
      code: ok
        ? 'QA_REPLAY_AND_RECOVERY_VERIFIED'
        : 'QA_REPLAY_CANARY_REQUIRES_REVIEW',
      candle_time: candleTime,
      start_verified: start?.verified === true,
      step_verified: step?.verified === true,
      stop_verified: stop?.verified === true,
      recovery_verified: recovery?.ok === true,
      navigation_attempted:
        recovery?.navigation_attempted ?? false,
      recovery_code: recovery?.code ?? null,
      stage_error: stageError,
      stop_error: stopError,
      recovery_error: recoveryError,
      protected_layout_operations: 0
    };

  } finally {
    activeRun = false;
  }
}
