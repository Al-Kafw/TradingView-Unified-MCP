import { O } from '../core/schema.mjs';
import { ToolError } from '../core/errors.mjs';
import { PublicMarketClient, SCANNER_MARKETS, SCANNER_COLUMNS, HOTLIST_PRESETS, TA_TIMEFRAMES } from '../core/public-market.mjs';

const publicClient = new PublicMarketClient();
const client = ctx => ctx.publicMarket ?? publicClient;
const quoteColumns = ['name', 'close', 'change', 'change_abs', 'volume', 'open', 'high', 'low'];
const taColumns = ['Recommend.All', 'Recommend.MA', 'Recommend.Other', 'RSI', 'MACD.macd', 'close', 'change'];
const numberOrNull = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Fixed native read for loaded chart quotes and an already visible depth
 * panel. No panel is opened and no broker/trading method is called. */
export function nativeMarketPage(a) {
  const fail = (code, message, details = {}) => ({ ok: false, code, message, ...details });
  const api = window.TradingViewApi, chart = api?._activeChartWidgetWV?.value?.() ?? api?.activeChart?.();
  if (!chart || typeof chart.symbol !== 'function' || typeof chart.resolution !== 'function') return fail('CAPABILITY_UNAVAILABLE', 'Native chart market data is unavailable.');
  const symbol = chart.symbol(), timeframe = chart.resolution();
  const unwrap = value => value && typeof value.value === 'function' ? value.value() : value;
  const save = typeof api.getSaveChartService === 'function' ? api.getSaveChartService() : null;
  const layout = unwrap(api._chartWidgetCollection?.metaInfo?.uid) || (typeof save?.layoutId === 'function' ? unwrap(save.layoutId()) : null);
  const layoutId = layout == null || layout === '' ? null : String(layout);
  if (a.expected_symbol && symbol !== a.expected_symbol || a.expected_timeframe && timeframe !== a.expected_timeframe) return fail('MARKET_CONTEXT_MISMATCH', 'The selected chart does not match the requested market context.');
  const numeric = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  if (a.op === 'quote') {
    const model = chart._chartWidget?.model?.();
    const main = model?.mainSeries?.() ?? model?.model?.()?.mainSeries?.();
    const info = main?.symbolInfo?.();
    const resolvedSymbol = info?.pro_name ?? info?.full_name ?? null;
    if (resolvedSymbol && resolvedSymbol !== symbol) return fail('MARKET_DATA_NOT_READY', 'The loaded bar series still belongs to a different symbol.');
    const bars = main?.bars?.();
    if (!bars || typeof bars.lastIndex !== 'function' || typeof bars.valueAt !== 'function') return fail('CAPABILITY_UNAVAILABLE', 'The loaded-bar API is unavailable.');
    const lastIndex = bars.lastIndex(), value = bars.valueAt(lastIndex);
    if (!Array.isArray(value) || value.length < 5 || numeric(value[0]) === null || numeric(value[4]) === null) return fail('MARKET_DATA_NOT_READY', 'No valid last loaded bar is available.');
    const ext = typeof chart.symbolExt === 'function' ? chart.symbolExt() : {};
    return { ok: true, layout_id: layoutId, symbol, resolved_symbol: resolvedSymbol, symbol_binding_verified: resolvedSymbol === symbol, timeframe, time: value[0], time_unit: 'TradingView native bar timestamp; normally Unix seconds',
      open: numeric(value[1]), high: numeric(value[2]), low: numeric(value[3]), close: numeric(value[4]), last: numeric(value[4]), volume: numeric(value[5]),
      description: typeof ext.description === 'string' ? ext.description.slice(0,500) : null,
      source: 'loaded_chart_last_bar', quote_kind: 'latest loaded candle close; not a bid/ask or tick subscription',
      captured_at: new Date().toISOString() };
  }
  if (a.op !== 'depth') return fail('INVALID_ARGUMENT', 'Unknown native market read.');
  const visible = e => { const rect = e.getBoundingClientRect(); const style = getComputedStyle(e); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
  let panel;
  for (const selector of ['[data-name="dom"]', '[class*="orderBook"]', '[class*="depth"]']) {
    const found = [...document.querySelectorAll(selector)].filter(visible);
    if (found.length === 1) { panel = found[0]; break; }
    if (found.length > 1) return fail('AMBIGUOUS_DEPTH_PANEL', 'More than one visible depth panel matched.');
  }
  if (!panel) return fail('CAPABILITY_UNAVAILABLE', 'No visible depth-of-market panel is available. Open it manually if supported by your data subscription.');
  const parse = value => {
    const text = String(value ?? '').trim().replaceAll('\u2212', '-');
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
    const valueNumber = Number(text.replaceAll(',', '')); return Number.isFinite(valueNumber) ? valueNumber : null;
  };
  const bids = [], asks = []; let unclassified = 0, unparsed = 0;
  const rows = [...panel.querySelectorAll('[class*="row"], tr')].filter(visible);
  if (rows.length > 5000) return fail('PAYLOAD_LIMIT', 'Depth panel has too many rows.');
  for (const row of rows) {
    const price = parse(row.querySelector('[class*="price"]')?.textContent);
    const size = parse(row.querySelector('[class*="size"], [class*="volume"], [class*="qty"]')?.textContent);
    if (price === null || size === null || size < 0) { unparsed++; continue; }
    const labels = [row.getAttribute('data-side'), row.getAttribute('class'), row.getAttribute('aria-label')].filter(Boolean).join(' ');
    const bid = /(?:^|[^a-z])(bid|buy)(?:$|[^a-z])/i.test(labels), ask = /(?:^|[^a-z])(ask|sell)(?:$|[^a-z])/i.test(labels);
    if (bid === ask) { unclassified++; continue; }
    (bid ? bids : asks).push({ price, size });
  }
  if (!bids.length && !asks.length) return fail('DEPTH_UNREADABLE', 'Visible depth rows cannot be safely classified and parsed; no side or price was guessed.', { unclassified_rows: unclassified, unparsed_rows: unparsed });
  bids.sort((a,b) => b.price-a.price); asks.sort((a,b) => a.price-b.price);
  const limit = Math.min(a.limit ?? 20, 100);
  return { ok: true, symbol, timeframe, bids: bids.slice(0,limit), asks: asks.slice(0,limit),
    bid_levels_observed: bids.length, ask_levels_observed: asks.length,
    spread: bids.length && asks.length ? asks[0].price-bids[0].price : null,
    unclassified_rows: unclassified, unparsed_rows: unparsed, partial: unclassified > 0 || unparsed > 0,
    source: 'visible_depth_panel', symbol_binding_verified: false,
    note: 'The selected chart symbol is context only. A separate broker/depth-panel instrument binding is not independently established.',
    numeric_format: 'ASCII decimal point with optional comma thousands groups; ambiguous localized values are omitted', captured_at: new Date().toISOString() };
}

async function native(ctx, op, args = {}) {
  const result = await ctx.callPage(nativeMarketPage, { ...args, op });
  if (!result?.ok) throw new ToolError(result?.code ?? 'MARKET_DATA_UNAVAILABLE', result?.message ?? 'No usable market data.', result);
  return result;
}

export async function getPublicQuotes(args, ctx) {
  const data = await client(ctx).scan({ market: 'global', symbols: args.symbols, columns: quoteColumns, limit: args.symbols.length }, { signal: ctx.signal });
  const quotes = args.symbols.flatMap(symbol => { const row = data.rows.find(item => item.symbol === symbol); if (!row) return [];
    const v = row.values;
    return [{ symbol, ticker: typeof v.name === 'string' ? v.name : null, last: numberOrNull(v.close), open: numberOrNull(v.open), high: numberOrNull(v.high), low: numberOrNull(v.low),
      change_percent: numberOrNull(v.change), change: numberOrNull(v.change_abs), volume: numberOrNull(v.volume) }]; });
  return { quotes, requested: args.symbols.length, returned: quotes.length, missing_symbols: data.missing_symbols,
    symbols_complete: data.missing_symbols.length === 0, complete: data.missing_symbols.length === 0 && quotes.every(quote => quote.last !== null),
    missing_last_price_symbols: quotes.filter(quote => quote.last === null).map(quote => quote.symbol), source: data.source, retrieved_at: data.retrieved_at, freshness: data.freshness, credentials_used: false };
}

const symbolSchema = { type: 'string', minLength: 3, maxLength: 128, pattern: '^[A-Za-z0-9_-]+:[A-Za-z0-9_.$^=+!/-]+$', description: 'Exact exchange-qualified TradingView symbol.' };
const symbolsSchema = { type: 'array', items: symbolSchema, minItems: 1, maxItems: 100, uniqueItems: true };
const marketSchema = { type: 'string', enum: SCANNER_MARKETS, default: 'global' };
const filterSchema = O({ field: { type: 'string', enum: ['close','change','change_abs','volume','market_cap_basic','type','subtype'] }, operation: { type: 'string', enum: ['equal','egreater','eless'] }, value: { type: ['string','number'], maxLength: 80 } }, ['field','operation','value']);

export default [
  { name: 'quote_get', description: 'With a symbol, read one credential-free TradingView public scanner quote without changing charts. Without a symbol, read the selected chart’s latest loaded candle and label that source explicitly.', inputSchema: O({ symbol: symbolSchema }), mutates: false, needsTarget: false, requiresLayout: false, publicNetwork:true,
    handler: async (a,c) => { if (!a.symbol) return native(c,'quote'); const data = await getPublicQuotes({ symbols:[a.symbol] },c); if (!data.quotes.length) throw new ToolError('SYMBOL_NOT_FOUND','TradingView scanner did not return the requested symbol.'); return { ...data, quote:data.quotes[0] }; } },
  { name: 'quote_batch', description: 'Read up to 100 exchange-qualified symbols from the public TradingView scanner with zero session credentials. Missing symbols remain explicit; no chart is retargeted.', inputSchema: O({ symbols:symbolsSchema },['symbols']), scope:'local', mutates:false, publicNetwork:true, handler:getPublicQuotes },
  { name: 'screener_scan', description: 'Run a bounded public TradingView scanner query across approved markets, columns and numeric/type filters. No credentials, arbitrary headers, external providers or authenticated fallback.', inputSchema: O({ market:marketSchema, symbols:{...symbolsSchema,minItems:0}, columns:{type:'array',items:{type:'string',enum:SCANNER_COLUMNS},minItems:1,maxItems:SCANNER_COLUMNS.length,uniqueItems:true}, filters:{type:'array',items:filterSchema,maxItems:20}, sort_by:{type:'string',enum:SCANNER_COLUMNS}, sort_order:{type:'string',enum:['asc','desc']}, limit:{type:'integer',minimum:1,maximum:100,default:20}, offset:{type:'integer',minimum:0,maximum:100000,default:0} }), scope:'local', mutates:false, publicNetwork:true,
    handler:(a,c)=>client(c).scan(a,{signal:c.signal}) },
  { name: 'market_technical_summary', description: 'Read TradingView scanner recommendation scores, RSI and MACD fields for specified symbols/timeframes. These are service-provided values, not locally simulated signals or backtest results.', inputSchema: O({ symbols:symbolsSchema, market:marketSchema, timeframes:{type:'array',items:{type:'string',enum:TA_TIMEFRAMES},minItems:1,maxItems:10,uniqueItems:true,default:['1D']} },['symbols']), scope:'local', mutates:false, publicNetwork:true,
    handler:async(a,c)=>{const frames=a.timeframes??['1D'];const column=(field,frame)=>frame==='1D'?field:field+'|'+frame;const columns=frames.flatMap(frame=>taColumns.map(field=>column(field,frame)));
      const data=await client(c).scan({market:a.market??'global',symbols:a.symbols,columns,limit:a.symbols.length},{signal:c.signal});
      const items=data.rows.flatMap(row=>frames.map(timeframe=>({symbol:row.symbol,timeframe,recommend_all:numberOrNull(row.values[column('Recommend.All',timeframe)]),recommend_moving_averages:numberOrNull(row.values[column('Recommend.MA',timeframe)]),recommend_oscillators:numberOrNull(row.values[column('Recommend.Other',timeframe)]),rsi:numberOrNull(row.values[column('RSI',timeframe)]),macd:numberOrNull(row.values[column('MACD.macd',timeframe)]),close:numberOrNull(row.values[column('close',timeframe)]),change_percent:numberOrNull(row.values[column('change',timeframe)])})));
      const incomplete=items.filter(item=>Object.values(item).some(value=>value===null)).map(item=>({symbol:item.symbol,timeframe:item.timeframe,missing_fields:Object.keys(item).filter(key=>item[key]===null)}));
      return {source:data.source,retrieved_at:data.retrieved_at,freshness:data.freshness,credentials_used:false,missing_symbols:data.missing_symbols,symbols_complete:data.missing_symbols.length===0,complete:data.missing_symbols.length===0&&incomplete.length===0,items,incomplete_items:incomplete,
        interpretation:'Scores are reported as numeric TradingView data. Missing fields remain null; no trade or backtest conclusion is inferred.'};} },
  { name: 'hotlist_get', description: 'Read a fixed US TradingView public hotlist preset with up to 20 rows. Uses only the credential-free scanner preset endpoint.', inputSchema:O({preset:{type:'string',enum:HOTLIST_PRESETS},limit:{type:'integer',minimum:1,maximum:20,default:20}},['preset']),scope:'local',mutates:false,publicNetwork:true,handler:(a,c)=>client(c).hotlist(a,{signal:c.signal}) },
  { name: 'market_depth', description: 'Read an already visible depth panel without opening trading controls. Requires explicit bid/ask row labels and unambiguous numeric values; never guesses sides by row position.', inputSchema:O({expected_symbol:symbolSchema,limit:{type:'integer',minimum:1,maximum:100,default:20}}),mutates:false,handler:(a,c)=>native(c,'depth',a) },
  { name: 'market_signal_snapshot', description: 'Combine the current loaded candle with native Data Window study values. Reports partial collection and context changes; does not call outside news or sentiment providers.', inputSchema:O(),mutates:false,
    handler:async(_a,c)=>{const before=await native(c,'quote');let studies=null,studyError=null;try{studies=await c.callTool('data_get_study_values');}catch(error){studyError={code:error.code??'STUDY_DATA_UNAVAILABLE'};}
      const after=await native(c,'quote');const stable=before.symbol===after.symbol&&before.timeframe===after.timeframe&&before.layout_id===after.layout_id&&(!studies||(studies.symbol===after.symbol&&studies.timeframe===after.timeframe&&studies.layout_id===after.layout_id));
      return {quote:after,studies:stable?studies:null,study_error:studyError,context_stable:stable,partial:!stable||!!studyError||studies?.coverage==='partial',
        collection_note:stable?'Chart symbol, timeframe and layout agree across reads; this is a sequential snapshot, not an atomic observation.':'Study values were discarded because their market context could not be reconciled with the final chart read.',source:'native_chart_and_data_window',news_included:false,captured_at:new Date().toISOString()};} },
];
