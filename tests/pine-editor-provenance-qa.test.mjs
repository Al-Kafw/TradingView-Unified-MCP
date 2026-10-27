import test from 'node:test';
import assert from 'node:assert/strict';
import descriptor,{inspectPineEditorProvenance} from '../src/features/pine-editor-provenance-qa.mjs';
import {sourceHash,sourceLineEndingInfo} from '../src/features/pine.mjs';

const LF='//@version=6\nindicator("Example")\nplot(close)\n';
const saved=LF.replaceAll('\n','\r\n');
const native={host:'dialog',script_id:'USER;test123',version:'3.0',is_modified:false,is_draft:false};
const args={target_id:'qa-tab-1',expected_layout_id:'qa-layout-1'};
function fixture({dirty=false,layoutMismatch=false,modified=false,draft=false,sourceChanged=false,versionChanged=false,unstable=false,missingTitle=true,missingName=false}={}) {
 const calls=[];let reads=0;
 const ctx={
   async callTool(name,a){calls.push(name);assert.equal(a.target_id,args.target_id);if(name==='layout_get')return {layout_id:layoutMismatch?'wrong-layout':args.expected_layout_id,unsaved_changes:dirty};if(name==='pine_get_saved_source'){const s=sourceChanged?saved.replace('plot(close)','plot(open)'):saved;return {ok:true,source:s,source_sha256:sourceHash(s),...sourceLineEndingInfo(s),script_id:native.script_id,version:versionChanged?'4.0':native.version,name:missingName?null:'Saved QTF Script'};}throw Error('Unexpected '+name)},
   async callPage(_fn,a){calls.push(a.op);if(a.op==='native_binding'){reads++;return {ok:true,source:unstable&&reads===2?LF+'//changed':LF,native_binding:{...native,is_modified:modified,is_draft:draft},title:missingTitle?null:'Native UI title'}}throw Error('Unexpected '+a.op)}
 };
 return {ctx,calls,run:()=>inspectPineEditorProvenance(args,ctx)};
}
test('LF editor versus CRLF library matches without returning Pine source or authorizing writes',async()=>{
 const f=fixture(),x=await f.run();assert.equal(x.status,'matched');assert.equal(x.comparison_allowed,true);assert.equal(x.normalized_hashes_equal,true);assert.equal(x.raw_hashes_equal,false);assert.equal(x.visual_editor_title_verified,false);assert.equal(x.library_name,'Saved QTF Script');assert.equal(x.authorizes_pine_mutation,false);assert.equal(x.authorizes_pine_compile,false);assert.equal(x.read_only,true);assert.ok(!Object.hasOwn(x,'source'));assert.ok(!Object.hasOwn(x,'editor_source'));assert.deepEqual(f.calls,['layout_get','native_binding','pine_get_saved_source','native_binding','layout_get']);
});
test('source differences cannot be normalized into a match',async()=>{let x=await fixture({sourceChanged:true}).run();assert.equal(x.status,'source_mismatch');assert.equal(x.comparison_allowed,false)});
test('dirty layout blocks before any Pine request',async()=>{let f=fixture({dirty:true}),x=await f.run();assert.equal(x.reason_code,'LAYOUT_ID_OR_SAVED_STATE_UNVERIFIED');assert.deepEqual(f.calls,['layout_get'])});
test('wrong layout blocks before any Pine request',async()=>{let f=fixture({layoutMismatch:true});assert.equal((await f.run()).status,'blocked');assert.deepEqual(f.calls,['layout_get'])});
test('draft or modified editor prevents cloud source comparison',async()=>{for(const changes of [{draft:true},{modified:true}]){let f=fixture(changes),x=await f.run();assert.equal(x.reason_code,'NATIVE_EDITOR_BINDING_UNVERIFIED');assert.deepEqual(f.calls,['layout_get','native_binding'])}});
test('native saved-script version mismatch fails closed',async()=>{let f=fixture({versionChanged:true});let x=await f.run();assert.equal(x.reason_code,'SAVED_SCRIPT_ID_VERSION_UNVERIFIED');assert.equal(f.calls.includes('native_binding'),true)});
test('editor changed during observation refuses comparison',async()=>{let f=fixture({unstable:true});let x=await f.run();assert.equal(x.reason_code,'LAYOUT_OR_NATIVE_BINDING_CHANGED_DURING_READ');assert.equal(x.comparison_allowed,false)});
test('visual title is independent from cloud name',async()=>{let x=await fixture({missingTitle:true}).run();assert.equal(x.visual_editor_title,null);assert.equal(x.library_name_is_not_visual_title,true);assert.equal(x.authorizes_pine_compile,false)});
test('no library name does not fabricate one',async()=>{let x=await fixture({missingName:true}).run();assert.equal(x.status,'matched');assert.equal(x.library_name,null)});
test('the registered descriptor is exactly read-only and requires target/layout identity',()=>{assert.equal(descriptor.length,1);assert.equal(descriptor[0].mutates,false);assert.equal(descriptor[0].name,'pine_get_editor_provenance_qa');assert.deepEqual(descriptor[0].inputSchema.required,['target_id','expected_layout_id']);assert.equal(descriptor[0].inputSchema.additionalProperties,false)});
