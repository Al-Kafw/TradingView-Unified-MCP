import { ToolError } from '../core/errors.mjs';

/** Read only chart data. This does not fetch any third-party data or account material. */
export function dataPage(a) {
  const fail = (code, message, details = {}) => ({ ok: false, code, message, ...details });
  const chart = window.TradingViewApi?._activeChartWidgetWV?.value?.();
  if (!chart) return fail('CAPABILITY_UNAVAILABLE', 'The chart API is unavailable.');
  const outer = chart._chartWidget?.model?.();
  const inner = outer?.model?.() ?? outer;
  const main = inner?.mainSeries?.() ?? outer?.mainSeries?.();
  const sources = inner?.dataSources?.();
  const root = window.TradingViewApi;
  const unwrap = value => value && typeof value.value === 'function' ? value.value() : value;
  const service = typeof root.getSaveChartService === 'function' ? root.getSaveChartService() : null;
  const nativeId = unwrap(root._chartWidgetCollection?.metaInfo?.uid) || (typeof service?.layoutId === 'function' ? unwrap(service.layoutId()) : null);
  const symbolInfo = main?.symbolInfo?.();
  const context = { layout_id: nativeId == null || nativeId === '' ? null : String(nativeId), symbol: chart.symbol(), resolved_symbol: symbolInfo?.pro_name ?? symbolInfo?.full_name ?? symbolInfo?.name ?? null, timeframe: chart.resolution(), session: typeof main?.sessionId === 'function' ? unwrap(main.sessionId()) : null, observed_at: new Date().toISOString() };
  try {
    if (a.op === 'ohlcv' || a.op === 'last_bar') {

      // Approve only independently identified ES/NQ/YM delayed-feed aliases.
      const approvedAliases = {
        'CME_MINI_DL:ES1!': 'CME_MINI:ES1!',
        'CME_MINI_DL:NQ1!': 'CME_MINI:NQ1!',
        'CBOT_MINI_DL:YM1!': 'CBOT_MINI:YM1!'
      };

      const exactIdentity =
        typeof context.symbol === 'string' &&
        context.symbol === context.resolved_symbol;

      let verifiedAlias = false;

      if (!exactIdentity) {
        let extended = null;

        if (typeof chart.symbolExt === 'function') {
          try { extended = chart.symbolExt(); }
          catch { extended = null; }
        }

        const approved = Object.hasOwn(
          approvedAliases, context.symbol
        ) ? approvedAliases[context.symbol] : null;

        const ticker = typeof context.symbol === 'string'
          ? context.symbol.split(':')[1] : null;

        verifiedAlias =
          approved !== null &&
          approved === context.resolved_symbol &&
          symbolInfo?.full_name === context.symbol &&
          symbolInfo?.pro_name === context.resolved_symbol &&
          (
            symbolInfo?.symbol === ticker ||
            (
              symbolInfo?.symbol == null &&
              symbolInfo?.name === ticker
            )
          ) &&
          extended?.full_name === context.symbol &&
          extended?.pro_name === context.resolved_symbol &&
          extended?.symbol === ticker &&
          extended?.type === 'futures';
      }

      if (!exactIdentity && !verifiedAlias) return fail(
        'CHART_NOT_READY',
        'Displayed and resolved symbols are not independently verified.',
        context
      );

      context.delayed_feed_alias = verifiedAlias;
      context.symbol_identity_verified_by = verifiedAlias
        ? 'exact_approved_alias_and_two_native_metadata_sources'
        : 'exact_displayed_and_resolved_symbol';

      const bars = main?.bars?.();
      if (!bars || !['firstIndex','lastIndex','valueAt','size'].every(k => typeof bars[k] === 'function')) return fail('CAPABILITY_UNAVAILABLE', 'Loaded bar series cannot be read on this TradingView build.');
      const first = bars.firstIndex(), last = bars.lastIndex(), size = bars.size();
      if (!size || first == null || last == null) return fail('CHART_NOT_READY', 'No loaded bars are available yet.');
      const offset = a.op === 'last_bar' ? 0 : (a.offset ?? 0);
      const limit = a.op === 'last_bar' ? 1 : (a.limit ?? 500);
      const descending = a.op === 'last_bar' || a.order === 'desc';
      const out = [];
      for (let j = offset; j < Math.min(size, offset + limit); j++) {
        const index = descending ? last - j : first + j;
        const v = bars.valueAt(index);
        if (v) out.push({ index, time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] ?? null });
      }
      const result = { ok: true, ...context, source: 'loaded_chart_bars', time_unit: 'unix_seconds', total_available: size, first_index: first, last_index: last, offset, returned: out.length, next_offset: offset + limit < size ? offset + limit : null, order: descending ? 'desc' : 'asc', bars: out, includes_only_loaded_history: true };
      if (a.op === 'last_bar') result.note = 'Latest loaded candle values; this is not a bid/ask quote or guaranteed real-time tick.';
      return result;
    }
    if (a.op === 'study_values') {
      if (!Array.isArray(sources)) return fail('CAPABILITY_UNAVAILABLE', 'Chart data sources cannot be enumerated.');
      const wanted = a.entity_id ? sources.filter(s => typeof s.id === 'function' && s.id() === a.entity_id) : sources.filter(s => typeof s.metaInfo === 'function');
      if (a.entity_id && wanted.length !== 1) return fail('TARGET_NOT_FOUND', 'No exact study entity ID matched.');
      const results = [], unavailable = [];
      for (const s of wanted) {
        const meta = s.metaInfo?.();
        const id = typeof s.id === 'function' ? s.id() : null;
        const info = { entity_id: typeof id === 'string' ? id : null, name: meta?.description ?? meta?.shortDescription ?? null };
        const items = s.dataWindowView?.()?.items?.();
        if (!Array.isArray(items)) { unavailable.push({ ...info, reason: 'Data Window values unavailable' }); continue; }
        const values = items.filter(i => i._title != null && i._value != null && i._value !== '∅').map(i => ({ title: String(i._title), value: String(i._value) }));
        if (values.length) results.push({ ...info, values });
        else unavailable.push({ ...info, reason: 'No loaded values' });
      }
      if (wanted.length && !results.length) return fail('VALUES_UNAVAILABLE', 'Studies are present but none returned readable values.', { unavailable });
      return { ok: true, ...context, studies: results, unavailable, coverage: unavailable.length ? 'partial' : 'complete' };
    }
    if (['lines','labels','tables','boxes'].includes(a.op)) {
      if (!Array.isArray(sources)) return fail('CAPABILITY_UNAVAILABLE', 'Chart data sources cannot be enumerated.');
      const map = { lines: ['dwglines','lines'], labels: ['dwglabels','labels'], tables: ['dwgtablecells','tableCells'], boxes: ['dwgboxes','boxes'] };
      const [collection, key] = map[a.op];
      const selected = sources.filter(s => typeof s.metaInfo === 'function' && (!a.entity_id || s.id?.() === a.entity_id));
      if (a.entity_id && selected.length !== 1) return fail('TARGET_NOT_FOUND', 'No exact study entity ID matched.');
      const out = [], unavailable = [];
      for (const s of selected) {
        const meta = s.metaInfo();
        const pc = s._graphics?._primitivesCollection;
        if (!pc) { unavailable.push({ entity_id: s.id?.(), reason: 'Graphics collection unavailable' }); continue; }
        if (!pc[collection]) { unavailable.push({entity_id:s.id?.(),reason:'Requested graphics collection is not exposed'}); continue; }
        const raw = pc[collection]?.get?.(key);
        const values = raw?.get?.(false)?._primitivesDataById ?? raw?._primitivesDataById;
        if (!values) {
          out.push({ entity_id: s.id?.(), name: meta.description, items: [], total: 0, adapter_collection_present: Boolean(pc[collection]) });
          continue;
        }
        if (typeof values.entries !== 'function') return fail('ADAPTER_MISMATCH', 'Graphics collection shape has changed.');
        const all = Array.from(values.entries());
        const items = all.slice(a.offset ?? 0, (a.offset ?? 0) + (a.limit ?? 500)).map(([id,v]) => {
          if (a.op === 'lines') return { id, x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2, style: v.st, width: v.w, color: v.ci };
          if (a.op === 'labels') return { id, text: v.t, x: v.x, price: v.y, location: v.yl, size: v.sz, color: v.ci, text_color: v.tci };
          if (a.op === 'tables') return { id, table_id: v.tid ?? 0, row: v.row, column: v.col, text: v.t ?? '' };
          return { id, left: v.x1, top: v.y1, right: v.x2, bottom: v.y2, text: v.t, background_color: v.bci, border_color: v.ci };
        });
        out.push({ entity_id: s.id?.(), name: meta.description, total: all.length, returned: items.length, items });
      }
      if (selected.length && !out.length) return fail('CAPABILITY_UNAVAILABLE', 'Graphics collections unavailable for the selected studies.', { unavailable });
      return { ok: true, ...context, kind: a.op, studies: out, unavailable, coverage: unavailable.length ? 'partial' : 'complete', coordinates: 'TradingView native graphics coordinates; x may be bar index, not Unix time' };
    }
    return fail('INVALID_ARGUMENT', 'Unknown data operation.');
  } catch (error) { return fail('BROWSER_OPERATION_FAILED', String(error?.message ?? error).slice(0,600)); }
}

