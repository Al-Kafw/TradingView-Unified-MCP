import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { assertFixedFunction } from '../src/core/security.mjs';
import paneTools,{panePage} from '../src/features/panes.mjs';
import templateTools,{templatePage,templateHash} from '../src/features/templates.mjs';

function world(window){const context=vm.createContext({window,location:{pathname:'/chart/layoutA/'},setTimeout,clearTimeout,Date});return {context,run:(fn,args)=>{context.args=args;return vm.runInContext(`(${fn.toString()})(args)`,context);}};}
const plain=value=>JSON.parse(JSON.stringify(value));

function panesFixture(){
  const state={active:0,layout:'2h',reported:1,symbols:['NASDAQ:AAPL','NASDAQ:MSFT'],resolved:['NASDAQ:AAPL','NASDAQ:MSFT'],timeframes:['60','60'],visible:[true,true],sync:false,writes:0};
  let widgets,charts;
  widgets=state.symbols.map((_,i)=>({model:()=>({mainSeries:()=>({symbol:()=>state.symbols[i],interval:()=>state.timeframes[i],symbolInfo:()=>({pro_name:state.resolved[i]})}),model:()=>({dataSources:()=>[]})}),_mainDiv:{isConnected:true,getBoundingClientRect:()=>({width:state.visible[i]?300:0,height:state.visible[i]?200:0}),click:()=>{state.active=i;}}}));
  charts=widgets.map((widget,i)=>({_chartWidget:widget,setSymbol:async symbol=>{state.writes++;state.symbols[i]=symbol;state.resolved[i]=symbol;},setResolution:async tf=>{state.writes++;state.timeframes[i]=tf;}}));
  const cwc={getAll:()=>widgets,_layoutType:{value:()=>state.layout},inlineChartsCount:{value:()=>state.reported},setLayout:async code=>{state.layout=code;if(code==='s')state.visible=[true,false];}};
  const api={_chartWidgetCollection:cwc,_activeChartWidgetWV:{value:()=>charts[state.active]},symbolSync:()=>({value:()=>state.sync,setValue:value=>{state.sync=value;}})};
  return {...world({TradingViewApi:api}),state,widgets,charts,api,cwc};
}

test('panes/templates adapters pass fixed-function security gate and expose executable descriptors',()=>{
  assertFixedFunction(panePage);assertFixedFunction(templatePage);
  for(const tool of [...paneTools,...templateTools]){assert.equal(typeof tool.handler,'function');assert.equal(typeof tool.mutates,'boolean');}
});

test('pane listing observes actual widgets and visible geometry despite stale declared count',async()=>{
  const f=panesFixture();const result=await f.run(panePage,{op:'list'});assert.equal(result.widget_count,2);assert.equal(result.visible_pane_count,2);assert.equal(result.reported_inline_count,1);assert.equal(result.active_index,0);
});

test('native layout collapse counts displayed charts rather than retained hidden widgets',async()=>{
  const f=panesFixture();const result=await f.run(panePage,{op:'set_layout',layout:'s',expected_count:1,timeout_ms:300});assert.equal(result.verified,true);assert.equal(result.observed.widget_count,2);assert.equal(result.observed.visible_pane_count,1);
});

test('focus failure prevents market mutation in the wrong pane',async()=>{
  const f=panesFixture();f.widgets[1]._mainDiv.click=()=>{};const result=await f.run(panePage,{op:'set_symbol',index:1,symbol:'NASDAQ:NVDA',timeout_ms:0});assert.equal(result.ok,false);assert.equal(result.code,'FOCUS_UNVERIFIED');assert.equal(f.state.writes,0);assert.equal(f.state.symbols[0],'NASDAQ:AAPL');
});

test('per-pane symbol change verifies resolved server instrument and preserves other panes',async()=>{
  const f=panesFixture();const result=await f.run(panePage,{op:'set_symbol',index:1,symbol:'NASDAQ:NVDA'});assert.equal(result.verified,true);assert.equal(result.other_panes_unchanged,true);assert.equal(f.state.symbols[0],'NASDAQ:AAPL');assert.equal(f.state.symbols[1],'NASDAQ:NVDA');
});

test('changing only the pane label never verifies the requested resolved instrument',async()=>{
  const f=panesFixture();f.charts[1].setSymbol=async symbol=>{f.state.writes++;f.state.symbols[1]=symbol;};const result=await f.run(panePage,{op:'set_symbol',index:1,symbol:'NASDAQ:NVDA',timeout_ms:0});assert.equal(result.ok,false);assert.equal(result.code,'VERIFICATION_FAILED');assert.equal(result.observed.panes[1].resolved_symbol,'NASDAQ:MSFT');
});

test('enabled symbol sync blocks a single-pane change before writing',async()=>{
  const f=panesFixture();f.state.sync=true;const result=await f.run(panePage,{op:'set_symbol',index:1,symbol:'NASDAQ:NVDA'});assert.equal(result.code,'SYNC_ENABLED');assert.equal(f.state.writes,0);
});

