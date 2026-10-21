import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PublicMarketClient, preparePublicScan, HOTLIST_PRESETS } from '../src/core/public-market.mjs';
import marketTools, { nativeMarketPage, getPublicQuotes } from '../src/features/market.mjs';
import { assertFixedFunction } from '../src/core/security.mjs';
import { validate, validateSchemaDefinition } from '../src/core/schema.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const scanArgs = { market: 'global', symbols: ['NASDAQ:AAPL'], columns: ['name','close'], limit: 1 };
const scanPayload = { totalCount: 1, data: [{ s: 'NASDAQ:AAPL', d: ['AAPL',0] }] };
function response(payload, url, init = {}) {
  const result = new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
function fixture(replier = (url) => response(scanPayload, url), limits = {}) {
  const requests = [];
  const publicMarket = new PublicMarketClient({ ...limits, fetchImpl: async (url, init) => {
    requests.push({ url, ...init, parsedBody: init.body === undefined ? undefined : JSON.parse(init.body) });
    return replier(url, init, requests.length);
  } });
  const ctx = { publicMarket, signal: new AbortController().signal };
  const run = async (name, args = {}) => {
    const tool = marketTools.find(item => item.name === name); validate(tool.inputSchema, args); return tool.handler(args, ctx);
  };
  return { publicMarket, requests, ctx, run };
}

test('market catalog has seven read-only tools with closed schemas and fixed browser code', () => {
  assert.equal(marketTools.length, 7);
  assert.equal(new Set(marketTools.map(tool => tool.name)).size, marketTools.length);
  for (const tool of marketTools) {
    assert.equal(tool.mutates, false); assert.equal(tool.inputSchema.additionalProperties, false); validateSchemaDefinition(tool.inputSchema);
  }
  assert.equal(typeof assertFixedFunction(nativeMarketPage), 'string');
  assert.deepEqual(marketTools.filter(tool=>tool.publicNetwork).map(tool=>tool.name),['quote_get','quote_batch','screener_scan','market_technical_summary','hotlist_get']);
});

test('scanner uses only the fixed public host and bounded source-backed payload', async () => {
  const f = fixture();
  await f.publicMarket.scan({ ...scanArgs, filters: [{ field:'close', operation:'egreater', value:0 }], sort_by:'volume', sort_order:'desc', offset:40 });
  assert.equal(f.requests.length, 1); const request = f.requests[0];
  assert.equal(request.url, 'https://scanner.tradingview.com/global/scan');
  assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'error'); assert.equal(request.credentials, 'omit'); assert.equal(request.cache, 'no-store');
  assert.deepEqual(request.headers, { Accept:'application/json', 'Content-Type':'application/json', Origin:'https://www.tradingview.com', Referer:'https://www.tradingview.com/' });
  assert.deepEqual(request.parsedBody, { symbols:{tickers:['NASDAQ:AAPL'],query:{types:[]}}, columns:['name','close'], range:[40,41], filter:[{left:'close',operation:'egreater',right:0}], sort:{sortBy:'volume',sortOrder:'desc'} });
  assert.ok(request.signal instanceof AbortSignal);
});

test('exclusive-end scanner pagination returns one requested row and adjacent pages do not skip boundaries',async()=>{
  const rows=[{s:'NASDAQ:AAPL',d:['AAPL',0]},{s:'NYSE:IBM',d:['IBM',1]},{s:'FX:EURUSD',d:['EURUSD',2]}];
  const f=fixture((url,init)=>{const body=JSON.parse(init.body);return response({totalCount:rows.length,data:rows.slice(...body.range)},url);});
  const first=await f.publicMarket.scan({columns:['name','close'],limit:1,offset:0});
  const next=await f.publicMarket.scan({columns:['name','close'],limit:2,offset:1});
  assert.deepEqual(first.rows.map(row=>row.symbol),['NASDAQ:AAPL']);assert.deepEqual(next.rows.map(row=>row.symbol),['NYSE:IBM','FX:EURUSD']);
  assert.deepEqual(f.requests.map(request=>request.parsedBody.range),[[0,1],[1,3]]);
});

