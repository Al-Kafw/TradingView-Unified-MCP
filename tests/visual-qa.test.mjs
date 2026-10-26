import test from 'node:test';
import assert from 'node:assert/strict';
import { captureVisualQaEvidence } from '../src/features/visual-qa.mjs';
import visualTools from '../src/features/visual-qa.mjs';

const PNG = 'iVBORw0KGgo='; // signature-only fixture: validates transport boundary
const chart = {
  ok: true,layout_id:'RESEARCH',symbol:'CBOT_MINI_DL:YM1!',resolved_symbol:'CBOT_MINI:YM1!',
  timeframe:'30',session:'regular',study:{entity_id:'abc',name:'Research'},
  coverage:'complete',all_graphics_returned_in_this_call:true,
  graphics:{lines:{status:'complete',total:1,returned:1,items:[{id:1,x1:23,y1:40,x1_time_unix_seconds:null}]},
    labels:{status:'complete',total:0,returned:0,items:[]}}
};
const args={target_id:'tab1',expected_layout_id:'RESEARCH',entity_id:'abc'};
const makeCtx=(snapshots=[chart,chart],picture={mimeType:'image/png',data:PNG})=>{
  const calls=[]; let snapIndex=0;
  return {
    calls,targetId:'tab1',
    callTool:async(name,params)=>{calls.push({name,params});return snapshots[snapIndex++] ?? chart;},
    browser:{capture:async id=>{calls.push({capture:id});return picture;}}
  };
};

test('visual evidence returns PNG and exact native coordinates after matching bracket reads', async()=>{
  const ctx=makeCtx();
  const r=await captureVisualQaEvidence(args,ctx);
  assert.equal(r.capture_consistency,'matching_bracket_reads');
  assert.equal(r.all_native_graphics_returned,true);
  assert.equal(r.graphics.lines.items[0].x1,23);
  assert.equal(r.graphics.lines.items[0].x1_time_unix_seconds,null);
  assert.equal(r.native_coordinate_mapping,'unverified_no_pixel_or_time_inference');
  assert.equal(r.image.data,PNG);
  assert.deepEqual(ctx.calls.map(c=>c.name||'capture'),['data_get_qa_snapshot','capture','data_get_qa_snapshot']);
  assert.equal(ctx.calls[0].params.expected_layout_id,'RESEARCH');
});

test('modified graphics across screenshot fails closed and suppresses PNG association',async()=>{
  const changed=structuredClone(chart);changed.graphics.lines.items[0].y1=55;
  const r=await captureVisualQaEvidence(args,makeCtx([chart,changed]));
  assert.equal(r.capture_consistency,'mismatch_do_not_correlate');
  assert.equal(r.graphics,null);assert.equal(r.image,undefined);
  assert.equal(r.all_native_graphics_returned,false);
});

test('changing chart symbol suppresses combined evidence even if drawings match',async()=>{
  const changed={...chart,symbol:'CME_MINI:ES1!'};
  const r=await captureVisualQaEvidence(args,makeCtx([chart,changed]));
  assert.equal(r.chart_identity_consistent_at_both_reads,false);
  assert.equal(r.graphics,null);assert.equal(r.image,undefined);
});

test('partially readable native collections remain partial despite matching image',async()=>{
  const partial=structuredClone(chart);partial.coverage='partial';
  partial.all_graphics_returned_in_this_call=false;
  partial.graphics.lines={status:'unavailable',total:null,items:[]};
  const r=await captureVisualQaEvidence(args,makeCtx([partial,partial]));
  assert.equal(r.capture_consistency,'matching_bracket_reads');
  assert.equal(r.graphics_coverage,'partial');
  assert.equal(r.all_native_graphics_returned,false);
});

test('reject unknown or unsafe browser target arguments before screenshot',async()=>{
  const ctx=makeCtx();ctx.targetId='other';
  await assert.rejects(captureVisualQaEvidence(args,ctx),e=>e.code==='TARGET_MISMATCH');
  assert.equal(ctx.calls.length,0);
});

test('reject invalid or oversized graphics cap',async()=>{
  for(const n of [0,201,1.25]){
    const ctx=makeCtx();await assert.rejects(captureVisualQaEvidence({...args,max_items_per_kind:n},ctx));
    assert.equal(ctx.calls.length,0);
  }
});

test('reject screenshot that is not a properly labelled PNG',async()=>{
  const ctx=makeCtx(undefined,{mimeType:'image/jpeg',data:PNG});
  await assert.rejects(captureVisualQaEvidence(args,ctx),e=>e.code==='SCREENSHOT_UNAVAILABLE');
});

test('reject image with wrong magic header and do not claim evidence',async()=>{
  const ctx=makeCtx(undefined,{mimeType:'image/png',data:Buffer.from('notapngfile').toString('base64')});
  await assert.rejects(captureVisualQaEvidence(args,ctx),e=>e.code==='SCREENSHOT_UNUSABLE');
});

test('new tool registered as read-only with exact identities mandatory',()=>{
  const d=visualTools[0];assert.equal(d.mutates,false);
  assert.ok(d.inputSchema.required.includes('target_id'));
  assert.ok(d.inputSchema.required.includes('expected_layout_id'));
  assert.ok(d.inputSchema.required.includes('entity_id'));
  assert.equal(d.inputSchema.properties.max_items_per_kind.maximum,200);
});

