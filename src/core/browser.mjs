import { ToolError, checkAbort } from './errors.mjs';
import { assertCdpEndpoint, assertDebuggerUrl, assertTradingViewUrl, assertFixedFunction, publicChartUrl, TV_REQUEST_HOSTS, TV_HOSTS } from './security.mjs';

const ALLOWED_CDP = new Set([
  'Runtime.evaluate','Runtime.enable','Page.enable','Page.navigate','Page.captureScreenshot',
  'Page.getLayoutMetrics','Page.bringToFront','Input.dispatchKeyEvent','Input.insertText',
  'Input.dispatchMouseEvent','Emulation.setDeviceMetricsOverride','Emulation.clearDeviceMetricsOverride',
]);

async function readDiscovery(response) {
  const maxBytes=4*1024*1024;
  const length=Number(response.headers?.get?.('content-length'));
  if(length>maxBytes){await response.body?.cancel();throw new ToolError('PAYLOAD_LIMIT','Chrome discovery response is too large.');}
  if(!response.body?.getReader)throw new ToolError('CDP_PROTOCOL','Chrome discovery response has no readable body.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new ToolError('PAYLOAD_LIMIT','Chrome discovery response is too large.');}
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }finally{reader.releaseLock();}
}

export class CdpSocket {
  constructor(url,{WebSocketImpl=globalThis.WebSocket,maxBytes=24*1024*1024}={}) {
    this.url=url;this.WebSocketImpl=WebSocketImpl;this.maxBytes=maxBytes;
    this.nextId=1;this.pending=new Map();this.socket=null;this.connecting=null;
  }
  async connect() {
    if(this.socket?.readyState===1) return;
    if(this.connecting) return this.connecting;
    this.connecting=new Promise((resolve,reject)=> {
      const ws=new this.WebSocketImpl(this.url);this.socket=ws;
      const timer=setTimeout(()=>{ws.close();reject(new ToolError('CDP_TIMEOUT','Chrome debugger connection timed out.'));},10000);
      ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(new ToolError('CDP_CONNECTION','Could not connect to Chrome debugger.'));},{once:true});
      ws.addEventListener('message',event=> {
        const raw=String(event.data);
        if(Buffer.byteLength(raw)>this.maxBytes){this.close();return;}
        let value;try{value=JSON.parse(raw);}catch{return;}
        // Unsolicited CDP events may contain request headers. Never record them.
        if(!Object.hasOwn(value,'id')) return;
        const pending=this.pending.get(value.id);if(!pending)return;
        this.pending.delete(value.id);clearTimeout(pending.timer);
        if(value.error) pending.reject(new ToolError('CDP_ERROR',value.error.message||'Chrome command failed.'));
        else pending.resolve(value.result||{});
      });
      ws.addEventListener('close',()=> {
        clearTimeout(timer);
        reject(new ToolError('CDP_DISCONNECTED','Chrome disconnected before the debugger connection completed.'));
        if(this.socket!==ws)return;
        this.socket=null;
        for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new ToolError('CDP_DISCONNECTED','Chrome disconnected. Reconcile submitted writes before retrying.'));}
        this.pending.clear();
      });
    }).finally(()=>{this.connecting=null;});
    return this.connecting;
  }
  async send(method,params={},timeoutMs=30000) {
    if(!ALLOWED_CDP.has(method)) throw new ToolError('CDP_METHOD_BLOCKED',`CDP method ${method} is not permitted.`);
    if(method==='Page.navigate') assertTradingViewUrl(params.url,{chartOnly:true});
    await this.connect();
    return new Promise((resolve,reject)=> {
      const id=this.nextId++;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new ToolError('CDP_TIMEOUT',`Chrome ${method} timed out; a submitted write may still have completed.`));},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try{this.socket.send(JSON.stringify({id,method,params}));}
      catch{clearTimeout(timer);this.pending.delete(id);reject(new ToolError('CDP_DISCONNECTED','Chrome command could not be sent. Reconcile writes before retrying.'));}
    });
  }
  close(){this.socket?.close();}
}