test('dummy environment credentials and caller-supplied auth options never enter requests', async () => {
  const key = 'TV_MARKET_TEST_SESSION_CANARY'; const prior = process.env[key]; process.env[key] = 'dummy_cookie_secret_7d152';
  try {
    const f = fixture();
    await f.publicMarket.scan({ ...scanArgs, headers:{Cookie:'dummy_caller_cookie_3f04', Authorization:'dummy_auth_2c5e'}, url:'https://example.invalid/collect', token:'dummy_token_00bd' });
    const trace = JSON.stringify(f.requests);
    for (const secret of ['dummy_cookie_secret_7d152','dummy_caller_cookie_3f04','dummy_auth_2c5e','dummy_token_00bd','example.invalid']) assert.equal(trace.includes(secret), false);
    assert.equal(Object.keys(f.requests[0].headers).some(key => /cookie|authorization|token|csrf/i.test(key)), false);
    await assert.rejects(() => f.run('screener_scan',{headers:{Cookie:'dummy'}}), error => error.code === 'INVALID_ARGUMENT');
  } finally { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; }
});

test('host/path traversal, URL symbols, duplicate symbols and unsupported columns fail before fetch', async () => {
  const f = fixture();
  const invalid = [
    {market:'https://scanner.tradingview.com.example.invalid'}, {market:'global/../crypto'},
    {symbols:['https://example.invalid']}, {symbols:['AAPL']}, {symbols:['NASDAQ:AAPL','NASDAQ:AAPL']},
    {columns:['document.cookie']}, {columns:['close|1D']}, {columns:['close|not-a-timeframe']}, {columns:['close','close']},
    {limit:101}, {offset:-1}, {filters:[{field:'close',operation:'egreater',value:'0'}]}, {filters:[{field:'token',operation:'equal',value:'dummy'}]},
    {filters:[{field:'close',operation:'egreater',value:Infinity}]}, {sort_by:'remote_url'},
  ];
  for (const args of invalid) await assert.rejects(() => f.publicMarket.scan({ ...scanArgs,...args }), error => error.code === 'INVALID_MARKET_REQUEST');
  for (const path of ['https://example.invalid','//example.invalid','/global/scan?url=https://example.invalid','/global/../scan','/presets/US_unknown?label-product=right-hotlists','/api/v1/symbols_list/custom/']) {
    await assert.rejects(() => f.publicMarket.request(path,{}), error => error.code === 'INVALID_MARKET_REQUEST');
  }
  assert.equal(f.requests.length, 0);
});

test('request and internal limits reject oversized payloads before fetch', async () => {
  const f = fixture();
  await assert.rejects(() => f.publicMarket.request('/global/scan',{value:'x'.repeat(128*1024)}), error => error.code === 'PUBLIC_MARKET_LIMIT');
  assert.equal(f.requests.length,0);
  for (const limits of [{timeoutMs:99},{timeoutMs:30001},{maxBytes:127},{maxBytes:9*1024*1024}]) assert.throws(() => new PublicMarketClient(limits), error => error.code === 'INVALID_MARKET_REQUEST');
});

test('unexpected response destination is refused without a second request', async () => {
  const f = fixture(() => response(scanPayload,'https://example.invalid/collect'));
  await assert.rejects(() => f.publicMarket.scan(scanArgs), error => error.code === 'PUBLIC_MARKET_DESTINATION');
  assert.equal(f.requests.length,1);
});

test('HTTP, non-JSON, API-error and transport errors do not expose response bodies or secrets', async () => {
  const marker = 'dummy_response_token_4892';
  for (const replier of [
    url => response({detail:marker},url,{status:403}),
    url => response('<html>'+marker+'</html>',url),
    url => response({s:'error',error:marker},url),
    () => { throw new Error(marker); },
  ]) {
    const f = fixture(replier);
    await assert.rejects(() => f.publicMarket.scan(scanArgs), error => error.code?.startsWith('PUBLIC_MARKET_') && !JSON.stringify(error).includes(marker) && !error.message.includes(marker));
    assert.equal(f.requests.length,1);
  }
});