test('unavailable requested sync controls prevent every requested sync mutation',async()=>{
  const f=panesFixture();const result=await f.run(panePage,{op:'set_sync',controls:{symbol:true,date_range:true}});assert.equal(result.code,'CAPABILITY_UNAVAILABLE');assert.equal(f.state.sync,false);
});

function templateFixture(){
  const make=(name,length=14)=>({version:1,panes:[{sources:[{type:'MainSeries'},{type:'Study',metaInfo:{id:`${name}@tv-basicstudies`,description:name},state:{inputs:{length},styles:{color:'blue'},visible:true}}]}]});
  const initial=make('RSI');const state={current:initial,rows:[{id:'custom-1',name:'My template',meta_info:{indicators:[{description:'RSI'}]}},{id:'standard-1',name:'Built-in',is_default:true,meta_info:{indicators:[]}}],contents:new Map([['custom-1',initial],['standard-1',make('SMA')]]),writes:0,list_bad:false,apply_noop:false};
  const backend={invalidateStudyTemplatesList:()=>{},getStudyTemplatesList:async()=>state.list_bad?{error:'session expired'}:state.rows,getStudyTemplateById:async id=>({content:JSON.stringify(state.contents.get(id))}),getStandardStudyTemplateById:(id,done)=>done({content:JSON.stringify(state.contents.get(id))}),saveStudyTemplate:async data=>{state.writes++;const id='custom-2';state.rows.push({id,name:data.name,meta_info:data.meta_info});state.contents.set(id,JSON.parse(data.content));return {result:{id}};},replaceStudyTemplate:(id,data,done)=>{state.writes++;state.contents.set(id,JSON.parse(data.content));done({result:{id}});},removeStudyTemplate:async id=>{state.writes++;state.rows=state.rows.filter(r=>r.id!==id);state.contents.delete(id);}};
  const chart={symbol:()=> 'NASDAQ:AAPL',resolution:()=> '60',createStudyTemplate:async()=>structuredClone(state.current),applyStudyTemplate:async template=>{state.writes++;if(!state.apply_noop)state.current=template;},getAllStudies:()=>state.current.panes.flatMap(p=>p.sources.filter(s=>s.type!=='MainSeries').map((s,i)=>({id:`registered-${i}`,name:s.metaInfo.description}))),_chartWidget:{model:()=>({model:()=>({})})}};
  const saveFactory=name=>({name,content:JSON.stringify(state.current),meta_info:{indicators:[{description:'RSI'}]}});
  const req={c:{templates:{exports:{backend,getStudyTemplateSaveData:saveFactory}}}};
  const chunk={push:parts=>parts[2](req)};
  return {...world({TradingViewApi:{_activeChartWidgetWV:{value:()=>chart}},webpackChunktradingview:chunk}),state,backend,chart,make};
}

test('failed native template list cannot be mistaken for an empty library',async()=>{
  const f=templateFixture();f.state.list_bad=true;const result=await f.run(templatePage,{op:'list'});assert.equal(result.ok,false);assert.equal(result.code,'ADAPTER_MISMATCH');
});

test('built-in template deletion is rejected before mutation',async()=>{
  const f=templateFixture();const result=await f.run(templatePage,{op:'delete',template_id:'standard-1',expected_name:'Built-in'});assert.equal(result.code,'BUILTIN_TEMPLATE');assert.equal(f.state.writes,0);
});

test('native template saves verify independent saved content rather than a returned success flag',async()=>{
  const f=templateFixture();const result=await f.run(templatePage,{op:'save',name:'New template'});assert.equal(result.verified,true);assert.equal(result.record.template_id,'custom-2');assert.deepEqual(plain(result.template),f.state.current);
});

test('duplicate template name is not silently overwritten',async()=>{
  const f=templateFixture();const result=await f.run(templatePage,{op:'save',name:'My template'});assert.equal(result.code,'NAME_CONFLICT');assert.equal(f.state.writes,0);
});

test('template application with the same count but wrong studies cannot verify',async()=>{
  const f=templateFixture();f.state.apply_noop=true;const result=await f.run(templatePage,{op:'apply',template:f.make('SMA'),timeout_ms:0});assert.equal(result.ok,false);assert.equal(result.code,'TEMPLATE_APPLY_UNVERIFIED');
});

test('template application verifies actual study identities and exposed input/style values',async()=>{
  const f=templateFixture();const result=await f.run(templatePage,{op:'apply',template:f.make('SMA',50),timeout_ms:1000});assert.equal(result.verified,true);assert.equal(result.all_input_values_verified,true);assert.equal(result.all_styles_verified,true);assert.equal(result.full_layout_fidelity,false);
});

test('template canonical hashes ignore object-key ordering but detect real input changes',()=>{
  assert.equal(templateHash({b:2,a:1}),templateHash({a:1,b:2}));assert.notEqual(templateHash({inputs:{length:14}}),templateHash({inputs:{length:15}}));
});
