import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourceHash, sourceLineEndingInfo, pineRead, pineLibraryRead } from '../src/features/pine.mjs';

const lf='//@version=6\nindicator("QA", overlay=true)\nplot(close)\n';
const crlf=lf.replaceAll('\n','\r\n');

test('CRLF and LF have distinct exact SHA but matching LF-normalized SHA',()=>{
  assert.notEqual(sourceHash(lf),sourceHash(crlf));
  assert.equal(sourceLineEndingInfo(lf).source_sha256_lf_normalized,sourceLineEndingInfo(crlf).source_sha256_lf_normalized);
  assert.equal(sourceLineEndingInfo(lf).source_line_endings,'lf');
  assert.equal(sourceLineEndingInfo(crlf).source_line_endings,'crlf');
});

test('different Pine program remains different after LF normalization',()=>{
  const changed=crlf.replace('plot(close)','plot(open)');
  assert.notEqual(sourceLineEndingInfo(lf).source_sha256_lf_normalized,sourceLineEndingInfo(changed).source_sha256_lf_normalized);
});

test('mixed CRLF/LF is reported and only CRLF pairs are normalized',()=>{
  const mixed='one\r\ntwo\nthree\r\n';
  assert.equal(sourceLineEndingInfo(mixed).source_line_endings,'mixed');
  assert.equal(sourceLineEndingInfo(mixed).source_sha256_lf_normalized,sourceHash('one\ntwo\nthree\n'));
});

test('unpaired carriage returns remain significant, not silently normalized',()=>{
  assert.equal(sourceLineEndingInfo('one\rtwo').source_line_endings,'cr');
  assert.notEqual(sourceLineEndingInfo('one\rtwo').source_sha256_lf_normalized,sourceLineEndingInfo('one\ntwo').source_sha256_lf_normalized);
  assert.equal(sourceLineEndingInfo('unchanged').source_line_endings,'none');
});

test('Pine visible-editor and saved-library reads expose additive metadata without changing raw source hash',async()=>{
  for(const [reader,source,ending] of [[pineRead,lf,'lf'],[pineLibraryRead,crlf,'crlf']]){
    const ctx={callPage:async()=>({ok:true,source})};
    const result=await reader('dummy',{},ctx);
    assert.equal(result.source,source);
    assert.equal(result.source_sha256,sourceHash(source));
    assert.equal(result.source_sha256_lf_normalized,sourceHash(lf));
    assert.equal(result.source_line_endings,ending);
  }
});

test('strict source-hash mutation guards still require exact hashes',async()=>{
  const code=await readFile(new URL('../src/features/pine.mjs',import.meta.url),'utf8');
  assert.match(code,/before\.source_sha256!==args\.expected_source_sha256/);
  assert.match(code,/before\.source_sha256!==args\.expected_saved_source_sha256/);
  assert.doesNotMatch(code,/before\.source_sha256_lf_normalized\s*!==/);
});
