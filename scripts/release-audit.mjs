import { execFileSync } from 'node:child_process';

// Audit exactly the candidate Git release tree; never traverse ignored profiles
// or runtime state. Findings contain filenames/rule names, never matched values.
const entries=execFileSync('git',['ls-files','--stage','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).map(line=>{
  const match=/^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(line);
  if(!match)throw new Error('Unexpected Git index entry.');
  return {mode:match[1],sha:match[2],stage:match[3],path:match[4]};
});
const paths=entries.map(e=>e.path);
if(!paths.length)throw new Error('Stage the intended release files before running the release audit.');
const findings=[];
const rules=[
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['provider credential',/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g],
  ['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Google API key',/\bAIza[A-Za-z0-9_-]{30,}\b/g],
  ['Slack credential',/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['local user path',/\/(?:Users|home)\/[A-Za-z0-9_.-]+\//g],
  ['cookie export',/"name"\s*:\s*"(?:sessionid|sessionid_sign|device_t)"\s*,/g],
  ['assigned credential',/(?:sessionid|sessionid_sign|access_token|refresh_token|api_key|apiKey|client_secret|password|token)["']?\s*[:=]\s*["']([A-Za-z0-9_.:/+=-]{20,})["']/gi],
];
for(const {path,sha,mode,stage} of entries){
  if(path.split('/').some(part=>['runtime','profiles','exports','browser-profile','node_modules','.cache'].includes(part))||/(?:^|\/)\.env(?:\..*)?$/.test(path)&&!path.endsWith('.env.example')||/\.(?:pem|key|p12|pfx|log|zip|tgz)$/i.test(path)){
    findings.push({path,rule:'private/generated artifact'});continue;
  }
  if(!['100644','100755'].includes(mode)||stage!=='0'){findings.push({path,rule:'unexpected file type or unmerged index'});continue;}
  const size=Number(execFileSync('git',['cat-file','-s',sha],{encoding:'utf8'}));
  if(size>2*1024*1024){findings.push({path,rule:'unexpected file size'});continue;}
  const text=execFileSync('git',['cat-file','blob',sha],{encoding:'utf8',maxBuffer:3*1024*1024});
  for(const [rule,pattern] of rules){
    pattern.lastIndex=0;
    for(const match of text.matchAll(pattern)){
      const candidate=match[1]??match[0];
      if(/CANARY|FIXTURE|DUMMY|^test[-_]/i.test(candidate))continue;
      findings.push({path,rule});break;
    }
  }
}
console.log(JSON.stringify({files:paths.length,findings,passed:findings.length===0,scope:'Tracked release files only; pattern scanning supplements manual review and does not recognize every possible secret.'},null,2));
if(findings.length)process.exitCode=1;
