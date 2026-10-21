import { ToolError } from '../core/errors.mjs';

export const AUTOPLAY_DELAYS = [100,143,200,300,1000,2000,3000,5000,10000];

export async function replayPage(a) {
  const fail=(code,message,details={})=>({ok:false,code,message,...details});
  const api=window.TradingViewApi?._replayApi;
  if(!api)return fail('CAPABILITY_UNAVAILABLE','TradingView replay API is unavailable on this browser build.');
  const read=(method)=>{
    if(typeof api[method]!=='function')return null;
    const v=api[method]();
    if(v&&typeof v.value==='function')return v.value();
    if(v===null||typeof v!=='object')return v??null;
    return v;
  };
  const boolean=method=>{const v=read(method);return typeof v==='boolean'?v:null;};
  const state=()=>({available:boolean('isReplayAvailable'),started:boolean('isReplayStarted'),autoplay:boolean('isAutoplayStarted'),current_time:read('currentDate'),autoplay_delay_ms:read('autoplayDelay'),position:read('position'),realized_pnl:read('realizedPL'),time_unit:'unix_seconds'});
  const wait=async(predicate,timeout=10000)=>{const deadline=Date.now()+timeout;do{const s=state();if(predicate(s))return s;await new Promise(r=>setTimeout(r,200));}while(Date.now()<deadline);return null;};
  try{
    const before=state();
    if(a.op==='status')return {ok:true,...before};
    if(a.op==='start'){
      if(before.available!==true)return fail('REPLAY_UNAVAILABLE','Replay is not confirmed available for this symbol/timeframe.',{observed:before});
      if(before.started!==false)return fail('PRECONDITION_FAILED','Replay must be confirmed stopped before selecting a new start date.',{observed:before});
      if(typeof api.selectDate!=='function')return fail('CAPABILITY_UNAVAILABLE','Replay date-selection API is unavailable.');
      if(typeof api.showReplayToolbar==='function')await api.showReplayToolbar();
      await api.selectDate(a.time*1000);
      const observed=await wait(s=>s.started===true&&typeof s.current_time==='number'&&Number.isFinite(s.current_time));
      if(!observed)return fail('VERIFICATION_FAILED','Replay start was submitted but a started session with a valid cursor was not observed.',{mutation_attempted:true,observed:state()});
      const delta=Math.abs(observed.current_time-a.time);
      if(delta>(a.maximum_relocation_seconds??86400)&&a.allow_relocation!==true){
        let stopped=false;
        if(typeof api.stopReplay==='function'){await api.stopReplay();stopped=Boolean(await wait(s=>s.started===false));}
        return fail('REPLAY_DATE_RELOCATED','TradingView moved the replay cursor beyond the allowed tolerance.',{mutation_attempted:true,requested_time:a.time,actual_time:observed.current_time,relocation_seconds:delta,cleanup_stopped_verified:stopped});
      }
      return {ok:true,verified:true,mutation_attempted:true,requested_time:a.time,relocation_seconds:delta,relocated:delta>0,observed};
    }
    if(a.op==='stop'){
      if(before.started===false)return {ok:true,verified:true,already_stopped:true,observed:before};
      if(before.started!==true)return fail('ADAPTER_MISMATCH','Replay started state could not be interpreted; no stop was submitted.');
      if(typeof api.stopReplay!=='function')return fail('CAPABILITY_UNAVAILABLE','stopReplay is unavailable.');
      await api.stopReplay();const observed=await wait(s=>s.started===false);
      return observed?{ok:true,verified:true,mutation_attempted:true,observed}:fail('VERIFICATION_FAILED','Replay stop was submitted but stopping was not verified.',{mutation_attempted:true,observed:state()});
    }
    if(before.started!==true)return fail('REPLAY_NOT_STARTED','A positively verified running replay session is required.',{observed:before});
    if(a.op==='step'){
      if(typeof api.doStep!=='function')return fail('CAPABILITY_UNAVAILABLE','Replay stepping is unavailable.');
      if(before.autoplay!==false)return fail('PRECONDITION_FAILED','Pause autoplay before a deterministic replay step.');
      const records=[];
      for(let i=0;i<(a.bars??1);i++){
        const prev=state();await api.doStep();const observed=await wait(s=>typeof s.current_time==='number'&&s.current_time>prev.current_time,5000);
        if(!observed){const atEnd=boolean('isReplayFinished')??boolean('isReplayEnded')??boolean('isLastBar');return fail('REPLAY_DID_NOT_ADVANCE','Replay step did not advance the cursor; do not count it as a successful bar.',{mutation_attempted:true,advanced_bars:records.length,at_end:atEnd,observed:state()});}
        records.push(observed.current_time);
      }
      return {ok:true,verified:true,mutation_attempted:true,advanced_bars:records.length,cursor_times:records,observed:state()};
    }
    if(a.op==='autoplay'){
      if(before.autoplay===null)return fail('ADAPTER_MISMATCH','Cannot determine autoplay state.');
      if(typeof api.toggleAutoplay!=='function')return fail('CAPABILITY_UNAVAILABLE','Autoplay toggle is unavailable.');
      if(a.delay_ms!==undefined&&typeof api.changeAutoplayDelay!=='function')return fail('CAPABILITY_UNAVAILABLE','Autoplay delay control is unavailable.');
      if(a.delay_ms!==undefined)await api.changeAutoplayDelay(a.delay_ms);
      if(before.autoplay!==a.enabled)await api.toggleAutoplay();
      const observed=await wait(s=>s.autoplay===a.enabled&&(a.delay_ms===undefined||s.autoplay_delay_ms===a.delay_ms));
      return observed?{ok:true,verified:true,mutation_attempted:true,before,observed}:fail('VERIFICATION_FAILED','Autoplay target state/delay did not verify.',{mutation_attempted:true,observed:state()});
    }
    if(a.op==='trade'){
      if(typeof before.position!=='number'||!Number.isFinite(before.position))return fail('CAPABILITY_UNAVAILABLE','Cannot read a numeric simulated replay position; no order was submitted.');
      const method=a.action==='buy'?'buy':a.action==='sell'?'sell':a.action==='close'?'closePosition':null;
      if(!method||typeof api[method]!=='function')return fail('CAPABILITY_UNAVAILABLE','Requested simulated replay action is unavailable.');
      if(a.action==='close'&&before.position===0)return {ok:true,verified:true,simulation_only:true,already_flat:true,observed:before};
      await api[method]();
      const observed=await wait(s=>typeof s.position==='number'&&(a.action==='buy'?s.position>before.position:a.action==='sell'?s.position<before.position:s.position===0));
      return observed?{ok:true,verified:true,mutation_attempted:true,simulation_only:true,action:a.action,before,observed}:fail('SIMULATED_TRADE_UNVERIFIED','Replay trade was submitted but the expected simulated position change was not observed.',{mutation_attempted:true,simulation_only:true,observed:state()});
    }
    return fail('INVALID_ARGUMENT','Unknown replay operation.');
  }catch(error){return fail('REPLAY_OPERATION_FAILED',String(error?.message??error).slice(0,600),{mutation_attempted:a.op!=='status'});}
}

