import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const MAX_GRAPHICS_PER_KIND = 200;

/**
 * Inspect only currently loaded chart bars and chart-local time-scale methods.
 * An OHLC bar index is NOT automatically the coordinate domain of a Pine drawing.
 * Public time scale coordinates are chart-local, not PNG viewport pixels.
 */
export function coordinateAnchorPage(a) {
  const fail = (code, message) => ({ ok: false, code, message });
  const root = window.TradingViewApi;
  const chart = root?._activeChartWidgetWV?.value?.();
  if (!chart) return fail('CHART_UNAVAILABLE', 'Active TradingView chart is unavailable.');
  const outer = chart._chartWidget?.model?.();
  const model = outer?.model?.() ?? outer;
  const main = model?.mainSeries?.() ?? outer?.mainSeries?.();
  const unwrap = value => value && typeof value.value === 'function' ? value.value() : value;
  const service = typeof root.getSaveChartService === 'function' ? root.getSaveChartService() : null;
  const layout = unwrap(root._chartWidgetCollection?.metaInfo?.uid) ||
    (typeof service?.layoutId === 'function' ? unwrap(service.layoutId()) : null);
  const layout_id = layout == null ? null : String(layout);
  if (layout_id !== a.expected_layout_id)
    return fail('LAYOUT_MISMATCH', 'The observed native layout differs from the requested layout.');
  const info = main?.symbolInfo?.();
  const identity = {
    layout_id,
    symbol: chart.symbol?.() ?? null,
    resolved_symbol: info?.pro_name ?? info?.full_name ?? info?.name ?? null,
    timeframe: chart.resolution?.() ?? null,
    session: typeof main?.sessionId === 'function' ? unwrap(main.sessionId()) : null
  };
  const sources = model?.dataSources?.();
  if (!Array.isArray(sources)) return fail('STUDIES_UNAVAILABLE', 'Native chart study sources unavailable.');
  const matches = sources.filter(s => typeof s?.id === 'function' && s.id() === a.entity_id);
  if (matches.length !== 1) return fail('STUDY_NOT_OBSERVED', 'Exactly one native study ID must be observed.');
  const bars = main?.bars?.();
  if (!bars || !['firstIndex','lastIndex','size','valueAt'].every(k => typeof bars[k] === 'function')) {
    return { ok: true, identity, requested_entity_id:a.entity_id,
      bar_readiness:'unavailable', bar_anchors:[], scale_api: {native_index_to_coordinate:false,native_coordinate_to_index:false,public_coordinate_to_time:false},
      scale_verification:'unavailable', note:'No verified OHLC-to-chart-coordinate anchors.' };
  }
  const count = bars.size();
  const first = bars.firstIndex();
  const last = bars.lastIndex();
  if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(first) || !Number.isInteger(last) || last < first) {
    return {ok:true,identity,requested_entity_id:a.entity_id,bar_readiness:'unavailable',bar_anchors:[],
      scale_api:{native_index_to_coordinate:false,native_coordinate_to_index:false,public_coordinate_to_time:false},
      scale_verification:'unavailable',note:'Loaded bar series is empty or inconsistent.'};
  }
  let nativeScale = null, publicScale = null;
  try { nativeScale = model?.timeScale?.() ?? outer?.timeScale?.() ?? null; } catch { /* unavailable */ }
  try { publicScale = chart.getTimeScale?.() ?? null; } catch { /* unavailable */ }
  const scale_api = {
    native_index_to_coordinate:typeof nativeScale?.indexToCoordinate === 'function',
    native_coordinate_to_index:typeof nativeScale?.coordinateToIndex === 'function',
    public_coordinate_to_time:typeof publicScale?.coordinateToTime === 'function'
  };
  const indexes = [...new Set([first,Math.round(first+(last-first)*0.25),
    Math.round((first+last)/2),Math.round(first+(last-first)*0.75),last])];
  const bar_anchors = [];
  for (const index of indexes) {
    const row = bars.valueAt(index);
    const t = row?.[0];
    if (!Number.isFinite(t)) continue;
    let x = null, roundTrip = false, publicTimeMatch = null;
    if (scale_api.native_index_to_coordinate && scale_api.native_coordinate_to_index) {
      try {
        const result = nativeScale.indexToCoordinate(index);
        if (Number.isFinite(result)) {
          const back = nativeScale.coordinateToIndex(result);
          if (Number.isFinite(back) && Math.abs(back-index) <= 0.001) {
            x = result;
            roundTrip = true;
            if (scale_api.public_coordinate_to_time) {
              try {
                const time = publicScale.coordinateToTime(result);
                publicTimeMatch = Number.isFinite(time) ? time === t : null;
              } catch { /* independent API not compatible */ }
            }
          }
        }
      } catch { /* no verified round-trip */ }
    }
    bar_anchors.push({loaded_bar_index:index,loaded_bar_time_unix_seconds:t,
      chart_local_x_if_index_roundtrip_verified:x,index_to_chart_x_roundtrip_verified:roundTrip,
      public_coordinate_time_matches_loaded_bar:publicTimeMatch});
  }
  const scale_verification = bar_anchors.some(a => a.index_to_chart_x_roundtrip_verified)
    ? 'chart_bar_index_to_local_x_roundtrip_observed'
    : 'loaded_bar_index_to_time_only';
  return {ok:true,identity,requested_entity_id:a.entity_id,bar_readiness:'loaded',
    loaded_bar_count:count,first_bar_index:first,last_bar_index:last,
    bar_anchors,scale_api,scale_verification,
    native_drawing_x_coordinate_basis:'unresolved_not_assumed_shared_with_chart_bar_index',
    chart_local_pixels_are_screenshot_pixels:false,
    note:'Even a verified chart-bar-to-local-X round trip does not prove that a Pine primitive X uses the chart bar index domain.'};
}

