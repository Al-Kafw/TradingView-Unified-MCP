import { readdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { execFileSync } from 'node:child_process';
async function files(path){const result=[];for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())result.push(...await files(p));else if(e.name.endsWith('.mjs'))result.push(p);}return result;}
const paths=await files(resolve('src'));
const checked=[...paths,...await files(resolve('scripts')),...await files(resolve('tests'))];
for(const path of checked)execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
const {buildRuntime,allDescriptors}=await import('../src/runtime.mjs');const runtime=buildRuntime({genericUi:true});
await import('../src/core/http.mjs');
process.stdout.write(JSON.stringify({source_files:paths.length,syntax_checked:checked.length,runtime_imports_valid:true,registered_tools:runtime.registry.list().length,unique_tools:new Set(allDescriptors.map(d=>d.name)).size,schemas_valid:true})+'\n');runtime.browser.close();
