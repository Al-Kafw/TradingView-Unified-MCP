import { createHash } from 'node:crypto';
import { ToolError } from '../core/errors.mjs';

export const sourceHash = source => createHash('sha256').update(source,'utf8').digest('hex');

/** Editor lookup never falls back to a detached or merely last-created Monaco editor. */
export async function pinePage(a) {
  const fail=(code,message,details={})=>({ok:false,code,message,...details});
  const visible=el=>{const rect=el?.getBoundingClientRect?.();return Boolean(el?.isConnected&&rect?.width>0&&rect?.height>0);};
  const editor=()=>{
    const containers=[...document.querySelectorAll('.monaco-editor.pine-editor-monaco')].filter(visible);
    if(containers.length!==1)return null;
    const container=containers[0];
    const match=env=>{
      const candidates=env?.editor?.getEditors?.()??[];
      const matches=candidates.filter(e=>{const dom=e.getDomNode?.();return dom&&visible(dom)&&(dom===container||container.contains(dom)||dom.contains(container));});
      return matches.length===1?{editor:matches[0],env,container}:null;
    };
    const direct=match(window.monaco);if(direct)return direct;
    for(let node=container,hops=0;node&&hops<25;node=node.parentElement,hops++){
      const key=Object.getOwnPropertyNames(node).find(k=>k.startsWith('__reactFiber'));
      if(!key)continue;
      for(let fiber=node[key],n=0;fiber&&n<50;fiber=fiber.return,n++){
        const found=match(fiber.memoizedProps?.value?.monacoEnv);if(found)return found;
      }
    }
    return null;
  };
  const title=()=>{
    const selectors=['[data-name="scriptTitle"]','[data-name="pine-script-title"]','.js-script-title','[data-name="pine-editor-header"] [class*="title"]'];
    for(const selector of selectors){const nodes=[...document.querySelectorAll(selector)].filter(visible);if(nodes.length===1){const value=nodes[0].textContent?.trim();if(value)return value.replace(/\s*[*•]\s*$/,'');}}
    return null;
  };
  const pineRoot=m=>m?.container?.closest('[data-name="pine-editor"],.pine-editor-container,[class*="pineEditor"],[class*="pine-editor"]')??null;
  const markers=m=>{
    const model=m.editor.getModel?.();
    if(!model||typeof m.env?.editor?.getModelMarkers!=='function')return null;
    return m.env.editor.getModelMarkers({resource:model.uri}).map(v=>({line:v.startLineNumber,column:v.startColumn,end_line:v.endLineNumber,end_column:v.endColumn,message:v.message,severity:v.severity}));
  };
  const consoleRows=()=>[...document.querySelectorAll('[class*="consoleRow"],[class*="consoleLine"]')].filter(visible).map(el=>el.textContent?.trim()).filter(Boolean);
  const findButton=(root,pattern)=>{const found=[...root.querySelectorAll('button,[role="button"]')].filter(el=>visible(el)&&pattern.test((el.textContent??'').trim())&&!el.disabled&&el.getAttribute('aria-disabled')!=='true');return found.length===1?found[0]:null;};
  const nativeBinding=async()=>{
    const m=editor();if(!m)throw new Error('PINE_EDITOR_UNAVAILABLE: A unique visible Monaco editor is required.');
    const api=window.TradingViewApi;
    if(typeof api?.pineEditorApi!=='function')throw new Error('CAPABILITY_UNAVAILABLE: Native Pine editor API is unavailable.');
    const pe=api.pineEditorApi.call(api),candidates=[],seen=new Set();
    for(const [method,host] of [['getDialogFacade','dialog'],['getBottomFacade','bottom']]){
      if(typeof pe?.[method]!=='function')continue;
      let facade;try{facade=pe[method].call(pe);}catch{continue;}
      if(!facade||seen.has(facade))continue;seen.add(facade);
      if(!['getSource','getScriptIdVersion','isModified','isDraft'].every(key=>typeof facade[key]==='function'))continue;
      const nativeSource=await facade.getSource();
      if(typeof nativeSource!=='string'||nativeSource!==m.editor.getValue())continue;
      const idv=await facade.getScriptIdVersion(),modified=await facade.isModified(),draft=await facade.isDraft();
      if(typeof modified!=='boolean'||typeof draft!=='boolean')continue;
      const scriptId=idv?.scriptIdPart,version=idv?.version;
      if(!draft&&(typeof scriptId!=='string'||!scriptId||version==null))continue;
      candidates.push({facade,editor:m.editor,source:nativeSource,binding:{host,script_id:typeof scriptId==='string'&&scriptId?scriptId:null,version:version==null?null:String(version),is_modified:modified,is_draft:draft}});
    }
    if(candidates.length!==1)throw new Error('BINDING_UNVERIFIED: No unique native editor facade matched the visible buffer and exposed authoritative identity.');
    return candidates[0];
  };
  try{
    if(['native_binding','native_open_script','native_new_buffer'].includes(a.op)){
      const before=await nativeBinding();
      if(a.op==='native_binding')return {ok:true,source:before.source,native_binding:before.binding,title:title(),verification_source:'unique_native_facade_and_visible_editor_source'};
      if(before.source!==a.expected_source||JSON.stringify(before.binding)!==a.expected_binding_json)return fail('PRECONDITION_FAILED','The native Pine binding or buffer changed before submission.');
      if(before.binding.is_modified&&a.saved_source_confirmed!==true)return fail('UNSAVED_EDITOR','Save the modified editor buffer before switching its native document. A backup alone does not mark the TradingView document saved.');
      const method=a.op==='native_open_script'?'openScript':'openNewScript';
      if(typeof before.facade[method]!=='function')return fail('CAPABILITY_UNAVAILABLE',`Native editor ${method} is unavailable.`);
      if(a.op==='native_new_buffer'&&before.binding.is_draft)return fail('PRECONDITION_FAILED','A draft is already open; creating another cannot be verified from its absent saved identity. Save or open a saved script first.');
      if(a.op==='native_open_script')await before.facade.openScript({scriptIdPart:a.script_id,version:a.version});
      else await before.facade.openNewScript();
      const deadline=Date.now()+(a.timeout_ms??15000);let observed=null;
      do{
        try{observed=await nativeBinding();}catch{observed=null;}
        const switched=observed&&(a.op==='native_open_script'?observed.binding.script_id===a.script_id&&observed.binding.version===String(a.version)&&observed.source===a.wanted_source:observed.binding.is_draft&&observed.binding.script_id!==before.binding.script_id);
        if(switched){
          if(a.op==='native_new_buffer'&&a.source!==undefined){observed.editor.setValue(a.source);const after=await nativeBinding();if(!after.binding.is_draft||after.binding.script_id!==observed.binding.script_id||after.source!==a.source)return fail('VERIFICATION_FAILED','New draft source did not independently verify.',{mutation_attempted:true,native_binding:after.binding});observed=after;}
          return {ok:true,verified:true,mutation_attempted:true,source:observed.source,native_binding:observed.binding,title:title(),saved_script_created:false,verification_source:'exact_native_script_ID_version_and_visible_full_source'};
        }
        await new Promise(r=>setTimeout(r,200));
      }while(Date.now()<deadline);
      return fail('BINDING_UNVERIFIED','Native editor switching was submitted but its exact identity/version/full source did not verify. No source-injection fallback was attempted.',{mutation_attempted:true,observed_binding:observed?.binding??null});
    }
    if(a.op==='list_saved'||a.op==='saved_source'){
      const response=await fetch('https://pine-facade.tradingview.com/pine-facade/list/?filter=saved',{credentials:'include',redirect:'error'});
      if(!response.ok)return fail('TRADINGVIEW_HTTP_ERROR',`Pine library returned HTTP ${response.status}.`);
      const scripts=await response.json();if(!Array.isArray(scripts))return fail('ADAPTER_MISMATCH','Pine library did not return an array; it is not treated as an empty library.');
      if(a.op==='list_saved'){
        const needle=(a.name_filter??'').toLowerCase();const all=scripts.filter(s=>!needle||`${s.scriptName??''} ${s.scriptTitle??''}`.toLowerCase().includes(needle));
        const offset=a.offset??0,limit=a.limit??100;const page=all.slice(offset,offset+limit).map(s=>({script_id:s.scriptIdPart,name:s.scriptName,title:s.scriptTitle,version:s.version,modified:s.modified}));
        return {ok:true,total:scripts.length,matched:all.length,offset,returned:page.length,next_offset:offset+limit<all.length?offset+limit:null,scripts:page};
      }
      const matches=scripts.filter(s=>s.scriptIdPart===a.script_id);
      if(matches.length!==1)return fail('TARGET_NOT_FOUND','No unique saved script ID matched.');
      const script=matches[0];const version=a.version??script.version;
      if(version==null)return fail('ADAPTER_MISMATCH','Saved script has no version; no default version is guessed.');
      const encodedId=encodeURIComponent(a.script_id).replaceAll('%3B',';');
      const result=await fetch(`https://pine-facade.tradingview.com/pine-facade/get/${encodedId}/${encodeURIComponent(String(version))}`,{credentials:'include',redirect:'error'});
      if(!result.ok)return fail('TRADINGVIEW_HTTP_ERROR',`Saved Pine source returned HTTP ${result.status}.`);
      const data=await result.json();if(typeof data.source!=='string')return fail('ADAPTER_MISMATCH','No source string was returned.');
      return {ok:true,script_id:a.script_id,version,name:script.scriptName,title:script.scriptTitle,source:data.source,editor_touched:false};
    }
    if(a.op==='check'){
      const body=new URLSearchParams({source:a.source});
      const response=await fetch('https://pine-facade.tradingview.com/pine-facade/translate_light?user_name=Guest&pine_id=00000000-0000-0000-0000-000000000000',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,credentials:'omit',redirect:'error'});
      if(!response.ok)return fail('TRADINGVIEW_HTTP_ERROR','Pine compiler returned HTTP '+response.status+'.');

      const data=await response.json();
      const result=data?.result;
      const unverified=()=>fail('COMPILE_OUTCOME_UNVERIFIED','Unrecognised or contradictory light compiler response. No successful compilation was inferred.',{response_keys:Object.keys(result&&typeof result==='object'?result:data??{})});

      if(typeof data?.success!=='boolean'||!result||typeof result!=='object'||Array.isArray(result))return unverified();

      const allowedTop=new Set(['success','result']);
      const allowedResult=new Set(['functions2','types','enums','errors2','warnings2']);

      if(Object.keys(data).some(k=>!allowedTop.has(k)))return unverified();
      if(Object.keys(result).some(k=>!allowedResult.has(k)))return unverified();

      const own=k=>Object.prototype.hasOwnProperty.call(result,k);
      const errors=own('errors2')?result.errors2:[];
      const warnings=own('warnings2')?result.warnings2:[];

      if(!Array.isArray(errors)||!Array.isArray(warnings))return unverified();

      const validDiagnostic=d=>d&&typeof d==='object'&&!Array.isArray(d)&&typeof d.message==='string'&&d.message.trim().length>0;
      if(!errors.every(validDiagnostic)||!warnings.every(validDiagnostic))return unverified();

      const format=d=>({message:d.message,line:d.start?.line,column:d.start?.column,end_line:d.end?.line,end_column:d.end?.column});

      if(data.success===false&&Object.keys(result).some(k=>!['errors2','warnings2'].includes(k)))return unverified();

      if(data.success===false&&errors.length)return {
        ok:true,
        status:'diagnostics_failed',
        compiled:false,
        editor_compiled:false,
        errors:errors.map(format),
        warnings:warnings.map(format),
        compiler_mode:'guest',
        note:'TradingView light compiler diagnostics; editor buffer untouched.'
      };

      if(data.success!==true||errors.length)return unverified();

      if(!['functions2','types','enums'].every(k=>Array.isArray(result[k])))return unverified();

      return {
        ok:true,
        status:'light_check_accepted',
        compiled:false,
        editor_compiled:false,
        errors:[],
        warnings:warnings.map(format),
        compiler_mode:'guest',
        note:'Recognised TradingView light response only. Full Pine Editor compilation and chart execution remain unverified.'
      };
    }
    let m=editor();
    if(a.op==='open'){
      if(m)return {ok:true,editor_open:true,already_open:true,title:title()};
      const bar=window.TradingView?.bottomWidgetBar;
      if(typeof bar?.activateScriptEditorTab==='function')await bar.activateScriptEditorTab();
      else if(typeof bar?.showWidget==='function')await bar.showWidget('pine-editor');
      else {
        const candidates=[...document.querySelectorAll('[aria-label="Pine"],[data-name="pine-dialog-button"]')].filter(visible);
        if(candidates.length!==1)return fail('CAPABILITY_UNAVAILABLE','No unique Pine editor opener was found.');candidates[0].click();
      }
      const deadline=Date.now()+10000;
      while(Date.now()<deadline){m=editor();if(m)return {ok:true,editor_open:true,verified:true,title:title()};await new Promise(r=>setTimeout(r,200));}
      return fail('VERIFICATION_FAILED','Pine editor opening was requested but no uniquely bound visible editor appeared.',{mutation_attempted:true});
    }
    if(!m)return fail('PINE_EDITOR_UNAVAILABLE','A unique visible, DOM-bound Pine editor is required. Open it with pine_open_editor.');
    const source=m.editor.getValue();if(typeof source!=='string')return fail('ADAPTER_MISMATCH','Editor source is not readable.');
    const binding=title();
    if(a.op==='get_source')return {ok:true,source,title:binding,line_count:source.split('\n').length,char_count:source.length,visible_editor_verified:true};
    if(a.op==='get_errors'){
      const found=markers(m);if(!found)return fail('CAPABILITY_UNAVAILABLE','Monaco diagnostics API unavailable.');
      return {ok:true,title:binding,diagnostics:found,error_count:found.filter(v=>v.severity===8).length,warning_count:found.filter(v=>v.severity===4).length};
    }
    if(a.op==='console')return {ok:true,title:binding,entries:consoleRows(),scope:'visible_Pine_console_rows'};
    if(a.op==='set_source'){
      if(source!==a.expected_source)return fail('PRECONDITION_FAILED','Pine buffer changed after it was read; no replacement was made.');
      if(a.expected_title!=null&&binding!==a.expected_title)return fail('BINDING_MISMATCH','Pine editor binding differs from the expected title; no replacement was made.');
      m.editor.setValue(a.source);
      const observed=m.editor.getValue();const afterTitle=title();
      const verified=observed===a.source&&afterTitle===binding;
      return {ok:verified,code:verified?undefined:'VERIFICATION_FAILED',mutation_attempted:true,verified,title:afterTitle,source:observed,action:'editor_buffer_replaced',saved:false,note:'This edits the existing bound buffer; it does not create a new saved script.'};
    }
    if(a.op==='save'||a.op==='compile'){
      if(source!==a.expected_source)return fail('PRECONDITION_FAILED','Pine buffer changed before submission; no action was taken.');
      if(binding==null||binding!==a.expected_title)return fail('BINDING_MISMATCH','Pine title is unreadable or does not exactly match expected_title.');
      let root=pineRoot(m);
      if(!root)return fail('CAPABILITY_UNAVAILABLE','Cannot isolate the Pine editor toolbar safely.');
      const beforeConsole=new Set(consoleRows());
      const buttons=()=>[...root.querySelectorAll('button,[role="button"]')].filter(visible);
      if(a.op==='save'&&buttons().some(b=>/^Saved$/i.test(b.textContent?.trim()??'')))return {ok:true,saved:true,verified:true,already_saved:true,title:binding,verification_source:'Pine_editor_saved_status'};
      const pattern=a.op==='save'?/^Save$/:/^(Add to chart|Update on chart|Save and add to chart)$/i;
      const button=findButton(root,pattern);
      if(!button)return fail('CAPABILITY_UNAVAILABLE',`No unique enabled Pine ${a.op} button was found. No global keyboard shortcut was sent.`);
      const action=button.textContent.trim();button.click();
      const deadline=Date.now()+15000;
      while(Date.now()<deadline){
        await new Promise(r=>setTimeout(r,250));m=editor();if(!m)return fail('VERIFICATION_FAILED','Editor became unavailable after submission.',{mutation_attempted:true});
        if(title()!==binding)return fail('BINDING_MISMATCH','Editor title changed during operation; result requires reconciliation.',{mutation_attempted:true});
        root=pineRoot(m);if(!root)return fail('VERIFICATION_FAILED','Pine toolbar disappeared after submission.',{mutation_attempted:true});
        if(a.op==='save'){
          const saved=[...root.querySelectorAll('button,[role="button"]')].filter(visible).some(b=>/^Saved$/i.test(b.textContent?.trim()??''));
          if(saved&&m.editor.getValue()===source)return {ok:true,title:binding,saved:true,verified:true,verification_source:'Pine_editor_saved_status',action};
        }else{
          const diagnostics=markers(m)??[];const errors=diagnostics.filter(d=>d.severity===8);
          if(errors.length)return {ok:true,compiled:false,added_to_chart:false,errors,mutation_attempted:true,action};
          const newMessages=consoleRows().filter(v=>!beforeConsole.has(v));
          const success=newMessages.find(v=>/script (added|updated).*chart|compiled successfully|compilation completed/i.test(v));
          if(success)return {ok:true,compiled:true,verified:true,verification_source:'new_Pine_console_success_message',evidence:success,action,mutation_attempted:true};
        }
      }
      return fail('VERIFICATION_FAILED',`${a.op} was submitted but no independent success indication was observed. Reconcile before retrying.`,{mutation_attempted:true,action});
    }
    return fail('INVALID_ARGUMENT','Unknown Pine operation.');
  }catch(error){const message=String(error?.message??error).slice(0,600);return fail(/^([A-Z_]+):/.exec(message)?.[1]??'PINE_OPERATION_FAILED',message,{mutation_attempted:['set_source','save','compile','open','native_open_script','native_new_buffer'].includes(a.op)});}
}

