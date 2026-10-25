
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeCdp } from './fake-cdp.mjs';
import { dataPage } from '../src/features/data.mjs';

function fixture({
  symbol = 'NASDAQ:AAPL',
  resolved = symbol,
  mainFull = symbol,
  mainPro = resolved,
  mainSymbol = undefined,
  mainName = undefined,
  extendedFull = symbol,
  extendedPro = resolved,
  noExtended = false
} = {}) {
  const ticker = symbol.split(':')[1];

  const bars = {
    firstIndex: () => 0,
    lastIndex: () => 2,
    size: () => 3,
    valueAt: index => [
      1792786500 + index * 900,
      100 + index,
      102 + index,
      99 + index,
      101 + index,
      1000 + index
    ]
  };

  const main = {
    bars: () => bars,
    symbolInfo: () => ({
      symbol: mainSymbol === undefined ? ticker : mainSymbol,
      name: mainName === undefined ? ticker : mainName,
      full_name: mainFull,
      pro_name: mainPro
    }),
    sessionId: () => 'regular'
  };

  const inner = { mainSeries: () => main };
  const chart = {
    symbol: () => symbol,
    resolution: () => '15',
    _chartWidget: {
      model: () => ({
        model: () => inner
      })
    }
  };

  if (!noExtended) {
    chart.symbolExt = () => ({
      symbol: ticker,
      full_name: extendedFull,
      pro_name: extendedPro,
      type: 'futures'
    });
  }

  const h = createFakeCdp({
    page: {
      TradingViewApi: {
        _activeChartWidgetWV: { value: () => chart },
        _chartWidgetCollection: {
          metaInfo: { uid: { value: () => 'LabQA001' } }
        }
      }
    }
  });

  return {
    read: (op = 'ohlcv') =>
      h.browser.evaluate('chart-1', dataPage, {
        op,
        offset: 0,
        limit: 3,
        order: 'asc'
      }),
    close: () => h.close()
  };
}

test('exact native symbol remains readable', async () => {
  const f = fixture();
  try {
    const r = await f.read();
    assert.equal(r.ok, true);
    assert.equal(r.delayed_feed_alias, false);
    assert.equal(r.returned, 3);
  } finally { await f.close(); }
});

for (const [symbol, resolved] of [
  ['CME_MINI_DL:ES1!', 'CME_MINI:ES1!'],
  ['CME_MINI_DL:NQ1!', 'CME_MINI:NQ1!'],
  ['CBOT_MINI_DL:YM1!', 'CBOT_MINI:YM1!']
]) {
  test('verified delayed-feed OHLC: ' + symbol, async () => {
    const f = fixture({ symbol, resolved });
    try {
      const r = await f.read();
      assert.equal(r.ok, true);
      assert.equal(r.delayed_feed_alias, true);
      assert.equal(r.symbol, symbol);
      assert.equal(r.resolved_symbol, resolved);
      assert.equal(r.time_unit, 'unix_seconds');
      assert.equal(r.returned, 3);
      assert.equal(r.bars[0].open, 100);
      assert.equal(r.bars[2].close, 103);
    } finally { await f.close(); }
  });
}

test('latest bar supports independently verified alias', async () => {
  const f = fixture({
    symbol: 'CBOT_MINI_DL:YM1!',
    resolved: 'CBOT_MINI:YM1!'
  });
  try {
    const r = await f.read('last_bar');
    assert.equal(r.ok, true);
    assert.equal(r.delayed_feed_alias, true);
    assert.equal(r.bars.length, 1);
    assert.equal(r.bars[0].index, 2);
  } finally { await f.close(); }
});

test('cross-contract mismatch fails closed', async () => {
  const f = fixture({
    symbol: 'CME_MINI_DL:ES1!',
    resolved: 'CME_MINI:NQ1!'
  });
  try {
    const r = await f.read();
    assert.equal(r.code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

test('unapproved exchange alias fails closed', async () => {
  const f = fixture({
    symbol: 'OTHER_DL:ES1!',
    resolved: 'OTHER:ES1!'
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

test('wrong main-series full name fails closed', async () => {
  const f = fixture({
    symbol: 'CME_MINI_DL:ES1!',
    resolved: 'CME_MINI:ES1!',
    mainFull: 'CME_MINI_DL:NQ1!'
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

test('wrong main-series resolved identity fails closed', async () => {
  const f = fixture({
    symbol: 'CME_MINI_DL:ES1!',
    resolved: 'CME_MINI:ES1!',
    mainPro: 'CME_MINI:NQ1!'
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

test('disagreeing independent symbol metadata fails closed', async () => {
  const f = fixture({
    symbol: 'CBOT_MINI_DL:YM1!',
    resolved: 'CBOT_MINI:YM1!',
    extendedPro: 'CBOT_MINI:OTHER'
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

test('missing independent metadata fails closed', async () => {
  const f = fixture({
    symbol: 'CME_MINI_DL:NQ1!',
    resolved: 'CME_MINI:NQ1!',
    noExtended: true
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

for (const [symbol, resolved] of [
  ['CME_MINI_DL:ES1!', 'CME_MINI:ES1!'],
  ['CME_MINI_DL:NQ1!', 'CME_MINI:NQ1!'],
  ['CBOT_MINI_DL:YM1!', 'CBOT_MINI:YM1!']
]) {
  test('live-shaped missing native symbol: ' + symbol, async () => {
    const f = fixture({
      symbol,
      resolved,
      mainSymbol: null,
      mainName: symbol.split(':')[1]
    });
    try {
      const r = await f.read();
      assert.equal(r.ok, true);
      assert.equal(r.delayed_feed_alias, true);
      assert.equal(r.returned, 3);
    } finally { await f.close(); }
  });
}

test('missing native symbol and name fails closed', async () => {
  const f = fixture({
    symbol: 'CME_MINI_DL:ES1!',
    resolved: 'CME_MINI:ES1!',
    mainSymbol: null,
    mainName: null
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

test('incorrect native name fails closed', async () => {
  const f = fixture({
    symbol: 'CBOT_MINI_DL:YM1!',
    resolved: 'CBOT_MINI:YM1!',
    mainSymbol: null,
    mainName: 'ES1!'
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});

test('incorrect populated symbol cannot use name fallback', async () => {
  const f = fixture({
    symbol: 'CME_MINI_DL:ES1!',
    resolved: 'CME_MINI:ES1!',
    mainSymbol: 'NQ1!',
    mainName: 'ES1!'
  });
  try {
    assert.equal((await f.read()).code, 'CHART_NOT_READY');
  } finally { await f.close(); }
});
