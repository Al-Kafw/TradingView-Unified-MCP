import { ToolError } from '../core/errors.mjs';

export const PANE_LAYOUTS = Object.freeze({s:{count:1,name:'Single chart'},'2h':{count:2,name:'Two side by side'},'2v':{count:2,name:'Two stacked'},'2-1':{count:3,name:'Two above one'},'1-2':{count:3,name:'One above two'},'3h':{count:3,name:'Three side by side'},'3v':{count:3,name:'Three stacked'},'3s':{count:3,name:'Three asymmetric'},'4':{count:4,name:'Two by two'},'4h':{count:4,name:'Four side by side'},'4v':{count:4,name:'Four stacked'},'4s':{count:4,name:'Four asymmetric'},'6':{count:6,name:'Six charts'},'8':{count:8,name:'Eight charts'},'10':{count:10,name:'Ten charts'},'12':{count:12,name:'Twelve charts'},'14':{count:14,name:'Fourteen charts'},'16':{count:16,name:'Sixteen charts'}});

export async function panePage(a){
  const fail=(code,message,details={})=>({ok:false,code,message,...details});
  const api=window.TradingViewApi,cwc=api?._chartWidgetCollection;
  if(typeof cwc?.getAll!=='function')return fail('CAPABILITY_UNAVAILABLE','Chart-widget collection cannot be enumerated.');
  const unwrap=v=>v&&typeof v.value==='function'?v.value():v;
  const active=()=>api._activeChartWidgetWV?.value?.();
  const syncMethods={symbol:'symbolSync',timeframe:'intervalSync',crosshair:'crosshairSync',time:'timeSync',date_range:'dateRangeSync'};
  const syncHandle=key=>{
    const method=syncMethods[key];
    for(const owner of [api,window.ChartApiInstance]){
      if(typeof owner?.[method]!=='function')continue;
      const handle=owner[method]();
      if(typeof handle?.value==='function'&&typeof handle?.setValue==='function'&&typeof handle.value()==='boolean')return handle;
    }
    return null;
  };
  const readSync=()=>Object.fromEntries(Object.keys(syncMethods).map(key=>{const handle=syncHandle(key);return [key,{supported:Boolean(handle),enabled:handle?handle.value():null}];}));
  const snapshot=()=>{
    const widgets=cwc.getAll();if(!Array.isArray(widgets))throw new Error('getAll did not return an array');
    const current=active()?._chartWidget;const panes=widgets.map((widget,index)=>{
      const outer=widget.model?.();const inner=outer?.model?.()??outer;const series=outer?.mainSeries?.()??inner?.mainSeries?.();
      const info=series?.symbolInfo?.();const box=widget._mainDiv?.getBoundingClientRect?.();
      const visible=box?Boolean(widget._mainDiv.isConnected!==false&&box.width>0&&box.height>0):null;
      return {index,active:widget===current,symbol:unwrap(series?.symbol?.())??null,timeframe:unwrap(series?.interval?.())??null,resolved_symbol:info?String(info.pro_name??info.full_name??info.name??''):null,visible,studies:(inner?.dataSources?.()??[]).filter(s=>typeof s.metaInfo==='function').map(s=>({entity_id:typeof s.id?.()==='string'?s.id():null,name:s.metaInfo()?.description??null}))};
    });
    const activeIndex=widgets.indexOf(current);
    let layoutCode=unwrap(cwc._layoutType);if(typeof api.layout==='function')layoutCode=api.layout();
    const inlineCount=unwrap(cwc.inlineChartsCount);
    const visibilityKnown=panes.every(p=>p.visible!==null);
    return {layout_code:typeof layoutCode==='string'?layoutCode:null,reported_inline_count:typeof inlineCount==='number'?inlineCount:null,widget_count:widgets.length,visible_pane_count:visibilityKnown?panes.filter(p=>p.visible).length:null,active_index:activeIndex>=0?activeIndex:null,panes,visibility_verified:visibilityKnown};
  };
  const wait=async(predicate,timeout=a.timeout_ms??10000)=>{const deadline=Date.now()+timeout;do{const s=snapshot();if(predicate(s))return s;await new Promise(r=>setTimeout(r,150));}while(Date.now()<deadline);return null;};
  const focus=async index=>{
    const widgets=cwc.getAll();const widget=widgets[index];
    if(!widget)return fail('TARGET_NOT_FOUND','Pane index does not exist.');
    const before=snapshot();if(before.panes[index].visible===false)return fail('PANE_HIDDEN','The requested pane is retained internally but is not displayed.');
    if(active()?._chartWidget!==widget){
      if(typeof widget._mainDiv?.click!=='function')return fail('CAPABILITY_UNAVAILABLE','Pane focus element is unavailable.');
      widget._mainDiv.click();
      const observed=await wait(()=>active()?._chartWidget===widget&&cwc.getAll()[index]===widget);
      if(!observed)return fail('FOCUS_UNVERIFIED','Pane was clicked but active widget reference did not become the requested pane.',{mutation_attempted:true,observed:snapshot()});
    }
    if(cwc.getAll()[index]!==widget)return fail('PANE_CHANGED','Pane order changed during focus.');
    return {ok:true,widget,before};
  };
  try{
    if(a.op==='list')return {ok:true,...snapshot()};
    if(a.op==='get_sync')return {ok:true,controls:readSync(),note:'Only documented native watched-value sync APIs are used; unavailable controls are reported explicitly.'};
    if(a.op==='set_sync'){
      const handles=Object.entries(a.controls).map(([key,value])=>({key,value,handle:syncHandle(key)}));
      const missing=handles.filter(h=>!h.handle).map(h=>h.key);if(missing.length)return fail('CAPABILITY_UNAVAILABLE','Some requested native sync controls are unavailable; none were changed.',{unavailable:missing});
      const before=readSync();const beforePanes=snapshot();
      for(const h of handles)await h.handle.setValue(h.value);
      const observed=readSync();const verified=handles.every(h=>observed[h.key].enabled===h.value);
      return {ok:verified,code:verified?undefined:'VERIFICATION_FAILED',mutation_attempted:true,verified,before,observed,panes_before:beforePanes,panes_after:snapshot()};
    }
    if(a.op==='set_layout'){
      if(typeof cwc.setLayout!=='function')return fail('CAPABILITY_UNAVAILABLE','Native layout selection API is unavailable.');
      const before=snapshot();await cwc.setLayout(a.layout);
      const observed=await wait(s=>s.visible_pane_count===a.expected_count&&(s.layout_code===a.layout||s.layout_code===null));
      if(!observed)return fail('LAYOUT_UNVERIFIED','Layout selection was submitted but displayed pane count/layout did not verify.',{mutation_attempted:true,requested_layout:a.layout,expected_count:a.expected_count,before,observed:snapshot()});
      return {ok:true,verified:true,mutation_attempted:true,requested_layout:a.layout,before,observed,geometry_verified:observed.visibility_verified,orientation_verified:observed.layout_code===a.layout};
    }
    if(a.op==='focus'){
      const result=await focus(a.index);if(!result.ok)return result;return {ok:true,verified:true,focused_index:a.index,observed:snapshot()};
    }
    if(a.op==='set_symbol'||a.op==='set_timeframe'){
      const sync=readSync();const syncKey=a.op==='set_symbol'?'symbol':'timeframe';
      if(sync[syncKey].enabled===true&&a.allow_linked_changes!==true)return fail('SYNC_ENABLED','This pane is synchronized with other panes. Disable the relevant sync control or explicitly allow linked changes.');
      if(a.op==='set_timeframe'){
        const replay=api._replayApi;
        if(typeof replay?.isReplayStarted==='function'){const started=unwrap(replay.isReplayStarted());if(started!==false)return fail('REPLAY_STATE_BLOCKS_CHANGE','Timeframe change requires a confirmed stopped replay.');}
      }
      const selected=await focus(a.index);if(!selected.ok)return selected;
      const before=snapshot();const chart=active();
      if(chart?._chartWidget!==selected.widget||cwc.getAll()[a.index]!==selected.widget)return fail('FOCUS_UNVERIFIED','The active chart changed before mutation; no market change was submitted.');
      if(a.op==='set_symbol'){
        if(typeof chart.setSymbol!=='function')return fail('CAPABILITY_UNAVAILABLE','setSymbol is unavailable.');await chart.setSymbol(a.symbol,{});
      }else{
        if(typeof chart.setResolution!=='function')return fail('CAPABILITY_UNAVAILABLE','setResolution is unavailable.');await chart.setResolution(a.timeframe,{});
      }
      const observed=await wait(s=>{
        if(cwc.getAll()[a.index]!==selected.widget)return false;const p=s.panes[a.index];
        return a.op==='set_symbol'?p?.symbol===a.symbol&&p.resolved_symbol===a.symbol:String(p?.timeframe)===a.timeframe;
      });
      const after=observed??snapshot();const collateral=after.panes.filter(p=>p.index!==a.index&&(p.symbol!==before.panes[p.index]?.symbol||p.timeframe!==before.panes[p.index]?.timeframe)).map(p=>({index:p.index,before:before.panes[p.index],after:p}));
      if(collateral.length&&a.allow_linked_changes!==true)return fail('COLLATERAL_PANE_CHANGE','The mutation also changed other panes; inspect before continuing.',{mutation_attempted:true,collateral,observed:after});
      if(!observed)return fail('VERIFICATION_FAILED','Target pane did not resolve to the requested market/timeframe.',{mutation_attempted:true,requested:{symbol:a.symbol,timeframe:a.timeframe},observed:after});
      return {ok:true,verified:true,mutation_attempted:true,index:a.index,before,observed:after,collateral,other_panes_unchanged:collateral.length===0};
    }
    return fail('INVALID_ARGUMENT','Unknown pane operation.');
  }catch(error){return fail('PANE_OPERATION_FAILED',String(error?.message??error).slice(0,600),{mutation_attempted:!['list','get_sync'].includes(a.op)});}
}

