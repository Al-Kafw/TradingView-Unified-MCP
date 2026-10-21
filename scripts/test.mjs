import { readdir,readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from 'node:test';
const selected=process.argv.slice(2);
const files=(await readdir('tests')).filter(f=>f.endsWith('.test.mjs')&&(!selected.length||selected.includes(f))).sort();
if(!files.length)throw new Error('No test files selected');
const outcomes=[];
async function sourceFiles(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())result.push(...await sourceFiles(path));else if(entry.name.endsWith('.mjs'))result.push(path);}return result;}
async function sourceFingerprint(){const hash=createHash('sha256');for(const path of [...await sourceFiles('src'),'package.json'].sort()){hash.update(path.replaceAll('\\','/')+'\0');hash.update(await readFile(path));hash.update('\0');}return hash.digest('hex');}
const sourceBefore=await sourceFingerprint();
// Run sequentially without child processes. Fixtures restore their own globals.
const stream=run({files:files.map(f=>resolve('tests',f)),isolation:'none',concurrency:1});
for await(const event of stream){
 if(['test:pass','test:fail'].includes(event.type)){
  const d=event.data;const record={name:d.name,file:d.file?relative(process.cwd(),d.file).replaceAll('\\','/'):undefined,status:event.type==='test:pass'?'passed':'failed',skipped:!!d.skip,todo:!!d.todo,duration_ms:d.details?.duration_ms,error:d.details?.error?String(d.details.error):undefined};outcomes.push(record);
  if(record.status==='failed')process.stderr.write(`FAIL ${record.name}: ${record.error}\n`);
 }
}
const sourceAfter=await sourceFingerprint();
const report={timestamp:new Date().toISOString(),source_sha256:sourceAfter,source_unchanged_during_tests:sourceBefore===sourceAfter,environment:{node:process.versions.node,platform:process.platform},scope:'Offline unit and controlled CDP/DOM/HTTP handler fixtures. No live TradingView session, real webhook delivery or listening HTTP socket was exercised.',files,tests:outcomes,totals:{files:files.length,tests:outcomes.length,pass:outcomes.filter(r=>r.status==='passed'&&!r.skipped).length,fail:outcomes.filter(r=>r.status==='failed').length,skipped:outcomes.filter(r=>r.skipped).length},passed:sourceBefore===sourceAfter&&outcomes.length>0&&outcomes.every(r=>r.status==='passed')};
await mkdir('docs',{recursive:true});const path=selected.length?'docs/SECURITY_TEST_RESULTS.json':'docs/TEST_RESULTS.json';await writeFile(path,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(report.totals)+'\n');if(!report.passed)process.exitCode=1;
