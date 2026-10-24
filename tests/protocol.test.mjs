import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough,Readable } from 'node:stream';
import { McpProtocol,startStdio } from '../src/core/protocol.mjs';
import { startHttp,createHttpHandler } from '../src/core/http.mjs';
import { ToolRegistry } from '../src/core/registry.mjs';
import { ToolError } from '../src/core/errors.mjs';
import { O,S } from '../src/core/schema.mjs';
function fixture(){const registry=new ToolRegistry({store:{audit:async()=>{}}});registry.add({name:'echo_data',scope:'local',inputSchema:O({text:S()},['text']),handler:async a=>({text:a.text})});registry.add({name:'fail_data',scope:'local',inputSchema:O(),handler:async()=>{throw new ToolError('EXPECTED_FAILURE','failure to verify');}});return new McpProtocol({registry});}
const initialize={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}};
test('Initialize negotiates a supported protocol, tools list is machine-readable and ping works',async()=>{
 const p=fixture();assert.equal((await p.handle({jsonrpc:'2.0',id:0,method:'tools/list'})).error.code,-32002);const init=await p.handle(initialize);assert.equal(init.result.protocolVersion,'2025-11-25');const list=await p.handle({jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal(list.result.tools.length,2);assert.deepEqual((await p.handle({jsonrpc:'2.0',id:3,method:'ping'})).result,{});
});
test('Tool errors use isError, while JSON-RPC errors retain protocol codes',async()=>{
 const p=fixture();await p.handle(initialize);const r=await p.handle({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'fail_data'}});assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/EXPECTED_FAILURE/);assert.equal((await p.handle({jsonrpc:'2.0',id:3,method:'unknown'})).error.code,-32601);assert.equal((await p.handle({jsonrpc:'2.0',id:4,method:'tools/list',params:null})).error.code,-32602);
});
test('Plaintext secrets are redacted from successful results and result text remains JSON',async()=>{
 const p=fixture();await p.handle(initialize);const r=await p.handle({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'echo_data',arguments:{text:'sessionid=CANARY'}}});assert.equal(r.result.isError,false);assert.equal(JSON.stringify(r).includes('CANARY'),false);assert.doesNotThrow(()=>JSON.parse(r.result.content[0].text));
});
test('UTF-8 newline stdio handles split multibyte messages and emits only protocol JSON',async()=>{
 const p=fixture(),input=new PassThrough(),output=new PassThrough();let result='';output.on('data',c=>result+=c.toString());startStdio(p,{input,output});input.write(JSON.stringify(initialize)+'\n');await new Promise(r=>setImmediate(r));const bytes=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'echo_data',arguments:{text:'行情📈'}}})+'\n');const split=bytes.indexOf(Buffer.from('📈'))+2;input.write(bytes.subarray(0,split));input.write(bytes.subarray(split));await new Promise(r=>setImmediate(r));const messages=result.trim().split('\n').map(JSON.parse);assert.equal(messages.length,2);assert.equal(messages[1].result.structuredContent.text,'行情📈');p.close();
});
test('JSON-RPC batch and nonobject messages are rejected',async()=>{const p=fixture();for(const value of [[],[initialize],null,42,'hello'])assert.equal((await p.handle(value)).error.code,-32600);});
test('Resource and prompt lookups reject inherited names and non-string identifiers',async()=>{
 const p=fixture();await p.handle(initialize);
 for(const value of ['__proto__','constructor','toString',{},null]){
  assert.equal((await p.handle({jsonrpc:'2.0',id:2,method:'resources/read',params:{uri:value}})).error.code,-32002);
  assert.equal((await p.handle({jsonrpc:'2.0',id:3,method:'prompts/get',params:{name:value}})).error.code,-32602);
 }
});
test('The complete delivered tool catalog is discoverable through MCP pagination without omissions',async()=>{
 const {buildRuntime}=await import('../src/runtime.mjs');const runtime=buildRuntime({genericUi:true,readonly:false});const p=runtime.protocol;await p.handle(initialize);const expected=runtime.registry.list().map(t=>t.name);const actual=[];let cursor,id=2;
 do{const page=await p.handle({jsonrpc:'2.0',id:id++,method:'tools/list',params:cursor===undefined?{}:{cursor}});assert.ok(page.result.tools.length<=100);actual.push(...page.result.tools.map(t=>t.name));cursor=page.result.nextCursor;}while(cursor!==undefined);
 assert.deepEqual(actual,expected);assert.equal(new Set(actual).size,expected.length);assert.ok(expected.length>100);assert.equal((await p.handle({jsonrpc:'2.0',id:99,method:'tools/list',params:{cursor:'not-a-cursor'}})).error.code,-32602);p.close();await runtime.browser.close();
});
test('Cancellation aborts a running tool through its signal',async()=>{
 const registry=new ToolRegistry({store:{audit:async()=>{}}});registry.add({name:'wait_data',scope:'local',inputSchema:O(),handler:async(_a,c)=>{await c.wait(10000);return {done:true};}});const p=new McpProtocol({registry});await p.handle(initialize);const active=p.handle({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'wait_data'}});await new Promise(r=>setImmediate(r));await p.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:2}});const r=await active;assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/CANCELLED/);
});
test('Loopback HTTP requires a strong token and rejects wildcard binding',async()=>{await assert.rejects(startHttp(fixture(),{host:'0.0.0.0',token:'x'.repeat(32)}));await assert.rejects(startHttp(fixture(),{token:'weak'}));});
test('Actual HTTP handler enforces authentication, Origin, Host, path and method before MCP execution',async()=>{
 const token='test-only-secret-'.repeat(3),p=fixture(),handler=createHttpHandler(p,{port:()=>3811,token});const auth={'authorization':`Bearer ${token}`,'content-type':'application/json'};
 const call=async({method='POST',url='/mcp',headers=auth,body=JSON.stringify(initialize)}={})=>{const req=Readable.from([Buffer.from(body)]);Object.assign(req,{method,url,headers:{host:'127.0.0.1:3811',...headers}});const res={status:null,headersSent:false,writeHead(s,h){this.status=s;this.headers=h;this.headersSent=true;},end(b){this.body=b;}};await handler(req,res);return res;};
 assert.equal((await call({headers:{'content-type':'application/json'}})).status,401);
 assert.equal((await call({headers:{...auth,origin:'https://evil.example'}})).status,403);
 assert.equal((await call({headers:{...auth,host:'evil.example'}})).status,403);
 assert.equal((await call({method:'GET'})).status,405);assert.equal((await call({url:'/other'})).status,404);
 const r=await call();assert.equal(r.status,200);assert.equal(JSON.parse(r.body).result.serverInfo.name,'tradingview-unified-mcp');p.close();
});
