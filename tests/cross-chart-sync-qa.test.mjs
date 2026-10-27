import test from 'node:test';
import assert from 'node:assert/strict';
import tools,{captureCrossChartSync,evaluateCrossChartSync,evaluateCrossChartSyncMode} from '../src/features/cross-chart-sync-qa.mjs';
const sources=[
  {target_id:'A',expected_layout_id:'layoutA',expected_symbol:'CME_MINI_DL:NQ1!',expected_timeframe:'30'},
  {target_id:'B',expected_layout_id:'layoutB',expected_symbol:'CBOT_MINI_DL:YM1!',expected_timeframe:'30'}
];
function fixture({replayA=false,replayB=false,clockA=100,clockB=100,shiftB=0,tfB='30',latestDrift=false,closedDrift=false,identityDrift=false,replayDrift=false,partial=false,short=false,indexShiftB=0,latestTimeDrift=false}={}) {
  const charts=sources.map((s,i)=>({ok:true,layout_id:s.expected_layout_id,symbol:s.expected_symbol,timeframe:i?tfB:s.expected_timeframe}));
  const replays=[{ok:true,started:replayA,autoplay:false,current_time:replayA?clockA:null},
    {ok:true,started:replayB,autoplay:false,current_time:replayB?clockB:null}];
  const make=(i,k)=>{
    let times=[9000,7200,5400,3600,1800];
    if(i)times=times.map(x=>x+shiftB);
    let bars=times.map((time,j)=>({index:20+(i?indexShiftB:0)-j,time,open:100+i*10+j,high:103+i*10+j,
      low:99+i*10+j,close:101+i*10+j,volume:150+j}));
    if(k===2&&latestDrift){bars[0].close+=1;bars[0].volume+=5;}
    if(k===2&&latestTimeDrift){bars[0].time+=1800;}
    if(k===2&&closedDrift)bars[2].high+=1;
    if(short)bars=bars.slice(0,3);
    return {ok:true,layout_id:charts[i].layout_id,symbol:charts[i].symbol,resolved_symbol:charts[i].symbol.replace('_DL',''),
      timeframe:charts[i].timeframe,session:'regular',order:'desc',source:'loaded_chart_bars',
      time_unit:'unix_seconds',total_available:20+ (i?indexShiftB:0),first_index:0,last_index:20+(i?indexShiftB:0),bars};
  };
  let counts={};const calls=[];
  const ctx={calls,async callTool(name,args){
    const i=sources.findIndex(s=>s.target_id===args.target_id);
    assert.ok(i>=0);calls.push([name,args.target_id]);
    const key=name+':'+i;counts[key]=(counts[key]??0)+1;
    if(name==='chart_get_state')return identityDrift&&i===1&&counts[key]>1?{...charts[i],timeframe:'15'}:charts[i];
    if(name==='replay_status')return replayDrift&&i===1&&counts[key]>1?{...replays[i],started:!replays[i].started}:replays[i];
    if(name==='data_get_ohlcv')return partial?{...make(i,counts[key]),bars:[]} :make(i,counts[key]);
    assert.fail('Unexpected '+name);
  }};
  return {charts,replays,captures:charts.map((_,i)=>make(i,1)),ctx};
}
const opts=()=>({sources,window_bars:4,min_common_bars:3});

