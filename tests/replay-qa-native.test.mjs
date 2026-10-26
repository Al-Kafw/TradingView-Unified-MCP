
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeCdp } from './fake-cdp.mjs';
import { replayPage } from '../src/features/replay.mjs';

function fixture({
  layout = 'AIibRZIx',
  name = 'MCP QA Recovery RestoreLab e8150714',
  symbol = 'CME_MINI_DL:ES1!',
  timeframe = '15',
  studies = [{ id: 'aMROG1', name: 'Volume' }],
  dirty = false,
  replayGeneratedStudy = false,
  replayGeneratedStudyName = 'Unnamed Study',
  pathname = '/chart/AIibRZIx/'
} = {}) {
  const calls = [];
  let started = false;
  let cursor = null;
  let autoplay = false;

  const api = {
    isReplayAvailable: () => true,
    isReplayStarted: () => started,
    isAutoplayStarted: () => autoplay,
    currentDate: () => cursor,
    autoplayDelay: () => 1000,
    position: () => 0,
    realizedPL: () => 0,
    selectDate: async ms => {
      calls.push('start');
      cursor = ms / 1000;
      started = true;
      if (replayGeneratedStudy) {
        studies.push({
          id: 'ReplayQA1',
          name: replayGeneratedStudyName
        });
        dirty = true;
      }
    },
    doStep: async () => {
      calls.push('step');
      cursor += 900;
    },
    stopReplay: async () => {
      calls.push('stop');
      started = false;
      if (replayGeneratedStudy) {
        const index = studies.findIndex(
          s => s.id === 'ReplayQA1'
        );
        if (index >= 0) studies.splice(index, 1);
        dirty = false;
      }
    }
  };

  const h = createFakeCdp({
    page: {
      location: new URL('https://www.tradingview.com' + pathname),
      TradingViewApi: {
        _replayApi: api,
        _chartWidgetCollection: {
          metaInfo: {
            uid: { value: () => layout },
            name: { value: () => name }
          }
        },
        _activeChartWidgetWV: {
          value: () => ({
            symbol: () => symbol,
            resolution: () => timeframe,
            getAllStudies: () => studies
          })
        },
        getSaveChartService: () => ({
          hasChanges: () => dirty
        })
      }
    }
  });

  return {
    calls,
    close: () => h.close(),
    run: (op, additional = {}) =>
      h.browser.evaluate('chart-1', replayPage, {
        op,
        qa_replay_guard: true,
        expected_layout_id: 'AIibRZIx',
        ...additional
      })
  };
}

test('correct QA baseline permits stopped-state inspection', async () => {
  const f = fixture();
  try {
    const r = await f.run('stop');
    assert.equal(r.ok, true);
    assert.equal(r.already_stopped, true);
    assert.deepEqual(f.calls, []);
  } finally { await f.close(); }
});

test('guarded QA start, single step and stop work', async () => {
  const f = fixture();
  try {
    const start = await f.run('start', {
      time: 1790000000,
      maximum_relocation_seconds: 0
    });
    assert.equal(start.ok, true);

    const step = await f.run('step', { bars: 1 });
    assert.equal(step.ok, true);
    assert.equal(step.advanced_bars, 1);

    const stop = await f.run('stop');
    assert.equal(stop.ok, true);
    assert.deepEqual(f.calls, ['start', 'step', 'stop']);
  } finally { await f.close(); }
});

for (const [label, changes] of [
  ['protected native layout', { layout: 'KrnVg2oE' }],
  ['incorrect layout name', { name: 'Couto|Mentorship' }],
  ['incorrect symbol', { symbol: 'CME_MINI_DL:NQ1!' }],
  ['incorrect timeframe', { timeframe: '30' }],
  ['additional indicator', {
    studies: [
      { id: 'aMROG1', name: 'Volume' },
      { id: 'other', name: 'Unknown' }
    ]
  }],
  ['wrong Volume identity', {
    studies: [{ id: 'wrong', name: 'Volume' }]
  }],
  ['incorrect URL', { pathname: '/chart/KrnVg2oE/' }]
]) {
  test('native guard blocks ' + label, async () => {
    const f = fixture(changes);
    try {
      const r = await f.run('start', { time: 1790000000 });
      assert.equal(r.ok, false);
      assert.equal(r.code, 'QA_REPLAY_GUARD_FAILED');
      assert.deepEqual(f.calls, []);
    } finally { await f.close(); }
  });
}

test('dirty QA layout cannot start Replay', async () => {
  const f = fixture({ dirty: true });
  try {
    const r = await f.run('start', { time: 1790000000 });
    assert.equal(r.code, 'QA_REPLAY_GUARD_FAILED');
    assert.deepEqual(f.calls, []);
  } finally { await f.close(); }
});

test('read-only native QA preflight succeeds', async () => {
  const f = fixture();
  try {
    const r = await f.run('qa_preflight');
    assert.equal(r.ok, true);
    assert.equal(r.qa_guard_verified, true);
    assert.equal(r.read_only, true);
    assert.equal(r.observed.started, false);
    assert.deepEqual(f.calls, []);
  } finally { await f.close(); }
});

test('dirty native QA preflight fails closed', async () => {
  const f = fixture({ dirty: true });
  try {
    const r = await f.run('qa_preflight');
    assert.equal(r.code, 'QA_REPLAY_GUARD_FAILED');
    assert.deepEqual(f.calls, []);
  } finally { await f.close(); }
});

test('protected native QA preflight fails closed', async () => {
  const f = fixture({
    layout: 'KrnVg2oE',
    name: 'Couto|Mentorship'
  });
  try {
    const r = await f.run('qa_preflight');
    assert.equal(r.code, 'QA_REPLAY_GUARD_FAILED');
    assert.deepEqual(f.calls, []);
  } finally { await f.close(); }
});

test('temporary Replay study permits step and stop', async () => {
  const f = fixture({ replayGeneratedStudy: true });

  try {
    const start = await f.run('start', {
      time: 1790000000,
      maximum_relocation_seconds: 0
    });
    assert.equal(start.ok, true);

    const step = await f.run('step', { bars: 1 });
    assert.equal(step.ok, true);
    assert.equal(step.advanced_bars, 1);

    const stop = await f.run('stop');
    assert.equal(stop.ok, true);
    assert.deepEqual(f.calls, ['start', 'step', 'stop']);
  } finally {
    await f.close();
  }
});

test('unexpected Replay study blocks step but not cleanup', async () => {
  const f = fixture({
    replayGeneratedStudy: true,
    replayGeneratedStudyName: 'Unexpected Indicator'
  });

  try {
    assert.equal((await f.run('start', {
      time: 1790000000
    })).ok, true);

    const step = await f.run('step', { bars: 1 });
    assert.equal(step.code, 'QA_REPLAY_GUARD_FAILED');

    const stop = await f.run('stop');
    assert.equal(stop.ok, true);
    assert.deepEqual(f.calls, ['start', 'stop']);
  } finally {
    await f.close();
  }
});

test('preflight rejects an already started Replay', async () => {
  const f = fixture();

  try {
    assert.equal((await f.run('start', {
      time: 1790000000
    })).ok, true);

    const result = await f.run('qa_preflight');
    assert.equal(result.code, 'QA_REPLAY_GUARD_FAILED');

    assert.equal((await f.run('stop')).ok, true);
  } finally {
    await f.close();
  }
});
