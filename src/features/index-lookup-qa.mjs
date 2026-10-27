import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const TITLE = 'Couto QTF v2.9x + C123 PROJECTED RESEARCH v0.4';
const SCRIPT_ID = 'USER;630d9b8bdd6048b4bc1bb2ab746fd583';
const VERSION = '3.0';
const SOURCE_SHA = 'cf32784699b32a9bb1965325a00e1f3546d23bf8f567d272ab793d4eb69344ee';

/** Fixed page function. Reads ONLY one named study and bounded native graphics metadata. */
export function c123IndexLookupPage(a) {
  const fail = code => ({ok:false,code});
  const root = window.TradingViewApi;
  const chart = root?._activeChartWidgetWV?.value?.();
  const outer = chart?._chartWidget?.model?.();
  const model = outer?.model?.() ?? outer;
  const main = model?.mainSeries?.() ?? outer?.mainSeries?.();
  const unwrap = v => v && typeof v.value === 'function' ? v.value() : v;
  const service = typeof root?.getSaveChartService === 'function' ? root.getSaveChartService() : null;
  let uid;
  try { uid = unwrap(root?._chartWidgetCollection?.metaInfo?.uid) ?? unwrap(service?.layoutId?.()); }
  catch { return fail('LAYOUT_UNAVAILABLE'); }
  if (String(uid) !== a.expected_layout_id) return fail('LAYOUT_MISMATCH');
  if (chart?.resolution?.() !== '15' || chart?.symbol?.() !== 'CBOT_MINI_DL:YM1!')
    return fail('CHART_SCOPE_MISMATCH');
  const sources = model?.dataSources?.();
  if (!Array.isArray(sources)) return fail('DATA_SOURCES_UNAVAILABLE');
  const studies = sources.filter(s => typeof s?.id === 'function' && s.id() === a.entity_id);
  if (studies.length !== 1) return fail('STUDY_NOT_UNIQUE');
  const study = studies[0];
  if (study.metaInfo?.()?.description !== a.expected_study_name) return fail('STUDY_NAME_MISMATCH');
  // Native model data source owns the graphics; it is NOT the public study API.
  // The public chart study handle exposes getInputValues(), as indicator_get_inputs does.
  const exposedStudies = chart.getAllStudies?.();
  if (!Array.isArray(exposedStudies)) return fail('PUBLIC_STUDIES_UNAVAILABLE');
  const exposed = exposedStudies.filter(s => s?.id === a.entity_id);
  if (exposed.length !== 1 || (exposed[0].name ?? exposed[0].title) !== a.expected_study_name)
    return fail('PUBLIC_STUDY_IDENTITY_MISMATCH');
  const studyHandle = chart.getStudyById?.(a.entity_id);
  if (!studyHandle || (typeof studyHandle.id === 'string' && studyHandle.id !== a.entity_id))
    return fail('PUBLIC_STUDY_INPUTS_UNAVAILABLE');
  const inputs = studyHandle.getInputValues?.();
  if (!Array.isArray(inputs)) return fail('STUDY_INPUTS_UNAVAILABLE');
  const one = id => {const matched=inputs.filter(v=>v?.id===id);return matched.length===1?matched[0].value:null;};
  if (one('pineId')!==a.saved_script_id || one('pineVersion')!==a.saved_version)
    return fail('NATIVE_STUDY_SOURCE_METADATA_MISMATCH');
  const padding=one('in_0'),spacing=one('in_1'),widthSetting=one('in_3'),rolesEnabled=one('in_6');
  if (!Number.isInteger(padding)||padding<1||padding>50||
      !Number.isInteger(spacing)||spacing<1||spacing>4||
      !Number.isInteger(widthSetting)||widthSetting<1||widthSetting>6||rolesEnabled!==true)
    return fail('C123_LAYOUT_INPUTS_UNEXPECTED');
  const bodyWidth=widthSetting*2, stride=bodyWidth+spacing;
  const bars=main?.bars?.();
  const first=bars?.firstIndex?.(),last=bars?.lastIndex?.(),count=bars?.size?.();
  if (!Number.isInteger(first)||!Number.isInteger(last)||!Number.isInteger(count)||
      last<first||count!==last-first+1||count<10) return fail('LOADED_BARS_INVALID');
  const graph=study?._graphics;
  const indexes=graph?._indexes;
  if (!Array.isArray(indexes)||indexes.length<16||indexes.length>500||
      !indexes.every((v,i)=>Number.isSafeInteger(v) && (i===0||v>indexes[i-1])))
    return fail('INDEX_LOOKUP_INVALID');
  const pc=graph?._primitivesCollection;
  if (!pc) return fail('PRIMITIVES_UNAVAILABLE');
  const primitiveFields=[['boxes','dwgboxes',['x1','x2']],['lines','dwglines',['x1','x2']],['labels','dwglabels',['x']]];
  const native={};const references=[];
  for (const [kind,key,fields] of primitiveFields) {
    const wrapper=pc[key]?.get?.(kind);
    const map=wrapper?.get?.(false)?._primitivesDataById ?? wrapper?._primitivesDataById;
    if (!map||typeof map.entries!=='function'||!Number.isInteger(map.size)||map.size<1||map.size>200)
      return fail('GRAPHICS_UNAVAILABLE_OR_UNBOUNDED_'+kind);
    const items=[];
    for (const [id,v] of map.entries()) {
      if (!Number.isSafeInteger(id)) return fail('PRIMITIVE_ID_INVALID_'+kind);
      const item={id};
      for (const field of fields) {
        if (!Number.isSafeInteger(v?.[field]) || v[field]<0 || v[field]>=indexes.length)
          return fail('DRAWING_X_OUTSIDE_INDEX_LOOKUP_'+kind);
        item[field]=v[field];references.push(v[field]);
      }
      items.push(item);
    }
    native[kind]=items;
  }
  if (new Set(references).size !== indexes.length)
    return fail('INDEX_LOOKUP_HAS_UNREFERENCED_ENTRIES');
  if (native.boxes.length<7) return fail('C123_FIRST_BOXES_UNAVAILABLE');
  const formulaChecks=native.boxes.slice(0,7).map((box,slot)=>({
    slot:slot+1, native_left:box.x1,native_right:box.x2,
    translated_bar_left:indexes[box.x1],translated_bar_right:indexes[box.x2],
    expected_bar_left:last+padding+slot*stride,
    expected_bar_right:last+padding+slot*stride+bodyWidth
  }));
  if (!formulaChecks.every(x=>x.translated_bar_left===x.expected_bar_left&&
    x.translated_bar_right===x.expected_bar_right)) return fail('PINE_BOX_POSITION_FORMULA_MISMATCH');
  const scale=model?.timeScale?.() ?? outer?.timeScale?.();
  if (typeof scale?.indexToCoordinate!=='function'||typeof scale?.coordinateToIndex!=='function')
    return fail('CHART_TIMESCALE_API_UNAVAILABLE');
  const roleTranslations=[];
  for (const role of a.roles) {
    if (!Number.isSafeInteger(role.native_x)||role.native_x<0||role.native_x>=indexes.length)
      return fail('ROLE_X_OUT_OF_LOOKUP');
    if (!native.labels.some(x=>x.x===role.native_x))return fail('ROLE_X_NOT_IN_NATIVE_LABELS');
    const barIndex=indexes[role.native_x];
    let x=null,back=null;
    try { x=scale.indexToCoordinate(barIndex);if(Number.isFinite(x)) back=scale.coordinateToIndex(x); }
    catch { return fail('ROLE_CHART_COORDINATE_UNAVAILABLE'); }
    if (!Number.isFinite(x)||!Number.isFinite(back)||Math.abs(back-barIndex)>0.001)
      return fail('ROLE_CHART_COORDINATE_ROUNDTRIP_FAILED');
    roleTranslations.push({role:role.role,clock_caption:role.clock_caption,native_x:role.native_x,
      translated_chart_bar_index:barIndex,chart_local_x:x,index_roundtrip_verified:true});
  }
  const samples=[...new Set(formulaChecks.flatMap(x=>[x.native_left,x.native_right]))];
  for (const i of samples) {
    let px,back;
    try {px=scale.indexToCoordinate(indexes[i]);back=scale.coordinateToIndex(px);}
    catch {return fail('BOX_COORDINATE_UNAVAILABLE');}
    if (!Number.isFinite(px)||!Number.isFinite(back)||Math.abs(back-indexes[i])>0.001)
      return fail('BOX_COORDINATE_ROUNDTRIP_FAILED');
  }
  return {ok:true,layout_id:String(uid),symbol:chart.symbol(),timeframe:chart.resolution(),
    entity_id:study.id(),study_name:study.metaInfo().description,
    loaded_bars:{first,last,count},
    native_source_metadata:{pine_id_matches:true,pine_version_matches:true},
    lookup:{length:indexes.length,first_12:indexes.slice(0,12),last_6:indexes.slice(-6),
      strictly_ascending:true,all_entries_referenced:true},
    primitives:{boxes:native.boxes.length,lines:native.lines.length,labels:native.labels.length,
      native_x_references:references.length,unique_native_x:new Set(references).size},
    layout_config:{padding,spacing,width_setting:widthSetting,body_width:bodyWidth,stride},
    box_formula_checks:formulaChecks,
    role_translations:roleTranslations,
    structural_lookup_supported:true,
    renderer_index_lookup_consumption_independently_verified:false,
    screenshot_pixel_mapping_approved:false,
    projected_event_absolute_timestamp_mapping_approved:false,
    compiled_runtime_equivalence_verified:false,
    note:'Native drawing X uses a study-local lookup consistent with projected Pine bar_index offsets and chart index coordinates. Renderer use, PNG pixels, and event time are not independently attested.'};
}

