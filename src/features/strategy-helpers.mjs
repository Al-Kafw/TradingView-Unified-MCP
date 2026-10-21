import { ToolError } from '../core/errors.mjs';

export function expandSweep({ symbols, timeframes, inputs = {}, max_combinations = 100 }) {
  const uniqueSymbols = [...new Set(symbols)];
  const uniqueTimeframes = [...new Set(timeframes)];
  const entries = Object.entries(inputs);
  let count = uniqueSymbols.length * uniqueTimeframes.length;
  for (const [key, values] of entries) {
    if (!Array.isArray(values) || values.length === 0) throw new ToolError('INVALID_ARGUMENT', `Input ${key} needs a nonempty values array.`);
    count *= values.length;
    if (!Number.isSafeInteger(count) || count > max_combinations) throw new ToolError('LIMIT_EXCEEDED', 'Sweep exceeds max_combinations before allocation.', { requested: count, max_combinations });
  }
  if (!count || count > max_combinations) throw new ToolError('LIMIT_EXCEEDED', 'Sweep size is empty or exceeds max_combinations.', { requested: count, max_combinations });
  let variants = [{}];
  for (const [key, values] of entries) variants = variants.flatMap(v => values.map(value => Object.fromEntries([...Object.entries(v), [key,value]])));
  return uniqueSymbols.flatMap(symbol => uniqueTimeframes.flatMap(timeframe => variants.map(overrides => ({symbol,timeframe,overrides}))));
}

export function freshnessVerdict(sample, { requireFresh = true, stableReads = 0, minimumStableReads = 3 } = {}) {
  const evidence = sample?.freshness_evidence ?? {};
  const contextMatches = sample?.context_matches === true;
  const reportAvailable = sample?.report_available === true;
  const stable = stableReads >= minimumStableReads;
  const changeObserved = evidence.report_event_observed === true || evidence.report_payload_changed === true;
  const loading = sample?.loading === true;
  return { ready: reportAvailable && contextMatches && stable && !loading && (!requireFresh || changeObserved), report_available: reportAvailable, context_matches: contextMatches, stable_reads: stableReads, loading, change_observed: changeObserved, freshness_status: changeObserved ? 'change_observed_after_probe' : 'unverified', requires_freshness: requireFresh, note: 'Stable values alone never establish freshness. TradingView does not expose a supported server revision in this adapter; change evidence is reported explicitly.' };
}

export function compareMetrics(baseline, candidate) {
  return [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])].sort().map(key => {
    const before = baseline[key], after = candidate[key];
    const numeric = typeof before === 'number' && Number.isFinite(before) && typeof after === 'number' && Number.isFinite(after);
    return { metric: key, baseline: before ?? null, candidate: after ?? null, absolute_change: numeric ? after-before : null, relative_change_percent: numeric && before !== 0 ? 100*(after-before)/Math.abs(before) : null };
  });
}
