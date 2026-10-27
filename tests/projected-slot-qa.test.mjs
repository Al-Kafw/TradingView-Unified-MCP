import test from 'node:test';
import assert from 'node:assert/strict';
import tools, {correlateProjectedSlots,captureProjectedSlotQa} from '../src/features/projected-slot-qa.mjs';

const script_id='USER;630d9b8bdd6048b4bc1bb2ab746fd583';
const source_sha='cf32784699b32a9bb1965325a00e1f3546d23bf8f567d272ab793d4eb69344ee';
const name='Couto QTF v2.9x + C123 PROJECTED RESEARCH v0.4';
const times=[['07:30',2],['08:00',5],['09:30',14],['10:00',17],['12:00',30],['12:30',33]];
const roles=[['C1',14],['C2↑',30],['C3',33],['C1',2],['C2↓',14],['C3',17],['C2↓',2],['C3',5]];
const labels=[...times.map(([text,x],i)=>({id:10+i,text,x, x_time_unix_seconds:null})),
  ...roles.map(([text,x],i)=>({id:100+i,text,x,x_time_unix_seconds:null}))];
const snapshot={ok:true,layout_id:'ljpmBuY2',symbol:'CBOT_MINI_DL:YM1!',resolved_symbol:'CBOT_MINI:YM1!',
  timeframe:'15',session:'regular',study:{entity_id:'SIVQwR',name},coverage:'complete',
  all_graphics_returned_in_this_call:true,
  graphics:{lines:{status:'complete',total:1,returned:1,all_items_returned_in_this_call:true,items:[{id:5,x1:14,x2:14}]},
    labels:{status:'complete',total:labels.length,returned:labels.length,all_items_returned_in_this_call:true,items:labels}}};
const args={target_id:'tab1',expected_layout_id:'ljpmBuY2',entity_id:'SIVQwR',expected_study_name:name,max_items_per_kind:200};
function ctx(first=snapshot,second=snapshot,source={ok:true,script_id,version:'3.0',source_sha256:source_sha,title:name}){
  let index=0;
  return {targetId:'tab1',calls:[],async callTool(tool,options){this.calls.push({tool,options});return tool==='pine_get_saved_source'?source:index++===0?first:second;}};
}