export function checkIndexLookupResult(result,a,expectedRoles){
  if (!result?.ok||result.layout_id!==a.expected_layout_id||result.entity_id!==a.entity_id||
      result.study_name!==a.expected_study_name||result.symbol!=='CBOT_MINI_DL:YM1!'||result.timeframe!=='15'||
      result.structural_lookup_supported!==true||result.lookup?.all_entries_referenced!==true||
      result.role_translations?.length!==expectedRoles.length||
      result.box_formula_checks?.length!==7||
      result.renderer_index_lookup_consumption_independently_verified!==false||
      result.screenshot_pixel_mapping_approved!==false||
      result.projected_event_absolute_timestamp_mapping_approved!==false||
      result.compiled_runtime_equivalence_verified!==false) {
    throw new ToolError('INDEX_LOOKUP_UNVERIFIED','Bounded native lookup result is incomplete or inconsistent.');
  }
  for(let i=0;i<expectedRoles.length;i++) {
    const r=result.role_translations[i],e=expectedRoles[i];
    if(r.role!==e.role||r.native_x!==e.native_x||r.clock_caption!==e.clock_caption||
      !Number.isSafeInteger(r.translated_chart_bar_index)||!Number.isFinite(r.chart_local_x)||
      r.index_roundtrip_verified!==true)throw new ToolError('ROLE_TRANSLATION_MISMATCH','Expected native role correspondence changed.');
  }
  if(!result.box_formula_checks.every(v=>v.translated_bar_left===v.expected_bar_left &&
      v.translated_bar_right===v.expected_bar_right))
    throw new ToolError('BOX_POSITION_MISMATCH','Pine projected box formula not reproduced.');
  return true;
}

