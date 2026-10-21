import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('Release audit scans staged bytes and reports credential/artifact findings without echoing values',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tv-release-'));const script=resolve('scripts/release-audit.mjs');
 const git=args=>execFileSync('git',args,{cwd:dir,stdio:'pipe'});
 git(['init','-b','main']);const sample='ghp_'+'A'.repeat(36);
 await writeFile(join(dir,'README.md'),sample);git(['add','README.md']);
 // A clean working file must not hide an unsafe staged blob.
 await writeFile(join(dir,'README.md'),'Safe working copy\n');
 let result=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(result.stdout.includes(sample),false);
 assert.ok(JSON.parse(result.stdout).findings.some(f=>f.rule==='GitHub credential'));
 git(['add','README.md']);result=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
 assert.equal(result.status,0);
 await writeFile(join(dir,'.env'),'sample=local\n');git(['add','-f','.env']);
 result=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});assert.equal(result.status,1);
 assert.ok(JSON.parse(result.stdout).findings.some(f=>f.rule==='private/generated artifact'));
});