test('Content-Length cap cancels an oversized body before reading it', async () => {
  let cancelled = false, read = false;
  const f = fixture(url => ({url,ok:true,status:200,headers:{get:()=> '1024'},body:{cancel:async()=>{cancelled=true;},getReader:()=>{read=true;throw new Error('must not read');}}}),{maxBytes:128});
  await assert.rejects(() => f.publicMarket.scan(scanArgs), error => error.code === 'PUBLIC_MARKET_LIMIT');
  assert.equal(cancelled,true); assert.equal(read,false);
});

test('streaming cap cancels oversized data even when Content-Length is absent', async () => {
  let cancelled = false, released = false;
  const f = fixture(url => ({url,ok:true,status:200,headers:{get:()=>null},body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(129)}),cancel:async()=>{cancelled=true;},releaseLock:()=>{released=true;}})}}),{maxBytes:128});
  await assert.rejects(() => f.publicMarket.scan(scanArgs), error => error.code === 'PUBLIC_MARKET_LIMIT');
  assert.equal(cancelled,true); assert.equal(released,true);
});

test('stream failures are sanitized and a non-streaming response is not read without a bound', async () => {
  const marker = 'dummy_read_secret_a082'; let textRead = false;
  for (const replier of [
    url => ({url,ok:true,headers:{get:()=>null},body:{getReader:()=>({read:async()=>{throw new Error(marker);},releaseLock:()=>{}})}}),
    url => ({url,ok:true,headers:{get:()=>null},text:async()=>{textRead=true;return '{}';}}),
  ]) {
    const f=fixture(replier);await assert.rejects(()=>f.publicMarket.scan(scanArgs),error=>error.code?.startsWith('PUBLIC_MARKET_')&&!error.message.includes(marker));
  }
  assert.equal(textRead,false);
});

test('pre-cancelled queries submit no request; caller cancellation interrupts an active fetch', async () => {
  const f=fixture();const controller=new AbortController();controller.abort();
  await assert.rejects(()=>f.publicMarket.scan(scanArgs,{signal:controller.signal}),error=>error.code==='CANCELLED');assert.equal(f.requests.length,0);
  const next=new AbortController();
  const active=fixture((_url,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});setTimeout(()=>next.abort(),5);}));
  await assert.rejects(()=>active.publicMarket.scan(scanArgs,{signal:next.signal}),error=>error.code==='CANCELLED');assert.equal(active.requests.length,1);
});

test('configured timeout interrupts the public request without an authenticated retry', async () => {
  const f=fixture((_url,init)=>new Promise((_resolve,reject)=>{
    const keepAlive=setTimeout(()=>reject(new Error('timeout did not abort')),500);
    init.signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(new Error('timed out'));},{once:true});
  }),{timeoutMs:100});
  await assert.rejects(()=>f.publicMarket.scan(scanArgs),error=>error.code==='PUBLIC_MARKET_UNAVAILABLE');assert.equal(f.requests.length,1);
});

test('scanner preserves numeric zero and marks omitted requested symbols explicitly', async () => {
  const f=fixture();const result=await f.publicMarket.scan({...scanArgs,symbols:['NASDAQ:AAPL','NYSE:IBM'],limit:2});
  assert.equal(result.rows[0].values.close,0);assert.deepEqual(result.missing_symbols,['NYSE:IBM']);assert.equal(result.credentials_used,false);
  assert.match(result.freshness,/timestamp.*not established/);
});

