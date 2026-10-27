import test from 'node:test';
import assert from 'node:assert/strict';
import tools,{captureCoordinateProvenance,coordinateAnchorPage} from '../src/features/coordinate-provenance.mjs';

const scene={ok:true,layout_id:'QA_LAYOUT',symbol:'CBOT_MINI_DL:YM1!',
  resolved_symbol:'CBOT_MINI:YM1!',timeframe:'5',session:'regular',
  study:{entity_id:'studyA',name:'QTF C123 research'},coverage:'complete',
  all_graphics_returned_in_this_call:true,graphics:{lines:{status:'complete',total:1,items:[{id:1,x1:0,x2:12,x1_time_unix_seconds:null}]},
    labels:{status:'complete',total:1,items:[{id:2,x:2,text:'20:30',x_time_unix_seconds:null}]}}};
const anchor={ok:true,identity:{layout_id:scene.layout_id,symbol:scene.symbol,resolved_symbol:scene.resolved_symbol,
  timeframe:scene.timeframe,session:scene.session},requested_entity_id:'studyA',first_bar_index:0,last_bar_index:300,
  bar_anchors:[{loaded_bar_index:0,loaded_bar_time_unix_seconds:1793095200,
    chart_local_x_if_index_roundtrip_verified:10,index_to_chart_x_roundtrip_verified:true}],
  scale_verification:'chart_bar_index_to_local_x_roundtrip_observed'};
const args={target_id:'tabA',expected_layout_id:'QA_LAYOUT',entity_id:'studyA'};
function ctx(first=scene,probe=anchor,second=scene){let n=0;return {targetId:'tabA',
  calls:[], async callTool(name,a){this.calls.push(name);assert.equal(name,'data_get_qa_snapshot');assert.equal(a.entity_id,'studyA');return n++===0?first:second;},
  async callPage(fn,a){this.calls.push('page');assert.equal(fn,coordinateAnchorPage);return probe;}};}

function pageFixture({withScale=true, wrongLayout=false, noStudy=false}={}){
  const info={pro_name:'CBOT_MINI:YM1!'};
  const bars={size:()=>301,firstIndex:()=>0,lastIndex:()=>300,valueAt:i=>[1793000000+i*300,1,2,0,1]};
  const scale=withScale?{indexToCoordinate:i=>i*4+10,coordinateToIndex:x=>(x-10)/4}:null;
  const main={bars:()=>bars,symbolInfo:()=>info,sessionId:()=> 'regular'};
  const model={mainSeries:()=>main,dataSources:()=>noStudy?[]:[{id:()=> 'studyA'}],timeScale:()=>scale};
  const chart={_chartWidget:{model:()=>({model:()=>model})},symbol:()=>scene.symbol,
    resolution:()=>scene.timeframe,getTimeScale:()=>({coordinateToTime:x=>1793000000+((x-10)/4)*300})};
  return {TradingViewApi:{_activeChartWidgetWV:{value:()=>chart},
    _chartWidgetCollection:{metaInfo:{uid:{value:()=>wrongLayout?'OTHER':'QA_LAYOUT'}}}}};
}
async function page(options){const prior=globalThis.window;globalThis.window=pageFixture(options);try{return coordinateAnchorPage({expected_layout_id:'QA_LAYOUT',entity_id:'studyA'});}finally{globalThis.window=prior;}}

