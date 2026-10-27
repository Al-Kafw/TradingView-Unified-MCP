import test from 'node:test';
import assert from 'node:assert/strict';
import descriptor,{inspectPineEditorProvenance,pineVisualTitlePage} from '../src/features/pine-editor-provenance-qa.mjs';
import {sourceHash,sourceLineEndingInfo} from '../src/features/pine.mjs';

const LF='//@version=6\nindicator("Example")\nplot(close)\n';
const saved=LF.replaceAll('\n','\r\n');
const native={host:'dialog',script_id:'USER;test123',version:'3.0',is_modified:false,is_draft:false};
const args={target_id:'qa-tab-1',expected_layout_id:'qa-layout-1'};
function fixture({dirty=false,layoutMismatch=false,modified=false,draft=false,sourceChanged=false,versionChanged=false,unstable=false,missingTitle=true,missingName=false,visualTitle=null,unstableTitle=false,ambiguousTitle=false}={}) {
 const calls=[];let reads=0,titleReads=0;
 const ctx={
   async callTool(name,a){calls.push(name);assert.equal(a.target_id,args.target_id);if(name==='layout_get')return {layout_id:layoutMismatch?'wrong-layout':args.expected_layout_id,unsaved_changes:dirty};if(name==='pine_get_saved_source'){const s=sourceChanged?saved.replace('plot(close)','plot(open)'):saved;return {ok:true,source:s,source_sha256:sourceHash(s),...sourceLineEndingInfo(s),script_id:native.script_id,version:versionChanged?'4.0':native.version,name:missingName?null:'Saved QTF Script'};}throw Error('Unexpected '+name)},
   async callPage(_fn,a){calls.push(a.op);if(a.op==='native_binding'){reads++;return {ok:true,source:unstable&&reads===2?LF+'//changed':LF,native_binding:{...native,is_modified:modified,is_draft:draft},title:missingTitle?null:'Native UI title'}}if(a.op==='visual_title_probe'){titleReads++;if(ambiguousTitle)return {ok:false,status:'blocked',reason_code:'VISUAL_PINE_TITLE_AMBIGUOUS'};return {ok:true,status:visualTitle===null?'unavailable':'candidate',title:visualTitle===null?null:unstableTitle&&titleReads===2?visualTitle+' changed':visualTitle,...(visualTitle!==null?{source:'unique_visible_split_editor_role_button'}:{})};}throw Error('Unexpected '+a.op)}
 };
 return {ctx,calls,run:()=>inspectPineEditorProvenance(args,ctx)};
}
test('LF editor versus CRLF library matches without returning Pine source or authorizing writes',async()=>{
 const f=fixture(),x=await f.run();assert.equal(x.status,'matched');assert.equal(x.comparison_allowed,true);assert.equal(x.normalized_hashes_equal,true);assert.equal(x.raw_hashes_equal,false);assert.equal(x.visual_editor_title_verified,false);assert.equal(x.library_name,'Saved QTF Script');assert.equal(x.authorizes_pine_mutation,false);assert.equal(x.authorizes_pine_compile,false);assert.equal(x.read_only,true);assert.ok(!Object.hasOwn(x,'source'));assert.ok(!Object.hasOwn(x,'editor_source'));assert.deepEqual(f.calls,['layout_get','native_binding','visual_title_probe','pine_get_saved_source','native_binding','visual_title_probe','layout_get']);
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


test('unique visible split-editor title matches independent saved library name, without compile authorization',async()=>{
 const x=await fixture({visualTitle:'Saved QTF Script'}).run();
 assert.equal(x.status,'matched');assert.equal(x.visual_editor_title_verified,true);
 assert.equal(x.visual_editor_title,'Saved QTF Script');
 assert.equal(x.visual_editor_title_source,'unique_visible_split_editor_role_button');
 assert.equal(x.authorizes_pine_compile,false);assert.equal(x.authorizes_pine_mutation,false);
 assert.equal(Object.hasOwn(x,'source'),false);
});
test('visible split title differing from cloud name is never marked verified',async()=>{
 const x=await fixture({visualTitle:'Different Visible Document'}).run();
 assert.equal(x.status,'matched');assert.equal(x.normalized_hashes_equal,true);
 assert.equal(x.visual_editor_title_verified,false);
 assert.equal(x.visual_editor_title_matches_library_name,false);
 assert.equal(x.authorizes_pine_compile,false);
});
test('split editor title drifting between reads refuses stable identity',async()=>{
 const x=await fixture({visualTitle:'Saved QTF Script',unstableTitle:true}).run();
 assert.equal(x.reason_code,'VISUAL_EDITOR_TITLE_CHANGED_DURING_READ');
 assert.equal(x.comparison_allowed,false);
});
test('ambiguous visible title refuses before saved Pine source retrieval',async()=>{
 const f=fixture({ambiguousTitle:true}),x=await f.run();
 assert.equal(x.reason_code,'VISUAL_EDITOR_TITLE_AMBIGUOUS_OR_UNAVAILABLE');
 assert.deepEqual(f.calls,['layout_get','native_binding','visual_title_probe']);
});
test('DOM probe binds the unique title and Monaco editor to one visible script widget',()=>{
 const before=globalThis.document;
 const el=(text,top=60)=>({isConnected:true,textContent:text,getBoundingClientRect:()=>({width:100,height:24,top,bottom:top+24})});
 let calls=[];
 const editor=el('editor',110),head=el('Saved QTF Script',62);
 const pane={...el('pane'),querySelectorAll(selector){calls.push('pane:'+selector);return selector==='.monaco-editor.pine-editor-monaco'?[editor]:selector==='div[role="button"]'?[head]:[];}};
 editor.closest=selector=>selector==='.tv-script-widget'?pane:null;
 globalThis.document={querySelectorAll(selector){calls.push(selector);return selector==='.monaco-editor.pine-editor-monaco'?[editor]:[];}};
 try{
  const x=pineVisualTitlePage();assert.equal(x.status,'candidate');assert.equal(x.title,'Saved QTF Script');
  assert.equal(x.source,'unique_visible_split_editor_role_button');
  assert.deepEqual(calls,['.monaco-editor.pine-editor-monaco','pane:.monaco-editor.pine-editor-monaco','pane:div[role="button"]']);
 }finally{globalThis.document=before;}
});
test('DOM title probe refuses ambiguous editor or title, multiline text, detached panel and controls below editor',()=>{
 const before=globalThis.document;
 const el=(text,top=60)=>({isConnected:true,textContent:text,getBoundingClientRect:()=>({width:100,height:24,top,bottom:top+24})});
 try{
  globalThis.document={querySelectorAll(selector){return selector.includes('monaco')?[el('one'),el('two')]:[];}};
  assert.equal(pineVisualTitlePage().reason_code,'VISIBLE_PINE_EDITOR_NOT_UNIQUE');
  const editor=el('editor',110);
  const pane={...el('pane'),querySelectorAll(selector){return selector.includes('monaco')?[editor]:[el('One'),el('Two')];}};
  editor.closest=()=>pane;
  globalThis.document={querySelectorAll(selector){return selector.includes('monaco')?[editor]:[];}};
  assert.equal(pineVisualTitlePage().reason_code,'VISUAL_PINE_TITLE_AMBIGUOUS');
  pane.querySelectorAll=selector=>selector.includes('monaco')?[editor]:[el('Multiline\nTitle')];
  assert.equal(pineVisualTitlePage().reason_code,'VISUAL_PINE_TITLE_INVALID');
  pane.querySelectorAll=selector=>selector.includes('monaco')?[editor]:[el('Wrong pane button',200)];
  assert.equal(pineVisualTitlePage().status,'unavailable');
  editor.closest=()=>null;
  assert.equal(pineVisualTitlePage().status,'unavailable');
  pane.querySelectorAll=selector=>selector.includes('monaco')?[el('Different editor',110)]:[el('Title')];
  editor.closest=()=>pane;
  assert.equal(pineVisualTitlePage().reason_code,'PINE_TITLE_PANEL_EDITOR_MISMATCH');
 }finally{globalThis.document=before;}
});
