import { mkdir, open, readFile, rename, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, join, basename, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ToolError } from './errors.mjs';
import { redact, sha256 } from './security.mjs';

export class LocalStore {
  constructor(root) { this.root = resolve(root); }
  checkArea(area){if(typeof area!=='string'||!/^[a-z][a-z0-9_-]{0,40}$/.test(area))throw new ToolError('UNSAFE_STORAGE','Invalid internal storage area.');}
  async ready() {
    await mkdir(this.root, {recursive:true,mode:0o700});
    const st = await lstat(this.root);
    if (st.isSymbolicLink()) throw new ToolError('UNSAFE_STORAGE','Runtime directory must not be a symbolic link.');
  }
  async write(area, key, value) {
    this.checkArea(area);
    await this.ready();
    const dir = join(this.root,area);
    await mkdir(dir,{recursive:true,mode:0o700});
    const within=relative(await realpath(this.root),await realpath(dir));
    if ((await lstat(dir)).isSymbolicLink() || !within || within==='..' || within.startsWith('..'+sep) || isAbsolute(within)) throw new ToolError('UNSAFE_STORAGE','Refusing storage outside the runtime directory.');
    const name = `${sha256(key)}.json`;
    const target = join(dir,name), tmp = join(dir,`${name}.${randomUUID()}.tmp`);
    const handle = await open(tmp,'wx',0o600);
    try { await handle.writeFile(JSON.stringify(value,null,2)+'\n'); await handle.sync(); } finally { await handle.close(); }
    await rename(tmp,target);
    return target;
  }
  async read(area,key) {
    this.checkArea(area);
    await this.ready();
    const dir=join(this.root,area);
    try {
      if ((await lstat(dir)).isSymbolicLink()) throw new ToolError('UNSAFE_STORAGE','Refusing symlink storage.');
      const path=join(dir,`${sha256(key)}.json`);
      if ((await lstat(path)).isSymbolicLink()) throw new ToolError('UNSAFE_STORAGE','Refusing symlink storage.');
      return JSON.parse(await readFile(path,'utf8'));
    } catch(e) { if(e.code==='ENOENT') return null; throw e; }
  }
  async list(area) {
    this.checkArea(area);
    await this.ready();
    const dir=join(this.root,area);
    try {
      if((await lstat(dir)).isSymbolicLink()) throw new ToolError('UNSAFE_STORAGE','Refusing symlink storage.');
      return (await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));
    } catch(e) { if(e.code==='ENOENT') return []; throw e; }
  }
  async records(area,limit=100) {
    const names=await this.list(area);const result=[];
    for(const name of names.slice(-Math.max(0,limit))){const path=join(this.root,area,name);if((await lstat(path)).isSymbolicLink())throw new ToolError('UNSAFE_STORAGE','Refusing symlink record.');result.push(JSON.parse(await readFile(path,'utf8')));}
    return result;
  }
  async checkpoint(key,value) { return this.write('checkpoints',key,redact(value)); }
  async loadCheckpoint(key) { return this.read('checkpoints',key); }
  async audit(record) { return this.write('audit',`${Date.now()}-${randomUUID()}`,redact({time:new Date().toISOString(),...record})); }
  async exportJson(name,data) {
    const safe = basename(name).replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/^\.+/,'').slice(0,100)||'export';
    const path=await this.write('exports',`${safe}-${Date.now()}-${randomUUID()}`,redact(data));
    return {path,format:'json',redaction_applied:true,credentials_not_collected_by_exporter:true};
  }
  async exportCsv(name,rows) {
    if(!Array.isArray(rows)) throw new ToolError('INVALID_ARGUMENT','CSV export requires rows.');
    const cleaned=redact(rows);
    const columns=[...new Set(cleaned.flatMap(row=>Object.keys(row||{})))];
    const cell=value=> {
      let s=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
      // Spreadsheet applications also evaluate formulas after whitespace and
      // numeric-looking minus prefixes. Preserve only strict negative numbers.
      if(/^[\s]*[=+@-]/.test(s) && !/^-\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s) || /^[\t\r\n]/.test(s)) s="'"+s;
      return '"'+s.replaceAll('"','""')+'"';
    };
    const content=[columns.map(cell).join(','),...cleaned.map(row=>columns.map(k=>cell(row[k])).join(','))].join('\r\n');
    await this.ready();
    const dir=join(this.root,'exports');await mkdir(dir,{recursive:true,mode:0o700});
    if((await lstat(dir)).isSymbolicLink()) throw new ToolError('UNSAFE_STORAGE','Refusing symlink export path.');
    const safe=basename(name).replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/^\.+/,'').slice(0,80)||'export';
    const path=join(dir,`${safe}-${randomUUID()}.csv`);
    const file=await open(path,'wx',0o600);try{await file.writeFile(content);}finally{await file.close();}
    return {path,format:'csv',rows:rows.length,columns};
  }
}