test('unrequested symbols, duplicate rows, bad column counts, object values and over-limit rows are rejected', async () => {
  const bad=[
    {data:[{s:'NYSE:IBM',d:['IBM',0]}]},
    {data:[{s:'NASDAQ:AAPL',d:['AAPL',0]},{s:'NASDAQ:AAPL',d:['AAPL',0]}]},
    {data:[{s:'NASDAQ:AAPL',d:['AAPL']}]},
    {data:[{s:'NASDAQ:AAPL',d:['AAPL',{cookie:'dummy'}]}]},
    {data:[{s:'https://example.invalid',d:['AAPL',0]}]},
  ];
  for(const payload of bad){const f=fixture(url=>response(payload,url));await assert.rejects(()=>f.publicMarket.scan(scanArgs),error=>['PUBLIC_MARKET_SHAPE','PUBLIC_MARKET_SYMBOL_MISMATCH'].includes(error.code));}
  const duplicate=fixture(url=>response(bad[1],url));await assert.rejects(()=>duplicate.publicMarket.scan({...scanArgs,limit:2}),error=>error.code==='PUBLIC_MARKET_SHAPE');
});

test('public quotes preserve requested ordering, zero prices, nulls and missing-last-price coverage', async () => {
  const f=fixture((url,init)=>{const body=JSON.parse(init.body);assert.deepEqual(body.columns,['name','close','change','change_abs','volume','open','high','low']);
    return response({data:[{s:'NYSE:IBM',d:['IBM',null,0,0,0,0,0,0]},{s:'NASDAQ:AAPL',d:['AAPL',0,0,0,0,0,0,0]}]},url);});
  const result=await getPublicQuotes({symbols:['NASDAQ:AAPL','NYSE:IBM','FX:EURUSD']},f.ctx);
  assert.deepEqual(result.quotes.map(q=>q.symbol),['NASDAQ:AAPL','NYSE:IBM']);assert.equal(result.quotes[0].last,0);assert.equal(result.quotes[0].volume,0);
  assert.equal(result.quotes[1].last,null);assert.deepEqual(result.missing_symbols,['FX:EURUSD']);assert.deepEqual(result.missing_last_price_symbols,['NYSE:IBM']);assert.equal(result.complete,false);
});

test('one-symbol quote does not touch chart APIs and missing symbols are an explicit error', async () => {
  const f=fixture((url,init)=>{const body=JSON.parse(init.body);return response({data:[{s:body.symbols.tickers[0],d:['AAPL',0,0,0,0,0,0,0]}]},url);});
  f.ctx.callPage=()=>{throw new Error('must not inspect browser');};
  const result=await f.run('quote_get',{symbol:'NASDAQ:AAPL'});assert.equal(result.quote.last,0);assert.equal(result.complete,true);
  const missing=fixture(url=>response({data:[]},url));await assert.rejects(()=>missing.run('quote_get',{symbol:'NASDAQ:AAPL'}),error=>error.code==='SYMBOL_NOT_FOUND');
});

test('technical summary uses daily unsuffixed fields and approved intraday suffixes; nulls make coverage incomplete', async () => {
  const f=fixture((url,init)=>{const body=JSON.parse(init.body);assert.equal(body.columns.includes('Recommend.All'),true);assert.equal(body.columns.includes('Recommend.All|60'),true);assert.equal(body.columns.some(c=>c.endsWith('|1D')),false);
    return response({data:[{s:'NASDAQ:AAPL',d:body.columns.map(c=>c==='RSI|60'?null:0)}]},url);});
  const result=await f.run('market_technical_summary',{symbols:['NASDAQ:AAPL'],timeframes:['1D','60']});
  assert.equal(result.items[0].recommend_all,0);assert.equal(result.items[0].rsi,0);assert.equal(result.items[1].rsi,null);
  assert.deepEqual(result.incomplete_items,[{symbol:'NASDAQ:AAPL',timeframe:'60',missing_fields:['rsi']}]);assert.equal(result.symbols_complete,true);assert.equal(result.complete,false);
});

