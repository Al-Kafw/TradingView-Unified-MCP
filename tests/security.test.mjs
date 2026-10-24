import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,symlink,mkdir,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertCdpEndpoint,assertDebuggerUrl,assertTradingViewUrl,assertFixedFunction,validateWebhook,redact,publicChartUrl } from '../src/core/security.mjs';
import { CdpSocket, BrowserManager } from '../src/core/browser.mjs';
import { browserEnvironment, parseLaunchOptions } from '../src/core/launcher.mjs';
import { LocalStore } from '../src/core/storage.mjs';
import { ToolRegistry } from '../src/core/registry.mjs';
import { readLayoutMeta,ToolContext } from '../src/core/context.mjs';
import { validate,O,S } from '../src/core/schema.mjs';
import { createFakeCdp } from './fake-cdp.mjs';

test('CDP endpoint rejects remote hosts, DNS aliases, credentials, paths and redirect-shaped query',()=>{
 for(const u of ['https://127.0.0.1:9222','http://localhost:9222','http://evil.example:9222','http://127.0.0.1.evil.example:9222','http://user:secret@127.0.0.1:9222','http://127.0.0.1:9222/private','http://127.0.0.1:9222/?next=https://evil.example'])assert.throws(()=>assertCdpEndpoint(u));
 assert.equal(assertCdpEndpoint('http://127.0.0.1:9222'),'http://127.0.0.1:9222');
 assert.equal(assertCdpEndpoint('http://[::1]:9222'),'http://[::1]:9222');
});
test('CDP websocket discovery cannot redirect to a remote host or unrelated local port',()=>{
 for(const u of ['ws://evil.example/devtools/page/x','ws://127.0.0.1:9223/devtools/page/x','ws://127.0.0.1:9222/other','ws://x:y@127.0.0.1:9222/devtools/page/x'])assert.throws(()=>assertDebuggerUrl(u,'http://127.0.0.1:9222'));
});
test('TradingView target origin must be exact HTTPS; public URLs remove unneeded secret query/fragment',()=>{
 for(const u of ['https://tradingview.com.evil.example/chart/a/','https://evil.example/?tradingview.com','http://www.tradingview.com/chart/a/','https://user:pass@www.tradingview.com/chart/a/','https://www.tradingview.com:444/chart/a/'])assert.throws(()=>assertTradingViewUrl(u,{chartOnly:true}));
 assert.equal(publicChartUrl('https://www.tradingview.com/chart/a/?symbol=NASDAQ%3AAAPL&token=CANARY#CANARY'),'https://www.tradingview.com/chart/a/?symbol=NASDAQ%3AAAPL');
});
test('Caller JavaScript and credential/storage accessors are prohibited',()=>{
 for(const fn of ['alert(1)',()=>document.cookie,()=>localStorage.getItem('token'),()=>eval('1'),()=>window.fetch('https://evil.example')])assert.throws(()=>assertFixedFunction(fn));
 assert.doesNotThrow(()=>assertFixedFunction(a=>a.text));
});
test('Page wrapper preserves hostile text as data and does not execute it',async()=>{
 const h=createFakeCdp();const payload='}); globalThis.COMPROMISED=true; // ${document.cookie}';
 assert.equal(await h.browser.evaluate('chart-1',a=>a.text,{text:payload}),payload);assert.equal(h.context.COMPROMISED,undefined);await h.close();
});
test('Page fetch blocks third-party, localhost, credentials and forbidden auth headers before network',async()=>{
 const h=createFakeCdp();
 for(const url of ['https://collector.example/','http://127.0.0.1/','https://www.tradingview.com.evil.example/','https://secret:cookie@www.tradingview.com/'])await assert.rejects(h.browser.evaluate('chart-1',async a=>{await fetch(a.url);return true;},{url}),e=>e.code==='SECURITY_BLOCK');
 await assert.rejects(h.browser.evaluate('chart-1',async()=>{await fetch('https://www.tradingview.com/api/',{headers:{Cookie:'CANARY'}});}),e=>e.code==='SECURITY_BLOCK');
 assert.equal(h.pageTraffic.length,0);await h.close();
});
test('Browser authentication stays implicit and no cookie canary reaches Node transport',async()=>{
 const cookieCanary='COOKIE_CANARY_MUST_NEVER_BE_EXPORTED';let cookieReads=0;
 const document={title:'Fixture',querySelector(){return null;},querySelectorAll(){return [];}};Object.defineProperty(document,'cookie',{get(){cookieReads++;return cookieCanary;}});
 const h=createFakeCdp({page:{document},pageFetch:async()=>new Response(JSON.stringify({s:'ok',r:[{id:17,name:'safe'}]}))});
 const result=await h.browser.evaluate('chart-1',async()=>{const r=await fetch('https://pricealerts.tradingview.com/list_alerts');return r.json();});
 assert.equal(result.r[0].id,17);assert.equal(cookieReads,0);assert.equal(h.pageTraffic[0].credentials,'include');assert.deepEqual(h.pageTraffic[0].headers,{});
 assert.ok(h.traffic.filter(x=>x.transport==='http').every(x=>x.url.startsWith('http://127.0.0.1:9222/')&&x.credentials==='omit'));
 assert.equal(JSON.stringify(h.traffic).includes(cookieCanary),false);await h.close();
});
test('CDP cookie/network/remote object methods are not in the callable allowlist',async()=>{
 const socket=new CdpSocket('ws://127.0.0.1:9222/devtools/page/x');for(const m of ['Network.getCookies','Storage.getCookies','Network.getAllCookies','Network.setExtraHTTPHeaders','Runtime.callFunctionOn','Runtime.getProperties','Browser.getVersion'])await assert.rejects(socket.send(m),e=>e.code==='CDP_METHOD_BLOCKED');
});
test('Redirects remain forbidden for allowed page fetch requests',async()=>{
 const h=createFakeCdp({pageFetch:async(_url,opts)=>{assert.equal(opts.redirect,'error');throw new Error('redirect blocked by browser');}});
 await assert.rejects(h.browser.evaluate('chart-1',async()=>fetch('https://www.tradingview.com/api/')));await h.close();
});
test('Origin is checked again inside the live page after discovery',async()=>{
 const h=createFakeCdp();h.context.location=new URL('https://evil.example/chart/source01/');await assert.rejects(h.browser.evaluate('chart-1',()=>42),e=>e.code==='SECURITY_BLOCK');await h.close();
});
test('Webhook validation rejects local/private endpoints and does not send a test request',()=>{
 for(const u of ['no-url','http://hooks.example/','https://127.0.0.1/','https://10.2.3.4/','https://172.20.1.1/','https://192.168.1.1/','https://[::1]/','https://u:p@hooks.example/','https://hooks.example:8443/'])assert.throws(()=>validateWebhook(u));
 assert.equal(validateWebhook('https://hooks.example/alerts'),'https://hooks.example/alerts');
});
test('Known secrets are redacted in maps, free text, query parameters and provider key formats',()=>{
 const value={cookie:'CANARY',token:'CANARY',nested:{apiKey:'CANARY'},message:'sessionid: CANARY token: CANARY',url:'https://hooks.example/?token=CANARY&api_key=CANARY',provider:'sk-proj-CANARY12345678901234567890'};
 assert.equal(JSON.stringify(redact(value)).includes('CANARY'),false);
});
test('MCP schemas reject prototype pollution and unknown arguments',()=>{
 assert.throws(()=>validate(O({name:S()}),JSON.parse('{"__proto__":{"polluted":true}}')));assert.throws(()=>validate(O({name:S()}),{shell:'rm -rf /'}));assert.equal({}.polluted,undefined);
});
test('Mutation cannot use a URL layout ID when native widget identity is absent',async()=>{
 const h=createFakeCdp({page:{TradingViewApi:{_chartWidgetCollection:{metaInfo:{}},getSaveChartService:()=>({})}}});const c=new ToolContext({browser:h.browser,targetId:'chart-1',expectedLayoutId:'source01'});
 assert.equal((await readLayoutMeta(c)).layout_id,null);await assert.rejects(c.assertLayout(),e=>e.code==='LAYOUT_MISMATCH');await h.close();
});
test('A changed native layout blocks the write and log contains no input body',async()=>{
 let wrote=false;const logs=[];const browser={resolveTarget:async()=>({id:'chart-1'}),evaluate:async()=>({layout_id:'unexpected'})};
 const registry=new ToolRegistry({ readonly: false, mutationPolicy: { assert() {} }, browser,store:{audit:async v=>logs.push(v)}});registry.add({name:'test_change',inputSchema:O({message:S()}),mutates:true,handler:async()=>{wrote=true;}});
 await assert.rejects(registry.execute('test_change',{target_id:'chart-1',expected_layout_id:'wanted',message:'SECRET_JSON_CANARY'}),e=>e.code==='LAYOUT_MISMATCH');assert.equal(wrote,false);assert.equal(JSON.stringify(logs).includes('SECRET_JSON_CANARY'),false);
});
test('A logging failure preserves a completed action receipt instead of inviting duplicate retries',async()=>{
 let writes=0;const registry=new ToolRegistry({ readonly: false, mutationPolicy: { assert() {} }, browser:{resolveTarget:async()=>({id:'t'}),evaluate:async()=>({layout_id:'a'})},store:{audit:async()=>{throw new Error('disk full');}}});
 registry.add({name:'test_change',mutates:true,inputSchema:O(),handler:async()=>({created_id:'new-id',writes:++writes})});
 const r=await registry.execute('test_change',{target_id:'t',expected_layout_id:'a'});assert.equal(r.created_id,'new-id');assert.equal(writes,1);assert.match(r.audit_warning,/Do not retry/);
});
test('Owner-only exports stay confined and CSV formula cells are escaped',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tv-security-')),store=new LocalStore(join(dir,'runtime'));
 const r=await store.exportCsv('../../outside',[{name:'=HYPERLINK("https://collector.example")',pnl:-3}]);assert.ok(r.path.startsWith(join(dir,'runtime','exports')+'/'));const data=await readFile(r.path,'utf8');assert.match(data,/'=HYPERLINK/);assert.equal((await stat(r.path)).mode&0o777,0o600);
});
test('Storage refuses symlinked export directories',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tv-security-'));await mkdir(join(dir,'runtime'));await mkdir(join(dir,'outside'));await symlink(join(dir,'outside'),join(dir,'runtime','exports'));const store=new LocalStore(join(dir,'runtime'));await assert.rejects(store.exportJson('x',{safe:true}),e=>e.code==='UNSAFE_STORAGE');
});
test('Internal storage area names cannot traverse or address an absolute sibling directory',async()=>{
 const store=new LocalStore(join(await mkdtemp(join(tmpdir(),'tv-area-')),'runtime'));for(const area of ['../outside','/tmp','exports/../../outside','a\\b','']){await assert.rejects(store.read(area,'x'),e=>e.code==='UNSAFE_STORAGE');await assert.rejects(store.list(area),e=>e.code==='UNSAFE_STORAGE');await assert.rejects(store.write(area,'x',{data:1}),e=>e.code==='UNSAFE_STORAGE');}
});

