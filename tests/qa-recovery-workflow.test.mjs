import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recoverQaSavedLayout
} from '../src/core/qa-recovery-workflow.mjs';

import {
  issueQaReplayRecoveryPermit
} from '../src/core/qa-recovery-permit.mjs';

const expected = {
  layout_id: 'AIibRZIx',
  layout_name: 'MCP QA Recovery RestoreLab e8150714',
  symbol: 'CME_MINI_DL:ES1!',
  resolved_symbol: 'CME_MINI:ES1!',
  timeframe: '15',
  studies: [{ id: 'aMROG1', name: 'Volume' }]
};

function fixture({
  dirty = true,
  started = false,
  wrongSymbol = false,
  missingProtected = false,
  navigationThrows = false,
  navigationRestores = true,
  asset = expected
} = {}) {
  const state = { dirty, started };
  const calls = [];

  const browserFactory = () => ({
    async listTargets() {
      calls.push('list');

      return [
        {
          id: 'qa-tab',
          url: `https://www.tradingview.com/chart/${asset.layout_id}/`
        },
        ...(!missingProtected ? [{
          id: 'protected-tab',
          url: 'https://www.tradingview.com/chart/KrnVg2oE/'
        }] : [])
      ];
    },

    async evaluate(target) {
      assert.equal(target, 'qa-tab');
      calls.push('read');

      return {
        pathname: `/chart/${asset.layout_id}/`,
        layout_id: asset.layout_id,
        layout_name: asset.layout_name,
        symbol: wrongSymbol ? 'WRONG:SYMBOL' : asset.symbol,
        resolved_symbol: asset.resolved_symbol,
        timeframe: asset.timeframe,
        studies: asset.studies,
        unsaved_changes: state.dirty,
        replay_started: state.started,
        autoplay: false
      };
    },

    async navigate(target, url) {
      assert.equal(target, 'qa-tab');
      assert.equal(
        url,
        `https://www.tradingview.com/chart/${asset.layout_id}/`
      );

      calls.push('navigate');

      if (navigationRestores) state.dirty = false;
      if (navigationThrows) throw Error('CDP_DISCONNECTED');
    },

    async close() {
      calls.push('close');
    }
  });

  return {
    calls,
    setDirty: value => { state.dirty = value; },
    issuePermit: (changes = {}) =>
      issueQaReplayRecoveryPermit({
        qaTargetId: 'qa-tab',
        protectedTargetId: 'protected-tab',
        protectedLayoutId: 'KrnVg2oE',
        expected: asset,
        before: {
          pathname: `/chart/${asset.layout_id}/`,
          ...asset,
          unsaved_changes: false,
          replay_started: false,
          autoplay: false
        },
        start: {
          verified: true,
          mutation_attempted: true,
          observed: {
            started: true,
            autoplay: false,
            current_time: 1790000000
          }
        },
        stop: {
          verified: true,
          mutation_attempted: true,
          observed: {
            started: false,
            autoplay: false
          }
        },
        ...changes
      }),
    run: (changes = {}) =>
      recoverQaSavedLayout({
        browserFactory,
        qaTargetId: 'qa-tab',
        protectedTargetId: 'protected-tab',
        protectedLayoutId: 'KrnVg2oE',
        authorizedQaLayoutId: asset.layout_id,
        expected: asset,
        maxAttempts: 5,
        intervalMs: 0,
        sleep: async () => {},
        ...changes
      })
  };
}

const count = (f, operation) =>
  f.calls.filter(c => c === operation).length;

test('dirty QA without authorization cannot reload', async () => {
  const f = fixture();
  const r = await f.run();

  assert.equal(r.code, 'QA_REPLAY_PERMIT_REQUIRED');
  assert.equal(count(f, 'navigate'), 0);
});

test('authorized Replay cleanup navigates exactly once', async () => {
  const f = fixture();
  const r = await f.run({
    recoveryPermit: f.issuePermit()
  });

  assert.equal(r.ok, true);
  assert.equal(r.code, 'QA_SAVED_BASELINE_RESTORED');
  assert.equal(r.stable_reads, 3);
  assert.equal(count(f, 'navigate'), 1);
});

test('clean QA verifies without navigating', async () => {
  const f = fixture({ dirty: false });
  const r = await f.run();

  assert.equal(r.ok, true);
  assert.equal(r.code, 'QA_ALREADY_CLEAN_VERIFIED');
  assert.equal(count(f, 'navigate'), 0);
});

