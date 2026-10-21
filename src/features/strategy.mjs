import { randomUUID } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';
import { expandSweep, freshnessVerdict, compareMetrics } from './strategy-helpers.mjs';

/** Fixed report extraction adapter. Exact registered entity IDs are mandatory. */
export function strategyPage(a) {
  const fail = (code,message,details={}) => ({ok:false,code,message,...details});
  const chart=window.TradingViewApi?._activeChartWidgetWV?.value?.();
  if(!chart)return fail('CAPABILITY_UNAVAILABLE','Active chart API unavailable.');
  const outer=chart._chartWidget?.model?.();
  const model=outer?.model?.()??outer;
  const all=model?.dataSources?.();
  if(!Array.isArray(all))return fail('CAPABILITY_UNAVAILABLE','Strategy data sources unavailable.');
  const unwrap=v=>v&&typeof v.value==='function'?v.value():v;
  const safe=(v,depth=0)=>{
    if(v==null||typeof v==='string'||typeof v==='boolean')return v??null;
    if(typeof v==='number')return Number.isFinite(v)?v:null;
    if(depth>7)return '[depth limit]';
    if(Array.isArray(v))return v.slice(0,10000).map(x=>safe(x,depth+1));
    if(typeof v==='object'){const o=Object.create(null);for(const k of Object.keys(v).slice(0,1000)){const x=v[k];if(typeof x!=='function')o[k]=safe(x,depth+1);}return o;}
    return null;
  };
  try {
    const strategies=all.filter(s=>typeof s.reportData==='function').map(s=>{
      const meta=typeof s.metaInfo==='function'?s.metaInfo():{};
      const id=typeof s.id==='function'?s.id():null;
      return {source:s,entity_id:typeof id==='string'?id:null,name:meta?.description??null,meta_id:meta?.id??null};
    });
    if(a.op==='list')return {ok:true,strategies:strategies.map(s=>({entity_id:s.entity_id,name:s.name,meta_id:s.meta_id,report_available:Boolean(unwrap(s.source.reportData())?.performance),addressable:Boolean(s.entity_id)}))};
    const matches=strategies.filter(s=>s.entity_id===a.entity_id);
    if(matches.length!==1)return fail(matches.length?'AMBIGUOUS_TARGET':'TARGET_NOT_FOUND','No unique exact strategy entity ID matched. No fallback strategy was selected.',{requested_entity_id:a.entity_id,available:strategies.map(s=>({entity_id:s.entity_id,name:s.name}))});
    const st=matches[0];
    const watched=st.source.reportData();
    const report=unwrap(watched);
    const root=window.TradingViewApi;
    const service=typeof root.getSaveChartService==='function'?root.getSaveChartService():null;
    const nativeId=unwrap(root._chartWidgetCollection?.metaInfo?.uid)||(typeof service?.layoutId==='function'?unwrap(service.layoutId()):null);
    const main=outer?.mainSeries?.()??model?.mainSeries?.();
    const session=typeof main?.sessionId==='function'?unwrap(main.sessionId()):null;
    const context={entity_id:st.entity_id,strategy:st.name,meta_id:st.meta_id,layout_id:nativeId==null||nativeId===''?null:String(nativeId),symbol:chart.symbol(),timeframe:chart.resolution(),session,observed_at:new Date().toISOString()};
    const inputValues=chart.getStudyById(a.entity_id)?.getInputValues?.()??[];
    const inputMap=Object.fromEntries(inputValues.map(v=>[v.id,v.value]));
    const perf=report?.performance??null;
    const fingerprint=JSON.stringify([context.symbol,context.timeframe,context.session,inputMap,perf,report?.settings,report?.trades?.length,report?.trades?.at?.(-1)]);
    let loading=null;
    if(typeof st.source.isLoading==='function') {const raw=unwrap(st.source.isLoading());if(typeof raw==='boolean')loading=raw;}
    const probeStore=window.__TV_UNIFIED_RESEARCH_V1;
    if(a.op==='capture'){
      let store=probeStore;
      if(!store){store={version:1,probes:new Map()};Object.defineProperty(window,'__TV_UNIFIED_RESEARCH_V1',{value:store,configurable:true});}
      if(store.version!==1||!(store.probes instanceof Map))return fail('ADAPTER_MISMATCH','Probe-state namespace is occupied by an incompatible value.');
      while(store.probes.size>=50){const key=store.probes.keys().next().value;const old=store.probes.get(key);if(old.unsubscribe)old.unsubscribe();store.probes.delete(key);}
      const probe={entity_id:a.entity_id,layout_id:context.layout_id,captured_at:context.observed_at,report_ref:report,report_payload:JSON.stringify([perf,report?.settings,report?.trades?.length,report?.trades?.at?.(-1)]),event_observed:false,inputs:inputMap};
      if(watched&&typeof watched.subscribe==='function'&&typeof watched.unsubscribe==='function'){
        const listener=()=>{probe.event_observed=true;};
        try{watched.subscribe(probe,listener);probe.unsubscribe=()=>watched.unsubscribe(probe,listener);}catch{probe.subscription_available=false;}
      }
      store.probes.set(a.probe_id,probe);
      return {ok:true,...context,probe_id:a.probe_id,report_available:Boolean(perf),inputs:inputValues,captured_at:probe.captured_at};
    }
    if(a.op==='release'){
      const probe=probeStore?.probes?.get?.(a.probe_id);
      if(!probe)return {ok:true,released:false};
      if(probe.unsubscribe)probe.unsubscribe();probeStore.probes.delete(a.probe_id);
      return {ok:true,released:true};
    }
    let evidence={report_event_observed:false,report_payload_changed:false,report_identity_changed:false,probe_present:false};
    if(a.probe_id){
      const probe=probeStore?.probes?.get?.(a.probe_id);
      if(!probe)return fail('PROBE_NOT_FOUND','Freshness probe is missing, expired, or belongs to a previous page load.');
      if(probe.entity_id!==a.entity_id||probe.layout_id!==context.layout_id)return fail('TARGET_MISMATCH','Probe belongs to a different strategy or layout.');
      evidence={probe_present:true,captured_at:probe.captured_at,report_event_observed:probe.event_observed,report_identity_changed:report!==probe.report_ref,report_payload_changed:JSON.stringify([perf,report?.settings,report?.trades?.length,report?.trades?.at?.(-1)])!==probe.report_payload};
    }
    const contextMatches=(!a.expected_symbol||a.expected_symbol===context.symbol)&&(!a.expected_timeframe||a.expected_timeframe===context.timeframe)&&(!a.expected_session||a.expected_session===context.session)&&(!a.expected_inputs||Object.entries(a.expected_inputs).every(([k,v])=>JSON.stringify(inputMap[k])===JSON.stringify(v)));
    if(a.op==='status')return {ok:true,...context,report_available:Boolean(perf),loading,context_matches:contextMatches,freshness_evidence:evidence,fingerprint,inputs:inputValues};
    if(!perf)return fail('REPORT_NOT_READY','Strategy report is not computed. Open Strategy Tester and wait for the selected strategy.',context);
    if(!contextMatches)return fail('TARGET_MISMATCH','Chart symbol, timeframe or inputs do not match the requested result context.',{...context,inputs:inputValues});
    const base={ok:true,...context,source:'TradingView_internal_strategy_report',freshness_evidence:evidence,report_fingerprint:fingerprint,loading};
    if(a.op==='report')return {...base,metrics:safe(perf.all??{}),performance:safe(perf),settings:safe(report.settings??{}),currency:report.currency??null,closed_trade_records:Array.isArray(report.trades)?report.trades.length:null,filled_order_records:Array.isArray(report.filledOrders)?report.filledOrders.length:null,window:safe(report.settings?.dateRange??{}),inputs:inputValues,deep_backtesting_verified:false};
    const paginate=array=>{
      const total=array.length,offset=a.offset??0,limit=a.limit??1000;
      const indices=Array.from({length:Math.min(limit,Math.max(0,total-offset))},(_,j)=>a.order==='desc'?total-1-offset-j:offset+j);
      return {total,offset,returned:indices.length,next_offset:offset+limit<total?offset+limit:null,indices};
    };
    if(a.op==='trades'||a.op==='equity'){
      if(!Array.isArray(report.trades))return fail('CAPABILITY_UNAVAILABLE','The report trade array is unavailable.');
      const page=paginate(report.trades);
      const items=page.indices.map(i=>{
        const t=report.trades[i],entry=t.e??{},exit=t.x??{};
        if(a.op==='equity')return {trade_number:i+1,time_ms:exit.tm??null,account_value:t.v??null,cumulative_profit:t.cp?.v??null,cumulative_profit_percent:t.cp?.p??null,trade_drawdown:t.dd?.v??null};
        return {trade_number:i+1,side:entry.tp==='le'?'long':entry.tp==='se'?'short':entry.tp??null,entry_time_ms:entry.tm??null,entry_price:entry.p??null,entry_bar:entry.b??null,entry_comment:entry.c??null,exit_time_ms:exit.tm??null,exit_price:exit.p??null,exit_bar:exit.b??null,exit_comment:exit.c??null,quantity:t.q??null,profit:t.tp?.v??null,profit_percent:t.tp?.p??null,cumulative_profit:t.cp?.v??null,cumulative_profit_percent:t.cp?.p??null,runup:t.rn?.v??null,drawdown:t.dd?.v??null,commission:t.cm??null,account_value:t.v??null,bars_held:entry.b!=null&&exit.b!=null?exit.b-entry.b:null};
      });
      const {indices,...pagination}=page;
      return {...base,...pagination,order:a.order??'asc',time_unit:'unix_milliseconds',...(a.op==='equity'?{resolution:'per_trade',curve:items,note:'This is a per-trade equity series. Trade drawdown is not an account high-water drawdown calculation.'}:{trades:items})};
    }
    if(a.op==='orders'){
      if(!Array.isArray(report.filledOrders))return fail('CAPABILITY_UNAVAILABLE','Filled orders array is unavailable.');
      const page=paginate(report.filledOrders);const {indices,...pagination}=page;
      return {...base,...pagination,orders:indices.map(i=>({record_number:i+1,record:safe(report.filledOrders[i])})),field_units:'TradingView native fields; not normalised to trade records'};
    }
    return fail('INVALID_ARGUMENT','Unknown strategy operation.');
  }catch(error){return fail('BROWSER_OPERATION_FAILED',String(error?.message??error).slice(0,600));}
}

