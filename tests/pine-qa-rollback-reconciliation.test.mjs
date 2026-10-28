import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePineQaRollback } from '../src/core/pine-qa-rollback-reconciliation.mjs';

const expected = {
  layout_id: 'AIibRZIx',
  layout_name: 'MCP QA Recovery RestoreLab e8150714',
  symbol: 'CME_MINI_DL:ES1!',
  resolved_symbol: 'CME_MINI:ES1!',
  timeframe: '15',
  chart_type: 1,
  drawings: [],
  studies: [{id:'aMROG1', name:'Volume', inputs:[{id:'length',value:20}]}]
};
const receipt = {
  ok: true,
  verified: true,
  mutation_attempted: true,
  removed_entity_id: 'DraftQA1',
  rollback_layout_id: 'AIibRZIx',
  baseline_entity_id: 'aMROG1',
  live_study_baseline_restored: true,
  persisted_layout_restoration_verified: false
};
const clean = {
  pathname: '/chart/AIibRZIx/',
  ...expected,
  unsaved_changes: false,
  replay_started: false,
  autoplay: false
};

const fixture = ({snapshot = () => clean, missingProtected = false} = {}) => {
  let reads = 0;
  let closes = 0;
  let navigation = 0;
  const browserFactory = () => ({
    async listTargets() {
      return [
        {id:'qa-tab',url:'https://www.tradingview.com/chart/AIibRZIx/'},
        ...(!missingProtected ? [{id:'protected-tab',url:'https://www.tradingview.com/chart/KrnVg2oE/'}] : [])
      ];
    },
    async evaluate(target) {
      assert.equal(target, 'qa-tab');
      reads++;
      return snapshot(reads);
    },
    async navigate() { navigation++; throw Error('Navigation must never happen'); },
    async close() { closes++; }
  });
  const run = changes => reconcilePineQaRollback({
    rollbackReceipt:receipt,
    browserFactory,
    qaTargetId:'qa-tab',
    protectedTargetId:'protected-tab',
    protectedLayoutId:'KrnVg2oE',
    expected,
    maxAttempts: 6,
    intervalMs: 0,
    sleep: async () => {},
    ...changes
  });
  return {run, reads:()=>reads,closes:()=>closes,navigation:()=>navigation};
};

test('in-memory rollback does not certify dirty saved layout', async () => {
  const f=fixture({snapshot:()=>({...clean,unsaved_changes:true})});
  const r=await f.run();
  assert.equal(r.ok,false);
  assert.equal(r.code,'CLEAN_BROWSER_BASELINE_NOT_VERIFIED');
  assert.equal(r.verifier_code,'QA_BASELINE_NOT_STABLE');
  assert.equal(r.persisted_cloud_state_verified,false);
  assert.equal(r.permission_to_reload,false);
  assert.equal(f.reads(),6);
  assert.equal(f.closes(),6);
  assert.equal(f.navigation(),0);
});

test('three independent clean snapshots can certify browser baseline only', async () => {
  const f=fixture();
  const r=await f.run();
  assert.equal(r.ok,true);
  assert.equal(r.status,'clean_browser_baseline_observed');
  assert.equal(r.stable_reads,3);
  assert.equal(r.persisted_cloud_state_verified,false);
  assert.equal(r.permission_to_compile,false);
  assert.equal(r.permission_to_reload,false);
  assert.equal(f.reads(),3);
  assert.equal(f.closes(),3);
  assert.equal(f.navigation(),0);
});

test('wrong Volume input cannot pass even with clean chart', async () => {
  const f=fixture({snapshot:()=>({...clean,studies:[{id:'aMROG1',name:'Volume',inputs:[{id:'length',value:21}]}]})});
  const r=await f.run();
  assert.equal(r.code,'CLEAN_BROWSER_BASELINE_NOT_VERIFIED');
  assert.equal(r.browser_baseline_verified,false);
  assert.equal(f.navigation(),0);
});

test('intermittent dirty snapshots reset consecutive clean certification', async () => {
  const f=fixture({snapshot:n=>n%3===0?{...clean,unsaved_changes:true}:clean});
  const r=await f.run();
  assert.equal(r.code,'CLEAN_BROWSER_BASELINE_NOT_VERIFIED');
  assert.equal(r.stable_reads,0);
  assert.equal(f.navigation(),0);
});

