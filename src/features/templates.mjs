import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

/** Native account study templates. No caller-supplied JS or credential extraction. */
export async function templatePage(a){
  const fail=(code,message,details={})=>({ok:false,code,message,...details});
  const api=window.TradingViewApi,chart=api?._activeChartWidgetWV?.value?.();
  if(!chart)return fail('CAPABILITY_UNAVAILABLE','Active chart API is unavailable.');
  const canonical=v=>{
    if(v===null||typeof v!=='object')return JSON.stringify(v);
    if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
    return '{'+Object.keys(v).sort().filter(k=>typeof v[k]!=='function'&&v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  };
  const content=record=>{const raw=record?.content??record;if(typeof raw==='string')return JSON.parse(raw);if(raw&&typeof raw==='object')return raw;throw new Error('No template content returned');};
  const signature=tpl=>{
    if(!Array.isArray(tpl?.panes))throw new Error('Template has no panes array');
    const panes=tpl.panes.map(p=>(p.sources??[]).filter(s=>s.type!=='MainSeries').map(s=>({type:s.type??null,meta_id:s.metaInfo?.id??null,name:s.metaInfo?.description??s.metaInfo?.shortDescription??s.state?.description??null,inputs:s.state?.inputs??null,styles:s.state?.styles??null,visible:s.state?.visible??null})));
    const studies=panes.flat();return {panes,study_count:studies.length,study_names:studies.map(s=>s.name),symbol:tpl.symbol??null,timeframe:tpl.interval??null,inputs_exposed_for_all:studies.every(s=>s.inputs!==null),styles_exposed_for_all:studies.every(s=>s.styles!==null)};
  };
  const snapshot=async(saveSymbol=false,saveInterval=false)=>{
    if(typeof chart.createStudyTemplate!=='function')throw new Error('CAPABILITY_UNAVAILABLE: createStudyTemplate is unavailable');
    const template=await chart.createStudyTemplate({saveSymbol,saveInterval});return {template,signature:signature(template),scope:'active_chart_studies_only',not_a_saved_layout_copy:true};
  };
  const native=()=>{
    const chunk=window.webpackChunktradingview;if(typeof chunk?.push!=='function')throw new Error('CAPABILITY_UNAVAILABLE: Native module registry is unavailable');
    let req;chunk.push([[`unified_templates_${Math.random().toString(36).slice(2)}`],{},r=>{req=r;}]);
    if(!req?.c)throw new Error('CAPABILITY_UNAVAILABLE: Native loaded module cache is unavailable');
    const backends=[],saveFactories=[];
    for(const module of Object.values(req.c)){
      let ex;try{ex=module?.exports;}catch{continue;}
      const backend=ex?.backend;
      if(backend&&typeof backend.getStudyTemplatesList==='function'&&typeof backend.saveStudyTemplate==='function'&&!backends.includes(backend))backends.push(backend);
      if(typeof ex?.getStudyTemplateSaveData==='function'&&!saveFactories.includes(ex.getStudyTemplateSaveData))saveFactories.push(ex.getStudyTemplateSaveData);
    }
    if(backends.length!==1)throw new Error('CAPABILITY_UNAVAILABLE: No unique study-template backend was found');
    return {backend:backends[0],saveFactory:saveFactories.length===1?saveFactories[0]:null};
  };
  const list=async backend=>{
    if(typeof backend.invalidateStudyTemplatesList==='function')await backend.invalidateStudyTemplatesList();
    const rows=await backend.getStudyTemplatesList();if(!Array.isArray(rows))throw new Error('ADAPTER_MISMATCH: Template list is not an array');return rows;
  };
  const kind=row=>row.is_fundamental?'fundamental':row.is_default?'standard':'custom';
  const rowData=row=>({template_id:String(row.id),name:row.name,kind:kind(row),favorite:row.favorite_date!=null,timeframe:row.meta_info?.interval??null,indicators:(row.meta_info?.indicators??[]).map(i=>({id:i.id??null,description:i.description??null}))});
  const resolve=(rows,id)=>{const matches=rows.filter(r=>String(r.id)===String(id));if(matches.length!==1)throw new Error('TARGET_NOT_FOUND: No unique exact template ID matched');return matches[0];};
  const callback=fn=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Native template callback timed out')),12000);try{fn(result=>{clearTimeout(timer);resolve(result);});}catch(error){clearTimeout(timer);reject(error);}});
  const get=async(backend,row)=>{
    let record;if(kind(row)==='custom'){if(typeof backend.getStudyTemplateById!=='function')throw new Error('CAPABILITY_UNAVAILABLE: Template getter unavailable');record=await backend.getStudyTemplateById(row.id);}
    else{if(typeof backend.getStandardStudyTemplateById!=='function')throw new Error('CAPABILITY_UNAVAILABLE: Built-in template getter unavailable');record=await callback(done=>backend.getStandardStudyTemplateById(row.id,done));}
    const template=content(record);return {record:rowData(row),template,signature:signature(template)};
  };
  try{
    if(a.op==='snapshot')return {ok:true,...await snapshot(Boolean(a.save_symbol),Boolean(a.save_timeframe))};
    if(a.op==='apply'){
      let desired=a.template,record=null;
      if(a.template_id!==undefined){const {backend}=native();const row=resolve(await list(backend),a.template_id);const got=await get(backend,row);desired=got.template;record=got.record;}
      const wanted=signature(desired);
      if(typeof chart.applyStudyTemplate!=='function')return fail('CAPABILITY_UNAVAILABLE','applyStudyTemplate is unavailable.');
      const before=await snapshot(Boolean(desired.symbol),Boolean(desired.interval));
      await chart.applyStudyTemplate(desired);
      let observed=null,stable=0,previous=null;const deadline=Date.now()+(a.timeout_ms??15000);
      do{
        observed=await snapshot(Boolean(desired.symbol),Boolean(desired.interval));
        const key=canonical(observed.signature);if(key===previous)stable++;else{previous=key;stable=1;}
        const matches=canonical(observed.signature.panes)===canonical(wanted.panes)&&(!desired.symbol||chart.symbol()===desired.symbol)&&(!desired.interval||chart.resolution()===desired.interval);
        const studies=chart.getAllStudies();const registered=studies.every(s=>typeof s.id==='string'&&s.id.length>0);
        if(matches&&stable>=2&&registered)return {ok:true,verified:true,mutation_attempted:true,record,before:before.signature,observed:observed.signature,scope:'active_chart_studies_only',verification_fields:['pane grouping','study metadata IDs/names','exposed input values','exposed styles','exposed visibility','optional symbol/timeframe','registered entity IDs'],all_input_values_verified:wanted.inputs_exposed_for_all&&observed.signature.inputs_exposed_for_all,all_styles_verified:wanted.styles_exposed_for_all&&observed.signature.styles_exposed_for_all,full_layout_fidelity:false};
        await new Promise(r=>setTimeout(r,250));
      }while(Date.now()<deadline);
      return fail('TEMPLATE_APPLY_UNVERIFIED','The template was submitted but its study identities/configuration did not independently match.',{mutation_attempted:true,wanted,observed:observed?.signature,before:before.signature});
    }
    const {backend,saveFactory}=native();const rows=await list(backend);const originalIds=new Set(rows.map(row=>String(row.id)));
    if(a.op==='list')return {ok:true,total:rows.length,templates:rows.map(rowData)};
    if(a.op==='get')return {ok:true,...await get(backend,resolve(rows,a.template_id))};
    if(a.op==='save'){
      const byName=rows.filter(r=>r.name===a.name);let existing=null;
      if(a.replace_id!==undefined){existing=resolve(rows,a.replace_id);if(kind(existing)!=='custom')return fail('BUILTIN_TEMPLATE','Built-in templates cannot be replaced.');if(byName.some(r=>String(r.id)!==String(existing.id)))return fail('NAME_CONFLICT','Another template already has the requested name.');}
      else if(byName.length)return fail('NAME_CONFLICT','A template with this exact name already exists. Use an exact replace_id and expected content hash to replace it.');
      if(!saveFactory)return fail('CAPABILITY_UNAVAILABLE','Native study-template save-data factory unavailable.');
      if(existing){const previous=await get(backend,existing);if(canonical(previous.template)!==a.expected_content_canonical)return fail('PRECONDITION_FAILED','Saved template changed after it was read; no replacement was submitted.');}
      const model=chart._chartWidget?.model?.()?.model?.();if(!model)return fail('CAPABILITY_UNAVAILABLE','Native chart model is unavailable.');
      const data=saveFactory(a.name,model,Boolean(a.save_symbol),Boolean(a.save_timeframe));
      const desired=content(data);signature(desired);
      if(existing){if(typeof backend.replaceStudyTemplate!=='function')return fail('CAPABILITY_UNAVAILABLE','Native template replacement API unavailable.');const result=await callback(done=>backend.replaceStudyTemplate(existing.id,data,done));if(result?.error)return fail('TRADINGVIEW_REJECTED',String(result.error),{mutation_attempted:true});}
      else{const result=await backend.saveStudyTemplate(data);if(result?.error)return fail('TRADINGVIEW_REJECTED',String(result.error),{mutation_attempted:true});}
      const deadline=Date.now()+12000;let matches=[];
      do{
        const after=await list(backend);matches=after.filter(r=>r.name===a.name&&(existing?String(r.id)===String(existing.id):!originalIds.has(String(r.id))));
        if(matches.length===1){const actual=await get(backend,matches[0]);if(canonical(actual.template)===canonical(desired))return {ok:true,verified:true,mutation_attempted:true,replaced:Boolean(existing),...actual};}
        if(matches.length>1)return fail('AMBIGUOUS_RESULT','Multiple newly created templates match the request; reconcile before retrying.',{mutation_attempted:true,candidates:matches.map(rowData)});
        await new Promise(r=>setTimeout(r,300));
      }while(Date.now()<deadline);
      return fail('TEMPLATE_SAVE_UNVERIFIED','Template save was submitted but exact independent content readback did not verify.',{mutation_attempted:true,candidates:matches.map(rowData)});
    }
    if(a.op==='delete'){
      const row=resolve(rows,a.template_id);if(kind(row)!=='custom')return fail('BUILTIN_TEMPLATE','Built-in templates cannot be deleted.');
      if(a.expected_name!==row.name)return fail('PRECONDITION_FAILED','Template name changed or does not match the requested deletion target.');
      if(typeof backend.removeStudyTemplate!=='function')return fail('CAPABILITY_UNAVAILABLE','Native template deletion API unavailable.');
      await backend.removeStudyTemplate(row.id);const deadline=Date.now()+12000;
      do{const after=await list(backend);if(!after.some(r=>String(r.id)===String(row.id)))return {ok:true,verified:true,mutation_attempted:true,deleted:rowData(row)};await new Promise(r=>setTimeout(r,300));}while(Date.now()<deadline);
      return fail('TEMPLATE_DELETE_UNVERIFIED','Delete was submitted but the template remains listed.',{mutation_attempted:true,template:rowData(row)});
    }
    return fail('INVALID_ARGUMENT','Unknown study-template operation.');
  }catch(error){const message=String(error?.message??error).slice(0,600);const code=/^([A-Z_]+):/.exec(message)?.[1]??'TEMPLATE_OPERATION_FAILED';return fail(code,message,{mutation_attempted:['save','apply','delete'].includes(a.op)});}
}

export function canonicalTemplate(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalTemplate).join(',')+']';
  return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined&&typeof value[k]!=='function').map(k=>JSON.stringify(k)+':'+canonicalTemplate(value[k])).join(',')+'}';
}
export const templateHash=value=>createHash('sha256').update(canonicalTemplate(value)).digest('hex');
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const id={type:'string',minLength:1,maxLength:300};
const capture={save_symbol:{type:'boolean'},save_timeframe:{type:'boolean'}};
export async function templateRead(op,args,ctx){const result=await ctx.callPage(templatePage,{...args,op},{timeoutMs:(args.timeout_ms??15000)+30000});if(!result?.ok)throw new ToolError(result?.code??'ADAPTER_MISMATCH',result?.message??'Study-template operation failed.',result);if(result.template)result.content_sha256=templateHash(result.template);return result;}
const def=(name,op,description,properties={},required=[],mutates=false)=>({name,description,inputSchema:schema(properties,required),mutates,handler:(args,ctx)=>templateRead(op,args,ctx)});

