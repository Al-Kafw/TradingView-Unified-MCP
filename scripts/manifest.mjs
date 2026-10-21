import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const paths=execFileSync('git',['ls-files','--cached','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&p!=='BUILD_MANIFEST.json').sort();
const tests=JSON.parse(await readFile('docs/TEST_RESULTS.json','utf8'));
const files=[];
for(const path of paths){const bytes=await readFile(path);files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile('BUILD_MANIFEST.json',JSON.stringify({project:'tradingview-unified-mcp',version:JSON.parse(await readFile('package.json','utf8')).version,prepared:new Date().toISOString().slice(0,10),runtime_source_sha256:tests.source_sha256,tests:tests.totals,scope:'All tracked release files except this self-referential manifest. Regenerate after changing release content.',files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,manifest:'BUILD_MANIFEST.json'}));
