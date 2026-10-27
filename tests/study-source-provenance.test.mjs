import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import tools, { studyPineIdentity, checkedStudyIdentity, captureStudySourceProvenance } from '../src/features/study-source-provenance.mjs';

const id = 'SIVQwR';
const name = 'Couto QTF v2.9x + C123 PROJECTED RESEARCH v0.4';
const savedId = 'USER;630d9b8bdd6048b4bc1bb2ab746fd583';
const source = '//@version=6\nindicator("C123 source")\n';
const hash = createHash('sha256').update(source).digest('hex');
const args = {target_id:'tabC123',expected_layout_id:'ljpmBuY2',entity_id:id,
  expected_study_name:name,saved_script_id:savedId,saved_version:'3.0',expected_saved_source_sha256:hash};
const chart = {ok:true,layout_id:'ljpmBuY2',symbol:'CBOT_MINI_DL:YM1!',resolved_symbol:'CBOT_MINI:YM1!',
  timeframe:'15',session:'regular',studies:[{entity_id:'5bzZl7',name:'Unnamed Study',addressable:true},{entity_id:id,name,addressable:true}]};
const opaqueText = 'PRIVATE_COMPILED_TEXT_MUST_NOT_LEAK__'.repeat(50);
const native = {ok:true,entity_id:id,inputs:[{id:'text',value:opaqueText},{id:'pineId',value:savedId},
  {id:'pineVersion',value:'3.0'},{id:'pineFeatures',value:'{"import":1}'}]};
const saved = {ok:true,script_id:savedId,version:'3.0',title:name,source,source_sha256:hash};
function ctx({firstChart=chart,firstNative=native,sourceResult=saved,secondNative=native,secondChart=chart,targetId='tabC123'}={}) {
  let state=0, inputs=0;
  return {targetId,calls:[],async callTool(tool,params) {
    this.calls.push({tool,params});
    if (tool==='chart_get_state') return state++===0?firstChart:secondChart;
    if (tool==='indicator_get_inputs') return inputs++===0?firstNative:secondNative;
    if (tool==='pine_get_saved_source') return sourceResult;
    throw new Error('Unexpected tool '+tool);
  }};
}
const run = (patch={},overrides={}) => captureStudySourceProvenance({...args,...patch},ctx(overrides));