test('live-shaped 8 roles all uniquely share native X with projected clock labels',()=>{
  const r=correlateProjectedSlots(labels);
  assert.equal(r.status,'all_observed_roles_uniquely_aligned');
  assert.equal(r.role_label_count,8);
  assert.equal(r.unique_clock_alignments,8);
  assert.equal(r.projected_clock_label_count,6);
  assert.deepEqual(r.alignments.slice(0,3).map(a=>a.clock_text),['09:30','12:00','12:30']);
  assert.equal(r.alignments[0].native_x_to_unix_time,null);
  assert.equal(r.alignments[0].screenshot_pixel_x,null);
});
test('separate valid C123 role events at same clock slot are not improperly collapsed',()=>{
  const r=correlateProjectedSlots(labels);
  assert.equal(r.alignments.filter(a=>a.native_x===14).length,2);
  assert.ok(r.alignments.filter(a=>a.native_x===14).every(a=>a.clock_text==='09:30'));
});
test('two different clocks at one X are ambiguous, never picked arbitrarily',()=>{
  const r=correlateProjectedSlots([...labels,{id:999,text:'09:00',x:14}]);
  assert.equal(r.status,'alignment_incomplete_or_ambiguous');
  assert.equal(r.ambiguous_clock_alignments,2);
  assert.equal(r.alignments.find(a=>a.native_x===14).clock_text,null);
});
test('two identical clock labels at one X are also ambiguous',()=>{
  const r=correlateProjectedSlots([...labels,{id:999,text:'09:30',x:14}]);
  assert.equal(r.ambiguous_clock_alignments,2);
});
test('unmatched role is not silently assigned nearest clock',()=>{
  const r=correlateProjectedSlots([{id:1,text:'C2↑',x:11},{id:2,text:'09:30',x:14}]);
  assert.equal(r.missing_clock_alignments,1);
  assert.equal(r.alignments[0].clock_text,null);
});
test('no C123 role labels is no evidence rather than vacuous success',()=>{
  const r=correlateProjectedSlots([{id:1,text:'09:30',x:14}]);
  assert.equal(r.status,'no_role_labels_observed');
});
test('reject malformed, out-of-range, and nonclock captions',()=>{
  const r=correlateProjectedSlots([{id:1,text:'C1',x:14},
    {id:2,text:'24:10',x:14},{id:3,text:'12:60',x:14},
    {id:4,text:'09:30:01',x:14},{id:5,text:'TF: 30M',x:14},
    {id:6,text:'09:30',x:'14'}]);
  assert.equal(r.projected_clock_label_count,0);
  assert.equal(r.missing_clock_alignments,1);
});
test('reject C123 text appearing in tooltip-like or long labels',()=>{
  const r=correlateProjectedSlots([{id:1,text:'C1 reference',x:14},{id:2,text:'C2 sweep/reclaim',x:14},{id:3,text:'C3 observation extension',x:14},{id:4,text:'09:30',x:14}]);
  assert.equal(r.status,'no_role_labels_observed');
});
test('bracketed native snapshots produce scoped slot evidence without screenshots or timestamps',async()=>{
  const c=ctx();const r=await captureProjectedSlotQa(args,c);
  assert.equal(r.capture_consistency,'matching_bracket_reads');
  assert.equal(r.slot_alignment_verified,true);
  assert.equal(r.projected_slot_correspondence.unique_clock_alignments,8);
  assert.equal(r.source_evidence.status,'not_checked');
  assert.equal(r.screenshot_captured,false);
  assert.equal(r.native_drawing_to_absolute_time,'unverified');
  assert.deepEqual(c.calls.map(x=>x.tool),['data_get_qa_snapshot','data_get_qa_snapshot']);
});
test('incomplete native labels cannot support complete correspondence claim',async()=>{
  const partial=structuredClone(snapshot);partial.graphics.labels.status='truncated';partial.graphics.labels.all_items_returned_in_this_call=false;partial.graphics.labels.total=labels.length+1;
  partial.coverage='partial';partial.all_graphics_returned_in_this_call=false;
  const r=await captureProjectedSlotQa(args,ctx(partial,partial));
  assert.equal(r.slot_alignment_verified,false);
  assert.equal(r.slot_check_status,'labels_not_complete');
  assert.equal(r.projected_slot_correspondence,null);
});
test('source and study identity mismatch fail closed',async()=>{
  const altered=structuredClone(snapshot);altered.study.name='Unexpected script';
  await assert.rejects(captureProjectedSlotQa(args,ctx(altered,altered)),e=>e.code==='STUDY_IDENTITY_MISMATCH');
});
test('changing graphics between reads suppresses matched evidence',async()=>{
  const altered=structuredClone(snapshot);altered.graphics.labels.items[1].x=500;
  const r=await captureProjectedSlotQa(args,ctx(snapshot,altered));
  assert.equal(r.capture_consistency,'mismatch_no_correlated_evidence');
  assert.equal(r.projected_slot_correspondence,null);
  assert.equal(r.slot_alignment_verified,false);
});
test('changing symbol/timeframe between reads suppresses matched evidence',async()=>{
  const altered={...snapshot,timeframe:'30'};
  const r=await captureProjectedSlotQa(args,ctx(snapshot,altered));
  assert.equal(r.identity_consistent_at_both_reads,false);
  assert.equal(r.projected_slot_correspondence,null);
});
test('saved source exact version/title/SHA check explicitly does not prove chart-study binding',async()=>{
  const c=ctx();
  const r=await captureProjectedSlotQa({...args,saved_script_id:script_id,saved_version:'3.0',expected_saved_source_sha256:source_sha},c);
  assert.equal(r.source_evidence.status,'saved_source_version_sha_and_title_verified');
  assert.equal(r.source_evidence.saved_source_to_loaded_study_binding_verified,false);
  assert.equal(r.slot_alignment_verified,true);
  assert.deepEqual(c.calls.map(x=>x.tool),['pine_get_saved_source','data_get_qa_snapshot','data_get_qa_snapshot']);
});
test('wrong saved source SHA or title blocks the entire check before graphics collection',async()=>{
  for(const source of [
    {ok:true,script_id,version:'3.0',source_sha256:'f'.repeat(64),title:name},
    {ok:true,script_id,version:'3.0',source_sha256:source_sha,title:'Other Script'}
  ]){
    const c=ctx(snapshot,snapshot,source);
    await assert.rejects(captureProjectedSlotQa({...args,saved_script_id:script_id,saved_version:'3.0',expected_saved_source_sha256:source_sha},c),e=>e.code==='SAVED_SOURCE_MISMATCH');
    assert.deepEqual(c.calls.map(x=>x.tool),['pine_get_saved_source']);
  }
});
test('partial saved source guard, unsafe caps and target mismatch are rejected before reads',async()=>{
  const variants=[{...args,saved_script_id:script_id},{...args,max_items_per_kind:0},
    {...args,max_items_per_kind:201},{...args,max_items_per_kind:1.5}];
  for(const a of variants){const c=ctx();await assert.rejects(captureProjectedSlotQa(a,c));assert.equal(c.calls.length,0);}
  const c=ctx();c.targetId='other';await assert.rejects(captureProjectedSlotQa(args,c),e=>e.code==='TARGET_MISMATCH');assert.equal(c.calls.length,0);
});
test('read-only descriptor requires exact identities and is bounded',()=>{
  const d=tools[0];
  assert.equal(d.name,'data_get_projected_slot_qa');
  assert.equal(d.mutates,false);
  assert.deepEqual(d.inputSchema.required,['target_id','expected_layout_id','entity_id','expected_study_name']);
  assert.equal(d.inputSchema.properties.max_items_per_kind.maximum,200);
});