export default [
  def('study_template_list','list','List native TradingView account study templates, distinguishing custom and built-in templates.'),
  def('study_template_get','get','Read one native study template by exact ID, with content hash and study/configuration signature.',{template_id:id},['template_id']),
  def('study_template_snapshot','snapshot','Capture a native template of the active chart’s studies, optionally including symbol/timeframe. This is not a saved-layout copy.',capture),
  {name:'study_template_save',description:'Save the active study configuration as a native account template and verify independent content readback. Replacement requires exact prior content hash.',inputSchema:schema({name:id,...capture,replace_id:id,expected_content_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}},['name']),mutates:true,handler:async(args,ctx)=>{
    let expected;
    if(args.replace_id!==undefined){if(!args.expected_content_sha256)throw new ToolError('PRECONDITION_REQUIRED','Replacing a template requires its expected_content_sha256 from study_template_get.');const old=await templateRead('get',{template_id:args.replace_id},ctx);if(old.content_sha256!==args.expected_content_sha256)throw new ToolError('PRECONDITION_FAILED','Saved template content differs from the expected hash.');expected=canonicalTemplate(old.template);}
    return templateRead('save',{...args,expected_content_canonical:expected},ctx);
  }},
  {name:'study_template_apply',description:'Apply one native saved or supplied study template, back up the prior studies, and verify identities plus exposed settings. Replaces active-chart studies.',inputSchema:schema({template_id:id,template:{type:'object',properties:{panes:{type:'array',minItems:1,maxItems:100}},required:['panes'],additionalProperties:true},timeout_ms:{type:'integer',minimum:500,maximum:30000}},[]),mutates:true,destructive:true,handler:async(args,ctx)=>{
    if(Number(args.template_id!==undefined)+Number(args.template!==undefined)!==1)throw new ToolError('INVALID_ARGUMENT','Provide exactly one of template_id or template.');
    const backup=await templateRead('snapshot',{save_symbol:true,save_timeframe:true},ctx);const file=await ctx.exportJson('study-template-before-apply',backup);
    try{return {...await templateRead('apply',args,ctx),backup_file:file};}catch(error){throw new ToolError(error.code??'TEMPLATE_APPLY_FAILED',error.message,{...(error.details??{}),backup_file:file});}
  }},
  {...def('study_template_delete','delete','Delete one exact custom study-template ID after matching its current name, then verify absence. Built-in templates refuse.',{template_id:id,expected_name:id},['template_id','expected_name'],true),destructive:true},
  {name:'study_template_export',description:'Export a saved native study template and hash to a confined JSON artifact.',inputSchema:schema({template_id:id},['template_id']),mutates:false,handler:async(args,ctx)=>{const result=await templateRead('get',args,ctx);const file=await ctx.exportJson('study-template',result);return {ok:true,record:result.record,content_sha256:result.content_sha256,file};}}
];
