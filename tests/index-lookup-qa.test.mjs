import test from 'node:test';
import assert from 'node:assert/strict';
import definitions, {c123IndexLookupPage,checkIndexLookupResult,captureC123IndexLookupQa} from '../src/features/index-lookup-qa.mjs';

const TITLE='Couto QTF v2.9x + C123 PROJECTED RESEARCH v0.4';
const ID='USER;630d9b8bdd6048b4bc1bb2ab746fd583';
const SHA='cf32784699b32a9bb1965325a00e1f3546d23bf8f567d272ab793d4eb69344ee';
const a={target_id:'TARGET',expected_layout_id:'ljpmBuY2',entity_id:'SIVQwR',
  expected_study_name:TITLE,saved_script_id:ID,saved_version:'3.0',expected_saved_source_sha256:SHA};
const roles=[{role:'C1',native_x:14,clock_caption:'10:00'},
  {role:'C2↓',native_x:27,clock_caption:'12:00'},
  {role:'C3',native_x:30,clock_caption:'12:30'}];
function fixture({shiftLookup=false,secondSource=false}={}){
  const indexes=[298];
  for(let i=0;i<6;i++) indexes.push(307+4*i,308+4*i,309+4*i);
  indexes.push(330); // special, non-candle lookup entry
  for(let i=6;i<26;i++) indexes.push(307+4*i,308+4*i,309+4*i);
  if(shiftLookup) indexes[3]+=1;
  const left=i=>i<6?1+3*i:20+3*(i-6);
  const boxes=Array.from({length:26},(_,i)=>[i+1,{x1:left(i),x2:left(i)+2}]);
  const lines=Array.from({length:56},(_,i)=>[i+50,{x1:left(i%26)+1,x2:left(i%26)+1}]);
  const labels=Array.from({length:51},(_,i)=>[i+110,{x:i===49?0:i===50?19:(left(i%26)+1)}]);
  const map=(pairs)=>new Map(pairs);
  const collect = pairs => ({get:()=>({_primitivesDataById:map(pairs)})});
  const study={id:()=>a.entity_id,metaInfo:()=>({description:TITLE}),
    getInputValues:()=>[
      {id:'pineId',value:ID},{id:'pineVersion',value:'3.0'},
      {id:'in_0',value:8},{id:'in_1',value:2},{id:'in_3',value:1},{id:'in_6',value:true}
    ],
    _graphics:{_indexes:indexes,_primitivesCollection:{
      dwgboxes:{get:()=>collect(boxes)},dwglines:{get:()=>collect(lines)},dwglabels:{get:()=>collect(labels)}
    }}
  };
  // Real TradingView uses a separate public study API for Pine inputs.
  // Native dataSources expose study graphics but NOT getInputValues().
  const publicStudy={id:a.entity_id,name:TITLE,getInputValues:study.getInputValues};
  delete study.getInputValues;
  const scale={indexToCoordinate:i=>i*8.3-100,coordinateToIndex:x=>(x+100)/8.3};
  const main={bars:()=>({firstIndex:()=>0,lastIndex:()=>299,size:()=>300})};
  const model={dataSources:()=>[study],mainSeries:()=>main,timeScale:()=>scale};
  const chart={resolution:()=> '15',symbol:()=> 'CBOT_MINI_DL:YM1!',
    getAllStudies:()=>[{id:a.entity_id,name:TITLE}],
    getStudyById:id=>id===a.entity_id?publicStudy:null,
    _chartWidget:{model:()=>({model:()=>model})}};
  globalThis.window={TradingViewApi:{_activeChartWidgetWV:{value:()=>chart},
    _chartWidgetCollection:{metaInfo:{uid:'ljpmBuY2'}}}};
  return {indexes,boxes,lines,labels,study,publicStudy,chart,scale,main,model};
}
function sourceResult(){return {ok:true,chart_identity_stable:true,native_pine_metadata_stable:true,
  native_study_to_saved_script_version_verified:true,saved_source:{source_sha256:SHA},
  observed_chart_identity:{layout_id:a.expected_layout_id,symbol:'CBOT_MINI_DL:YM1!',timeframe:'15',entity_id:a.entity_id}};}
function slotResult(){return {slot_alignment_verified:true,capture_consistency:'matching_bracket_reads',
  graphics_coverage:'complete',all_native_graphics_returned:true,
  projected_slot_correspondence:{alignments:roles.map(r=>({role:r.role,native_x:r.native_x,clock_text:r.clock_caption}))}};}
