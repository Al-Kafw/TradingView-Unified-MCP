
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeCdp } from './fake-cdp.mjs';
import { layoutPage } from '../src/features/layouts.mjs';

function fixture(sourceIds, directProperties) {
  const studyId = 'study-1';
  const modelState = {
    inputs: { length: 20 },
    styles: { columns: { visible: true } },
    visible: true
  };

  const sources = sourceIds.map(id => ({
    id: () => id,
    properties: () => ({ state: () => modelState })
  }));

  const widget = {
    model: () => ({
      model: () => ({ dataSources: () => sources }),
      mainSeries: () => ({
        symbol: () => 'NASDAQ:AAPL',
        interval: () => '15'
      })
    })
  };

  const handle = {
    getInputValues: () => [{ id: 'length', value: 20 }]
  };

  if (directProperties !== undefined)
    handle.getProperties = () => directProperties;

  const chart = {
    _chartWidget: widget,
    symbol: () => 'NASDAQ:AAPL',
    resolution: () => '15',
    chartType: () => 1,
    getAllStudies: () => [{ id: studyId, name: 'Volume' }],
    getStudyById: () => handle,
    getAllShapes: () => []
  };

  const page = {
    TradingViewApi: {
      activeChart: () => chart,
      getSaveChartService: () => ({
        layoutId: () => 'source01',
        hasChanges: () => false
      }),
      _chartWidgetCollection: {
        metaInfo: {
          uid: { value: () => 'source01' },
          name: { value: () => 'MCP Test' }
        },
        getAll: () => [widget]
      }
    }
  };

  return createFakeCdp({ page });
}

async function snapshot(h) {
  try {
    return await h.browser.evaluate(
      'chart-1', layoutPage, { operation: 'snapshot' }
    );
  } finally {
    await h.close();
  }
}

test('unique native study ID recovers model properties', async () => {
  const result = await snapshot(fixture(['study-1']));
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.panes[0].studies[0].properties)),
    {
      inputs: { length: 20 },
      styles: { columns: { visible: true } },
      visible: true
    }
  );
  assert.deepEqual(result.unverified_fields, []);
});

test('different study ID cannot supply fallback properties', async () => {
  const result = await snapshot(fixture(['other-study']));
  assert.equal(result.panes[0].studies[0].properties, null);
  assert.ok(result.unverified_fields.includes(
    'panes.0.study.Volume.properties'
  ));
});

test('ambiguous native study ID fails closed', async () => {
  const result = await snapshot(fixture(['study-1', 'study-1']));
  assert.equal(result.panes[0].studies[0].properties, null);
  assert.ok(result.unverified_fields.includes(
    'panes.0.study.Volume.properties'
  ));
});

test('direct study properties take precedence over fallback', async () => {
  const result = await snapshot(
    fixture(['study-1'], { directProperty: true })
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.panes[0].studies[0].properties)),
    { directProperty: true }
  );
});