test('active Replay cannot be discarded', async () => {
  const f = fixture({ started: true });
  const r = await f.run({
    recoveryPermit: f.issuePermit()
  });

  assert.equal(r.code, 'QA_PREFLIGHT_UNSAFE');
  assert.equal(count(f, 'navigate'), 0);
});

test('wrong asset identity blocks navigation', async () => {
  const f = fixture({ wrongSymbol: true });
  const r = await f.run({
    recoveryPermit: f.issuePermit()
  });

  assert.equal(r.code, 'QA_PREFLIGHT_UNSAFE');
  assert.equal(count(f, 'navigate'), 0);
});

test('missing protected-tab identity blocks navigation', async () => {
  const f = fixture({ missingProtected: true });
  const r = await f.run({
    recoveryPermit: f.issuePermit()
  });

  assert.equal(r.code, 'TARGET_IDENTITY_MISMATCH');
  assert.equal(count(f, 'navigate'), 0);
});

test('CDP disconnect after submitted navigation reconciles', async () => {
  const f = fixture({ navigationThrows: true });
  const r = await f.run({
    recoveryPermit: f.issuePermit()
  });

  assert.equal(r.ok, true);
  assert.equal(r.navigation_acknowledged, false);
  assert.equal(count(f, 'navigate'), 1);
});

test('failed restoration never retries navigation', async () => {
  const f = fixture({ navigationRestores: false });
  const r = await f.run({
    recoveryPermit: f.issuePermit()
  });

  assert.equal(r.ok, false);
  assert.equal(r.code, 'QA_RECOVERY_UNVERIFIED');
  assert.equal(count(f, 'navigate'), 1);
});

test('same workflow supports another configured market and timeframe', async () => {
  const nq = {
    ...expected,
    symbol: 'CME_MINI_DL:NQ1!',
    resolved_symbol: 'CME_MINI:NQ1!',
    timeframe: '30'
  };

  const f = fixture({ dirty: false, asset: nq });
  const r = await f.run();

  assert.equal(r.ok, true);
  assert.equal(count(f, 'navigate'), 0);
});

test('protected layout cannot be authorized as QA', async () => {
  const f = fixture();

  await assert.rejects(
    f.run({ authorizedQaLayoutId: 'KrnVg2oE' }),
    /INVALID_QA_RECOVERY_CONFIGURATION/
  );

  assert.equal(count(f, 'navigate'), 0);
});

test('old boolean authorization cannot trigger reload', async () => {
  const f = fixture();

  const r = await f.run({
    authorizeDiscard: true,
    cleanupReason: 'qa_replay_test_cleanup'
  });

  assert.equal(r.code, 'QA_REPLAY_PERMIT_REQUIRED');
  assert.equal(count(f, 'navigate'), 0);
});

test('fabricated permit cannot trigger reload', async () => {
  const f = fixture();
  const r = await f.run({ recoveryPermit: {} });

  assert.equal(r.code, 'QA_REPLAY_PERMIT_INVALID');
  assert.equal(count(f, 'navigate'), 0);
});

test('permit cannot be issued without verified stop', () => {
  const f = fixture();

  assert.throws(
    () => f.issuePermit({
      stop: {
        verified: false,
        mutation_attempted: true,
        observed: { started: false, autoplay: false }
      }
    }),
    /QA_REPLAY_EVIDENCE_NOT_VERIFIED/
  );
});

test('permit is scoped and cannot be reused', async () => {
  const f = fixture();
  const permit = f.issuePermit();

  const wrongScope = await f.run({
    recoveryPermit: f.issuePermit({
      protectedTargetId: 'some-other-tab'
    })
  });

  assert.equal(wrongScope.code, 'QA_REPLAY_PERMIT_INVALID');
  assert.equal(count(f, 'navigate'), 0);

  const first = await f.run({ recoveryPermit: permit });
  assert.equal(first.ok, true);
  assert.equal(count(f, 'navigate'), 1);

  f.setDirty(true);

  const second = await f.run({ recoveryPermit: permit });
  assert.equal(second.code, 'QA_REPLAY_PERMIT_INVALID');
  assert.equal(count(f, 'navigate'), 1);
});