function summarizeGraphics(graphics, firstIndex, lastIndex) {
  const xs=[];
  const push=x=>{ if(typeof x==='number' && Number.isFinite(x)) xs.push(x); };
  for (const line of graphics?.lines?.items ?? []) {push(line.x1);push(line.x2);}
  for (const label of graphics?.labels?.items ?? []) push(label.x);
  const overlap=Number.isInteger(firstIndex)&&Number.isInteger(lastIndex)
    ? xs.filter(x=>Number.isInteger(x)&&x>=firstIndex&&x<=lastIndex).length : null;
  return {sampled_native_x_values:xs.length,minimum_native_x:xs.length?Math.min(...xs):null,
    maximum_native_x:xs.length?Math.max(...xs):null,
    numeric_collisions_with_loaded_bar_index:overlap,
    collision_interpretation:'numeric_coincidence_only_not_mapping_evidence',
    sampled_only:graphics?.lines?.status!=='complete'||graphics?.labels?.status!=='complete'};
}

export async function captureCoordinateProvenance(a,ctx) {
  if (!a.target_id || !a.expected_layout_id || !a.entity_id)
    throw new ToolError('EXACT_TARGET_REQUIRED', 'Require exact target, layout and study IDs.');
  if (a.target_id !== ctx.targetId)
    throw new ToolError('TARGET_MISMATCH', 'Resolved target ID differs from request.');
  const limit=a.max_items_per_kind ?? 100;
  if(!Number.isInteger(limit)||limit<1||limit>MAX_GRAPHICS_PER_KIND)
    throw new ToolError('INVALID_ARGUMENT', 'max_items_per_kind must be 1-200.');
  const params={target_id:a.target_id,expected_layout_id:a.expected_layout_id,
    entity_id:a.entity_id,max_items_per_kind:limit};
  const before=await ctx.callTool('data_get_qa_snapshot',params);
  if(!before?.ok || before.layout_id!==a.expected_layout_id || before.study?.entity_id!==a.entity_id)
    throw new ToolError('SNAPSHOT_UNVERIFIED', 'Cannot establish exact native snapshot.');
  const anchors=await ctx.callPage(coordinateAnchorPage,{expected_layout_id:a.expected_layout_id,entity_id:a.entity_id});
  const after=await ctx.callTool('data_get_qa_snapshot',params);
  if(!after?.ok) throw new ToolError('SNAPSHOT_UNVERIFIED', 'Post-probe native snapshot unavailable.');
  const identity=s=>({layout_id:s.layout_id,symbol:s.symbol,resolved_symbol:s.resolved_symbol,
    timeframe:s.timeframe,session:s.session,study:s.study});
  const sameIdentity=sha(identity(before))===sha(identity(after));
  const sameGraphics=sha(before.graphics)===sha(after.graphics) &&
    before.coverage===after.coverage &&
    before.all_graphics_returned_in_this_call===after.all_graphics_returned_in_this_call;
  const anchorMatches=anchors?.ok===true && anchors.identity?.layout_id===before.layout_id &&
    anchors.identity.symbol===before.symbol && anchors.identity.resolved_symbol===before.resolved_symbol &&
    anchors.identity.timeframe===before.timeframe && anchors.identity.session===before.session &&
    anchors.requested_entity_id===a.entity_id;
  const valid=sameIdentity&&sameGraphics&&anchorMatches;
  return {ok:true,target_id:a.target_id,layout_id:a.expected_layout_id,entity_id:a.entity_id,
    chart_identity_consistent_at_both_reads:sameIdentity&&anchorMatches,
    graphics_consistent_at_both_reads:sameGraphics,
    evidence_status:valid?'matching_bracket_reads':'mismatch_no_correlated_evidence',
    screenshot_captured:false,
    graphics_coverage:valid?before.coverage:'not_claimed',
    all_native_graphics_returned:valid&&before.all_graphics_returned_in_this_call===true,
    graphic_native_x_statistics:valid?summarizeGraphics(before.graphics,anchors.first_bar_index,anchors.last_bar_index):null,
    chart_time_scale_evidence:valid?anchors:null,
    native_drawing_x_to_time:'unverified',
    native_drawing_x_to_pixel:'unverified',
    mapping_approved:false,
    limitations:'Read-only observation, not an atomic capture. Two matching reads cannot rule out transient changes. Any numeric overlap between Pine X and chart candle index is coincidence, not proof of shared coordinate provenance. No projected drawing timestamps, screen pixels, hover information or trading-signal correctness are certified.'};
}

export default [{
  name:'data_get_coordinate_provenance',
  description:'Read-only chart candle/time-scale anchor probe with strict separation from unresolved native Pine drawing X. Never infers drawing timestamps or screenshot pixels.',
  inputSchema:{type:'object',properties:{
    entity_id:{type:'string',minLength:1,maxLength:300},
    max_items_per_kind:{type:'integer',minimum:1,maximum:MAX_GRAPHICS_PER_KIND}
  },required:['target_id','expected_layout_id','entity_id'],additionalProperties:false},
  mutates:false,handler:captureCoordinateProvenance
}];
