import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { assertFixedFunction } from '../src/core/security.mjs';
import chartTools, { chartPage } from '../src/features/chart.mjs';
import dataTools, { dataPage } from '../src/features/data.mjs';
import strategyTools, { strategyPage } from '../src/features/strategy.mjs';
import { expandSweep, freshnessVerdict, compareMetrics } from '../src/features/strategy-helpers.mjs';
import pineTools, { pinePage, analyzePine, sourceHash } from '../src/features/pine.mjs';
import replayTools, { replayPage } from '../src/features/replay.mjs';

function fixture(overrides = {}) {
  const state={symbol:'NASDAQ:AAPL',timeframe:'60',type:1,range:{from:100,to:1000},inputs:[{id:'length',value:14}],visible:true,studies:[{id:'strat-1',name:'Example'}],report:{currency:'USD',settings:{dateRange:{backtest:{from:1000,to:2000}}},performance:{all:{netProfit:0,totalTrades:30},long:{all:{netProfit:1}},short:{all:{netProfit:-1}}},trades:Array.from({length:30},(_,i)=>({e:{tp:'le',tm:i*1000,p:i,b:i},x:{tm:i*1000+500,p:i+1,b:i+1},q:0,tp:{v:i,p:0},cp:{v:i,p:0},v:1000+i,cm:0})),filledOrders:Array.from({length:35},(_,i)=>({i,p:i}))}};
  const study={getInputValues:()=>state.inputs.map(x=>({...x})),getInputsInfo:()=>[{id:'length',name:'Length'}],setInputValues:async values=>{state.inputs=values;},isVisible:()=>state.visible,setVisible:v=>{state.visible=v;}};
  const source={id:()=> 'strat-1',metaInfo:()=>({description:'Example',id:'StrategyScript$USER;example'}),reportData:()=>state.report,isLoading:()=>false,dataWindowView:()=>({items:()=>[{_title:'Value',_value:'0'}]})};
  const bars={firstIndex:()=>0,lastIndex:()=>599,size:()=>600,valueAt:i=>[1000+i,0,3,-1,2,0]};
  const main={bars:()=>bars,symbolInfo:()=>({ticker:'AAPL',pro_name:state.symbol})};
  const model={mainSeries:()=>main,dataSources:()=>[source]};
  const chart={symbol:()=>state.symbol,resolution:()=>state.timeframe,chartType:()=>state.type,getAllStudies:()=>state.studies,getStudyById:id=>id==='strat-1'?study:null,setSymbol:async value=>{state.symbol=value;},setResolution:async value=>{state.timeframe=value;},setChartType:async value=>{state.type=value;},getVisibleRange:()=>state.range,setVisibleRange:async value=>{state.range=value;},createStudy:async name=>{await Promise.resolve();state.studies.push({id:'new-study',name});return 'new-study';},removeEntity:async id=>{state.studies=state.studies.filter(s=>s.id!==id);},_chartWidget:{model:()=>({model:()=>model,mainSeries:()=>main})}};
  const context=vm.createContext({window:{TradingViewApi:{_activeChartWidgetWV:{value:()=>chart},_chartWidgetCollection:{metaInfo:{uid:{value:()=> 'layout-A'}}}}},location:{pathname:'/chart/layout-A/'},setTimeout,clearTimeout,URLSearchParams,URL,Date,...overrides});
  const run=(fn,args)=>{context.args=args;return vm.runInContext(`(${fn.toString()})(args)`,context);};
  return {state,study,source,chart,bars,context,run};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('every authored research page adapter passes the credential and dynamic-code gate',()=>{
  for(const fn of [chartPage,dataPage,strategyPage,pinePage,replayPage])assert.equal(typeof assertFixedFunction(fn),'string');
});

test('every research tool has a unique name, fixed schema and runnable handler',()=>{
  const tools=[...chartTools,...dataTools,...strategyTools,...pineTools,...replayTools];
  assert.equal(new Set(tools.map(t=>t.name)).size,tools.length);
  for(const tool of tools){assert.equal(tool.inputSchema.type,'object');assert.equal(typeof tool.handler,'function');assert.equal(typeof tool.mutates,'boolean');}
});

test('symbol mutation reports observed symbol and awaits registered study creation',async()=>{
  const f=fixture();const changed=await f.run(chartPage,{op:'set_symbol',symbol:'BINANCE:BTCUSDT'});
  assert.equal(changed.verified,true);assert.equal(changed.observed.symbol,'BINANCE:BTCUSDT');
  const added=await f.run(chartPage,{op:'study_add',name:'SMA'});assert.equal(added.entity_id,'new-study');assert.equal(added.verified,true);
});

test('a created study without a registered string ID is an unverified mutation',async()=>{
  const f=fixture();f.chart.createStudy=async()=>[];const result=await f.run(chartPage,{op:'study_add',name:'SMA'});
  assert.equal(result.ok,false);assert.equal(result.code,'VERIFICATION_FAILED');assert.equal(result.mutation_attempted,true);
});

test('an unknown input ID prevents all input mutations, including recognised keys',async()=>{
  const f=fixture();const result=await f.run(chartPage,{op:'study_set_inputs',entity_id:'strat-1',inputs:{length:99,typo:2}});
  assert.equal(result.ok,false);assert.equal(result.code,'INVALID_ARGUMENT');assert.equal(f.state.inputs[0].value,14);
});

test('unreadable replay state blocks timeframe changes without claiming replay is active',async()=>{
  const f=fixture();f.context.window.TradingViewApi._replayApi={isReplayStarted:()=>({unrecognised:true})};
  const result=await f.run(chartPage,{op:'set_timeframe',timeframe:'1D'});assert.equal(result.code,'ADAPTER_MISMATCH');assert.equal(f.state.timeframe,'60');
});

test('data pagination can read beyond the former 500-bar cap and preserves zero values',async()=>{
  const f=fixture();const result=await f.run(dataPage,{op:'ohlcv',limit:600});assert.equal(result.returned,600);assert.equal(result.bars[0].open,0);assert.equal(result.bars[0].volume,0);assert.equal(result.next_offset,null);
});

test('empty loaded bar series is an explicit not-ready error',async()=>{
  const f=fixture();f.bars.size=()=>0;const result=await f.run(dataPage,{op:'ohlcv'});assert.equal(result.code,'CHART_NOT_READY');
});

test('strategy selection fails closed instead of falling back to another strategy',()=>{
  const f=fixture();const result=f.run(strategyPage,{op:'report',entity_id:'wrong-id'});assert.equal(result.ok,false);assert.equal(result.code,'TARGET_NOT_FOUND');
});

test('full trade extraction exceeds twenty records and preserves zero prices, quantities and commissions',()=>{
  const f=fixture();const result=f.run(strategyPage,{op:'trades',entity_id:'strat-1',limit:100});assert.equal(result.trades.length,30);assert.equal(result.trades[0].entry_price,0);assert.equal(result.trades[0].quantity,0);assert.equal(result.trades[0].commission,0);
});

test('descending trade pagination uses exact offset without dropping or duplicating rows',()=>{
  const f=fixture();const result=f.run(strategyPage,{op:'trades',entity_id:'strat-1',limit:3,offset:5,order:'desc'});assert.deepEqual(plain(result.trades.map(t=>t.trade_number)),[25,24,23]);assert.equal(result.next_offset,8);
});

test('equity explicitly has per-trade resolution; no invented initial capital',()=>{
  const f=fixture();const result=f.run(strategyPage,{op:'equity',entity_id:'strat-1',limit:100});assert.equal(result.resolution,'per_trade');assert.equal(result.curve.length,30);assert.equal(result.curve[0].account_value,1000);assert.equal(Object.hasOwn(result,'initial_capital'),false);
});

test('changing chart inputs alone never establishes report freshness',()=>{
  const f=fixture();f.run(strategyPage,{op:'capture',entity_id:'strat-1',probe_id:'probe-1'});f.state.inputs=[{id:'length',value:50}];
  const sample=f.run(strategyPage,{op:'status',entity_id:'strat-1',probe_id:'probe-1',expected_inputs:{length:50}});
  assert.equal(sample.context_matches,true);assert.equal(sample.freshness_evidence.report_payload_changed,false);
  assert.equal(freshnessVerdict(sample,{stableReads:100}).ready,false);
});

test('payload-change evidence and stable exact context allow an explicitly qualified freshness verdict',()=>{
  const f=fixture();f.run(strategyPage,{op:'capture',entity_id:'strat-1',probe_id:'probe-2'});f.state.report.performance.all.netProfit=5;
  const sample=f.run(strategyPage,{op:'status',entity_id:'strat-1',probe_id:'probe-2',expected_symbol:'NASDAQ:AAPL'});const verdict=freshnessVerdict(sample,{stableReads:3});
  assert.equal(verdict.ready,true);assert.equal(verdict.freshness_status,'change_observed_after_probe');
  assert.equal(freshnessVerdict({...sample,context_matches:false},{stableReads:100}).ready,false);
});

test('sweep product is bounded before materialisation, deduplicates markets, and preserves variants',()=>{
  assert.throws(()=>expandSweep({symbols:['X'],timeframes:['1'],inputs:{a:Array(100).fill(1),b:Array(100).fill(2)},max_combinations:100}),e=>e.code==='LIMIT_EXCEEDED');
  const result=expandSweep({symbols:['X','X'],timeframes:['1'],inputs:{length:[10,20]}});assert.equal(result.length,2);assert.deepEqual(result.map(x=>x.overrides.length),[10,20]);
});

test('metric comparison does not divide by zero or pretend nonnumeric values are numeric',()=>{
  const result=compareMetrics({zero:0,negative:-10,label:'a'},{zero:3,negative:-5,label:'b'});assert.equal(result.find(r=>r.metric==='zero').relative_change_percent,null);assert.equal(result.find(r=>r.metric==='negative').relative_change_percent,50);assert.equal(result.find(r=>r.metric==='label').absolute_change,null);
});

function pineFixture({detachedOnly=false,noOpWrite=false}={}){
  let source='//@version=6\nindicator("X")\nplot(close)';
  const box={width:600,height:300};const container={isConnected:true,getBoundingClientRect:()=>box,contains:n=>n===container};
  const detached={isConnected:false,getBoundingClientRect:()=>({width:0,height:0})};
  const title={isConnected:true,getBoundingClientRect:()=>box,textContent:'Example'};
  const active={getDomNode:()=>container,getValue:()=>source,setValue:v=>{if(!noOpWrite)source=v;},getModel:()=>({uri:'pine://visible'})};
  const inactive={getDomNode:()=>detached,getValue:()=> 'detached-secret-script'};
  const env={editor:{getEditors:()=>detachedOnly?[inactive]:[inactive,active],getModelMarkers:()=>[{startLineNumber:1,startColumn:1,message:'warning',severity:4}]}};
  const document={querySelectorAll:selector=>selector==='.monaco-editor.pine-editor-monaco'?[container]:selector==='[data-name="scriptTitle"]'?[title]:[]};
  const f=fixture({document});f.context.window.monaco=env;return {...f,getSource:()=>source};
}

test('Pine lookup matches a visible DOM-bound editor, never the first detached editor',async()=>{
  const f=pineFixture();const result=await f.run(pinePage,{op:'get_source'});assert.equal(result.title,'Example');assert.match(result.source,/indicator/);assert.doesNotMatch(result.source,/detached/);
  const missing=pineFixture({detachedOnly:true});assert.equal((await missing.run(pinePage,{op:'get_source'})).code,'PINE_EDITOR_UNAVAILABLE');
});

test('Pine writes compare full content, catching a same-length no-op write',async()=>{
  const f=pineFixture({noOpWrite:true});const before=f.getSource();const result=await f.run(pinePage,{op:'set_source',source:before.replace('close','open '),expected_source:before,expected_title:'Example'});assert.equal(result.ok,false);assert.equal(result.code,'VERIFICATION_FAILED');
});

test('Pine preimage mismatch never overwrites the existing buffer',async()=>{
  const f=pineFixture();const before=f.getSource();const result=await f.run(pinePage,{op:'set_source',source:'new',expected_source:'stale'});assert.equal(result.code,'PRECONDITION_FAILED');assert.equal(f.getSource(),before);
});

test('Pine warnings do not count as compiler errors',async()=>{
  const f=pineFixture();const result=await f.run(pinePage,{op:'get_errors'});assert.equal(result.warning_count,1);assert.equal(result.error_count,0);
});

test('static Pine analysis ignores declaration text in strings/comments and never claims compilation',()=>{
  const result=analyzePine('//@version=6\nindicator("strategy(x)")\n// library("fake")\nplot(close)');assert.equal(result.declarations.length,1);assert.equal(result.compiler,false);assert.equal(sourceHash('same').length,64);
});

test('replay status unwraps false WatchedValues instead of treating objects as true',async()=>{
  const f=fixture();f.context.window.TradingViewApi._replayApi={isReplayAvailable:()=>({value:()=>true}),isReplayStarted:()=>({value:()=>false}),isAutoplayStarted:()=>({value:()=>false})};const result=await f.run(replayPage,{op:'status'});assert.equal(result.started,false);assert.equal(result.autoplay,false);
});

test('replay autoplay uses explicit target state and verifies the selected delay',async()=>{
  const f=fixture();let autoplay=false,delay=1000,calls=0;f.context.window.TradingViewApi._replayApi={isReplayStarted:()=>true,isAutoplayStarted:()=>autoplay,autoplayDelay:()=>delay,changeAutoplayDelay:v=>{delay=v;},toggleAutoplay:()=>{calls++;autoplay=!autoplay;}};
  const first=await f.run(replayPage,{op:'autoplay',enabled:true,delay_ms:300});assert.equal(first.verified,true);assert.equal(first.observed.autoplay_delay_ms,300);
  await f.run(replayPage,{op:'autoplay',enabled:true,delay_ms:300});assert.equal(calls,1);
});