const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const def=(name,op,description,properties={},required=[],mutates=true)=>({name,description,inputSchema:schema(properties,required),mutates,handler:async(args,ctx)=>{const result=await ctx.callPage(replayPage,{...args,op},{timeoutMs:op==='step'?(args.bars??1)*5500+5000:30000});if(!result?.ok)throw new ToolError(result?.code??'ADAPTER_MISMATCH',result?.message??'Replay did not verify.',result);return result;}});
export default [
  def('replay_status','status','Read replay availability, cursor, autoplay and simulated position with tri-state booleans.',{},[],false),
  def('replay_start','start','Start browser Bar Replay at a Unix-second timestamp; verify cursor and stop on excessive unapproved relocation.',{time:{type:'number',minimum:0},allow_relocation:{type:'boolean'},maximum_relocation_seconds:{type:'number',minimum:0,maximum:315360000}},['time']),
  def('replay_stop','stop','Stop replay and independently verify its stopped state.'),
  def('replay_step','step','Advance a bounded number of replay bars, verifying every cursor advance; autoplay must be paused.',{bars:{type:'integer',minimum:1,maximum:10}}),
  def('replay_autoplay','autoplay','Set an explicit autoplay state and supported delay, verifying both; no blind toggle.',{enabled:{type:'boolean'},delay_ms:{type:'integer',enum:AUTOPLAY_DELAYS}},['enabled']),
  def('replay_trade','trade','Place only a simulated Bar Replay buy/sell/close action and verify simulated position direction. Never calls a broker order API.',{action:{type:'string',enum:['buy','sell','close']}},['action'])
];