const entity={entity_id:{type:'string',minLength:1,maxLength:300}};
const pagination={offset:{type:'integer',minimum:0,maximum:10000000},limit:{type:'integer',minimum:1,maximum:10000},order:{type:'string',enum:['asc','desc']}};
const expected={expected_symbol:{type:'string',minLength:1,maxLength:300},expected_timeframe:{type:'string',minLength:1,maxLength:30},expected_session:{type:'string',minLength:1,maxLength:100},expected_inputs:{type:'object',maxProperties:200,additionalProperties:{type:['string','number','boolean']}}};
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const targetArgs=ctx=>({target_id:ctx.targetId,expected_layout_id:ctx.expectedLayoutId});
export async function strategyRead(op,args,ctx){
  const result=await ctx.callPage(strategyPage,{...args,op});
  if(!result?.ok)throw new ToolError(result?.code??'ADAPTER_MISMATCH',result?.message??'Strategy operation failed.',result);
  return result;
}
const def=(name,op,description,properties={},required=[])=>({name,description,inputSchema:schema(properties,required),mutates:false,handler:(args,ctx)=>strategyRead(op,args,ctx)});

export async function waitForStrategy(args,ctx){
  const deadline=Date.now()+(args.timeout_ms??30000);let last=null,stable=0,sample=null,verdict=null;
  do{
    if(ctx.signal?.aborted)throw new ToolError('CANCELLED','Strategy wait cancelled.');
    sample=await strategyRead('status',args,ctx);
    if(sample.fingerprint===last)stable++;else{last=sample.fingerprint;stable=1;}
    verdict=freshnessVerdict(sample,{requireFresh:args.require_fresh!==false,stableReads:stable});
    if(verdict.ready)return {ok:true,...sample,...verdict,verified:true};
    await ctx.wait(350);
  }while(Date.now()<deadline);
  throw new ToolError('FRESHNESS_UNVERIFIED','The intended report did not satisfy the requested freshness evidence before timeout.',{...sample,...verdict,verified:false});
}