test('partial or misleading rollback receipts are rejected before browser access', async () => {
  const f=fixture();
  for(const r of [
    {...receipt,verified:false},
    {...receipt,mutation_attempted:false},
    {...receipt,live_study_baseline_restored:false},
    {...receipt,persisted_layout_restoration_verified:true},
    {...receipt,removed_entity_id:'bad/id'}
  ]){
    const out=await f.run({rollbackReceipt:r});
    assert.equal(out.code,'ROLLBACK_RECEIPT_UNVERIFIED');
    assert.equal(out.ok,false);
  }
  assert.equal(f.reads(),0);
  assert.equal(f.navigation(),0);
});

test('unexpected restored chart and missing protected target fail closed', async () => {
  const f=fixture({missingProtected:true});
  const r=await f.run();
  assert.equal(r.code,'CLEAN_BROWSER_BASELINE_NOT_VERIFIED');
  assert.equal(r.verifier_code,'TARGET_IDENTITY_MISMATCH');
  assert.equal(f.navigation(),0);
  const g=fixture();
  const q=await g.run({expected:{...expected,layout_name:'Couto|Mentorship'}});
  assert.equal(q.code,'RESTORELAB_BASELINE_UNVERIFIED');
  assert.equal(g.reads(),0);
});

// Receipt linkage is evidence correlation, not an authorization to mutate.
test('missing rollback layout binding is refused before browser access', async () => {
  const f=fixture(); const {rollback_layout_id,...bad}=receipt;
  const r=await f.run({rollbackReceipt:bad});
  assert.equal(r.code,'ROLLBACK_RECEIPT_UNVERIFIED'); assert.equal(f.reads(),0);
});
test('wrong rollback layout is refused before browser access', async () => {
  const f=fixture(); const r=await f.run({rollbackReceipt:{...receipt,rollback_layout_id:'WrongLab'}});
  assert.equal(r.code,'ROLLBACK_RECEIPT_UNVERIFIED'); assert.equal(f.reads(),0);
});
test('missing Volume baseline ID in receipt is refused before browser access', async () => {
  const f=fixture(); const {baseline_entity_id,...bad}=receipt;
  const r=await f.run({rollbackReceipt:bad});
  assert.equal(r.code,'ROLLBACK_RECEIPT_UNVERIFIED'); assert.equal(f.reads(),0);
});
test('mismatched Volume baseline ID in receipt is refused before browser access', async () => {
  const f=fixture(); const r=await f.run({rollbackReceipt:{...receipt,baseline_entity_id:'OtherVolume'}});
  assert.equal(r.code,'ROLLBACK_RECEIPT_UNVERIFIED'); assert.equal(f.reads(),0);
});
test('removed indicator ID cannot be the original Volume ID', async () => {
  const f=fixture(); const r=await f.run({rollbackReceipt:{...receipt,removed_entity_id:'aMROG1'}});
  assert.equal(r.code,'ROLLBACK_RECEIPT_UNVERIFIED'); assert.equal(f.reads(),0);
});
test('omitted Volume input baseline refuses without browser access', async () => {
  const f=fixture(); const r=await f.run({expected:{...expected,studies:[{id:'aMROG1',name:'Volume'}]}});
  assert.equal(r.code,'RESTORELAB_BASELINE_UNVERIFIED'); assert.equal(f.reads(),0);
});
test('duplicate Volume input IDs refuse without browser access', async () => {
  const f=fixture(); const r=await f.run({expected:{...expected,studies:[{
    id:'aMROG1',name:'Volume',inputs:[{id:'length',value:20},{id:'length',value:30}]
  }]}});
  assert.equal(r.code,'RESTORELAB_BASELINE_UNVERIFIED'); assert.equal(f.reads(),0);
});
test('unobservable Volume input values refuse without browser access', async () => {
  const f=fixture();
  for(const value of [null,{length:20},Number.NaN]) {
    const r=await f.run({expected:{...expected,studies:[{
      id:'aMROG1',name:'Volume',inputs:[{id:'length',value}]
    }]}});
    assert.equal(r.code,'RESTORELAB_BASELINE_UNVERIFIED');
  }
  assert.equal(f.reads(),0);
});
