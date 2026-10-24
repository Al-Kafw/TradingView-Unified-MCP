import { randomUUID } from 'node:crypto';
import { ToolContext } from './context.mjs';
import { ToolError, checkAbort } from './errors.mjs';
import { validate, validateSchemaDefinition } from './schema.mjs';
import { redact } from './security.mjs';

export class ToolRegistry {
  constructor({browser,store,readonly=!(process.env.TV_READONLY==='0'&&process.env.TV_ENABLE_WRITES==='1')}={}){
    this.browser=browser;this.store=store;this.readonly=readonly;this.tools=new Map();this.lock=Promise.resolve();this.emergencyStop=false;this.activeControllers=new Set();
  }
  add(descriptor){
    const d={scope:'browser',mutates:false,requiresLayout:true,needsTarget:true,...descriptor};
    if(!/^[a-z][a-z0-9_]{1,63}$/.test(d.name)||this.tools.has(d.name))throw new Error(`Invalid or duplicate tool ${d.name}`);
    if(typeof d.handler!=='function')throw new Error(`Missing implementation for ${d.name}`);
    const schema=structuredClone(d.inputSchema||{type:'object',properties:{},additionalProperties:false});
    schema.type='object';schema.properties||={};schema.additionalProperties??=false;
    if(d.scope==='browser'){
      schema.properties.target_id={type:'string',maxLength:128,description:'Exact Chrome tab target ID from browser_list_tabs. Required for changes.'};
      schema.properties.expected_layout_id={type:'string',maxLength:128,description:'Expected saved-layout ID. A mismatch stops the operation before writing.'};
      if(d.mutates && d.requiresLayout) schema.required=[...new Set([...(schema.required||[]),'target_id','expected_layout_id'])];
      else if(d.mutates && d.needsTarget) schema.required=[...new Set([...(schema.required||[]),'target_id'])];
    }
    validateSchemaDefinition(schema);d.inputSchema=schema;
    this.tools.set(d.name,d);return this;
  }
  addAll(descriptors){for(const d of descriptors)this.add(d);return this;}
  list(){return [...this.tools.values()].filter(d=>!this.readonly||!d.mutates).map(d=>({name:d.name,description:d.description,inputSchema:d.inputSchema,annotations:{readOnlyHint:!d.mutates,destructiveHint:!!d.destructive,idempotentHint:!!d.idempotent,openWorldHint:d.scope==='browser'||!!d.publicNetwork},_meta:{implementation:'source-implemented',live_verified:false,requires_layout:d.scope==='browser'&&d.mutates&&d.requiresLayout}}));}
  get(name){const d=this.tools.get(name);if(!d||this.readonly&&d.mutates)throw new ToolError('UNKNOWN_TOOL',`Tool ${name} is not registered.`);return d;}
  async execute(name,args={}, {signal,runId=randomUUID()}={}){
    const d=this.get(name);validate(d.inputSchema,args);
    const execute=async()=>{
      const operationController=new AbortController();
      const operationSignal=signal?AbortSignal.any([signal,operationController.signal]):operationController.signal;
      checkAbort(signal);
      if(this.emergencyStop && !['emergency_status','emergency_clear','emergency_stop','security_status','tools_catalog'].includes(name))throw new ToolError('EMERGENCY_STOP','Emergency stop is active.');
      let targetId=args.target_id;
      if(d.scope==='browser'&&d.needsTarget)targetId=(await this.browser.resolveTarget(targetId)).id;
      checkAbort(operationSignal);
      if(d.scope==='browser'&&this.emergencyStop)throw new ToolError('EMERGENCY_STOP','Emergency stop became active while the target was resolving.');
      const ctx=new ToolContext({browser:this.browser,store:this.store,registry:this,targetId,expectedLayoutId:args.expected_layout_id,signal:operationSignal,runId});
      if(d.scope==='browser')this.activeControllers.add(operationController);
      const started=Date.now();
      try{
        if(d.scope==='browser'&&d.mutates&&d.requiresLayout)await ctx.assertLayout();
        checkAbort(operationSignal);
        if(d.scope==='browser'&&this.emergencyStop)throw new ToolError('EMERGENCY_STOP','Emergency stop became active before dispatch.');
        const data=await d.handler(args,ctx);
        if(data?.ok===false||data?.success===false)throw new ToolError(data.code||'OPERATION_FAILED',data.message||data.error||'The operation reported a failure.',data);
        const result=redact(data);
        try{await this.store.audit({run_id:runId,tool:name,target_id:targetId,expected_layout_id:args.expected_layout_id,mutates:d.mutates,outcome:'returned',duration_ms:Date.now()-started});}
        catch{return {...(result&&typeof result==='object'&&!Array.isArray(result)?result:{value:result}),audit_warning:'The operation returned, but its metadata log could not be saved. Do not retry the operation because of this logging warning.',run_id:runId};}
        return result;
      }catch(error){
        try{await this.store.audit({run_id:runId,tool:name,target_id:targetId,mutates:d.mutates,outcome:'error',code:error.code||'INTERNAL_ERROR',duration_ms:Date.now()-started});}catch{/* Preserve the original action outcome even when local logging fails. */}
        throw error;
      }finally{this.activeControllers.delete(operationController);}
    };
    // The entire browser workflow owns one queue slot, including dependent reads.
    if(d.scope==='local')return execute();
    const next=this.lock.then(execute,execute);this.lock=next.catch(()=>{});return next;
  }
  async executeNested(name,args,context){
    const d=this.get(name);validate(d.inputSchema,args);checkAbort(context.signal);
    if(this.emergencyStop)throw new ToolError('EMERGENCY_STOP','Emergency stop is active.');
    let ctx=context;
    if(d.scope==='browser' && args.target_id && args.target_id!==ctx.targetId)ctx=await context.forTarget(args.target_id,args.expected_layout_id);
    else if(args.expected_layout_id!==ctx.expectedLayoutId)ctx=new ToolContext({...ctx,expectedLayoutId:args.expected_layout_id});
    if(d.scope==='browser'&&d.mutates&&d.requiresLayout)await ctx.assertLayout();
    checkAbort(ctx.signal);
    if(this.emergencyStop)throw new ToolError('EMERGENCY_STOP','Emergency stop became active before nested dispatch.');
    const data=await d.handler(args,ctx);
    if(data?.ok===false||data?.success===false)throw new ToolError(data.code||'OPERATION_FAILED',data.message||data.error||'The nested operation reported a failure.',data);
    return data;
  }
}