const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const index={index:{type:'integer',minimum:0,maximum:31}};
const opts={allow_linked_changes:{type:'boolean'},timeout_ms:{type:'integer',minimum:300,maximum:30000}};
const def=(name,op,description,properties={},required=[],mutates=true)=>({name,description,inputSchema:schema(properties,required),mutates,handler:async(args,ctx)=>{
  const result=await ctx.callPage(panePage,{...args,op,...(op==='set_layout'?{expected_count:PANE_LAYOUTS[args.layout].count}:{})},{timeoutMs:(args.timeout_ms??10000)*2+5000});
  if(!result?.ok)throw new ToolError(result?.code??'ADAPTER_MISMATCH',result?.message??'Pane operation failed.',result);return result;
}});
export default [
  {name:'pane_layout_options',description:'List known native layout codes and expected displayed chart counts; actual account entitlement is checked on application.',scope:'local',requiresLayout:false,mutates:false,inputSchema:schema(),handler:async()=>({ok:true,layouts:Object.entries(PANE_LAYOUTS).map(([code,value])=>({code,...value})),account_entitlement_verified:false})},
  def('pane_list','list','Read all retained chart widgets, displayed pane geometry, exact active pane and per-pane markets/studies.',{},[],false),
  def('pane_set_layout','set_layout','Select a native multi-chart layout and verify displayed pane count; retained hidden widgets do not count as visible charts.',{layout:{type:'string',enum:Object.keys(PANE_LAYOUTS)},timeout_ms:opts.timeout_ms},['layout']),
  def('pane_focus','focus','Focus a pane by index and verify active widget reference identity before dependent operations.',{...index,timeout_ms:opts.timeout_ms},['index']),
  def('pane_set_symbol','set_symbol','Set an exchange-qualified symbol on exactly one pane, verify resolved instrument and detect collateral pane changes.',{...index,symbol:{type:'string',minLength:3,maxLength:300,pattern:'^[^\\s:]+:[^\\s]+$'},...opts},['index','symbol']),
  def('pane_set_timeframe','set_timeframe','Set a timeframe on exactly one pane; verify target and check every other pane for collateral changes.',{...index,timeframe:{type:'string',minLength:1,maxLength:30},...opts},['index','timeframe']),
  def('pane_get_sync','get_sync','Read native symbol, timeframe, crosshair, time and date-range synchronization controls when available.',{},[],false),
  def('pane_set_sync','set_sync','Set and verify explicit native synchronization targets; preflight all requested controls before mutation.',{controls:{...schema({symbol:{type:'boolean'},timeframe:{type:'boolean'},crosshair:{type:'boolean'},time:{type:'boolean'},date_range:{type:'boolean'}}),minProperties:1}},['controls'])
];
