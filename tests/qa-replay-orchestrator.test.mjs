import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runQaReplayCanaryCore,
  ES_QA_BASELINE
} from '../src/core/qa-replay-orchestrator.mjs';

function fixture({
  dirty = false,
  stepFails = false,
  startFails = false,
  stopFails = false,
  badCandle = false,
  badTarget = false,
  clearDirtyOnStop = false,
  drawingChangedAfterStart = false,
  chartTypeChangedAfterStart = false,
  inputChangedAfterStart = false
} = {}) {
  const state = {
    dirty,
    started: false,
    autoplay: false,
    unexpectedDrawing: false,
    unexpectedChartType: false,
    unexpectedInput: false
  };

  const calls = [];

  const browserFactory = () => ({
    async listTargets() {
      calls.push('tabs');

      return [
        {
          id: 'qa-tab',
          url: 'https://www.tradingview.com/chart/AIibRZIx/'
        },
        {
          id: 'protected-tab',
          url: badTarget
            ? 'https://www.tradingview.com/chart/WRONG99/'
            : 'https://www.tradingview.com/chart/KrnVg2oE/'
        }
      ];
    },

    async evaluate(target, fn, args) {
      assert.equal(target, 'qa-tab');
      calls.push('read');

      if (args?.op === 'qa_preflight') {
        return {
          ok: true,
          qa_guard_verified: true,
          read_only: true
        };
      }

      return {
        pathname: '/chart/AIibRZIx/',
        ...ES_QA_BASELINE,
        studies: state.unexpectedInput
          ? [{
              id: 'aMROG1',
              name: 'Volume',
              inputs: [
                { id: 'length', value: 21 },
                { id: 'col_prev_close', value: false }
              ]
            }]
          : ES_QA_BASELINE.studies,
        drawings: state.unexpectedDrawing
          ? [{ id: 'manual-line', name: 'Trend Line' }]
          : [],
        chart_type: state.unexpectedChartType ? 2 : 1,
        unsaved_changes: state.dirty,
        replay_started: state.started,
        autoplay: state.autoplay
      };
    },

    async navigate(target, url) {
      assert.equal(target, 'qa-tab');
      assert.equal(
        url,
        'https://www.tradingview.com/chart/AIibRZIx/'
      );

      calls.push('navigate');
      state.dirty = false;
    },

    async close() {}
  });

  const registry = {
    async execute(name, args) {
      calls.push(name);

      assert.equal(args.target_id, 'qa-tab');
      assert.equal(args.expected_layout_id, 'AIibRZIx');

      if (name === 'replay_status') {
        return {
          available: true,
          started: state.started,
          autoplay: state.autoplay
        };
      }

      if (name === 'data_get_ohlcv') {
        return {
          delayed_feed_alias: !badCandle,
          symbol: ES_QA_BASELINE.symbol,
          timeframe: '15',
          bars: [{ time: 1792769400 }]
        };
      }

      if (name === 'replay_start') {
        state.started = true;
        state.dirty = true;
        state.unexpectedDrawing = drawingChangedAfterStart;
        state.unexpectedChartType = chartTypeChangedAfterStart;
        state.unexpectedInput = inputChangedAfterStart;

        if (startFails) throw Error('START_FAILED');

        return {
          verified: true,
          mutation_attempted: true,
          observed: {
            started: true,
            autoplay: false,
            current_time: 1792769399
          }
        };
      }

      if (name === 'replay_step') {
        if (stepFails) throw Error('STEP_FAILED');

        return {
          verified: true,
          advanced_bars: 1,
          cursor_times: [1792770299]
        };
      }

      if (name === 'replay_stop') {
        if (stopFails) throw Error('STOP_FAILED');

        state.started = false;
        if (clearDirtyOnStop) state.dirty = false;

        return {
          verified: true,
          mutation_attempted: true,
          observed: {
            started: false,
            autoplay: false
          }
        };
      }

      throw Error('UNEXPECTED_TOOL');
    }
  };

  return {
    state,
    calls,
    run: () => runQaReplayCanaryCore({
      browserFactory,
      registry,
      qaTargetId: 'qa-tab',
      protectedTargetId: 'protected-tab',
      maxAttempts: 5,
      intervalMs: 0,
      sleep: async () => {}
    })
  };
}

