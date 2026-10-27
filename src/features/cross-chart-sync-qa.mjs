import { ToolError } from '../core/errors.mjs';

const refuse = (code, observations=[], detail='') => ({
  ok: true, read_only: true, comparison_allowed: false, status: 'blocked',
  reason_code: code, reason: detail, observations,
  capture_atomic: false, no_chart_mutations: true,
  note: 'Do not compare cross-market indicator signals from these observations.'
});
const ensure = (condition, code, msg) => {if (!condition) throw new ToolError(code,msg);};
const identity = state => [state?.layout_id,state?.symbol,state?.timeframe];
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const finiteBar = b => b && Number.isSafeInteger(b.time) &&
  [b.open,b.high,b.low,b.close].every(Number.isFinite) &&
  b.high>=Math.max(b.open,b.close) && b.low<=Math.min(b.open,b.close);
const stableHistory = x => [x.layout_id,x.symbol,x.resolved_symbol,x.timeframe,x.session,
  x.total_available,x.first_index,x.last_index,
  x.bars?.[0]?.index,x.bars?.[0]?.time,
  x.bars?.slice(1).map(b=>[b.index,b.time,b.open,b.high,b.low,b.close,b.volume])];
const meta = (c,s,r) => ({slot:s,layout_id:c.layout_id,symbol:c.symbol,timeframe:c.timeframe,
  replay_started:r.started,replay_clock_unix:r.started?r.current_time:null,
  replay_autoplay:r.autoplay,latest_loaded_time_unix:c.latest_loaded_time_unix??null,
  latest_closed_candidate_time_unix:c.latest_closed_candidate_time_unix??null});

/** Pure classification. Never treats chart titles, native bar indexes or replay cursor as candle timestamps. */
export function evaluateCrossChartSync(sources, charts, replays, captures, {min_common_bars=3}={}) {
  const observations=sources.map((_,i)=>meta(charts[i],i,replays[i]));
  if (!replays.every(r=>typeof r?.started==='boolean'))
    return refuse('REPLAY_STATE_UNKNOWN',observations);
  if (!replays.every(r=>r.started===replays[0].started))
    return refuse('MIXED_REPLAY_AND_LIVE',observations);
  if (replays[0].started && (!replays.every(r=>r.autoplay===false && Number.isSafeInteger(r.current_time)) ||
      !replays.every(r=>r.current_time===replays[0].current_time)))
    return refuse('REPLAY_CLOCK_UNALIGNED_OR_MOVING',observations);
  if (captures.some(x=>!x))return refuse('OHLCV_CAPTURE_MISSING',observations);
  const candidates=[];
  for(let i=0;i<sources.length;i++){
    const c=captures[i],source=sources[i],chart=charts[i];
    if(c.ok!==true||c.source!=='loaded_chart_bars'||c.time_unit!=='unix_seconds'||c.order!=='desc'||
       c.layout_id!==chart.layout_id||c.symbol!==chart.symbol||c.timeframe!==chart.timeframe||
       !Array.isArray(c.bars)||c.bars.length<min_common_bars+1||
       !Number.isInteger(c.total_available)||!Number.isInteger(c.last_index))
      return refuse('OHLCV_SCOPE_OR_COVERAGE_MISMATCH',observations);
    if(!c.bars.every(finiteBar) || !c.bars.every((b,j)=>j===0||b.time<c.bars[j-1].time))
      return refuse('OHLCV_BARS_INVALID',observations);
    const bars=c.bars.slice(1); // Always discard potentially developing latest bar.
    if(bars.some(b=>b.time>=c.bars[0].time))return refuse('OHLCV_ORDER_INVALID',observations);
    candidates.push(bars);
    observations[i].latest_loaded_time_unix=c.bars[0].time;
    observations[i].latest_closed_candidate_time_unix=bars[0].time;
    observations[i].loaded_bars_total=c.total_available;
    observations[i].closed_candidates=bars.length;
    observations[i].resolved_symbol=c.resolved_symbol??null;
    observations[i].delayed_feed_alias=c.delayed_feed_alias===true;
  }
  if(!candidates.every(b=>b[0].time===candidates[0][0].time))
    return refuse('LATEST_CLOSED_CANDLE_TIME_MISMATCH',observations);
  const maps=candidates.map(rows=>new Map(rows.map(b=>[b.time,b])));
  const common=candidates[0].map(b=>b.time).filter(t=>maps.every(m=>m.has(t)));
  if(common.length<min_common_bars)
    return refuse('INSUFFICIENT_COMMON_CLOSED_BARS',observations);
  const aligned_bars=common.map(time_unix=>({time_unix,candles:maps.map((m,slot)=>{
    const {open,high,low,close,volume}=m.get(time_unix);
    return {slot,open,high,low,close,volume};
  })}));
  return {ok:true,read_only:true,comparison_allowed:true,status:'aligned',
    source_count:sources.length, timeframe:charts[0].timeframe,
    replay_mode:replays[0].started?'paused_replay':'live_chart_loaded_history',
    common_closed_bar_count:common.length,observations,aligned_bars,
    latest_developing_bar_excluded:true,charts_may_update_after_capture:true,
    capture_atomic:false,no_chart_mutations:true,
    limitation:'Matching non-atomic observations of closed candidate candles. No cross-market tick synchronization, signal correctness, or independent proof of candle finality. Latest loaded candle is excluded conservatively.'};
}