test('live-shaped native pineId/pineVersion matches saved source and exact chart identity',async()=>{
  const c=ctx(); const r=await captureStudySourceProvenance(args,c);
  assert.equal(r.source_provenance_status,'native_study_id_version_matches_verified_saved_source');
  assert.equal(r.native_study_to_saved_script_version_verified,true);
  assert.equal(r.chart_identity_stable,true);
  assert.equal(r.native_pine_metadata_stable,true);
  assert.equal(r.compiled_runtime_byte_equivalence_verified,false);
  assert.equal(r.compiled_runtime_source_sha256,null);
  assert.equal(r.saved_source.content_hash_independently_recomputed,true);
  assert.deepEqual(c.calls.map(x=>x.tool), ['chart_get_state','indicator_get_inputs','pine_get_saved_source','indicator_get_inputs','chart_get_state']);
});
test('no raw compiled text or source returned to the caller',async()=>{
  const result=await run();
  assert.ok(!JSON.stringify(result).includes('PRIVATE_COMPILED_TEXT'));
  assert.ok(!JSON.stringify(result).includes('indicator("C123 source")'));
  assert.equal(result.native_drawing_to_absolute_time,'unverified');
  assert.equal(result.native_drawing_to_screenshot_pixels,'unverified');
});
test('same chart observed across both reads does not imply atomic capture',async()=>{
  const r=await run(); assert.equal(r.capture_atomic,false);
});
test('native field extraction ignores opaque IL text and unrelated fields',()=>{
  assert.deepEqual(studyPineIdentity(native,id),{status:'native_fields_observed',pine_id:savedId,pine_version:'3.0'});
});
test('duplicate pineId fails closed',async()=>{
  const inputs=structuredClone(native); inputs.inputs.push({id:'pineId',value:savedId});
  const r=await run({}, {firstNative:inputs,secondNative:inputs});
  assert.equal(r.native_study_to_saved_script_version_verified,false);
  assert.equal(r.source_provenance_status,'native_metadata_missing_or_invalid_no_claim');
});
test('duplicate pineVersion fails closed',async()=>{
  const inputs=structuredClone(native);inputs.inputs.push({id:'pineVersion',value:'3.0'});
  const r=await run({}, {firstNative:inputs,secondNative:inputs});
  assert.equal(r.native_study_to_saved_script_version_verified,false);
});
test('missing pineId or pineVersion cannot establish binding',async()=>{
  for(const key of ['pineId','pineVersion']){
    const inputs=structuredClone(native);inputs.inputs=inputs.inputs.filter(x=>x.id!==key);
    const r=await run({}, {firstNative:inputs,secondNative:inputs});
    assert.equal(r.native_study_to_saved_script_version_verified,false);
  }
});
test('malformed native script ID/version is not accepted',async()=>{
  for(const [key,value] of [['pineId','../../unexpected'],['pineVersion','draft'],['pineVersion','3.0\n']]){
    const inputs=structuredClone(native);inputs.inputs.find(x=>x.id===key).value=value;
    const r=await run({}, {firstNative:inputs,secondNative:inputs});
    assert.equal(r.native_study_to_saved_script_version_verified,false);
  }
});
test('mismatching native script ID fails without adopting unexpected ID',async()=>{
  const inputs=structuredClone(native);inputs.inputs.find(x=>x.id==='pineId').value='USER;different';
  const r=await run({}, {firstNative:inputs,secondNative:inputs});
  assert.equal(r.source_provenance_status,'native_metadata_mismatch_no_claim');
  assert.equal(r.native_study_to_saved_script_version_verified,false);
  assert.ok(!JSON.stringify(r).includes('USER;different'));
});
test('mismatching native script version is not attested',async()=>{
  const inputs=structuredClone(native);inputs.inputs.find(x=>x.id==='pineVersion').value='4.0';
  const r=await run({}, {firstNative:inputs,secondNative:inputs});
  assert.equal(r.source_provenance_status,'native_metadata_mismatch_no_claim');
});
test('native version changes between reads suppresses binding',async()=>{
  const after=structuredClone(native);after.inputs.find(x=>x.id==='pineVersion').value='4.0';
  const r=await run({}, {secondNative:after});
  assert.equal(r.source_provenance_status,'native_metadata_changed_no_claim');
  assert.equal(r.native_pine_metadata_stable,false);
});
test('native script ID changes between reads suppresses binding',async()=>{
  const after=structuredClone(native);after.inputs.find(x=>x.id==='pineId').value='USER;different';
  const r=await run({}, {secondNative:after});
  assert.equal(r.source_provenance_status,'native_metadata_changed_no_claim');
});
test('chart timeframe changes between reads suppresses provenance',async()=>{
  const after={...chart,timeframe:'5'};const r=await run({}, {secondChart:after});
  assert.equal(r.source_provenance_status,'chart_identity_changed_no_claim');
  assert.equal(r.observed_chart_identity,null);
});
test('chart symbol changes between reads suppresses provenance',async()=>{
  const after={...chart,symbol:'CME_MINI:ES1!'};const r=await run({}, {secondChart:after});
  assert.equal(r.chart_identity_stable,false);
  assert.equal(r.native_study_to_saved_script_version_verified,false);
});
test('wrong study ID/name or unavailable chart fails before source read',async()=>{
  for(const c of [
    {...chart,studies:[{entity_id:id,name:'Unexpected name',addressable:true}]},
    {...chart,studies:[{entity_id:id,name,addressable:false}]},
    {...chart,studies:[]},
    {...chart,layout_id:'OTHER'},
    {...chart,studies:[{entity_id:id,name,addressable:true},{entity_id:id,name,addressable:true}]}
  ]){
    const x=ctx({firstChart:c});
    await assert.rejects(captureStudySourceProvenance(args,x));
    assert.deepEqual(x.calls.map(z=>z.tool),['chart_get_state']);
  }
});
test('wrong study in second chart read must never attest',async()=>{
  const x=ctx({secondChart:{...chart,studies:[]}});
  await assert.rejects(captureStudySourceProvenance(args,x), e=>e.code==='STUDY_IDENTITY_MISMATCH');
});
test('wrong pinned source hash fails before second native read',async()=>{
  const x=ctx({sourceResult:{...saved,source_sha256:'f'.repeat(64)}});
  await assert.rejects(captureStudySourceProvenance(args,x), e=>e.code==='SAVED_SOURCE_MISMATCH');
  assert.deepEqual(x.calls.map(z=>z.tool),['chart_get_state','indicator_get_inputs','pine_get_saved_source']);
});
test('native saved source differs despite claimed digest must fail',async()=>{
  const x=ctx({sourceResult:{...saved,source:'//@version=6\nindicator("different")'}});
  await assert.rejects(captureStudySourceProvenance(args,x),e=>e.code==='SAVED_SOURCE_MISMATCH');
});
test('wrong saved script ID, version or title fail closed',async()=>{
  for(const sourceResult of [{...saved,script_id:'USER;OTHER'},{...saved,version:'4.0'},{...saved,title:'Wrong title'}]){
    await assert.rejects(run({}, {sourceResult}),e=>e.code==='SAVED_SOURCE_MISMATCH');
  }
});
test('source request wrong target or incomplete args rejected without tool reads',async()=>{
  for(const patch of [{target_id:'wrong'},{saved_script_id:'../../wrong'},{saved_version:'draft'},
    {expected_saved_source_sha256:'INVALID'},{expected_layout_id:''},{expected_study_name:''}]){
    const c=ctx();await assert.rejects(captureStudySourceProvenance({...args,...patch},c));
    assert.equal(c.calls.length,0);
  }
});
test('invalid input response is not confused with zero/empty study evidence',async()=>{
  const r=await run({}, {firstNative:{ok:false,entity_id:id,inputs:[]}});
  assert.equal(r.source_provenance_status,'native_metadata_missing_or_invalid_no_claim');
  assert.equal(r.native_study_to_saved_script_version_verified,false);
});
test('descriptor is read-only and requires all exact identities',()=>{
  const d=tools[0]; assert.equal(d.mutates,false); assert.equal(d.name,'data_get_study_source_provenance');
  assert.deepEqual(d.inputSchema.required,['target_id','expected_layout_id','entity_id','expected_study_name','saved_script_id','saved_version','expected_saved_source_sha256']);
  assert.equal(d.inputSchema.additionalProperties,false);
});
test('native chart identity helper rejects unaddressable/stale study',()=>{
  assert.throws(()=>checkedStudyIdentity({...chart,studies:[{entity_id:id,name,addressable:false}]},'ljpmBuY2',id,name));
});