test('native candle index and timestamp anchors remain separate from Pine X',async()=>{
  const r=await page();assert.equal(r.bar_readiness,'loaded');assert.equal(r.bar_anchors.length,5);
  assert.equal(r.scale_verification,'chart_bar_index_to_local_x_roundtrip_observed');
  assert.equal(r.bar_anchors[0].index_to_chart_x_roundtrip_verified,true);
  assert.equal(r.bar_anchors[0].public_coordinate_time_matches_loaded_bar,true);
  assert.equal(r.native_drawing_x_coordinate_basis,'unresolved_not_assumed_shared_with_chart_bar_index');
  assert.equal(r.chart_local_pixels_are_screenshot_pixels,false);
});
test('unavailable internal scale still reports verified OHLC bar times, never drawing mapping',async()=>{
  const r=await page({withScale:false});assert.equal(r.scale_verification,'loaded_bar_index_to_time_only');
  assert.equal(r.bar_anchors[0].chart_local_x_if_index_roundtrip_verified,null);
});
test('wrong layout fails before extracting time-scale evidence',async()=>{
  const r=await page({wrongLayout:true});assert.equal(r.ok,false);assert.equal(r.code,'LAYOUT_MISMATCH');
});
test('not-observed study fails without treating missing study as empty data',async()=>{
  const r=await page({noStudy:true});assert.equal(r.ok,false);assert.equal(r.code,'STUDY_NOT_OBSERVED');
});
test('matched pre-post native snapshots produce observational statistics but no mappings',async()=>{
  const c=ctx();const r=await captureCoordinateProvenance(args,c);
  assert.equal(r.evidence_status,'matching_bracket_reads');assert.equal(r.mapping_approved,false);
  assert.equal(r.native_drawing_x_to_time,'unverified');assert.equal(r.native_drawing_x_to_pixel,'unverified');
  assert.equal(r.graphic_native_x_statistics.numeric_collisions_with_loaded_bar_index,3);
  assert.deepEqual(c.calls,['data_get_qa_snapshot','page','data_get_qa_snapshot']);
});
test('identical numeric Pine X and OHLC index is coincidence only',async()=>{
  const r=await captureCoordinateProvenance(args,ctx());
  assert.equal(r.graphic_native_x_statistics.collision_interpretation,'numeric_coincidence_only_not_mapping_evidence');
  assert.equal(r.chart_time_scale_evidence.bar_anchors[0].loaded_bar_index,0);
  assert.equal(r.mapping_approved,false);
});
test('mismatched native graphics suppress all correlated evidence',async()=>{
  const change=structuredClone(scene);change.graphics.labels.items[0].x=6;
  const r=await captureCoordinateProvenance(args,ctx(scene,anchor,change));
  assert.equal(r.evidence_status,'mismatch_no_correlated_evidence');
  assert.equal(r.chart_time_scale_evidence,null);assert.equal(r.graphic_native_x_statistics,null);
});
test('chart identity mismatch suppresses coordinate evidence even with matching graphics',async()=>{
  const changed={...anchor,identity:{...anchor.identity,timeframe:'30'}};
  const r=await captureCoordinateProvenance(args,ctx(scene,changed,scene));
  assert.equal(r.chart_identity_consistent_at_both_reads,false);
  assert.equal(r.chart_time_scale_evidence,null);
});
test('partial native read is never reported as complete',async()=>{
  const partial=structuredClone(scene);partial.coverage='partial';partial.all_graphics_returned_in_this_call=false;
  partial.graphics.lines.status='unavailable';
  const r=await captureCoordinateProvenance(args,ctx(partial,anchor,partial));
  assert.equal(r.graphics_coverage,'partial');assert.equal(r.all_native_graphics_returned,false);
  assert.equal(r.graphic_native_x_statistics.sampled_only,true);
});
test('invalid caps and target mismatch are rejected before reading chart',async()=>{
  for(const cap of [0,201,1.1]){
    const c=ctx();await assert.rejects(captureCoordinateProvenance({...args,max_items_per_kind:cap},c));
    assert.equal(c.calls.length,0);
  }
  const c=ctx();c.targetId='other';await assert.rejects(captureCoordinateProvenance(args,c),e=>e.code==='TARGET_MISMATCH');
});
test('required exact IDs and read-only schema are declared',()=>{
  const t=tools[0];assert.equal(t.mutates,false);
  assert.deepEqual(t.inputSchema.required,['target_id','expected_layout_id','entity_id']);
  assert.equal(t.inputSchema.properties.max_items_per_kind.maximum,200);
});