export async function captureCrossChartSync(a,ctx) {
  const sources=a.sources;
  ensure(new Set(sources.map(s=>s.target_id)).size===sources.length,'DUPLICATE_TARGET','Require different exact browser targets.');
  ensure(new Set(sources.map(s=>s.expected_layout_id)).size===sources.length,'DUPLICATE_LAYOUT','Require different exact layouts.');
  ensure(sources.every(s=>s.expected_timeframe===sources[0].expected_timeframe),
    'TIMEFRAME_REQUEST_MISMATCH','All expected chart timeframes must be identical.');
  const observed=[],replays=[];
  for(const s of sources){
    const b={target_id:s.target_id,expected_layout_id:s.expected_layout_id};
    const c=await ctx.callTool('chart_get_state',b);
    if(!c?.ok||!same(identity(c),[s.expected_layout_id,s.expected_symbol,s.expected_timeframe]))
      return refuse('CHART_IDENTITY_MISMATCH',observed.map((v,i)=>meta(v,i,replays[i])),
        'Chart layout/symbol/timeframe disagrees with exact source request.');
    const r=await ctx.callTool('replay_status',b);
    if(!r?.ok)return refuse('REPLAY_UNAVAILABLE',observed.map((v,i)=>meta(v,i,replays[i])));
    observed.push(c);replays.push(r);
  }
  const mode=evaluateCrossChartSyncMode(replays);
  if(mode!==null)return refuse(mode,observed.map((v,i)=>meta(v,i,replays[i])));
  const captures=[];
  const limit=(a.window_bars??12)+1;
  for(const s of sources){
    const b={target_id:s.target_id,expected_layout_id:s.expected_layout_id};
    const before=await ctx.callTool('data_get_ohlcv',{...b,order:'desc',limit});
    const after=await ctx.callTool('data_get_ohlcv',{...b,order:'desc',limit});
    if(!same(stableHistory(before),stableHistory(after)))
      return refuse('CLOSED_WINDOW_CHANGED_BETWEEN_READS',observed.map((v,i)=>meta(v,i,replays[i])));
    captures.push(after);
  }
  for(let i=0;i<sources.length;i++){
    const s=sources[i],b={target_id:s.target_id,expected_layout_id:s.expected_layout_id};
    const c=await ctx.callTool('chart_get_state',b);
    const r=await ctx.callTool('replay_status',b);
    if(!c?.ok || !r?.ok || !same(identity(c),identity(observed[i])) || !same([r.started,r.autoplay,r.current_time],
       [replays[i].started,replays[i].autoplay,replays[i].current_time]))
      return refuse('CHART_OR_REPLAY_CHANGED_DURING_CAPTURE',observed.map((v,j)=>meta(v,j,replays[j])));
  }
  return evaluateCrossChartSync(sources,observed,replays,captures,{min_common_bars:a.min_common_bars??3});
}

export function evaluateCrossChartSyncMode(replays){
  if(!replays.every(r=>typeof r?.started==='boolean'))return 'REPLAY_STATE_UNKNOWN';
  if(!replays.every(r=>r.started===replays[0].started))return 'MIXED_REPLAY_AND_LIVE';
  if(replays[0].started && (!replays.every(r=>r.autoplay===false&&Number.isSafeInteger(r.current_time))||
     !replays.every(r=>r.current_time===replays[0].current_time)))return 'REPLAY_CLOCK_UNALIGNED_OR_MOVING';
  return null;
}

export default [{
  name:'data_get_cross_chart_sync_qa',mutates:false,
  description:'Read-only exact-chart guard for synchronized OHLC comparison across 2–4 TradingView QA charts. Rejects mixed Replay/live, mismatched Replay clocks, timeframes, stale last-closed times or unstable candle windows. Excludes current developing bar; does not infer indicator correctness.',
  inputSchema:{type:'object',properties:{
    sources:{type:'array',minItems:2,maxItems:4,items:{type:'object',properties:{
      target_id:{type:'string',minLength:1,maxLength:128},expected_layout_id:{type:'string',minLength:1,maxLength:128},
      expected_symbol:{type:'string',minLength:2,maxLength:100},expected_timeframe:{type:'string',minLength:1,maxLength:20}
    },required:['target_id','expected_layout_id','expected_symbol','expected_timeframe'],additionalProperties:false}},
    window_bars:{type:'integer',minimum:3,maximum:60},min_common_bars:{type:'integer',minimum:3,maximum:60}
  },required:['sources'],additionalProperties:false},
  scope:'browser',needsTarget:false,requiresLayout:false,handler:captureCrossChartSync
}];