async function runVariants(variants,args,ctx){
  const call=(name,input={})=>ctx.callTool(name,{...input,...targetArgs(ctx)});
  const before=await call('chart_get_state');
  const baseInputs=await call('indicator_get_inputs',{entity_id:args.entity_id});
  const startingInputs=Object.fromEntries(baseInputs.inputs.map(v=>[v.id,v.value]));
  for(const variant of variants){const unknown=Object.keys(variant.overrides??{}).filter(k=>!Object.hasOwn(startingInputs,k));if(unknown.length)throw new ToolError('INVALID_ARGUMENT','Sweep contains unknown input IDs; no changes made.',{unknown});}
  const results=[];const restoration=[];let current={symbol:before.symbol,timeframe:before.timeframe};
  let inputState={...startingInputs};
  try{
    for(let i=0;i<variants.length;i++){
      if(ctx.signal?.aborted)break;
      const variant=variants[i];const symbol=variant.symbol??before.symbol;const timeframe=variant.timeframe??before.timeframe;
      const overrides=variant.overrides??{};const desired={...startingInputs,...overrides};
      const changed=symbol!==current.symbol||timeframe!==current.timeframe||JSON.stringify(desired)!==JSON.stringify(inputState);
      const probeId=randomUUID();
      try{
        await strategyRead('capture',{entity_id:args.entity_id,probe_id:probeId},ctx);
        if(symbol!==current.symbol){await call('chart_set_symbol',{symbol});current.symbol=symbol;}
        if(timeframe!==current.timeframe){await call('chart_set_timeframe',{timeframe});current.timeframe=timeframe;}
        if(JSON.stringify(desired)!==JSON.stringify(inputState)){await call('indicator_set_inputs',{entity_id:args.entity_id,inputs:desired});inputState=desired;}
        await call('chart_wait_ready',{symbol,timeframe,timeout_ms:Math.min(args.timeout_per_variant_ms??30000,30000)});
        const ready=await waitForStrategy({entity_id:args.entity_id,probe_id:probeId,expected_symbol:symbol,expected_timeframe:timeframe,expected_inputs:desired,timeout_ms:args.timeout_per_variant_ms??30000,require_fresh:changed},ctx);
        const report=await strategyRead('report',{entity_id:args.entity_id,probe_id:probeId,expected_symbol:symbol,expected_timeframe:timeframe,expected_inputs:desired},ctx);
        results.push({index:i,label:variant.label??`variant_${i+1}`,ok:true,symbol,timeframe,inputs:overrides,metrics:report.metrics,performance:report.performance,window:report.window,freshness_evidence:ready.freshness_evidence,freshness_status:changed?ready.freshness_status:'unchanged_configuration_current_report'});
      }catch(error){results.push({index:i,label:variant.label??`variant_${i+1}`,ok:false,symbol,timeframe,inputs:overrides,error:{code:error.code??'OPERATION_FAILED',message:error.message}});if(args.on_error!=='continue')break;}
      finally{try{await strategyRead('release',{entity_id:args.entity_id,probe_id:probeId},ctx);}catch{/* Probe is transient page memory; missing page after cancellation is safe. */}}
    }
  }finally{
    if(args.restore_start_state!==false){
      for(const [name,input] of [['chart_set_symbol',{symbol:before.symbol}],['chart_set_timeframe',{timeframe:before.timeframe}],['indicator_set_inputs',{entity_id:args.entity_id,inputs:startingInputs}]]){
        try{await call(name,input);restoration.push({tool:name,verified:true});}catch(error){restoration.push({tool:name,verified:false,error:error.message});}
      }
    }
  }
  const data={run_id:randomUUID(),started_chart:before,variants_requested:variants.length,variants_run:results.length,completed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,cancelled:Boolean(ctx.signal?.aborted),results,restoration,cache_used:false,execution:'sequential_single_selected_tab'};
  const file=await ctx.exportJson('strategy-sweep',data);
  return {ok:data.failed===0&&!data.cancelled&&restoration.every(r=>r.verified),...data,file};
}

