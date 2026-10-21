import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRuntime } from '../src/runtime.mjs';
import { startHttp } from '../src/core/http.mjs';

const initialize={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'transport-test',version:'1'}}};

test('Real loopback HTTP serves MCP and refuses unauthenticated, browser-origin and oversized requests',async()=>{
 const runtime=buildRuntime({readonly:true,store:{audit:async()=>{}}});
 const token='transport-test-dummy-token-'.repeat(2);
 const server=await startHttp(runtime.protocol,{port:0,token});
 const url=`http://127.0.0.1:${server.address().port}/mcp`;
 const send=(body,extra={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...extra},body:JSON.stringify(body)});
 try{
   assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
   assert.equal((await send(initialize,{Origin:'https://collector.example'})).status,403);
   const response=await send(initialize);assert.equal(response.status,200);assert.equal((await response.json()).result.serverInfo.name,'tradingview-unified-mcp');
   const tools=await (await send({jsonrpc:'2.0',id:2,method:'tools/list'})).json();assert.ok(tools.result.tools.every(t=>t.annotations.readOnlyHint));
   assert.equal((await send({value:'x'.repeat(2*1024*1024)})).status,413);
 }finally{runtime.protocol.close();await runtime.browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('Real stdio entry point negotiates MCP, paginates tools and shuts down without secret output',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'tv-stdio-'));
 const child=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,TV_READONLY:'1',TV_ENABLE_GENERIC_UI:'0',TV_DATA_DIR:dataDir,TV_CDP_ENDPOINT:'http://127.0.0.1:1',TV_HTTP_TOKEN:'STDIO_SECRET_CANARY'}});
 const exited=once(child,'exit');let buffer='',stderr='';const pending=new Map();
 child.stderr.on('data',chunk=>stderr+=chunk);
 child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);const result=JSON.parse(line);const resolve=pending.get(result.id);assert.ok(resolve,'Every stdout line must be a solicited JSON-RPC response');pending.delete(result.id);resolve(result);}});
 const call=message=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('stdio response timed out')),10000);pending.set(message.id,value=>{clearTimeout(timer);resolve(value);});child.stdin.write(JSON.stringify(message)+'\n');});
 try{
   assert.equal((await call(initialize)).result.protocolVersion,'2025-11-25');
   const names=[];let cursor,id=2;
   do{const response=await call({jsonrpc:'2.0',id:id++,method:'tools/list',params:cursor?{cursor}:{}});assert.ok(response.result.tools.every(t=>t.annotations.readOnlyHint));names.push(...response.result.tools.map(t=>t.name));cursor=response.result.nextCursor;}while(cursor);
   assert.ok(names.includes('security_status'));assert.ok(!names.includes('alert_create'));
   const status=await call({jsonrpc:'2.0',id:id++,method:'tools/call',params:{name:'security_status'}});assert.equal(status.result.structuredContent.readonly,true);assert.equal(JSON.stringify(status).includes('STDIO_SECRET_CANARY'),false);
   const resources=await call({jsonrpc:'2.0',id:id++,method:'resources/list'});assert.ok(resources.result.resources.length>0);
   child.stdin.end();const [code]=await exited;assert.equal(code,0);assert.equal(buffer,'');assert.equal(stderr,'');
 }finally{if(child.exitCode===null)child.kill();}
});