/** Loaded first-party Pine facade only. Operation names and endpoint paths are fixed. */
export async function pineLibraryPage(a){
  const fail=(code,message,details={})=>({ok:false,code,message,...details});
  let submitted=false;
  try{
    const chunk=window.webpackChunktradingview;if(typeof chunk?.push!=='function')return fail('CAPABILITY_UNAVAILABLE','Native Pine module registry is unavailable.');
    let req;chunk.push([[`unified_pine_${Math.random().toString(36).slice(2)}`],{},r=>{req=r;}]);
    const found=[];for(const m of Object.values(req?.c??{})){let f;try{f=m?.exports?.pineFacadeFetch;}catch{continue;}if(typeof f==='function'&&!found.includes(f))found.push(f);}
    if(found.length!==1)return fail('CAPABILITY_UNAVAILABLE','No unique already-loaded native pineFacadeFetch is available. Open Pine Editor first.');
    const nativeFetch=found[0];
    const id=String(a.script_id??'');
    if(a.script_id!==undefined&&!/^[A-Za-z0-9_.$:;-]{1,300}$/.test(id))return fail('INVALID_ARGUMENT','Script ID contains characters outside the native identifier format.');
    const version=value=>{const v=String(value??'');if(!/^\d+(?:\.\d+)*$/.test(v))throw new Error('ADAPTER_MISMATCH: Native script version is missing or unrecognised.');return v;};
    const list=async()=>{const rows=await nativeFetch({method:'GET',urlPath:'list',urlParams:{filter:'saved'}});if(!Array.isArray(rows))throw new Error('ADAPTER_MISMATCH: Native Pine list is not an array.');return rows;};
    const exact=(rows,wanted)=>{const matches=rows.filter(row=>row.scriptIdPart===wanted);if(matches.length!==1)throw new Error('TARGET_NOT_FOUND: No unique saved script ID matched.');return matches[0];};
    const record=row=>({script_id:row.scriptIdPart,name:row.scriptName??row.scriptTitle??null,title:row.scriptTitle??null,version:version(row.version),modified:row.modified??null,builtin:row.isTVScriptBuiltIn===true});
    const get=async(row,wantedVersion)=>{
      const ver=version(wantedVersion??row.version);
      if(!/^[A-Za-z0-9_.$:;-]{1,300}$/.test(row.scriptIdPart))throw new Error('ADAPTER_MISMATCH: Native library returned an invalid script identifier.');
      // Semicolons in USER;... identifiers remain literal, matching the app client.
      const data=await nativeFetch({method:'GET',urlPath:`get/${row.scriptIdPart}/${ver}`});
      if(typeof data?.source!=='string')throw new Error('ADAPTER_MISMATCH: Native saved source is absent.');
      if(data.scriptIdPart!==undefined&&data.scriptIdPart!==row.scriptIdPart||data.version!==undefined&&version(data.version)!==ver)throw new Error('TARGET_MISMATCH: Native source response identity/version does not match.');
      return {...record(row),version:ver,source:data.source};
    };
    const rows=await list();
    if(a.op==='save_new'){
      if(rows.some(row=>(row.scriptName??row.scriptTitle)===a.name))return fail('NAME_CONFLICT','This saved script name already exists. New-script creation never overwrites another script.');
      const beforeIds=new Set(rows.map(row=>row.scriptIdPart));submitted=true;
      const response=await nativeFetch({method:'POST',urlPath:'save/new',urlParams:{name:a.name},data:{source:a.source}});
      if(response?.success===false||response?.result?.success===false||response?.error)return fail('TRADINGVIEW_REJECTED','TradingView rejected new-script saving.',{mutation_attempted:true,reason:response?.reason??response?.error??null});
      const returnedId=response?.result?.metaInfo?.scriptIdPart??response?.metaInfo?.scriptIdPart;
      const deadline=Date.now()+(a.timeout_ms??15000);
      do{
        const matches=(await list()).filter(row=>!beforeIds.has(row.scriptIdPart)&&(row.scriptName??row.scriptTitle)===a.name&&(!returnedId||row.scriptIdPart===returnedId));
        if(matches.length>1)return fail('AMBIGUOUS_RESULT','Multiple new scripts match; reconcile before retrying.',{mutation_attempted:true,candidate_ids:matches.map(row=>row.scriptIdPart)});
        if(matches.length===1){const saved=await get(matches[0]);if(saved.source===a.source)return {ok:true,verified:true,mutation_attempted:true,...saved,created:true,editor_binding_changed:false,verification_source:'independent_native_library_ID_version_full_source'};}
        await new Promise(r=>setTimeout(r,250));
      }while(Date.now()<deadline);
      return fail('PINE_SAVE_UNVERIFIED','A new-script save was submitted but its independent ID/version/source readback did not verify. Reconcile the library before retrying.',{mutation_attempted:true});
    }
    const row=exact(rows,id);
    if(a.op==='get_source')return {ok:true,...await get(row,a.version),editor_touched:false};
    if(a.op==='versions'){
      const result=await nativeFetch({method:'GET',urlPath:`versions/${id}`,urlParams:{limit:String(a.limit??100)}});
      if(!Array.isArray(result))return fail('ADAPTER_MISMATCH','Native version history is not an array; no empty history was inferred.');
      return {ok:true,script_id:id,returned:result.length,versions:result.map(v=>({version:v.version??v.lastVersionMaj??null,modified:v.modified??null,created:v.created??null,name:v.scriptName??null})),limit:a.limit??100};
    }
    if(a.op==='permission'){const result=await nativeFetch({method:'GET',urlPath:`is_auth_to_write/${id}`});return {ok:true,script_id:id,native_result:result,can_write:typeof result==='boolean'?result:null};}
    if(row.isTVScriptBuiltIn===true)return fail('BUILTIN_SCRIPT','Built-in scripts cannot be changed by native library mutation tools.');
    const current=await get(row);
    if(current.version!==String(a.expected_version)||current.source!==a.expected_saved_source||a.expected_name!==undefined&&current.name!==a.expected_name)return fail('PRECONDITION_FAILED','The saved script version, name or full source changed; no write was submitted.');
    if(a.op==='save_next'&&current.source===a.source)return {ok:true,verified:true,already_current:true,version_created:false,...current};
    if(a.op==='rename'&&rows.some(other=>other.scriptIdPart!==id&&(other.scriptName??other.scriptTitle)===a.name))return fail('NAME_CONFLICT','Another saved script already has the requested name.');
    if(a.op==='rename'&&current.name===a.name)return {ok:true,verified:true,already_named:true,...current};
    let options;
    if(a.op==='save_next')options={method:'POST',urlPath:`save/next/${id}`,urlParams:{allow_create_new:false},data:{source:a.source}};
    else if(a.op==='rename')options={method:'POST',urlPath:`rename/${id}`,urlParams:{name:a.name,force:false}};
    else if(a.op==='delete')options={method:'POST',urlPath:`delete/${id}`};
    else return fail('INVALID_ARGUMENT','Unknown native Pine library operation.');
    submitted=true;const response=await nativeFetch(options);
    if(response?.success===false||response?.result?.success===false||response?.error)return fail('TRADINGVIEW_REJECTED','TradingView rejected the saved-script change.',{mutation_attempted:true,reason:response?.reason??response?.error??null});
    const deadline=Date.now()+(a.timeout_ms??15000);let last=null;
    do{
      const after=await list();const matches=after.filter(candidate=>candidate.scriptIdPart===id);
      if(a.op==='delete'&&matches.length===0)return {ok:true,verified:true,mutation_attempted:true,deleted:{script_id:id,name:current.name,version:current.version}};
      if(matches.length===1&&a.op!=='delete'){
        last=await get(matches[0]);
        const verified=a.op==='save_next'?last.version!==current.version&&last.source===a.source:last.name===a.name&&last.source===current.source;
        if(verified)return {ok:true,verified:true,mutation_attempted:true,...last,previous_version:current.version,version_created:a.op==='save_next',verification_source:'independent_native_library_ID_version_full_source'};
      }
      await new Promise(r=>setTimeout(r,250));
    }while(Date.now()<deadline);
    return fail('PINE_MUTATION_UNVERIFIED','The saved-script change was submitted but independent library verification did not complete. Reconcile before retrying.',{mutation_attempted:true,script_id:id,last_observed_version:last?.version??null});
  }catch(error){const message=String(error?.message??error).slice(0,600);return fail(/^([A-Z_]+):/.exec(message)?.[1]??'PINE_LIBRARY_FAILED',message,{mutation_attempted:submitted});}
}

