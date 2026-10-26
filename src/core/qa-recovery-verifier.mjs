/*
 * Read-only saved-layout verification after browser navigation.
 * Each attempt receives a fresh CDP connection.
 * Never saves, reloads, or modifies any TradingView chart.
 */

export function qaBaselineSnapshotPage() {
  const root = window.TradingViewApi;
  const unwrap = v =>
    typeof v?.value === 'function' ? v.value() : v;

  const meta = root?._chartWidgetCollection?.metaInfo;
  const chart = root?._activeChartWidgetWV?.value?.();
  const service = root?.getSaveChartService?.();
  const replay = root?._replayApi;

  const outer = chart?._chartWidget?.model?.();
  const inner = outer?.model?.() ?? outer;
  const main = inner?.mainSeries?.() ?? outer?.mainSeries?.();
  const info = main?.symbolInfo?.();

  const studies = chart?.getAllStudies?.();

  return {
    pathname: location.pathname,
    layout_id: unwrap(meta?.uid) == null
      ? null : String(unwrap(meta.uid)),
    layout_name: unwrap(meta?.name) ?? null,
    unsaved_changes:
      typeof service?.hasChanges === 'function'
        ? service.hasChanges() : null,
    symbol: chart?.symbol?.() ?? null,
    resolved_symbol: info?.pro_name ?? null,
    timeframe: chart?.resolution?.() ?? null,
    studies: Array.isArray(studies)
      ? studies.map(s => ({
          id: s.id ?? null,
          name: s.name ?? null
        }))
      : null,
    replay_started:
      typeof replay?.isReplayStarted === 'function'
        ? unwrap(replay.isReplayStarted()) : null,
    autoplay:
      typeof replay?.isAutoplayStarted === 'function'
        ? unwrap(replay.isAutoplayStarted()) : null
  };
}

export function matchesQaBaseline(s, e) {
  return Boolean(
    s &&
    s.pathname === `/chart/${e.layout_id}/` &&
    s.layout_id === e.layout_id &&
    s.layout_name === e.layout_name &&
    s.unsaved_changes === false &&
    s.symbol === e.symbol &&
    s.resolved_symbol === e.resolved_symbol &&
    s.timeframe === e.timeframe &&
    s.replay_started === false &&
    s.autoplay === false &&
    Array.isArray(s.studies) &&
    Array.isArray(e.studies) &&
    s.studies.length === e.studies.length &&
    s.studies.every(study =>
      e.studies.filter(
        item => item.id === study.id && item.name === study.name
      ).length === 1
    )
  );
}

export async function verifyQaSavedBaseline({
  browserFactory,
  qaTargetId,
  protectedTargetId,
  protectedLayoutId,
  expected,
  maxAttempts = 60,
  intervalMs = 500,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  if (
    typeof browserFactory !== 'function' ||
    !qaTargetId ||
    !protectedTargetId ||
    qaTargetId === protectedTargetId ||
    !protectedLayoutId ||
    expected?.layout_id === protectedLayoutId ||
    !expected?.layout_name?.startsWith('MCP QA ') ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 3 ||
    maxAttempts > 120
  ) throw Error('INVALID_QA_RECOVERY_CONFIGURATION');

  let stable = 0;
  let last = null;
  let lastError = null;
  let transientErrors = 0;

  const pathname = t => {
    try { return new URL(t.url).pathname; }
    catch { return null; }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const browser = browserFactory();

    try {
      const tabs = await browser.listTargets();

      const qa = tabs.filter(
        t => pathname(t) === `/chart/${expected.layout_id}/`
      );
      const protectedTabs = tabs.filter(
        t => pathname(t) === `/chart/${protectedLayoutId}/`
      );

      if (
        qa.length !== 1 ||
        qa[0].id !== qaTargetId ||
        protectedTabs.length !== 1 ||
        protectedTabs[0].id !== protectedTargetId
      ) return {
        ok: false,
        code: 'TARGET_IDENTITY_MISMATCH',
        attempts: attempt,
        stable_reads: stable
      };

      last = await browser.evaluate(
        qaTargetId, qaBaselineSnapshotPage, {}
      );

      stable = matchesQaBaseline(last, expected)
        ? stable + 1 : 0;

      if (stable >= 3) return {
        ok: true,
        code: 'QA_SAVED_BASELINE_VERIFIED',
        attempts: attempt,
        stable_reads: stable,
        transient_errors: transientErrors,
        snapshot: last,
        tradingview_writes: 0
      };

    } catch (error) {
      stable = 0;
      transientErrors++;
      lastError = String(error?.code ?? error?.message ?? error)
        .slice(0, 200);

    } finally {
      await browser.close();
    }

    if (attempt < maxAttempts) await sleep(intervalMs);
  }

  return {
    ok: false,
    code: 'QA_BASELINE_NOT_STABLE',
    stable_reads: stable,
    transient_errors: transientErrors,
    last_error: lastError,
    last_snapshot: last,
    tradingview_writes: 0
  };
}