export async function captureC123IndexLookupQa(a,ctx){
  if(ctx.targetId!==a.target_id || !a.target_id || !a.expected_layout_id || !a.entity_id ||
      a.expected_study_name!==TITLE||a.saved_script_id!==SCRIPT_ID||String(a.saved_version)!==VERSION||
      a.expected_saved_source_sha256?.toLowerCase()!==SOURCE_SHA)
    throw new ToolError('EXACT_C123_SCOPE_REQUIRED','Require pinned C123 v0.4 study/script/version/SHA and explicit target/layout.');
  const base={target_id:a.target_id,expected_layout_id:a.expected_layout_id};
  const provArgs={...base,entity_id:a.entity_id,expected_study_name:TITLE,
    saved_script_id:SCRIPT_ID,saved_version:VERSION,expected_saved_source_sha256:SOURCE_SHA};
  const p0=await ctx.callTool('data_get_study_source_provenance',provArgs);
  if(p0?.native_study_to_saved_script_version_verified!==true||p0?.chart_identity_stable!==true||
    p0?.native_pine_metadata_stable!==true||p0?.saved_source?.source_sha256!==SOURCE_SHA)
    throw new ToolError('SOURCE_PROVENANCE_FAILED','Pinned study-source provenance must pass before drawing QA.');
  const slot=await ctx.callTool('data_get_projected_slot_qa',{
    ...provArgs,max_items_per_kind:200
  });
  if(slot?.slot_alignment_verified!==true || slot?.capture_consistency!=='matching_bracket_reads'||
     slot?.graphics_coverage!=='complete'||slot?.all_native_graphics_returned!==true)
    throw new ToolError('PROJECTED_ROLE_QA_FAILED','Projected role/clock QA not complete.');
  const roles=slot.projected_slot_correspondence?.alignments;
  if(!Array.isArray(roles)||roles.length!==3||
     !roles.some(r=>r.role==='C1')||!roles.some(r=>r.role==='C3')||
     !roles.some(r=>r.role==='C2↑'||r.role==='C2↓'))
    throw new ToolError('C123_ROLES_INCOMPLETE','Require one each of C1, C2, C3 before translation.');
  const expectedRoles=roles.map(r=>({role:r.role,native_x:r.native_x,clock_caption:r.clock_text}));
  const pageArgs={...provArgs,roles:expectedRoles};
  const p1=await ctx.callPage(c123IndexLookupPage,pageArgs);
  checkIndexLookupResult(p1,a,expectedRoles);
  const p2=await ctx.callPage(c123IndexLookupPage,pageArgs);
  checkIndexLookupResult(p2,a,expectedRoles);
  if(sha(p1)!==sha(p2))throw new ToolError('INDEX_LOOKUP_CHANGED','Native lookup or chart-local positions changed between reads.');
  const pEnd=await ctx.callTool('data_get_study_source_provenance',provArgs);
  if(pEnd?.native_study_to_saved_script_version_verified!==true||
     pEnd?.chart_identity_stable!==true||pEnd?.native_pine_metadata_stable!==true||
     sha(pEnd.observed_chart_identity)!==sha(p0.observed_chart_identity)||
     pEnd.saved_source?.source_sha256!==SOURCE_SHA)
    throw new ToolError('SOURCE_OR_CHART_CHANGED','Study/source identity changed during index lookup.');
  // Explicitly withhold screenshot-pixel, event-time, renderer, and runtime-equivalence claims.
  return {ok:true,read_only:true,layout_id:a.expected_layout_id,entity_id:a.entity_id,
    capture_consistency:'matching_nonatomic_reads',observational_source_provenance_verified:true,
    projected_slot_alignment_verified:true,index_lookup_structural_correspondence_supported:true,
    native_coordinate_domain:'study_local_slot_indexes_into_graphics_index_lookup',
    lookup_summary:p1.lookup,graphics_summary:p1.primitives,
    pine_layout_config:p1.layout_config,first_seven_projected_boxes:p1.box_formula_checks,
    role_translations:p1.role_translations,
    native_chart_local_coordinate_verified:true,
    renderer_consumption_independently_verified:false,
    screenshot_pixel_mapping_approved:false,
    projected_event_absolute_time_mapping_approved:false,
    compiled_runtime_equivalence_verified:false,
    capture_atomic:false,
    limitations:'Scoped YM1! 15M C123 v0.4 metadata/layout probe only. Matching observations are not atomic; native renderer consumption of the lookup is not independently certified. Chart-local X is not screenshot pixel X. A projected drawing future index is NOT its 30M event timestamp. No compiled Pine-runtime equivalence.'};
}

export default [{
  name:'data_get_c123_index_lookup_qa',
  description:'Guarded read-only C123 v0.4 native graphics X lookup to chart future bar index and chart-local X; no pixel/time/renderer equivalence claims.',
  inputSchema:{type:'object',properties:{
    entity_id:{type:'string',minLength:1,maxLength:300},
    expected_study_name:{type:'string',minLength:1,maxLength:300},
    saved_script_id:{type:'string',minLength:1,maxLength:300},
    saved_version:{type:'string',minLength:1,maxLength:40},
    expected_saved_source_sha256:{type:'string',minLength:64,maxLength:64,pattern:'^[a-fA-F0-9]{64}$'}
  },required:['target_id','expected_layout_id','entity_id','expected_study_name','saved_script_id','saved_version','expected_saved_source_sha256'],additionalProperties:false},
  mutates:false,handler:captureC123IndexLookupQa
}];
