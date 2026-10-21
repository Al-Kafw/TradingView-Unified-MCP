import { ToolError, checkAbort } from './errors.mjs';
import { publicChartUrl } from './security.mjs';

export async function readLayoutMeta(ctx) {
  const meta=await ctx.callPage(()=>{
    const api=window.TradingViewApi;
    if(!api)throw new Error('TradingView chart API is unavailable. Open a signed-in Superchart.');
    const col=api._chartWidgetCollection;
    const info=col?.metaInfo||{};
    const value=v=>typeof v?.value==='function'?v.value():v;
    const service=typeof api.getSaveChartService==='function'?api.getSaveChartService():null;
    const id=value(info.uid)|| (typeof service?.layoutId==='function'?service.layoutId():null) || null;
    return {layout_id:id===null?null:String(id),name:value(info.name)||null,has_changes:typeof service?.hasChanges==='function'?!!service.hasChanges():null,url:location.href};
  });
  if(meta?.url)meta.url=publicChartUrl(meta.url);
  return meta;
}

export class ToolContext {
  constructor({browser,store,registry,targetId,expectedLayoutId,signal,runId}) {
    Object.assign(this,{browser,store,registry,targetId,expectedLayoutId,signal,runId});
  }
  async callPage(fn,args={},options={}) {checkAbort(this.signal);return this.browser.evaluate(this.targetId,fn,args,{...options,signal:this.signal});}
  async assertLayout(expected=this.expectedLayoutId) {
    if(!expected)throw new ToolError('EXPECTED_LAYOUT_REQUIRED','Supply the layout ID you intend to modify.');
    const actual=await readLayoutMeta(this);
    if(String(actual.layout_id)!==String(expected))throw new ToolError('LAYOUT_MISMATCH','The selected tab is showing a different layout; no write was submitted.',{expected_layout_id:expected,actual_layout_id:actual.layout_id,target_id:this.targetId});
    return actual;
  }
  async wait(ms){checkAbort(this.signal);await new Promise((resolve,reject)=>{const onAbort=()=>{clearTimeout(timer);reject(new ToolError('CANCELLED','Operation cancelled.'));};const timer=setTimeout(()=>{this.signal?.removeEventListener('abort',onAbort);resolve();},Math.min(Math.max(ms,0),60000));this.signal?.addEventListener('abort',onAbort,{once:true});});}
  async poll(read,predicate,{timeoutMs=30000,intervalMs=300,description='operation'}={}){
    const start=Date.now();let last;
    while(Date.now()-start<timeoutMs){checkAbort(this.signal);last=await read();if(await predicate(last))return last;await this.wait(intervalMs);}
    throw new ToolError('VERIFICATION_TIMEOUT',`${description} was not independently verified before the deadline. Reconcile before retrying.`,{last_observation:last,timeout_ms:timeoutMs});
  }
  async forTarget(targetId,expectedLayoutId){await this.browser.resolveTarget(targetId);return new ToolContext({...this,targetId,expectedLayoutId});}
  async callTool(name,args={}){const d=this.registry.get(name);const bound=d.scope==='browser'?{...args,target_id:args?.target_id||this.targetId,expected_layout_id:args?.expected_layout_id||this.expectedLayoutId}:args;return this.registry.executeNested(name,bound,this);}
  async exportJson(name,data){return this.store.exportJson(name,data);}
  async exportCsv(name,rows){return this.store.exportCsv(name,rows);}
  async checkpoint(key,value){return this.store.checkpoint(key,value);}
  async loadCheckpoint(key){return this.store.loadCheckpoint(key);}
}