function ctx({p0=sourceResult(),p1=sourceResult(),slots=slotResult(),page1=null,page2=null,targetId='TARGET'}={}){
  let sourced=0,pagecount=0;
  return {targetId,calls:[],async callTool(name,args){this.calls.push(name);
    if(name==='data_get_study_source_provenance')return sourced++===0?p0:p1;
    if(name==='data_get_projected_slot_qa')return slots;
    throw Error('UNEXPECTED_NESTED_TOOL');
  },async callPage(fn,args){this.calls.push('PAGE');
    return ++pagecount===1?(page1??fn(args)):(page2??fn(args));
  }};
}
const page=()=>c123IndexLookupPage(aWithRoles());
const aWithRoles=()=>({...a,roles});

test('C123 live-shaped lookup maps all graphic native X references and 7 boxes',()=>{
  fixture();const p=page();assert.equal(p.ok,true);assert.equal(p.lookup.length,80);
  assert.equal(p.primitives.boxes,26);assert.equal(p.primitives.lines,56);assert.equal(p.primitives.labels,51);
  assert.equal(p.primitives.native_x_references,215);assert.equal(p.primitives.unique_native_x,80);
  assert.ok(p.box_formula_checks.every(x=>x.expected_bar_left===x.translated_bar_left));
  assert.deepEqual(p.role_translations.map(x=>x.translated_chart_bar_index),[324,340,344]);
  assert.equal(checkIndexLookupResult(p,a,roles),true);
});
test('all projected role coordinates are chart-local, not PNG pixels or time',()=>{
  fixture();const p=page();assert.equal(p.screenshot_pixel_mapping_approved,false);
  assert.equal(p.projected_event_absolute_timestamp_mapping_approved,false);
  assert.equal(p.renderer_index_lookup_consumption_independently_verified,false);
  assert.equal(p.compiled_runtime_equivalence_verified,false);
  assert.ok(p.role_translations.every(x=>Number.isFinite(x.chart_local_x)&&x.index_roundtrip_verified));
});
test('shifted lookup fails first box formula instead of inferring pixels',()=>{
  fixture({shiftLookup:true});assert.equal(page().code,'PINE_BOX_POSITION_FORMULA_MISMATCH');
});
test('missing index lookup fails closed',()=>{const f=fixture();delete f.study._graphics._indexes;assert.equal(page().code,'INDEX_LOOKUP_INVALID');});
test('non-integer and unordered entries are refused',()=>{
  for(const val of ['nan',-40,0.5]){const f=fixture();f.indexes[8]=val;assert.equal(page().code,'INDEX_LOOKUP_INVALID');}
});
test('native X beyond lookup bounds is refused',()=>{
  const f=fixture();f.boxes[4][1].x2=200;assert.equal(page().code,'DRAWING_X_OUTSIDE_INDEX_LOOKUP_boxes');
});
test('unreferenced index entry refuses completeness',()=>{
  const f=fixture();f.labels[50][1].x=2;assert.equal(page().code,'INDEX_LOOKUP_HAS_UNREFERENCED_ENTRIES');
});
test('missing graphics collection does not become zero evidence',()=>{
  const f=fixture();delete f.study._graphics._primitivesCollection.dwglabels;
  assert.equal(page().code,'GRAPHICS_UNAVAILABLE_OR_UNBOUNDED_labels');
});
test('study ID or layout changes refuse the page probe',()=>{
  let f=fixture();f.study.id=()=> 'DIFFERENT';assert.equal(page().code,'STUDY_NOT_UNIQUE');
  f=fixture();globalThis.window.TradingViewApi._chartWidgetCollection.metaInfo.uid='DIFFERENT';
  assert.equal(page().code,'LAYOUT_MISMATCH');
});
test('native pineId and pineVersion mismatches refuse the page probe',()=>{
  for(const [id,v] of [['pineId','USER;other'],['pineVersion','4.0']]){
    const f=fixture();const old=f.publicStudy.getInputValues();old.find(x=>x.id===id).value=v;
    f.publicStudy.getInputValues=()=>old;
    assert.equal(page().code,'NATIVE_STUDY_SOURCE_METADATA_MISMATCH');
  }
});
test('projected C123 layout inputs are required and bounded',()=>{
  for(const [id,v] of [['in_0',0],['in_1',6],['in_3',0],['in_6',false]]){
    const f=fixture();const inputs=f.publicStudy.getInputValues();inputs.find(x=>x.id===id).value=v;
    f.publicStudy.getInputValues=()=>inputs;
    assert.equal(page().code,'C123_LAYOUT_INPUTS_UNEXPECTED');
  }
});
test('coordinate roundtrip mismatch suppresses lookup assertion',()=>{
  const f=fixture();f.scale.coordinateToIndex=()=>999;
  assert.equal(page().code,'ROLE_CHART_COORDINATE_ROUNDTRIP_FAILED');
});
test('source, role, two page reads, and final source are all guarded',async()=>{
  fixture();const c=ctx();const r=await captureC123IndexLookupQa(a,c);
  assert.equal(r.ok,true);assert.equal(r.index_lookup_structural_correspondence_supported,true);
  assert.equal(r.capture_atomic,false);assert.equal(r.renderer_consumption_independently_verified,false);
  assert.deepEqual(c.calls,['data_get_study_source_provenance','data_get_projected_slot_qa',
    'PAGE','PAGE','data_get_study_source_provenance']);
});
test('wrong SHA or target fails before any tool reads',async()=>{
  for(const patch of [{expected_saved_source_sha256:'0'.repeat(64)},{target_id:'BAD'},{saved_version:'4.0'},
    {expected_study_name:'wrong'},{saved_script_id:'USER;OTHER'}]){
    const c=ctx();await assert.rejects(captureC123IndexLookupQa({...a,...patch},c),e=>e.code==='EXACT_C123_SCOPE_REQUIRED');
    assert.equal(c.calls.length,0);
  }
});
test('bad initial provenance refuses drawing probe',async()=>{
  fixture();const bad=sourceResult();bad.native_study_to_saved_script_version_verified=false;
  const c=ctx({p0:bad});await assert.rejects(captureC123IndexLookupQa(a,c),e=>e.code==='SOURCE_PROVENANCE_FAILED');
  assert.deepEqual(c.calls,['data_get_study_source_provenance']);
});
test('ambiguous or missing projected roles block native translation',async()=>{
  fixture();const bad=slotResult();bad.projected_slot_correspondence.alignments.length=2;
  const c=ctx({slots:bad});await assert.rejects(captureC123IndexLookupQa(a,c),e=>e.code==='C123_ROLES_INCOMPLETE');
});
test('any change between native lookup reads aborts correlation',async()=>{
  fixture();const p=page(),p2=structuredClone(p);
  p2.lookup.first_12[2]+=1;
  const c=ctx({page1:p,page2:p2});
  await assert.rejects(captureC123IndexLookupQa(a,c),e=>e.code==='INDEX_LOOKUP_CHANGED');
});
test('source metadata changes after the page probe aborts',async()=>{
  fixture();const bad=sourceResult();bad.observed_chart_identity.timeframe='5';
  await assert.rejects(captureC123IndexLookupQa(a,ctx({p1:bad})),e=>e.code==='SOURCE_OR_CHART_CHANGED');
});
test('validator rejects fabricated renderer or pixel certification',()=>{
  fixture();const p=page();p.screenshot_pixel_mapping_approved=true;
  assert.throws(()=>checkIndexLookupResult(p,a,roles));
});
test('descriptor read-only and exact scoped arguments',()=>{
  assert.equal(definitions[0].name,'data_get_c123_index_lookup_qa');
  assert.equal(definitions[0].mutates,false);
  assert.equal(definitions[0].inputSchema.additionalProperties,false);
  assert.equal(definitions[0].inputSchema.required.length,7);
});