test('exact synchronized live closed bars compare by timestamp, never bar index',async()=>{
  const f=fixture(),r=await captureCrossChartSync(opts(),f.ctx);
  assert.equal(r.status,'aligned');assert.equal(r.common_closed_bar_count,4);
  assert.deepEqual(r.aligned_bars.map(x=>x.time_unix),[7200,5400,3600,1800]);
  assert.equal(r.aligned_bars[0].candles.length,2);assert.equal(r.latest_developing_bar_excluded,true);
  assert.equal(r.capture_atomic,false);assert.equal(r.no_chart_mutations,true);
  assert.equal(f.ctx.calls.filter(x=>x[0]==='data_get_ohlcv').length,4);
});
test('different current candle close and volume is tolerated because developing bar is excluded',async()=>{
  const f=fixture({latestDrift:true});assert.equal((await captureCrossChartSync(opts(),f.ctx)).status,'aligned');
});
test('closed candle price drift is blocked, never silently compared',async()=>{
  const f=fixture({closedDrift:true});const r=await captureCrossChartSync(opts(),f.ctx);
  assert.equal(r.reason_code,'CLOSED_WINDOW_CHANGED_BETWEEN_READS');assert.equal(r.comparison_allowed,false);
});
test('mixed paused Replay and live mode refuses without OHLC reads',async()=>{
  const f=fixture({replayA:true,replayB:false}),r=await captureCrossChartSync(opts(),f.ctx);
  assert.equal(r.reason_code,'MIXED_REPLAY_AND_LIVE');
  assert.equal(f.ctx.calls.filter(x=>x[0]==='data_get_ohlcv').length,0);
});
test('different Replay cursor times refuse before data',async()=>{
  const f=fixture({replayA:true,replayB:true,clockA:1,clockB:2});
  assert.equal((await captureCrossChartSync(opts(),f.ctx)).reason_code,'REPLAY_CLOCK_UNALIGNED_OR_MOVING');
});
test('same paused Replay cursor can compare loaded closed candidate bars',async()=>{
  const f=fixture({replayA:true,replayB:true,clockA:12500,clockB:12500});
  const r=await captureCrossChartSync(opts(),f.ctx);assert.equal(r.replay_mode,'paused_replay');
});
test('different most recent closed timestamps are blocked',async()=>{
  const f=fixture({shiftB:1800});assert.equal((await captureCrossChartSync(opts(),f.ctx)).reason_code,'LATEST_CLOSED_CANDLE_TIME_MISMATCH');
});
test('different requested source timeframes fail before browser calls',async()=>{
  const f=fixture();await assert.rejects(captureCrossChartSync({...opts(),sources:[sources[0],{...sources[1],expected_timeframe:'15'}]},f.ctx),e=>e.code==='TIMEFRAME_REQUEST_MISMATCH');
  assert.equal(f.ctx.calls.length,0);
});
test('actual unexpected timeframe blocks even when requested sources agree',async()=>{
  const f=fixture({tfB:'15'});const r=await captureCrossChartSync(opts(),f.ctx);
  assert.equal(r.reason_code,'CHART_IDENTITY_MISMATCH');
  assert.equal(f.ctx.calls.filter(x=>x[0]==='data_get_ohlcv').length,0);
});
test('chart identity drift between initial and final checks blocks',async()=>{
  const f=fixture({identityDrift:true});assert.equal((await captureCrossChartSync(opts(),f.ctx)).reason_code,'CHART_OR_REPLAY_CHANGED_DURING_CAPTURE');
});
test('Replay drift between initial and final checks blocks',async()=>{
  const f=fixture({replayDrift:true});assert.equal((await captureCrossChartSync(opts(),f.ctx)).reason_code,'CHART_OR_REPLAY_CHANGED_DURING_CAPTURE');
});
test('insufficient OHLC coverage blocks without invented candles',async()=>{
  const f=fixture({short:true});assert.equal((await captureCrossChartSync(opts(),f.ctx)).reason_code,'OHLCV_SCOPE_OR_COVERAGE_MISMATCH');
});
test('missing OHLC data blocks without fabricating zero observations',async()=>{
  const f=fixture({partial:true});assert.equal((await captureCrossChartSync(opts(),f.ctx)).reason_code,'OHLCV_SCOPE_OR_COVERAGE_MISMATCH');
});
test('duplicate exact chart targets and layouts are rejected before reads',async()=>{
  const f=fixture();for(const patch of [[sources[0],{...sources[1],target_id:'A'}],[sources[0],{...sources[1],expected_layout_id:'layoutA'}]]){
    await assert.rejects(captureCrossChartSync({...opts(),sources:patch},f.ctx),e=>e.code==='DUPLICATE_TARGET'||e.code==='DUPLICATE_LAYOUT');
  }
  assert.equal(f.ctx.calls.length,0);
});
test('unknown Replay status fails closed and cannot mean live',()=>{
  assert.equal(evaluateCrossChartSyncMode([{started:null},{started:false}]),'REPLAY_STATE_UNKNOWN');
});
test('non-atomic observations cannot certify timestamp synchronization or signal correctness',()=>{
  const f=fixture(),r=evaluateCrossChartSync(sources,f.charts,f.replays,f.captures);
  assert.equal(r.capture_atomic,false);assert.equal(r.status,'aligned');
  assert.match(r.limitation,/No cross-market tick synchronization/);
});
test('catalog descriptor only registers a read-only bounded multi-chart tool',()=>{
  assert.equal(tools.length,1);const t=tools[0];assert.equal(t.name,'data_get_cross_chart_sync_qa');
  assert.equal(t.mutates,false);assert.equal(t.needsTarget,false);assert.equal(t.inputSchema.properties.sources.maxItems,4);
  assert.equal(t.inputSchema.additionalProperties,false);
});

test('different loaded chart bar indexes do not prevent correctly timestamp-aligned OHLC',async()=>{
  const f=fixture({indexShiftB:7});
  const r=await captureCrossChartSync(opts(),f.ctx);
  assert.equal(r.status,'aligned');assert.equal(r.common_closed_bar_count,4);
});
test('latest timestamp rollover is blocked despite ignoring live developing price changes',async()=>{
  const f=fixture({latestTimeDrift:true});
  const r=await captureCrossChartSync(opts(),f.ctx);
  assert.equal(r.reason_code,'CLOSED_WINDOW_CHANGED_BETWEEN_READS');
});
