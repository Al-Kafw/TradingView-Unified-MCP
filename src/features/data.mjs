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
    if (a.op === 'study_diagnostics') {
      // Presence is only what is observable NOW. A missing study ID does not
      // establish that a saved study was removed or that its graphics count is 0.
      if (!a.expected_layout_id || typeof a.expected_layout_id !== 'string')
        return fail('EXPECTED_LAYOUT_REQUIRED', 'An exact expected saved-layout ID is required.');
      if (context.layout_id !== a.expected_layout_id)
        return fail('LAYOUT_MISMATCH', 'The chart layout differs from the expected layout; no diagnostics were claimed.',
          { expected_layout_id: a.expected_layout_id, observed_layout_id: context.layout_id });
      if (!Array.isArray(sources)) return fail('CAPABILITY_UNAVAILABLE', 'Native study sources are unavailable.', context);
      const observed = sources.filter(s => typeof s.metaInfo === 'function' && typeof s.id === 'function')
        .map(s => {
          const meta = s.metaInfo();
          return { entity_id: s.id(), name: meta?.description ?? meta?.shortDescription ?? null };
        }).filter(s => typeof s.entity_id === 'string');
      const exact = observed.filter(s => s.entity_id === a.entity_id);
      const expectedName = a.expected_name ?? null;
      const sameNameCandidates = expectedName === null ? [] : observed.filter(s => s.name === expectedName);
      const bars = main?.bars?.();
      const barCount = typeof bars?.size === 'function' ? bars.size() : null;
      const readiness = {
        data_sources_observed: true,
        loaded_bar_count: typeof barCount === 'number' ? barCount : null,
        bars_present: typeof barCount === 'number' && barCount > 0
      };
      const common = {
        ...context,
        requested_entity_id: a.entity_id,
        expected_name: expectedName,
        observed_study_count: observed.length,
        observed_studies: observed.slice(0, 100),
        observed_studies_truncated: observed.length > 100,
        same_name_candidates: sameNameCandidates.slice(0, 20),
        same_name_candidates_truncated: sameNameCandidates.length > 20,
        readiness,
        capture_scope: 'single_synchronous_chart_page_evaluation',
        inference_limit: 'Absence means not observed now, not proven removed or zero graphics. Chart can change after capture.'
      };
      if (exact.length !== 1)
        return { ok: true, ...common, study_status: 'not_observed_at_capture',
          exact_name_match: null, graphics: null, graphics_coverage: 'not_checked' };
      const snap = dataPage({ op: 'qa_snapshot', expected_layout_id: a.expected_layout_id,
        entity_id: a.entity_id, max_items_per_kind: a.max_items_per_kind ?? 50 });
      if (!snap.ok) return fail(snap.code ?? 'ADAPTER_MISMATCH', snap.message ?? 'Graphics diagnostics failed.', common);
      if (snap.layout_id !== context.layout_id || snap.symbol !== context.symbol ||
          snap.resolved_symbol !== context.resolved_symbol || snap.timeframe !== context.timeframe ||
          snap.session !== context.session)
        return fail('CHART_CHANGED', 'Chart identity changed during diagnostics; no combined evidence is claimed.', common);
      const graphics = {};
      for (const kind of ['lines', 'labels']) {
        const g = snap.graphics[kind];
        graphics[kind] = { status: g.status, total: g.total, returned: g.returned,
          next_offset: g.next_offset, reason: g.reason ?? null,
          all_items_returned_in_this_call: g.all_items_returned_in_this_call };
      }
      return { ok: true, ...common, study_status: 'present',
        exact_name_match: expectedName === null ? null : exact[0].name === expectedName,
        actual_study: exact[0], graphics, graphics_coverage: snap.coverage,
        all_graphics_returned_in_this_call: snap.all_graphics_returned_in_this_call };
    }
    if (a.op === 'qa_snapshot') {
      if (!a.expected_layout_id || typeof a.expected_layout_id !== 'string')
        return fail('EXPECTED_LAYOUT_REQUIRED', 'An exact expected saved-layout ID is required.');
      if (context.layout_id !== a.expected_layout_id)
        return fail('LAYOUT_MISMATCH', 'The chart layout differs from the expected layout; no snapshot was claimed.',
          { expected_layout_id: a.expected_layout_id, observed_layout_id: context.layout_id });
      if (!Array.isArray(sources)) return fail('CAPABILITY_UNAVAILABLE', 'Chart study data sources are unavailable.');
      const exactStudies = sources.filter(s => typeof s.metaInfo === 'function' &&
        typeof s.id === 'function' && s.id() === a.entity_id);
      if (exactStudies.length !== 1)
        return fail('TARGET_NOT_FOUND', 'Exactly one study with the supplied entity ID is required.');
      const maxItems = a.max_items_per_kind ?? 200;
      if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 1000)
        return fail('INVALID_ARGUMENT', 'max_items_per_kind must be an integer between 1 and 1000.');
      const study = exactStudies[0];
      const name = study.metaInfo()?.description ?? study.metaInfo()?.shortDescription ?? null;
      const graphics = {};
      for (const kind of ['lines', 'labels']) {
        // These calls happen within the same synchronous page evaluation, not
        // separate MCP round-trips. Reuse the existing fail-closed adapters.
        const read = dataPage({ op: kind, entity_id: a.entity_id, offset: 0, limit: maxItems });
        if (!read.ok) {
          if (read.code !== 'CAPABILITY_UNAVAILABLE')
            return fail(read.code ?? 'ADAPTER_MISMATCH', read.message ?? 'Graphics snapshot read failed.');
          graphics[kind] = {
            status: 'unavailable', total: null, returned: 0, next_offset: null,
            all_items_returned_in_this_call: false, items: [],
            reason: read.unavailable?.[0]?.reason ?? read.message
          };
          continue;
        }
        if (read.layout_id !== context.layout_id || read.symbol !== context.symbol ||
            read.resolved_symbol !== context.resolved_symbol || read.timeframe !== context.timeframe ||
            read.session !== context.session)
          return fail('CHART_CHANGED', 'Chart identity changed during the graphics snapshot.');
        const item = read.studies?.[0];
        if (!item || item.entity_id !== a.entity_id)
          return fail('ADAPTER_MISMATCH', 'An unexpected study was returned by the graphics adapter.');
        graphics[kind] = {
          status: item.all_items_returned_in_this_call ? 'complete' : 'truncated',
          total: item.total, returned: item.returned, next_offset: item.next_offset,
          all_items_returned_in_this_call: item.all_items_returned_in_this_call,
          items: item.items
        };
      }
      const states = Object.values(graphics).map(x => x.status);
      const coverage = states.every(s => s === 'complete') ? 'complete' :
        states.every(s => s === 'unavailable') ? 'unavailable' : 'partial';
      return {
        ok: true, ...context,
        study: { entity_id: a.entity_id, name },
        capture_mode: 'single_synchronous_chart_page_evaluation',
        graphics, coverage,
        all_graphics_returned_in_this_call: coverage === 'complete',
        coordinate_policy: 'native_x_only; timestamps_unverified_and_null',
        limitations: 'Available Pine primitives only; visual fidelity and hover text not certified. A live chart can change after capture.'
      };
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
      if (!selected.length) return fail('CAPABILITY_UNAVAILABLE', 'No readable Pine study was found; graphics coverage cannot be asserted.', context);
      // Native Pine X can use a projection-specific coordinate domain.
      // Numeric equality with a loaded OHLC index is NOT proof that both
      // coordinates refer to the same candle. Keep timestamp fields null
      // until the native coordinate basis is independently established.
      const out = [], unavailable = [];
      for (const s of selected) {
        const meta = s.metaInfo();
        const pc = s._graphics?._primitivesCollection;
        if (!pc) { unavailable.push({ entity_id: s.id?.(), reason: 'Graphics collection unavailable' }); continue; }
        if (!pc[collection]) { unavailable.push({entity_id:s.id?.(),reason:'Requested graphics collection is not exposed'}); continue; }
        const raw = pc[collection]?.get?.(key);
        const values = raw?.get?.(false)?._primitivesDataById ?? raw?._primitivesDataById;
        if (!values) {
          unavailable.push({ entity_id: s.id?.(), reason: 'Primitive data not exposed; cannot distinguish zero drawings from unavailable data' });
          continue;
        }
        if (typeof values.entries !== 'function') return fail('ADAPTER_MISMATCH', 'Graphics collection shape has changed.');
        const all = Array.from(values.entries());
        const offset = a.offset ?? 0;
        const limit = a.limit ?? 500;
        const items = all.slice(offset, offset + limit).map(([id,v]) => {
          if (a.op === 'lines') {
            return { id, x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2, style: v.st, width: v.w, color: v.ci,
              x1_time_unix_seconds: null, x2_time_unix_seconds: null,
              x1_coordinate_basis: 'unresolved_native_x',
              x2_coordinate_basis: 'unresolved_native_x' };
          }
          if (a.op === 'labels') {
            return { id, text: v.t, x: v.x, price: v.y, location: v.yl, size: v.sz, color: v.ci, text_color: v.tci,
              x_time_unix_seconds: null,
              x_coordinate_basis: 'unresolved_native_x' };
          }
          if (a.op === 'tables') return { id, table_id: v.tid ?? 0, row: v.row, column: v.col, text: v.t ?? '' };
          return { id, left: v.x1, top: v.y1, right: v.x2, bottom: v.y2, text: v.t, background_color: v.bci, border_color: v.ci };
        });
        out.push({
          entity_id: s.id?.(), name: meta.description,
          total: all.length, returned: items.length, offset, limit,
          next_offset: offset + items.length < all.length ? offset + items.length : null,
          all_items_returned_in_this_call: offset === 0 && items.length === all.length,
          items
        });
      }
      if (selected.length && !out.length) return fail('CAPABILITY_UNAVAILABLE', 'Graphics collections unavailable for the selected studies.', { unavailable });
      return { ok: true, ...context, kind: a.op, studies: out, unavailable,
        coverage: unavailable.length ? 'partial' : 'complete',
        coverage_scope: 'native_collection_availability_not_pagination',
        all_items_returned_in_this_call: unavailable.length === 0 &&
          out.every(study => study.all_items_returned_in_this_call === true),
        pagination_note: 'A complete single response does not establish historical stability across separate calls; recheck layout and source before combining pages.',
        coordinates: ['lines', 'labels'].includes(a.op) ? 'Native x retained unchanged; timestamps unverified because numerical index equality does not prove a shared coordinate domain; *_time_unix_seconds is null' : 'TradingView native graphics coordinates; X may be bar index, not Unix time' };
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
  def('data_get_qa_snapshot','qa_snapshot','Capture a bounded read-only single-study line/label QA snapshot with exact layout guard and explicit completeness.',{...entity,max_items_per_kind:{type:'integer',minimum:1,maximum:1000}},['entity_id','target_id','expected_layout_id']),
  def('data_get_study_diagnostics','study_diagnostics','Diagnose the currently observed study identity, readiness and graphics availability without inferring removal or zero drawings.',{...entity,expected_name:{type:'string',minLength:1,maxLength:300},max_items_per_kind:{type:'integer',minimum:1,maximum:1000}},['entity_id','target_id','expected_layout_id']),
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