export class BrowserManager {
  constructor({endpoint=process.env.TV_CDP_ENDPOINT||'http://127.0.0.1:9222',fetchImpl=globalThis.fetch,WebSocketImpl=globalThis.WebSocket}={}) {
    this.endpoint=assertCdpEndpoint(endpoint);this.fetchImpl=fetchImpl;this.WebSocketImpl=WebSocketImpl;
    this.connections=new Map();this.stats={loopback_requests:0,page_calls:0,blocked:0};
  }
  async request(path,{method='GET'}={}) {
    if(!/^\/json(?:\/list|\/version|\/new\?.*|\/(?:close|activate)\/[a-zA-Z0-9_-]+)?$/.test(path)) throw new ToolError('CDP_PATH_BLOCKED','Unsupported Chrome debugging endpoint.');
    this.stats.loopback_requests++;
    let response;
    try{response=await this.fetchImpl(this.endpoint+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),credentials:'omit'});}
    catch{throw new ToolError('BROWSER_UNAVAILABLE','Start a dedicated Chrome profile with --remote-debugging-port=9222. No TradingView Desktop is used.');}
    if(!response.ok)throw new ToolError('CDP_HTTP_ERROR',`Chrome debugging endpoint returned HTTP ${response.status}.`);
    const text=await readDiscovery(response);
    try{return JSON.parse(text);}catch{return text;}
  }
  async listTargets(){
    const list=await this.request('/json/list');
    if(!Array.isArray(list))throw new ToolError('CDP_PROTOCOL','Chrome target list is not an array.');
    return list.filter(t=>t.type==='page').filter(t=>{try{assertTradingViewUrl(t.url,{chartOnly:true});return true;}catch{return false;}})
      .map(t=>({target_id:t.id,id:t.id,title:t.title||'',url:t.url,webSocketDebuggerUrl:assertDebuggerUrl(t.webSocketDebuggerUrl,this.endpoint)}));
  }
  async resolveTarget(id) {
    const targets=await this.listTargets();
    if(id){const hit=targets.find(t=>t.id===id);if(!hit)throw new ToolError('TARGET_NOT_FOUND','Requested TradingView chart tab is not available.');return hit;}
    if(targets.length!==1)throw new ToolError('AMBIGUOUS_TARGET',targets.length?'Multiple TradingView tabs are open; choose an explicit target_id.':'Open a TradingView chart in the dedicated Chrome profile.');
    return targets[0];
  }
  async socket(targetId) {
    const target=await this.resolveTarget(targetId);
    let socket=this.connections.get(target.id);
    if(!socket || socket.url!==target.webSocketDebuggerUrl){socket?.close();socket=new CdpSocket(target.webSocketDebuggerUrl,{WebSocketImpl:this.WebSocketImpl});this.connections.set(target.id,socket);}
    return socket;
  }
  async evaluate(targetId,fn,args={}, {timeoutMs=30000,signal}={}) {
    checkAbort(signal);
    const source=assertFixedFunction(fn);
    const serialized=JSON.stringify(args);
    if(Buffer.byteLength(serialized)>2*1024*1024)throw new ToolError('PAYLOAD_LIMIT','Page arguments exceed the 2 MiB limit.');
    const expression=`(async()=>{
      'use strict';
      if(location.protocol!=='https:' || !${JSON.stringify(TV_HOSTS)}.includes(location.hostname) || location.port) throw new Error('UNSAFE_ORIGIN');
      const __nativeFetch=globalThis.fetch.bind(globalThis);
      const fetch=async(input,options={})=>{
        const __url=new URL(typeof input==='string'?input:input.url,location.href);
        if(__url.protocol!=='https:' || !${JSON.stringify(TV_REQUEST_HOSTS)}.includes(__url.hostname) || __url.port || __url.username || __url.password) throw new Error('NETWORK_DESTINATION_BLOCKED');
        const __headers=new Headers(options.headers||{});
        for(const __key of ['cookie','authorization','proxy-authorization']) if(__headers.has(__key)) throw new Error('CREDENTIAL_HEADER_BLOCKED');
        if(options.credentials!==undefined&&!['omit','same-origin','include'].includes(options.credentials))throw new Error('INVALID_CREDENTIAL_MODE');
        return __nativeFetch(__url.href,{...options,headers:__headers,redirect:'error',credentials:options.credentials||'include'});
      };
      return await (${source})(${serialized});
    })()`;
    this.stats.page_calls++;
    const socket=await this.socket(targetId);
    const result=await socket.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true,timeout:timeoutMs},timeoutMs+1000);
    checkAbort(signal);
    if(result.exceptionDetails){
      const exception=result.exceptionDetails.exception;
      const description=exception?.description||result.exceptionDetails.text||'TradingView page operation failed.';
      const first=description.split('\n')[0];
      throw new ToolError(/UNSAFE_ORIGIN|NETWORK_DESTINATION_BLOCKED|CREDENTIAL_HEADER_BLOCKED/.test(first)?'SECURITY_BLOCK':'TRADINGVIEW_API_ERROR',first);
    }
    if(result.result?.type==='undefined')return null;
    return result.result?.value??null;
  }
  async openTarget(url){
    assertTradingViewUrl(url,{chartOnly:true});
    const target=await this.request('/json/new?'+encodeURIComponent(url),{method:'PUT'});
    if(!target?.id)throw new ToolError('TAB_CREATE_FAILED','Chrome did not return a new tab ID.');
    return {target_id:target.id,id:target.id,url:publicChartUrl(target.url)};
  }
  async closeTarget(id){await this.resolveTarget(id);await this.request('/json/close/'+encodeURIComponent(id));this.connections.get(id)?.close();this.connections.delete(id);return {closed:!(await this.listTargets()).some(t=>t.id===id),target_id:id};}
  async activateTarget(id){await this.resolveTarget(id);await this.request('/json/activate/'+encodeURIComponent(id));return {target_id:id,activation_requested:true};}
  async navigate(id,url){assertTradingViewUrl(url,{chartOnly:true});return (await this.socket(id)).send('Page.navigate',{url});}
  async capture(id,{clip}={}){
    const socket=await this.socket(id);await socket.send('Page.bringToFront');
    const result=await socket.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})},15000);
    return {mimeType:'image/png',data:result.data};
  }
  async input(id,method,params){if(!method.startsWith('Input.'))throw new ToolError('CDP_METHOD_BLOCKED','Only keyboard or mouse input allowed here.');return (await this.socket(id)).send(method,params);}
  async version(){const v=await this.request('/json/version');return {browser:v.Browser,protocol:v['Protocol-Version']};}
  async close(){for(const connection of this.connections.values())connection.close();this.connections.clear();}
}