const tools=[
  def('strategy_list','list','List every strategy with exact entity IDs; ambiguous or missing IDs are never guessed.'),
  def('strategy_get_report','report','Read the full performance object, long/short metrics, settings and report date window for one exact strategy.',{...entity,...expected,probe_id:{type:'string',maxLength:100}},['entity_id']),
  def('strategy_get_trades','trades','Read complete trade history using pagination, including paired entry/exit, commission and account value.',{...entity,...pagination,...expected},['entity_id']),
  def('strategy_get_equity','equity','Read per-trade account values and cumulative P&L with pagination; does not claim per-bar equity.',{...entity,...pagination,...expected},['entity_id']),
  def('strategy_get_orders','orders','Read all filled-order report records with pagination and explicit native field semantics.',{...entity,...pagination},['entity_id']),
  def('strategy_status','status','Read report availability, exact context and explicitly qualified freshness evidence.',{...entity,...expected,probe_id:{type:'string',maxLength:100}},['entity_id']),
  {name:'strategy_capture',description:'Capture a pre-mutation report probe for subsequent freshness checks; stores only bounded transient page-memory report references.',inputSchema:schema(entity,['entity_id']),mutates:false,handler:(args,ctx)=>strategyRead('capture',{...args,probe_id:randomUUID()},ctx)},
  {name:'strategy_wait',description:'Wait for exact strategy/context and explicit report-change evidence; unchanged stable metrics alone fail freshness checks.',inputSchema:schema({...entity,...expected,probe_id:{type:'string',minLength:1,maxLength:100},require_fresh:{type:'boolean'},timeout_ms:{type:'integer',minimum:1000,maximum:120000}},['entity_id','probe_id']),mutates:false,handler:waitForStrategy},
  {name:'strategy_get_inputs',description:'Read exact strategy input IDs and values.',inputSchema:schema(entity,['entity_id']),mutates:false,handler:(args,ctx)=>ctx.callTool('indicator_get_inputs',{...args,...targetArgs(ctx)})},
  {name:'strategy_set_inputs',description:'Set strategy inputs by exact IDs and verify values; report freshness is a separate step.',inputSchema:schema({...entity,inputs:{type:'object',minProperties:1,maxProperties:200,additionalProperties:{type:['string','number','boolean']}}},['entity_id','inputs']),mutates:true,handler:(args,ctx)=>ctx.callTool('indicator_set_inputs',{...args,...targetArgs(ctx)})},
  {name:'strategy_scan',description:'Run explicit parameter variants sequentially, verify report-change evidence, restore starting chart/inputs and export results.',inputSchema:schema({...entity,variants:{type:'array',minItems:1,maxItems:100,items:schema({label:{type:'string',maxLength:100},overrides:{type:'object',maxProperties:200,additionalProperties:{type:['string','number','boolean']}}},['overrides'])},timeout_per_variant_ms:{type:'integer',minimum:1000,maximum:120000},restore_start_state:{type:'boolean'},on_error:{type:'string',enum:['abort','continue']}},['entity_id','variants']),mutates:true,handler:(args,ctx)=>runVariants(args.variants,args,ctx)},
  {name:'strategy_sweep',description:'Run a bounded symbol × timeframe × input grid sequentially; fresh by default, no cross-run cache, full result evidence and state restoration.',inputSchema:schema({...entity,symbols:{type:'array',minItems:1,maxItems:100,items:{type:'string',minLength:1,maxLength:300}},timeframes:{type:'array',minItems:1,maxItems:100,items:{type:'string',minLength:1,maxLength:30}},inputs:{type:'object',maxProperties:200,additionalProperties:{type:'array',minItems:1,maxItems:100,items:{type:['string','number','boolean']}}},max_combinations:{type:'integer',minimum:1,maximum:100},timeout_per_variant_ms:{type:'integer',minimum:1000,maximum:120000},restore_start_state:{type:'boolean'},on_error:{type:'string',enum:['abort','continue']}},['entity_id','symbols','timeframes']),mutates:true,handler:(args,ctx)=>runVariants(expandSweep(args),args,ctx)},
  {name:'strategy_export',description:'Export one full report plus the complete trade history and per-trade equity; detects report changes during pagination.',inputSchema:schema({...entity,max_trades:{type:'integer',minimum:1,maximum:1000000},format:{type:'string',enum:['json','csv']}},['entity_id']),mutates:false,handler:async(args,ctx)=>{
    const report=await strategyRead('report',args,ctx);const trades=[];let offset=0;
    const max=args.max_trades??100000;
    if(report.closed_trade_records>max)throw new ToolError('LIMIT_EXCEEDED','Trade history exceeds max_trades.',{total:report.closed_trade_records,max_trades:max});
    while(true){
      if(ctx.signal?.aborted)throw new ToolError('CANCELLED','Strategy export cancelled.');
      const page=await strategyRead('trades',{...args,offset,limit:10000},ctx);
      if(page.report_fingerprint!==report.report_fingerprint)throw new ToolError('REPORT_CHANGED','Report changed during export; no file was written.');
      trades.push(...page.trades);if(page.next_offset===null)break;offset=page.next_offset;
    }
    const {report_fingerprint,...metadata}=report;
    const equity=trades.map(t=>({trade_number:t.trade_number,time_ms:t.exit_time_ms,account_value:t.account_value,cumulative_profit:t.cumulative_profit,cumulative_profit_percent:t.cumulative_profit_percent}));
    if(args.format==='csv'){
      const reportFile=await ctx.exportJson('strategy-report',metadata);const tradesFile=await ctx.exportCsv('strategy-trades',trades);const equityFile=await ctx.exportCsv('strategy-equity',equity);
      return {ok:true,trade_count:trades.length,files:{report:reportFile,trades:tradesFile,equity:equityFile}};
    }
    const file=await ctx.exportJson('strategy-report',{...metadata,trades,equity,equity_resolution:'per_trade'});return {ok:true,trade_count:trades.length,file};
  }},
  {name:'strategy_compare_metrics',description:'Compare two supplied metric objects with absolute and relative changes; does not infer causation or investment merit.',scope:'local',requiresLayout:false,mutates:false,inputSchema:schema({baseline:{type:'object',maxProperties:1000},candidate:{type:'object',maxProperties:1000}},['baseline','candidate']),handler:async args=>({ok:true,comparison:compareMetrics(args.baseline,args.candidate)})}
];
export default tools;
