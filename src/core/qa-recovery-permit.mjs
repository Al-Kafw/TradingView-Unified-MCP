import { matchesQaBaseline } from './qa-recovery-verifier.mjs';

// Module-private storage: serialized or caller-created objects cannot
// authorize recovery. Issuance is for trusted local QA orchestration only.
const issued = new WeakMap();

function scopeKey({
  qaTargetId, protectedTargetId, protectedLayoutId, expected
}) {
  if (
    typeof qaTargetId !== 'string' || !qaTargetId ||
    typeof protectedTargetId !== 'string' || !protectedTargetId ||
    qaTargetId === protectedTargetId ||
    typeof protectedLayoutId !== 'string' ||
    expected?.layout_id === protectedLayoutId ||
    !/^[A-Za-z0-9_-]{6,64}$/.test(expected?.layout_id ?? '') ||
    !/^MCP QA Recovery RestoreLab [A-Za-z0-9]{8}$/.test(
      expected?.layout_name ?? ''
    ) ||
    typeof expected?.symbol !== 'string' || !expected.symbol ||
    typeof expected?.resolved_symbol !== 'string' ||
    !expected.resolved_symbol ||
    typeof expected?.timeframe !== 'string' || !expected.timeframe ||
    !Array.isArray(expected?.studies) ||
    expected.studies.length < 1 ||
    expected.studies.some(s =>
      typeof s.id !== 'string' || !s.id ||
      typeof s.name !== 'string' || !s.name
    )
  ) throw Error('INVALID_QA_PERMIT_SCOPE');

  return JSON.stringify({
    qaTargetId,
    protectedTargetId,
    protectedLayoutId,
    layout_id: expected.layout_id,
    layout_name: expected.layout_name,
    symbol: expected.symbol,
    resolved_symbol: expected.resolved_symbol,
    timeframe: expected.timeframe,
    studies: expected.studies
      .map(s => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.id.localeCompare(b.id))
  });
}

export function issueQaReplayRecoveryPermit({
  qaTargetId,
  protectedTargetId,
  protectedLayoutId,
  expected,
  before,
  start,
  stop
}) {
  const scope = scopeKey({
    qaTargetId, protectedTargetId, protectedLayoutId, expected
  });

  if (
    !matchesQaBaseline(before, expected) ||
    start?.verified !== true ||
    start?.mutation_attempted !== true ||
    start?.observed?.started !== true ||
    start?.observed?.autoplay !== false ||
    !Number.isSafeInteger(start.observed.current_time) ||
    stop?.verified !== true ||
    stop?.mutation_attempted !== true ||
    stop?.observed?.started !== false ||
    stop?.observed?.autoplay !== false
  ) throw Error('QA_REPLAY_EVIDENCE_NOT_VERIFIED');

  const permit = Object.freeze(Object.create(null));

  issued.set(permit, {
    scope,
    expiresAt: Date.now() + 120000
  });

  return permit;
}

export function consumeQaReplayRecoveryPermit(permit, scope) {
  if (permit === null || typeof permit !== 'object')
    return false;

  const record = issued.get(permit);

  if (!record) return false;

  // A permit is consumed even if the caller supplies the wrong scope.
  issued.delete(permit);

  try {
    return (
      Date.now() <= record.expiresAt &&
      record.scope === scopeKey(scope)
    );
  } catch {
    return false;
  }
}
