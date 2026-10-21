import { readdir,readFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
const findings=[];let files=0;
const forbidden=[['cookie extraction call',/\.(?:getCookies|getAllCookies|storageState)\s*\(/],['document cookie access',/document\s*\.\s*cookie/],['remote shell bootstrap',/curl\s+[^\n]+\|\s*(?:ba)?sh/],['external AI SDK',/from\s+['"](?:openai|@anthropic-ai\/sdk)['"]/],['unrestricted HTTP client',/from\s+['"](?:node:https|axios|undici)['"]/],['environment cookie import',/process\.env\.(?:TV_COOKIE|TRADINGVIEW_COOKIE|SESSIONID)/],['remote code import',/import\s*\(\s*['"]https?:/]];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.mjs')){files++;const source=await readFile(p,'utf8');for(const [rule,re] of forbidden)if(re.test(source))findings.push({file:p,rule});}}}
await walk(resolve('src'));const pkg=JSON.parse(await readFile('package.json','utf8'));
if(Object.keys(pkg.dependencies||{}).length||Object.keys(pkg.devDependencies||{}).length)findings.push({rule:'New dependency requires separate manual supply-chain review'});
process.stdout.write(JSON.stringify({gate:'static-source',files,findings,passed:findings.length===0,scope:'Narrow static checks; run tests/security.test.mjs and the documented live canary audit. This is not proof that unreviewed code or the browser cannot exfiltrate data.'},null,2)+'\n');if(findings.length)process.exitCode=1;
