import { randomUUID } from 'node:crypto';
import { O,S,B } from '../core/schema.mjs';
import { ToolError,checkAbort } from '../core/errors.mjs';
import { redact,sha256 } from '../core/security.mjs';

const jobs=new Map(),streams=new Map();
const forbidden=new Set(['batch_execute','job_submit','job_cancel','stream_start','stream_stop','emergency_stop','emergency_clear']);
const argsSchema={type:'object',additionalProperties:true,maxProperties:100};
const calls={type:'array',minItems:1,maxItems:100,items:O({tool:S('Registered tool name',64),arguments:argsSchema},['tool'])};
const id=S('Returned job or stream ID',128);
function allowed(registry,call,{readOnly=false}={}){if(forbidden.has(call.tool))throw new ToolError('NESTED_JOB_BLOCKED','Recursive jobs or lifecycle controls are not allowed in a batch.');const d=registry.get(call.tool);if(readOnly&&d.mutates)throw new ToolError('READ_ONLY_REQUIRED','Streams may only run a read-only tool.');return d;}
async function bounded(data,ctx,label){const encoded=JSON.stringify(data);if(encoded.length<=128000)return data;return {truncated_inline:true,sha256:sha256(encoded),file:await ctx.exportJson(label,data)};}
function state(job){return redact({id:job.id,status:job.status,submitted_at:job.submitted_at,started_at:job.started_at,finished_at:job.finished_at,completed:job.results.filter(r=>r.status==='completed').length,attempted:job.results.length,total:job.calls.length,results:job.results,error:job.error});}
export default [
 {name:'batch_execute',description:'Execute up to 100 tool calls sequentially in one browser queue slot. Reports per-step results, stops on failure by default, and never marks partial success as complete.',inputSchema:O({calls,stop_on_error:B()},['calls']),mutates:true,handler:async(a,c)=>{
   for(const call of a.calls)allowed(c.registry,call);
   const results=[];
   for(let i=0;i<a.calls.length;i++){checkAbort(c.signal);const call=a.calls[i];try{const data=await c.callTool(call.tool,call.arguments||{});results.push({index:i,tool:call.tool,status:'completed',result:await bounded(data,c,`batch-${c.runId}-${i}`)});}catch(e){results.push({index:i,tool:call.tool,status:'failed',code:e.code||'OPERATION_FAILED',message:e.message,details:redact(e.details)});if(a.stop_on_error!==false)break;}}
   return {complete:results.length===a.calls.length&&results.every(x=>x.status==='completed'),completed:results.filter(x=>x.status==='completed').length,requested:a.calls.length,results};
 }},
 {name:'job_submit',description:'Start a bounded background sequence of fully specified tool calls. Arguments stay in process memory; no cookie, webhook, Pine or secret payload is written to a job database. Jobs do not resume automatically after restart.',inputSchema:O({calls,stop_on_error:B()},['calls']),scope:'local',mutates:true,handler:async(a,c)=>{
   for(const call of a.calls){allowed(c.registry,call);const d=c.registry.get(call.tool);if(d.scope==='browser'&&d.mutates&&(!call.arguments?.target_id||d.requiresLayout&&!call.arguments?.expected_layout_id))throw new ToolError('EXPLICIT_JOB_TARGET_REQUIRED','Every mutating job step must include its exact target and expected layout.');}
   if([...jobs.values()].filter(j=>['queued','running'].includes(j.status)).length>=10)throw new ToolError('JOB_LIMIT','At most ten jobs may be active.');
   const job={id:randomUUID(),status:'queued',submitted_at:new Date().toISOString(),calls:structuredClone(a.calls),results:[],controller:new AbortController()};jobs.set(job.id,job);
   while(jobs.size>100){const old=[...jobs.values()].find(j=>!['queued','running'].includes(j.status));if(!old)break;jobs.delete(old.id);}
   job.promise=(async()=>{
     job.status='running';job.started_at=new Date().toISOString();
     try{for(let i=0;i<job.calls.length;i++){checkAbort(job.controller.signal);const call=job.calls[i];try{const data=await c.registry.execute(call.tool,call.arguments||{},{signal:job.controller.signal});job.results.push({index:i,tool:call.tool,status:'completed',result:await bounded(data,c,`job-${job.id}-${i}`)});}catch(e){job.results.push({index:i,tool:call.tool,status:'failed',code:e.code||'OPERATION_FAILED',message:e.message,details:redact(e.details)});if(a.stop_on_error!==false)throw e;}}
       job.status=job.results.every(r=>r.status==='completed')?'completed':'partial';
     }catch(e){job.status=job.controller.signal.aborted?'cancelled':'failed';job.error={code:e.code||'OPERATION_FAILED',message:e.message,details:redact(e.details)};}
     finally{job.finished_at=new Date().toISOString();job.calls=job.calls.map(x=>({tool:x.tool}));}
   })();
   return {job_id:job.id,status:'accepted',result_not_yet_verified:true};
 }},
 {name:'job_get',description:'Read a submitted job and each independently returned step result. A cancelled step may already have submitted a write; reconcile it.',inputSchema:O({id},['id']),scope:'local',handler:async(a)=>{const j=jobs.get(a.id);if(!j)throw new ToolError('JOB_NOT_FOUND','Job is absent or this process restarted.');return state(j);}},
 {name:'job_list',description:'List in-process jobs and completion states without returning their input arguments.',inputSchema:O(),scope:'local',handler:async()=>({jobs:[...jobs.values()].map(state)})},
 {name:'job_cancel',description:'Request cancellation of an in-process job. Does not undo a TradingView write already submitted.',inputSchema:O({id},['id']),scope:'local',mutates:true,handler:async(a)=>{const j=jobs.get(a.id);if(!j)throw new ToolError('JOB_NOT_FOUND','Job not found.');j.controller.abort();return {id:a.id,cancellation_requested:true,current_status:j.status,reconcile_submitted_writes:true};}},
 {name:'stream_start',description:'Poll one read-only tool at a bounded interval and retain a limited in-memory result buffer. This is browser polling, not a guaranteed tick feed. Stops after its duration or on an error.',inputSchema:O({tool:S('',64),arguments:argsSchema,interval_ms:{type:'integer',minimum:1000,maximum:60000},duration_seconds:{type:'integer',minimum:1,maximum:3600},buffer_size:{type:'integer',minimum:1,maximum:200}},['tool','duration_seconds']),scope:'local',mutates:true,handler:async(a,c)=>{
   allowed(c.registry,{tool:a.tool},{readOnly:true});if(streams.size>=20)throw new ToolError('STREAM_LIMIT','Stop an existing stream before starting another.');
   const s={id:randomUUID(),status:'running',buffer:[],sequence:0,started_at:Date.now(),controller:new AbortController(),timer:null};streams.set(s.id,s);
   const tick=async()=>{if(s.controller.signal.aborted)return;if(Date.now()-s.started_at>=a.duration_seconds*1000){s.status='completed';return;}
     try{const data=await c.registry.execute(a.tool,a.arguments||{},{signal:s.controller.signal});s.buffer.push({sequence:++s.sequence,observed_at:new Date().toISOString(),result:await bounded(data,c,`stream-${s.id}-${s.sequence}`)});s.buffer=s.buffer.slice(-(a.buffer_size||50));}
     catch(e){s.status=s.controller.signal.aborted?'stopped':'failed';s.error={code:e.code||'OPERATION_FAILED',message:e.message,details:redact(e.details)};return;}
     s.timer=setTimeout(tick,a.interval_ms||5000);s.timer.unref();};
   s.timer=setTimeout(tick,0);s.timer.unref();return {stream_id:s.id,status:'started',polling:true};
 }},
 {name:'stream_poll',description:'Read buffered samples after a sequence number and detect dropped samples.',inputSchema:O({id,after_sequence:{type:'integer',minimum:0}},['id']),scope:'local',handler:async(a)=>{const s=streams.get(a.id);if(!s)throw new ToolError('STREAM_NOT_FOUND','Stream not found.');const after=a.after_sequence||0;return {id:s.id,status:s.status,samples:s.buffer.filter(x=>x.sequence>after),dropped:Math.max(0,(s.buffer[0]?.sequence||1)-after-1),error:s.error};}},
 {name:'stream_list',description:'List in-memory polling streams.',inputSchema:O(),scope:'local',handler:async()=>({streams:[...streams.values()].map(s=>({id:s.id,status:s.status,samples:s.sequence,buffered:s.buffer.length}))})},
 {name:'stream_stop',description:'Stop a polling stream and optionally remove its in-memory buffer.',inputSchema:O({id,remove:B()},['id']),scope:'local',mutates:true,handler:async(a)=>{const s=streams.get(a.id);if(!s)throw new ToolError('STREAM_NOT_FOUND','Stream not found.');s.controller.abort();clearTimeout(s.timer);s.status='stopped';if(a.remove)streams.delete(a.id);return {id:a.id,status:'stopped',removed:!!a.remove};}}
];

export function closeJobs(){for(const j of jobs.values())j.controller.abort();for(const s of streams.values()){s.controller.abort();clearTimeout(s.timer);}}
