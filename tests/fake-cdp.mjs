import vm from 'node:vm';
import { BrowserManager } from '../src/core/browser.mjs';

/** Controlled CDP fixture. It never opens Chrome or sends a network request. */
export function createFakeCdp({page={},pageFetch,targets}={}){
  const traffic=[],pageTraffic=[];
  const location=new URL('https://www.tradingview.com/chart/source01/');
  const defaultPage={location,URL,Headers,Response,Request,AbortController,AbortSignal,TextEncoder,TextDecoder,structuredClone,setTimeout,clearTimeout,setInterval,clearInterval,Event,EventTarget,crypto:globalThis.crypto,console:{log(){},warn(){},error(){}},document:{title:'TradingView fixture',querySelector(){return null;},querySelectorAll(){return [];}}};
  const context=vm.createContext({...defaultPage,...page});context.window=context;
  context.fetch=async(url,options={})=>{pageTraffic.push({url:String(url),method:options.method||'GET',credentials:options.credentials,headers:Object.fromEntries(new Headers(options.headers)),body:options.body});if(pageFetch)return pageFetch(url,options,context);return new Response(JSON.stringify({s:'ok',r:[]}),{status:200});};
  let list=targets||[{id:'chart-1',type:'page',title:'Fixture',url:location.href,webSocketDebuggerUrl:'ws://127.0.0.1:9222/devtools/page/chart-1'}];
  class FakeWebSocket extends EventTarget {
    constructor(url){super();this.url=url;this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
    send(raw){const message=JSON.parse(raw);traffic.push({transport:'websocket',...message});
      const run=async()=>{
        if(message.method==='Runtime.evaluate'){
          try{const value=await vm.runInContext(message.params.expression,context,{timeout:3000});return {result:{type:value===undefined?'undefined':typeof value,value}};}
          catch(e){return {exceptionDetails:{text:'Uncaught',exception:{description:String(e)}}};}
        }
        if(message.method==='Page.navigate'){context.location=new URL(message.params.url);return {frameId:'frame-1'};}
        if(message.method==='Page.captureScreenshot')return {data:'aGVsbG8='};
        return {};
      };
      run().then(result=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:message.id,result})})));
    }
    close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
  }
  const fetchImpl=async(url,options={})=>{
    traffic.push({transport:'http',url:String(url),method:options.method,credentials:options.credentials});const u=new URL(url);
    if(u.hostname!=='127.0.0.1'||u.port!=='9222')throw new Error('Fixture refused nonloopback request');
    if(u.pathname==='/json/list')return new Response(JSON.stringify(list));
    if(u.pathname==='/json/version')return new Response(JSON.stringify({Browser:'Fixture/1','Protocol-Version':'1.3'}));
    if(u.pathname.startsWith('/json/close/')){list=list.filter(t=>t.id!==u.pathname.split('/').at(-1));return new Response('Target is closing');}
    return new Response('{}');
  };
  const browser=new BrowserManager({fetchImpl,WebSocketImpl:FakeWebSocket});
  return {browser,context,traffic,pageTraffic,setTargets:v=>{list=v;},close:()=>browser.close()};
}