const count = (f, name) =>
  f.calls.filter(c => c === name).length;

test('Replay and recovery complete with one navigation', async () => {
  const f = fixture();
  const r = await f.run();

  assert.equal(r.ok, true);
  assert.equal(r.code, 'QA_REPLAY_AND_RECOVERY_VERIFIED');
  assert.equal(r.step_verified, true);
  assert.equal(r.recovery_verified, true);
  assert.equal(count(f, 'replay_step'), 1);
  assert.equal(count(f, 'replay_stop'), 1);
  assert.equal(count(f, 'navigate'), 1);
  assert.equal(f.state.dirty, false);
});

test('step error still stops and recovers QA', async () => {
  const f = fixture({ stepFails: true });
  const r = await f.run();

  assert.equal(r.ok, false);
  assert.equal(r.stage_error, 'STEP_FAILED');
  assert.equal(r.stop_verified, true);
  assert.equal(r.recovery_verified, true);
  assert.equal(count(f, 'replay_stop'), 1);
  assert.equal(count(f, 'navigate'), 1);
});

test('uncertain stop blocks recovery navigation', async () => {
  const f = fixture({ stopFails: true });
  const r = await f.run();

  assert.equal(r.ok, false);
  assert.equal(r.stop_error, 'STOP_FAILED');
  assert.equal(count(f, 'navigate'), 0);
});

test('uncertain start attempts stop but blocks discard', async () => {
  const f = fixture({ startFails: true });
  const r = await f.run();

  assert.equal(r.ok, false);
  assert.equal(count(f, 'replay_stop'), 1);
  assert.equal(count(f, 'navigate'), 0);
});

test('dirty preflight blocks Replay start', async () => {
  const f = fixture({ dirty: true });
  const r = await f.run();

  assert.equal(r.code, 'QA_CANARY_PREFLIGHT_FAILED');
  assert.equal(count(f, 'replay_start'), 0);
});

test('incorrect protected-tab identity blocks Replay', async () => {
  const f = fixture({ badTarget: true });
  const r = await f.run();

  assert.equal(r.code, 'QA_CANARY_PREFLIGHT_FAILED');
  assert.equal(count(f, 'replay_start'), 0);
});

test('unverified OHLC source blocks Replay', async () => {
  const f = fixture({ badCandle: true });
  const r = await f.run();

  assert.equal(r.code, 'QA_CANARY_PREFLIGHT_FAILED');
  assert.equal(count(f, 'replay_start'), 0);
});

test('clean state after stop needs no navigation', async () => {
  const f = fixture({ clearDirtyOnStop: true });
  const r = await f.run();

  assert.equal(r.ok, true);
  assert.equal(r.recovery_code, 'QA_ALREADY_CLEAN_VERIFIED');
  assert.equal(count(f, 'navigate'), 0);
});


test('drawing added during Replay blocks recovery discard', async () => {
  const f = fixture({ drawingChangedAfterStart: true });
  const r = await f.run();

  assert.equal(r.ok, false);
  assert.equal(r.stop_verified, true);
  assert.equal(r.recovery_verified, false);
  assert.equal(r.recovery_error, 'QA_POST_STOP_IDENTITY_FAILED');
  assert.equal(count(f, 'navigate'), 0);
});

test('chart type changed during Replay blocks recovery discard', async () => {
  const f = fixture({ chartTypeChangedAfterStart: true });
  const r = await f.run();

  assert.equal(r.ok, false);
  assert.equal(r.stop_verified, true);
  assert.equal(r.recovery_verified, false);
  assert.equal(count(f, 'navigate'), 0);
});


test('Volume input changed during Replay blocks recovery', async () => {
  const f = fixture({ inputChangedAfterStart: true });
  const r = await f.run();

  assert.equal(r.ok, false);
  assert.equal(r.stop_verified, true);
  assert.equal(r.recovery_verified, false);
  assert.equal(r.recovery_error, 'QA_POST_STOP_IDENTITY_FAILED');
  assert.equal(count(f, 'navigate'), 0);
});