test('hotlists use only exact public US preset GETs and map source field indexes faithfully', async () => {
  const f=fixture(url=>response({totalCount:2,fields:['name','close','volume'],symbols:[{s:'NASDAQ:AAPL',f:['AAPL',0,0]},{s:'NYSE:IBM',f:['IBM',4,8]}],time:1700000000000},url));
  const result=await f.run('hotlist_get',{preset:'volume_gainers',limit:1});
  assert.equal(f.requests[0].url,'https://scanner.tradingview.com/presets/US_volume_gainers?label-product=right-hotlists');assert.equal(f.requests[0].method,'GET');assert.equal(f.requests[0].body,undefined);
  assert.equal(result.rows[0].values.close,0);assert.equal(result.rows[0].values.volume,0);assert.equal(result.truncated,true);assert.equal(result.server_time_ms,1700000000000);
  for(const preset of ['../../collect','US_volume_gainers','volume_gainers&url=evil'])await assert.rejects(()=>f.publicMarket.hotlist({preset}),error=>error.code==='INVALID_MARKET_REQUEST');
  assert.equal(HOTLIST_PRESETS.length,9);assert.equal(f.requests.length,1);
});

test('hotlist duplicate fields, duplicate symbol rows and mismatched field-value counts are rejected', async () => {
  for(const payload of [
    {fields:['close','close'],symbols:[{s:'NASDAQ:AAPL',f:[1,2]}]},
    {fields:['__proto__'],symbols:[{s:'NASDAQ:AAPL',f:['dummy']}]},
    {fields:['close'],symbols:[{s:'NASDAQ:AAPL',f:[]}]},
    {fields:['close'],symbols:[{s:'NASDAQ:AAPL',f:[1]},{s:'NASDAQ:AAPL',f:[1]}]},
  ]){const f=fixture(url=>response(payload,url));await assert.rejects(()=>f.publicMarket.hotlist({preset:'volume_gainers'}),error=>error.code==='PUBLIC_MARKET_SHAPE');}
});