/** Small offline checks, deliberately not advertised as a Pine compiler. */
export function analyzePine(source){
  const diagnostics=[];const lines=source.split('\n');
  const stripped=lines.map(line=>{let result='',quote=null,escape=false;for(let i=0;i<line.length;i++){const ch=line[i];if(quote){result+=' ';if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote=null;}else if(ch==='"'||ch==="'"){quote=ch;result+=' ';}else if(ch==='/'&&line[i+1]==='/'){result+=' '.repeat(line.length-i);break;}else result+=ch;}return result;});
  const version=source.match(/^\s*\/\/@version=(\d+)\s*$/m)?.[1]??null;
  const declarations=[];stripped.forEach((line,i)=>{for(const match of line.matchAll(/\b(indicator|strategy|library)\s*\(/g))declarations.push({kind:match[1],line:i+1});if(/\blookahead\s*=\s*barmerge\.lookahead_on\b/.test(line))diagnostics.push({severity:'review',line:i+1,message:'Review higher-timeframe lookahead and indexing for future-data leakage; this flag alone does not prove repainting.'});});
  if(!version)diagnostics.push({severity:'warning',message:'No Pine version directive was found.'});
  if(declarations.length!==1)diagnostics.push({severity:'warning',message:`Found ${declarations.length} top-level declaration candidates; compilation determines validity.`});
  return {ok:true,version:version?Number(version):null,declarations,diagnostics,compiler:false,coverage:'limited_static_checks',line_count:lines.length};
}

const text={type:'string',maxLength:1000000};
const str={type:'string',minLength:1,maxLength:300};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
export const bindingHash=result=>sourceHash(JSON.stringify([result.native_binding,result.source]));
export async function pineRead(op,args,ctx){const result=await ctx.callPage(pinePage,{...args,op},{timeoutMs:(args.timeout_ms??15000)+15000});if(!result?.ok)throw new ToolError(result?.code??'ADAPTER_MISMATCH',result?.message??'Pine operation failed.',result);if(typeof result.source==='string')result.source_sha256=sourceHash(result.source);if(result.native_binding)result.binding_sha256=bindingHash(result);return result;}
export async function pineLibraryRead(op,args,ctx){const result=await ctx.callPage(pineLibraryPage,{...args,op},{timeoutMs:(args.timeout_ms??15000)+30000});if(!result?.ok)throw new ToolError(result?.code??'ADAPTER_MISMATCH',result?.message??'Native Pine library operation failed.',result);if(typeof result.source==='string')result.source_sha256=sourceHash(result.source);return result;}
const def=(name,op,description,properties={},required=[],mutates=false)=>({name,description,inputSchema:schema(properties,required),mutates,handler:(args,ctx)=>pineRead(op,args,ctx)});
const nativeId={type:'string',minLength:1,maxLength:300,pattern:'^[A-Za-z0-9_.$:;-]+$'};
const nativeVersion={type:['string','integer'],minLength:1,maxLength:50,pattern:'^\\d+(?:\\.\\d+)*$',minimum:0};
const timeout={timeout_ms:{type:'integer',minimum:500,maximum:30000}};
const priorSaved={script_id:nativeId,expected_version:nativeVersion,expected_saved_source_sha256:hash};
const readBinding=async(args,ctx)=>{const before=await pineRead('native_binding',{},ctx);if(before.binding_sha256!==args.expected_binding_sha256)throw new ToolError('PRECONDITION_FAILED','The current native Pine binding/source hash differs from the expected value.',{binding_sha256:before.binding_sha256,native_binding:before.native_binding});return before;};
const bindingArgs=before=>({expected_source:before.source,expected_binding_json:JSON.stringify(before.native_binding)});
const changeSaved=async(op,args,ctx)=>{
  const before=await pineLibraryRead('get_source',{script_id:args.script_id},ctx);
  if(before.version!==String(args.expected_version)||before.source_sha256!==args.expected_saved_source_sha256||args.expected_name!==undefined&&before.name!==args.expected_name)throw new ToolError('PRECONDITION_FAILED','The saved Pine script differs from the expected version/source/name. No write was submitted.',{script_id:before.script_id,version:before.version,source_sha256:before.source_sha256});
  const backup=await ctx.exportJson('pine-before-'+op,before);
  try{return {...await pineLibraryRead(op,{...args,expected_saved_source:before.source},ctx),backup_file:backup};}
  catch(error){throw new ToolError(error.code??'PINE_LIBRARY_FAILED',error.message,{...(error.details??{}),backup_file:backup});}
};
const guarded=async(op,args,ctx)=>{
  const before=await pineRead('get_source',{},ctx);
  if(before.source_sha256!==args.expected_source_sha256)throw new ToolError('PRECONDITION_FAILED','Expected Pine source hash differs from the current buffer; no write was submitted.',{current_source_sha256:before.source_sha256,title:before.title});
  const result=await pineRead(op,{...args,expected_source:before.source},ctx);return result;
};
export default [
  def('pine_get_binding','native_binding','Read authoritative native Pine script ID/version, draft/modified state and the full visible source, with a binding hash. Ambiguous facades fail closed.'),
  {name:'pine_open_script',description:'Open one saved Pine script/version through its native editor facade and verify exact bound ID, version and full source. Requires a clean current buffer and binding hash; no source-injection fallback.',inputSchema:schema({script_id:nativeId,version:nativeVersion,expected_binding_sha256:hash,...timeout},['script_id','expected_binding_sha256']),mutates:true,handler:async(args,ctx)=>{
    const before=await readBinding(args,ctx);const saved=await pineLibraryRead('get_source',{script_id:args.script_id,version:args.version},ctx);const backup=await ctx.exportJson('pine-before-open',before);
    try{return {...await pineRead('native_open_script',{...args,...bindingArgs(before),script_id:saved.script_id,version:saved.version,wanted_source:saved.source},ctx),backup_file:backup};}catch(error){throw new ToolError(error.code??'BINDING_UNVERIFIED',error.message,{...(error.details??{}),backup_file:backup});}
  }},
  {name:'pine_new_buffer',description:'Create a native unsaved Pine draft from a clean saved document, verify draft identity, and set exact supplied source. Does not create a cloud script.',inputSchema:schema({source:text,expected_binding_sha256:hash,...timeout},['source','expected_binding_sha256']),mutates:true,handler:async(args,ctx)=>{const before=await readBinding(args,ctx);const backup=await ctx.exportJson('pine-before-new-buffer',before);try{return {...await pineRead('native_new_buffer',{...args,...bindingArgs(before)},ctx),backup_file:backup};}catch(error){throw new ToolError(error.code??'BINDING_UNVERIFIED',error.message,{...(error.details??{}),backup_file:backup});}}},
  {name:'pine_save_new',description:'Create a new cloud Pine script from supplied source, refuse duplicate names, and independently verify new ID/version/full source. Leaves the editor binding unchanged.',inputSchema:schema({name:str,source:text,...timeout},['name','source']),mutates:true,handler:(args,ctx)=>pineLibraryRead('save_new',args,ctx)},
  {name:'pine_save_as',description:'Save the exactly hashed visible Pine buffer as a uniquely named new cloud script, then natively bind the editor to its verified new ID/version/source. Returns a reconciliation receipt if binding fails after saving.',inputSchema:schema({name:str,expected_binding_sha256:hash,...timeout},['name','expected_binding_sha256']),mutates:true,handler:async(args,ctx)=>{
    const before=await readBinding(args,ctx);const backup=await ctx.exportJson('pine-before-save-as',before);const saved=await pineLibraryRead('save_new',{name:args.name,source:before.source,timeout_ms:args.timeout_ms},ctx);
    try{const opened=await pineRead('native_open_script',{...bindingArgs(before),script_id:saved.script_id,version:saved.version,wanted_source:saved.source,saved_source_confirmed:true,timeout_ms:args.timeout_ms},ctx);return {...opened,created_script:{script_id:saved.script_id,version:saved.version,name:saved.name,source_sha256:saved.source_sha256},saved_script_created:true,backup_file:backup};}
    catch(error){throw new ToolError('PINE_SAVED_BINDING_UNVERIFIED','The new script was independently saved, but editor binding did not verify. Do not create another copy; reconcile this saved script ID.',{created_script:{script_id:saved.script_id,version:saved.version,name:saved.name,source_sha256:saved.source_sha256},binding_error:{code:error.code,message:error.message},backup_file:backup});}
  }},
  {name:'pine_save_next',description:'Save the next cloud version of exactly one Pine script after matching prior version/full-source hash; back up old source and independently verify the version moved and new source matches.',inputSchema:schema({...priorSaved,source:text,...timeout},['script_id','expected_version','expected_saved_source_sha256','source']),mutates:true,handler:(args,ctx)=>changeSaved('save_next',args,ctx)},
  {name:'pine_rename_script',description:'Rename one exact saved Pine script after version/source/name preconditions; preserve source, refuse name conflicts, and verify native ID/name readback.',inputSchema:schema({...priorSaved,name:str,expected_name:str,...timeout},['script_id','expected_version','expected_saved_source_sha256','name','expected_name']),mutates:true,handler:(args,ctx)=>changeSaved('rename',args,ctx)},
  {name:'pine_delete_script',description:'Delete one exact saved Pine script only after version/source/name preconditions and a confined backup; verify absence from a successful native library read.',inputSchema:schema({...priorSaved,expected_name:str,...timeout},['script_id','expected_version','expected_saved_source_sha256','expected_name']),mutates:true,destructive:true,handler:(args,ctx)=>changeSaved('delete',args,ctx)},
  {name:'pine_get_versions',description:'Read native saved Pine version history by exact script ID. An unexpected response is an error, never an empty version list.',inputSchema:schema({script_id:nativeId,limit:{type:'integer',minimum:1,maximum:1000}},['script_id']),mutates:false,handler:(args,ctx)=>pineLibraryRead('versions',args,ctx)},
  {name:'pine_can_write',description:'Inspect TradingView’s native write-permission result for one saved script; only a literal boolean is interpreted as can_write.',inputSchema:schema({script_id:nativeId},['script_id']),mutates:false,handler:(args,ctx)=>pineLibraryRead('permission',args,ctx)},
  def('pine_open_editor','open','Open Pine Editor and verify a unique visible Monaco editor bound to the displayed DOM.',{},[],true),
  def('pine_get_source','get_source','Read the current editor source, exact binding title and source SHA-256.'),
  {name:'pine_set_source',description:'Replace the existing Pine buffer only if its prior SHA-256 still matches; verify exact full-text readback. Does not create a new saved script.',inputSchema:schema({source:text,expected_source_sha256:hash,expected_title:str},['source','expected_source_sha256']),mutates:true,handler:(args,ctx)=>guarded('set_source',args,ctx)},
  def('pine_get_errors','get_errors','Read Monaco compiler diagnostics including severity and line/column positions.'),
  def('pine_get_console','console','Read only currently visible Pine console rows.'),
  {name:'pine_compile',description:'Submit Add/Update on chart only for the exact expected buffer and title; require new compile success evidence or report failure/unverified.',inputSchema:schema({expected_source_sha256:hash,expected_title:str},['expected_source_sha256','expected_title']),mutates:true,handler:(args,ctx)=>guarded('compile',args,ctx)},
  {name:'pine_save',description:'Save the exactly identified open Pine buffer using its scoped toolbar; verify Saved status. New unnamed script dialogs require native UI handling.',inputSchema:schema({expected_source_sha256:hash,expected_title:str},['expected_source_sha256','expected_title']),mutates:true,handler:(args,ctx)=>guarded('save',args,ctx)},
  def('pine_check','check','Submit supplied Pine source to TradingView’s own guest compile endpoint; require recognised output and never infer success from empty diagnostics.',{source:text},['source']),
  def('pine_list_scripts','list_saved','List the account’s saved Pine library through the browser’s TradingView request context; no credential extraction.',{name_filter:{type:'string',maxLength:300},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:1000}}),
  def('pine_get_saved_source','saved_source','Read saved source by exact script ID and version without touching the current editor or its binding.',{script_id:str,version:{type:['string','integer']}},['script_id']),
  {name:'pine_analyze',description:'Run limited offline static Pine checks; explicitly not a compiler or a proof against repainting.',scope:'local',requiresLayout:false,mutates:false,inputSchema:schema({source:text},['source']),handler:async args=>analyzePine(args.source)},
  {name:'pine_template',description:'Return a new Pine v6 template as text. Does not overwrite an editor or create a saved script.',scope:'local',requiresLayout:false,mutates:false,inputSchema:schema({kind:{type:'string',enum:['indicator','strategy','library']},name:str},['kind','name']),handler:async args=>{
    const name=JSON.stringify(args.name);const source=args.kind==='indicator'?`//@version=6\nindicator(${name}, overlay=true)\nplot(close)\n`:args.kind==='strategy'?`//@version=6\nstrategy(${name}, overlay=true)\n// Add entry and exit rules before backtesting.\n`:`//@version=6\nlibrary(${name})\n// Add exported functions.\n`;
    return {ok:true,source,source_sha256:sourceHash(source),saved_script_created:false};
  }},
  {name:'pine_export_saved_source',description:'Export one saved script’s exact source and metadata into a confined JSON artifact.',inputSchema:schema({script_id:str,version:{type:['string','integer']}},['script_id']),mutates:false,handler:async(args,ctx)=>{const result=await pineRead('saved_source',args,ctx);const file=await ctx.exportJson('pine-source',result);return {ok:true,script_id:result.script_id,version:result.version,source_sha256:result.source_sha256,file};}}
];
