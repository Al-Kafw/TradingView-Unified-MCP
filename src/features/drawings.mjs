import { O,S,N,B } from '../core/schema.mjs';
import { ToolError } from '../core/errors.mjs';
import { sha256 } from '../core/security.mjs';

export function drawingPage(a){
  const api=window.TradingViewApi;const c=api?.activeChart?.()||api?._activeChartWidgetWV?.value?.();if(!c||typeof c.getAllShapes!=='function')throw new Error('CAPABILITY_UNAVAILABLE: chart drawing API');
  const all=()=>c.getAllShapes().map(x=>({id:String(x.id),name:x.name}));
  const get=id=>{const row=all().find(x=>x.id===String(id));if(!row)throw new Error('DRAWING_NOT_FOUND');const s=c.getShapeById(row.id);const data={...row};const unavailable=[];
    for(const [key,method] of [['points','getPoints'],['properties','getProperties'],['visible','isVisible'],['locked','isLocked'],['selectable','isSelectionEnabled']]){try{if(typeof s[method]==='function')data[key]=s[method]();else unavailable.push(key);}catch{unavailable.push(key);}}
    return {...data,unavailable};};
  if(a.action==='list')return {drawings:all()};
  if(a.action==='get')return get(a.id);
  if(a.action==='snapshot')return {drawings:all().map(x=>get(x.id)),format_version:1};
  if(a.action==='create'){
    const opt={shape:a.shape,text:a.text||'',overrides:a.properties||{},lock:!!a.locked,disableSelection:a.selectable===false};
    const method=a.points.length===1?'createShape':'createMultipointShape';if(typeof c[method]!=='function')throw new Error('CAPABILITY_UNAVAILABLE: drawing creation');
    return Promise.resolve(c[method](a.points.length===1?a.points[0]:a.points,opt)).then(id=>({returned_id:id===undefined?null:String(id)}));
  }
  if(a.action==='remove'){get(a.id);c.removeEntity(a.id);return {submitted:true};}
  if(a.action==='update'){
    get(a.id);const s=c.getShapeById(a.id);
    const changes=[['points','setPoints'],['properties','setProperties'],['visible','setVisible'],['locked','setLocked'],['selectable','setSelectionEnabled']];
    for(const [key,method] of changes)if(a[key]!==undefined&&typeof s[method]!=='function')throw new Error('CAPABILITY_UNAVAILABLE: '+method);
    for(const [key,method] of changes)if(a[key]!==undefined)s[method](a[key]);
    return {submitted:true};
  }
  throw new Error('UNSUPPORTED_ACTION');
}
const SHAPES=['trend_line','horizontal_line','horizontal_ray','vertical_line','ray','extended','rectangle','ellipse','triangle','polyline','path','fib_retracement','fib_extension','text','anchored_text','arrow_up','arrow_down','flag','long_position','short_position','price_label','parallel_channel','pitchfork','brush'];
const point=O({time:{type:'number'},price:{type:'number'}},['time','price']);
const points={type:'array',minItems:1,maxItems:100,items:point};
const properties={type:'object',additionalProperties:true,maxProperties:300};
const id=S('Exact drawing ID',128);
const page=(c,action,a={})=>c.callPage(drawingPage,{...a,action});
const fingerprint=d=>sha256({id:d.id,name:d.name,points:d.points,properties:d.properties,visible:d.visible,locked:d.locked,selectable:d.selectable});
export function shapeMatches(requested,actual){const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');const aliases={horizontalline:['horzline'],horizontalray:['horzray'],verticalline:['vertline'],longposition:['riskrewardlong'],shortposition:['riskrewardshort']};return norm(requested)===norm(actual)||(aliases[norm(requested)]||[]).includes(norm(actual));}
function contains(actual,expected){if(expected&&typeof expected==='object'){if(!actual||typeof actual!=='object')return false;if(Array.isArray(expected)&&(!Array.isArray(actual)||actual.length!==expected.length))return false;return Object.entries(expected).every(([k,v])=>contains(actual[k],v));}return actual===expected;}
async function create(a,c){
  const before=(await page(c,'list')).drawings;await c.assertLayout();
  const sent=await page(c,'create',a);
  const fresh=await c.poll(async()=>{const all=(await page(c,'list')).drawings;return all.filter(x=>!before.some(b=>b.id===x.id));},x=>x.length>0,{description:'verify created drawing'});
  const hit=sent.returned_id?fresh.find(x=>x.id===sent.returned_id):fresh.length===1?fresh[0]:null;
  if(!hit)throw new ToolError('DRAWING_AMBIGUOUS','A new drawing appeared but its identity cannot be proved.',{new_ids:fresh.map(x=>x.id)});
  if(!shapeMatches(a.shape,hit.name))throw new ToolError('DRAWING_TYPE_MISMATCH','TradingView created a different drawing type. Inspect the returned ID before removing it.',{requested:a.shape,actual:hit.name,id:hit.id});
  const actual=await page(c,'get',{id:hit.id});
  return {created:true,id:hit.id,drawing:actual,fingerprint:fingerprint(actual),shape_verified:true,points_verified:contains(actual.points,a.points),properties_verified:contains(actual.properties,a.properties||{}),note:'TradingView may snap time coordinates to loaded bars. Inspect returned points.'};
}
async function remove(a,c){const before=await page(c,'get',a);if(a.expected_fingerprint&&fingerprint(before)!==a.expected_fingerprint)throw new ToolError('PREIMAGE_MISMATCH','Drawing changed since inspection.');await c.assertLayout();await page(c,'remove',a);await c.poll(()=>page(c,'list'),v=>!v.drawings.some(x=>x.id===a.id),{description:'verify drawing removal'});return {removed:true,id:a.id,verified_absent:true};}
export default [
 {name:'drawing_list',description:'List native chart drawings with exact entity IDs and actual shape names.',inputSchema:O(),handler:(_a,c)=>page(c,'list')},
 {name:'drawing_get',description:'Read all available points, properties, visibility, lock and selection state. Includes a preimage fingerprint and any unavailable fields.',inputSchema:O({id},['id']),handler:async(a,c)=>{const d=await page(c,'get',a);return {...d,fingerprint:fingerprint(d)};}},
 {name:'drawing_create',description:'Create a native drawing and verify a new entity ID and actual shape type. Reports coordinate/property fidelity instead of assuming it.',inputSchema:O({shape:{type:'string',enum:SHAPES},points,properties,text:S('Drawing text',10000),locked:B(),selectable:B()},['shape','points']),mutates:true,handler:create},
 {name:'drawing_update',description:'Update a drawing only if its fingerprint still matches, then independently verify every requested property or point.',inputSchema:O({id,expected_fingerprint:S('Fingerprint from drawing_get',64),points,properties,visible:B(),locked:B(),selectable:B()},['id','expected_fingerprint']),mutates:true,handler:async(a,c)=>{const before=await page(c,'get',a);if(fingerprint(before)!==a.expected_fingerprint)throw new ToolError('PREIMAGE_MISMATCH','Drawing changed since inspection.');const changes=Object.fromEntries(['points','properties','visible','locked','selectable'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));if(!Object.keys(changes).length)throw new ToolError('NO_CHANGES','Specify drawing changes.');await c.assertLayout();await page(c,'update',a);const actual=await c.poll(()=>page(c,'get',a),d=>contains(d,changes),{description:'verify drawing changes'});return {updated:true,drawing:actual,fingerprint:fingerprint(actual)};}},
 {name:'drawing_remove',description:'Remove an exact drawing and verify absence; optionally guard its preimage fingerprint.',inputSchema:O({id,expected_fingerprint:S('',64)},['id']),mutates:true,destructive:true,handler:remove},
 {name:'drawing_clear',description:'Remove only the complete set of drawing IDs supplied after inspection. Refuses if the live set has changed.',inputSchema:O({expected_ids:{type:'array',items:id,maxItems:1000,uniqueItems:true}},['expected_ids']),mutates:true,destructive:true,handler:async(a,c)=>{const before=(await page(c,'list')).drawings.map(x=>x.id).sort();if(JSON.stringify(before)!==JSON.stringify([...a.expected_ids].sort()))throw new ToolError('PREIMAGE_MISMATCH','Drawing inventory has changed; nothing was removed.');const removed=[];for(const drawingId of before){try{await remove({id:drawingId},c);removed.push(drawingId);}catch(e){throw new ToolError('PARTIAL_CLEAR','Drawing removal stopped. Reconcile the failed ID before retrying.',{removed_ids:removed,failed_id:drawingId,cause:e.code||e.message,cause_details:e.details});}}return {removed_ids:removed,remaining:(await page(c,'list')).drawings};}},
 {name:'drawing_export',description:'Export every available drawing point and property to local JSON. Marks missing fields; does not advertise perfect restoration.',inputSchema:O({name:S('Export label',100)},['name']),handler:async(a,c)=>{const data=await page(c,'snapshot');return {data,file:await c.exportJson(a.name,data),complete:data.drawings.every(d=>d.unavailable.length===0)};}},
 {name:'drawing_import',description:'Create a bounded list of drawings with per-item identity verification. Stops at the first failure and returns created IDs; no claim of atomic rollback.',inputSchema:O({drawings:{type:'array',minItems:1,maxItems:100,items:O({shape:{type:'string',enum:SHAPES},points,properties,text:S('',10000)},['shape','points'])}},['drawings']),mutates:true,handler:async(a,c)=>{const created=[];for(let i=0;i<a.drawings.length;i++){try{created.push(await create(a.drawings[i],c));}catch(e){throw new ToolError('PARTIAL_IMPORT','Drawing import stopped after a failure.',{created,failed_index:i,cause:e.code||e.message,cause_details:e.details});}}return {created,verified_count:created.length};}}
];
