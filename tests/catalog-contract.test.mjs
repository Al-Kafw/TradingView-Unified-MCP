import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRuntime} from '../src/runtime.mjs';

const readJson=async path=>JSON.parse(await readFile(path,'utf8'));

test('generated catalogue counts distinguish all, default and read-only registered tools', async()=>{
  const all=buildRuntime({readonly:false,genericUi:true});
  const enabled=buildRuntime({readonly:false,genericUi:false});
  const readonly=buildRuntime({readonly:true,genericUi:false});
  try{
    const full=all.registry.list(), defaults=enabled.registry.list(), reads=readonly.registry.list();
    const counts=await readJson('docs/CATALOG_COUNTS.json');
    assert.equal(counts.implemented,full.length);
    assert.equal(counts.default_exposed,defaults.length);
    assert.equal(counts.read_only_exposed,reads.length);
    assert.deepEqual([...counts.optional_ui_mutations].sort(),full.filter(t=>!enabled.registry.tools.has(t.name)).map(t=>t.name).sort());
    assert.equal(new Set(full.map(x=>x.name)).size,full.length);
    assert.ok(full.some(x=>x.name==='data_get_cross_chart_sync_qa'&&x.annotations.readOnlyHint===true));
    assert.ok(counts.implemented>=counts.default_exposed);
    assert.ok(counts.default_exposed>=counts.read_only_exposed);
  }finally{
    await all.browser.close();await enabled.browser.close();await readonly.browser.close();
  }
});

test('generated full TOOL and FEATURES catalogues contain complete source registrations',async()=>{
  const all=buildRuntime({readonly:false,genericUi:true});
  try{
    const names=all.registry.list().map(x=>x.name).sort();
    const doc=await readJson('docs/TOOLS.json');
    assert.deepEqual(doc.map(x=>x.name),names);
    const features=await readFile('docs/FEATURES.md','utf8');
    assert.ok(features.includes(`Total implemented tools: **${names.length}**.`));
    assert.ok(features.includes('`data_get_cross_chart_sync_qa`'));
  }finally{await all.browser.close();}
});