test('real-shaped split: data-source graphics lack getInputValues while public study provides it',()=>{
  const f=fixture();
  assert.equal(typeof f.study.getInputValues,'undefined');
  assert.equal(typeof f.publicStudy.getInputValues,'function');
  assert.equal(page().ok,true);
});
test('public chart study inventory must match the native study exactly',()=>{
  let f=fixture();f.chart.getAllStudies=()=>[];
  assert.equal(page().code,'PUBLIC_STUDY_IDENTITY_MISMATCH');
  f=fixture();f.chart.getAllStudies=()=>[{id:a.entity_id,name:'Different title'}];
  assert.equal(page().code,'PUBLIC_STUDY_IDENTITY_MISMATCH');
  f=fixture();f.chart.getAllStudies=()=>[{id:a.entity_id,name:TITLE},{id:a.entity_id,name:TITLE}];
  assert.equal(page().code,'PUBLIC_STUDY_IDENTITY_MISMATCH');
  f=fixture();f.chart.getAllStudies=undefined;
  assert.equal(page().code,'PUBLIC_STUDIES_UNAVAILABLE');
});
test('public study handle and input API absence cannot claim study provenance',()=>{
  let f=fixture();f.chart.getStudyById=()=>null;
  assert.equal(page().code,'PUBLIC_STUDY_INPUTS_UNAVAILABLE');
  f=fixture();f.publicStudy.id='WRONG_STUDY';
  assert.equal(page().code,'PUBLIC_STUDY_INPUTS_UNAVAILABLE');
  f=fixture();f.publicStudy.getInputValues=undefined;
  assert.equal(page().code,'STUDY_INPUTS_UNAVAILABLE');
});