const pagination = { offset: { type: 'integer', minimum: 0, maximum: 10000000 }, limit: { type: 'integer', minimum: 1, maximum: 10000 } };
const entity = { entity_id: { type: 'string', minLength: 1, maxLength: 300 } };
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const def = (name, op, description, properties = {}, required = []) => ({ name, description, inputSchema: schema(properties, required), mutates: false, handler: async (args,ctx) => {
  const result = await ctx.callPage(dataPage,{...args,op});
  if (!result?.ok) throw new ToolError(result?.code ?? 'ADAPTER_MISMATCH',result?.message ?? 'Data read failed.',result);
  return result;
} });
const tools = [
  def('data_get_ohlcv','ohlcv','Read paginated loaded OHLCV history with explicit units and coverage; no fixed 500-bar ceiling.',{...pagination,order:{type:'string',enum:['asc','desc']}}),
  def('data_get_last_bar','last_bar','Read the latest loaded candle; this is not a bid/ask quote.'),
  def('data_get_study_values','study_values','Read current Data Window values for all studies or one exact entity.',entity),
  def('data_get_pine_lines','lines','Read Pine-generated line primitives with per-study pagination.',{...entity,...pagination}),
  def('data_get_pine_labels','labels','Read Pine-generated label text, prices and native coordinates.',{...entity,...pagination}),
  def('data_get_pine_tables','tables','Read Pine table cells preserving original row/column coordinates and blanks.',{...entity,...pagination}),
  def('data_get_pine_boxes','boxes','Read Pine box primitives without confusing them with manual chart drawings.',{...entity,...pagination}),
  {name:'data_export_ohlcv',description:'Export all currently loaded bars into a confined JSON or CSV file; fail if the loaded range or selected market changes during pagination.',inputSchema:schema({format:{type:'string',enum:['json','csv']},max_bars:{type:'integer',minimum:1,maximum:1000000}}),mutates:false,handler:async(args,ctx)=>{
    const rows=[]; let offset=0,baseline=null,metadata=null;
    const max=args.max_bars??100000;
    while(true){
      if(ctx.signal?.aborted) throw new ToolError('CANCELLED','Export cancelled.');
      const result=await ctx.callPage(dataPage,{op:'ohlcv',offset,limit:Math.min(10000,max-rows.length),order:'asc'});
      if(!result?.ok)throw new ToolError(result?.code??'DATA_UNAVAILABLE',result?.message??'OHLCV export failed.',result);
      const current=JSON.stringify([result.layout_id,result.symbol,result.resolved_symbol,result.timeframe,result.session,result.first_index,result.last_index,result.total_available]);
      if(baseline!==null && baseline!==current)throw new ToolError('DATA_CHANGED','Chart history changed during export; no file written.');
      baseline=current;
      metadata={symbol:result.symbol,resolved_symbol:result.resolved_symbol,timeframe:result.timeframe,session:result.session,layout_id:result.layout_id,first_index:result.first_index,last_index:result.last_index,total_available:result.total_available};
      if(result.total_available>max)throw new ToolError('LIMIT_EXCEEDED',`Loaded history exceeds max_bars=${max}; increase the explicit limit.`,{total_available:result.total_available});
      rows.push(...result.bars);
      if(result.next_offset===null)break;
      offset=result.next_offset;
    }
    const file=args.format==='csv'?await ctx.exportCsv('ohlcv',rows):await ctx.exportJson('ohlcv',{...metadata,exported_at:new Date().toISOString(),time_unit:'unix_seconds',source:'loaded_chart_bars',bars:rows});
    return {ok:true,...metadata,exported_bars:rows.length,file,includes_only_loaded_history:true,live_last_bar_may_change:true};
  }}
];
export default tools;