function nativeFixture(options = {}) {
  const state={symbol:'NASDAQ:AAPL',timeframe:'60',layout:'layout-A',bar:[1700000000,0,0,0,0,0],...options};
  const main={symbolInfo:()=>({pro_name:state.resolvedSymbol??state.symbol}),bars:()=>({lastIndex:()=>0,valueAt:()=>state.bar})};
  const chart={symbol:()=>state.symbol,resolution:()=>state.timeframe,symbolExt:()=>({description:'Fixture instrument'}),_chartWidget:{model:()=>({mainSeries:()=>main})}};
  const root={_activeChartWidgetWV:{value:()=>chart},_chartWidgetCollection:{metaInfo:{uid:{value:()=>state.layout}}}};
  const realm=vm.createContext({window:{TradingViewApi:root},Date,document:{querySelectorAll:selector=>state.panels?.[selector]??[]},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  const ctx={callPage:async(fn,args)=>{assertFixedFunction(fn);realm.args=plain(args);return plain(await vm.runInContext(`(${fn.toString()})(args)`,realm));},callTool:async()=>({ok:true,layout_id:state.layout,symbol:state.symbol,timeframe:state.timeframe,studies:[],coverage:'complete'})};
  const run=async(name,args={})=>{const tool=marketTools.find(item=>item.name===name);validate(tool.inputSchema,args);return tool.handler(args,ctx);};
  return{state,chart,main,ctx,run};
}

test('native quote reads latest loaded candle zero values and reports source/binding without a public request',async()=>{
  const f=nativeFixture();const result=await f.run('quote_get');assert.equal(result.close,0);assert.equal(result.volume,0);assert.equal(result.timeframe,'60');assert.equal(result.layout_id,'layout-A');
  assert.equal(result.symbol_binding_verified,true);assert.equal(result.source,'loaded_chart_last_bar');assert.match(result.quote_kind,/candle close/);
  f.state.bar=[1700000000,1,2,0,1];assert.equal((await f.run('quote_get')).volume,null);
});

test('native quote refuses stale-symbol bars and unavailable bar data',async()=>{
  const f=nativeFixture({resolvedSymbol:'NYSE:IBM'});await assert.rejects(()=>f.run('quote_get'),error=>error.code==='MARKET_DATA_NOT_READY');
  f.state.resolvedSymbol='NASDAQ:AAPL';f.state.bar=null;await assert.rejects(()=>f.run('quote_get'),error=>error.code==='MARKET_DATA_NOT_READY');
  f.main.bars=()=>null;await assert.rejects(()=>f.run('quote_get'),error=>error.code==='CAPABILITY_UNAVAILABLE');
});

const visibleBox=()=>({width:200,height:20});
function depthRow(price,size,side='') { return {getBoundingClientRect:visibleBox,querySelector:selector=>({textContent:selector.includes('price')?price:size}),getAttribute:name=>name==='data-side'?side:''}; }
function depthPanel(rows){return{getBoundingClientRect:visibleBox,querySelectorAll:()=>rows};}

test('native depth requires explicit side labels, preserves zero, and omits ambiguous localized values',async()=>{
  const panel=depthPanel([depthRow('1,234.50','0','bid'),depthRow('1,235.00','2','ask'),depthRow('1,23','4','bid'),depthRow('1234','3',''),depthRow('1233','4','bid ask')]);
  const f=nativeFixture({panels:{'[data-name="dom"]':[panel]}});const result=await f.run('market_depth',{expected_symbol:'NASDAQ:AAPL'});
  assert.deepEqual(result.bids,[{price:1234.5,size:0}]);assert.deepEqual(result.asks,[{price:1235,size:2}]);assert.equal(result.spread,0.5);
  assert.equal(result.unparsed_rows,1);assert.equal(result.unclassified_rows,2);assert.equal(result.partial,true);assert.equal(result.symbol_binding_verified,false);
});

test('native depth refuses unavailable/ambiguous panels and never guesses unlabeled row sides',async()=>{
  const f=nativeFixture();await assert.rejects(()=>f.run('market_depth'),error=>error.code==='CAPABILITY_UNAVAILABLE');
  f.state.panels={'[data-name="dom"]':[depthPanel([]),depthPanel([])]};await assert.rejects(()=>f.run('market_depth'),error=>error.code==='AMBIGUOUS_DEPTH_PANEL');
  f.state.panels={'[data-name="dom"]':[depthPanel([depthRow('1','2'),depthRow('2','3')])]};await assert.rejects(()=>f.run('market_depth'),error=>error.code==='DEPTH_UNREADABLE');
  await assert.rejects(()=>f.run('market_depth',{expected_symbol:'NYSE:IBM'}),error=>error.code==='MARKET_CONTEXT_MISMATCH');
});

test('native signal snapshot carries study coverage and discards context-mismatched studies',async()=>{
  const f=nativeFixture();assert.equal((await f.run('market_signal_snapshot')).partial,false);
  f.ctx.callTool=async()=>({layout_id:f.state.layout,symbol:f.state.symbol,timeframe:f.state.timeframe,studies:[{values:['0']}],coverage:'partial'});
  assert.equal((await f.run('market_signal_snapshot')).partial,true);
  f.ctx.callTool=async()=>{const old={layout_id:f.state.layout,symbol:f.state.symbol,timeframe:f.state.timeframe,studies:[{values:['0']}],coverage:'complete'};f.state.symbol='NYSE:IBM';return old;};
  const changed=await f.run('market_signal_snapshot');assert.equal(changed.context_stable,false);assert.equal(changed.studies,null);assert.equal(changed.partial,true);assert.equal(changed.quote.symbol,'NYSE:IBM');
});

test('native signal snapshot retains quote but sanitizes a failed study collection',async()=>{
  const f=nativeFixture();f.ctx.callTool=async()=>{throw new Error('dummy_study_secret_1551');};
  const result=await f.run('market_signal_snapshot');assert.equal(result.quote.close,0);assert.equal(result.partial,true);assert.equal(result.studies,null);assert.equal(result.news_included,false);
  assert.equal(JSON.stringify(result).includes('dummy_study_secret_1551'),false);
});