test('Quoted JSON and source-like secret fields are redacted without breaking JSON',()=>{
 const source=JSON.stringify({password:'QUOTED_CANARY with spaces',nested:{apiKey:'ESCAPED_CANARY\\"value'},authorization:'Bearer AUTH_CANARY'});
 const cleaned=redact(source);assert.doesNotThrow(()=>JSON.parse(cleaned));assert.equal(cleaned.includes('CANARY'),false);
 assert.equal(redact("const config = {'clientSecret': 'SOURCE_CANARY with spaces'};").includes('CANARY'),false);
});
test('Cookie-export name/value records redact credential values recursively',()=>{
 const records=[{name:'sessionid',value:'COOKIE_RECORD_CANARY'},{name:'sessionid_sign',value:'SIGN_CANARY'},{name:'device_t',value:'DEVICE_CANARY'},{name:'theme',value:'dark'}];
 const cleaned=redact({records});assert.equal(JSON.stringify(cleaned).includes('CANARY'),false);assert.equal(cleaned.records[3].value,'dark');
 assert.equal(redact(JSON.stringify(records)).includes('CANARY'),false);
 const harmless=' { "event": "fill", "quantity": 1 } ';assert.equal(redact(harmless),harmless);
});
test('Browser launcher inherits platform settings and excludes unrelated secrets and injection flags',()=>{
 const env=browserEnvironment({PATH:'/bin',HOME:'/example',SystemRoot:'C:\\Windows',DISPLAY:':0',OPENAI_API_KEY:'ENV_CANARY',GITHUB_TOKEN:'ENV_CANARY',TV_HTTP_TOKEN:'ENV_CANARY',OTHER_SECRET:'ENV_CANARY',NODE_OPTIONS:'--import=evil',LD_PRELOAD:'evil',DYLD_INSERT_LIBRARIES:'evil',SSLKEYLOGFILE:'/tmp/secret'});
 assert.deepEqual(env,{PATH:'/bin',HOME:'/example',SystemRoot:'C:\\Windows',DISPLAY:':0'});assert.equal(JSON.stringify(env).includes('CANARY'),false);
});
test('Launcher refuses missing, duplicate or unknown options before choosing a profile',()=>{
 for(const args of [['--profile'],['--profile','--url'],['--unknown','x'],['--profile','a','--profile','b']])assert.throws(()=>parseLaunchOptions(args),e=>e.code==='INVALID_OPTION');
 assert.deepEqual(parseLaunchOptions(['--profile','new profile','--url','https://www.tradingview.com/chart/']),{'--profile':'new profile','--url':'https://www.tradingview.com/chart/'});
});
test('Session diagnostics and layout metadata discard arbitrary URL query secrets and fragments',async()=>{
 const h=createFakeCdp();const raw='https://www.tradingview.com/chart/source01/?interval=60&custom=URL_CANARY#FRAGMENT_CANARY';
 h.setTargets([{id:'chart-1',type:'page',url:raw,webSocketDebuggerUrl:'ws://127.0.0.1:9222/devtools/page/chart-1'}]);h.context.location=new URL(raw);
 h.context.TradingViewApi={_chartWidgetCollection:{metaInfo:{uid:'source01'}},getSaveChartService:()=>({hasChanges:()=>false})};
 const {buildRuntime}=await import('../src/runtime.mjs');const r=buildRuntime({browser:h.browser,store:{audit:async()=>{}}});
 assert.equal(JSON.stringify(await r.registry.execute('session_health')).includes('CANARY'),false);
 const meta=await readLayoutMeta(new ToolContext({browser:h.browser,targetId:'chart-1'}));assert.equal(meta.url,'https://www.tradingview.com/chart/source01/?interval=60');await h.close();
});
test('CSV exports neutralize whitespace-prefixed and numeric-looking formulas and headers',async()=>{
 const store=new LocalStore(join(await mkdtemp(join(tmpdir(),'tv-csv-')),'runtime'));
 const inputs=[' =HYPERLINK("https://collector.example")','-1+CMD()','\n@SUM(1)','+1+CMD()','@SUM(1)'];
 const file=await store.exportCsv('formulas',inputs.map(value=>({'=FORMULA()':value,number:-12.5})));
 const csv=await readFile(file.path,'utf8');assert.ok(csv.startsWith('"\'=FORMULA()"'));
 for(const value of inputs)assert.ok(csv.includes('"\''+value.replaceAll('"','""')+'"'));
 assert.ok(csv.includes('"-12.5"'));
});
test('Chrome discovery is bounded while streaming and cancels oversized bodies',async()=>{
 let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 const browser=new BrowserManager({fetchImpl:async()=>new Response(body)});
 await assert.rejects(browser.version(),e=>e.code==='PAYLOAD_LIMIT');assert.equal(cancelled,true);
});
test('New-target discovery refuses a non-TradingView response and sanitizes accepted URLs',async()=>{
 const invalid=new BrowserManager({fetchImpl:async()=>new Response(JSON.stringify({id:'x',url:'https://collector.example/chart/'}))});
 await assert.rejects(invalid.openTarget('https://www.tradingview.com/chart/'),e=>e.code==='UNSAFE_ORIGIN');
 const valid=new BrowserManager({fetchImpl:async()=>new Response(JSON.stringify({id:'x',url:'https://www.tradingview.com/chart/?private=URL_CANARY#CANARY'}))});
 assert.equal((await valid.openTarget('https://www.tradingview.com/chart/')).url,'https://www.tradingview.com/chart/');
});
test('A debugger that closes before opening rejects promptly and clears its state',async()=>{
 class ClosingSocket extends EventTarget{constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('close')));}close(){}}
 const socket=new CdpSocket('ws://127.0.0.1:9222/devtools/page/x',{WebSocketImpl:ClosingSocket});
 await assert.rejects(socket.connect(),e=>e.code==='CDP_DISCONNECTED');assert.equal(socket.socket,null);assert.equal(socket.pending.size,0);
});
