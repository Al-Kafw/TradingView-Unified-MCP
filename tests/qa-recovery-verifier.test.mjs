import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesQaBaseline,
  verifyQaSavedBaseline
} from '../src/core/qa-recovery-verifier.mjs';

const expected = {
  layout_id: 'AIibRZIx',
  layout_name: 'MCP QA Recovery RestoreLab e8150714',
  symbol: 'CME_MINI_DL:ES1!',
  resolved_symbol: 'CME_MINI:ES1!',
  timeframe: '15',
  studies: [{ id: 'aMROG1', name: 'Volume' }]
};

const baseline = {
  pathname: '/chart/AIibRZIx/',
  ...expected,
  unsaved_changes: false,
  replay_started: false,
  autoplay: false
};

function fixture(read) {
  let closed = 0;
  let reads = 0;

  const browserFactory = () => ({
    async listTargets() {
      return [
        {
          id: 'qa-tab',
          url: 'https://www.tradingview.com/chart/AIibRZIx/'
        },
        {
          id: 'protected-tab',
          url: 'https://www.tradingview.com/chart/KrnVg2oE/'
        }
      ];
    },
    async evaluate() {
      reads++;
      return read(reads);
    },
    async close() {
      closed++;
    }
  });

  return {
    closed: () => closed,
    reads: () => reads,
    run: (overrides = {}) =>
      verifyQaSavedBaseline({
        browserFactory,
        qaTargetId: 'qa-tab',
        protectedTargetId: 'protected-tab',
        protectedLayoutId: 'KrnVg2oE',
        expected,
        maxAttempts: 9,
        intervalMs: 0,
        sleep: async () => {},
        ...overrides
      })
  };
}

test('reconnects after error and requires three clean reads', async () => {
  const f = fixture(n => {
    if (n === 1) throw Error('CDP_DISCONNECTED');
    if (n === 2) return { ...baseline, unsaved_changes: true };
    return baseline;
  });

  const r = await f.run();

  assert.equal(r.ok, true);
  assert.equal(r.stable_reads, 3);
  assert.equal(r.transient_errors, 1);
  assert.equal(f.reads(), 5);
  assert.equal(f.closed(), 5);
});

test('unstable saved state is never declared restored', async () => {
  const f = fixture(n =>
    n % 3 === 0
      ? { ...baseline, unsaved_changes: true }
      : baseline
  );

  const r = await f.run();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'QA_BASELINE_NOT_STABLE');
  assert.equal(f.closed(), 9);
});

test('protected layout cannot become the QA recovery target', async () => {
  const f = fixture(() => baseline);

  await assert.rejects(
    f.run({ expected: {
      ...expected,
      layout_id: 'KrnVg2oE'
    } }),
    /INVALID_QA_RECOVERY_CONFIGURATION/
  );

  assert.equal(f.reads(), 0);
});

test('snapshot matcher supports other assets and timeframes', () => {
  const nq = {
    ...expected,
    symbol: 'CME_MINI_DL:NQ1!',
    resolved_symbol: 'CME_MINI:NQ1!',
    timeframe: '30'
  };

  assert.equal(matchesQaBaseline({
    ...baseline,
    symbol: nq.symbol,
    resolved_symbol: nq.resolved_symbol,
    timeframe: '30'
  }, nq), true);

  assert.equal(matchesQaBaseline({
    ...baseline,
    symbol: 'CME_MINI_DL:ES1!'
  }, nq), false);
});
