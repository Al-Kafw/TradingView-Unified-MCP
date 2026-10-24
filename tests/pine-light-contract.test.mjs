import test from 'node:test';
import assert from 'node:assert/strict';
import { pinePage } from '../src/features/pine.mjs';

const SOURCE = '//@version=6\nindicator("MCP QA")\nplot(close)';

async function probe(t, payload) {
  let calls = 0;

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.match(url, /pine-facade\/translate_light/);
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('source'), SOURCE);

    return {
      ok: true,
      json: async () => structuredClone(payload)
    };
  });

  const result = await pinePage({ op: 'check', source: SOURCE });
  assert.equal(calls, 1);
  return result;
}

test('recognised light response is accepted, not editor-compiled', async t => {
  const r = await probe(t, {
    success: true,
    result: { functions2: [], types: [], enums: [] }
  });

  assert.equal(r.ok, true);
  assert.equal(r.status, 'light_check_accepted');
  assert.equal(r.compiled, false);
  assert.equal(r.editor_compiled, false);
  assert.deepEqual(r.errors, []);
});

test('real structured syntax diagnostics are preserved', async t => {
  const r = await probe(t, {
    success: false,
    result: {
      errors2: [{
        message: 'Syntax error: Missing closing parenthesis',
        start: { line: 3, column: 5 },
        end: { line: 3, column: 5 }
      }]
    }
  });

  assert.equal(r.ok, true);
  assert.equal(r.status, 'diagnostics_failed');
  assert.equal(r.compiled, false);
  assert.equal(r.errors[0].line, 3);
  assert.equal(r.errors[0].column, 5);
});

test('malformed light response remains unverified', async t => {
  const r = await probe(t, {
    success: true,
    result: { functions2: [], types: 'invalid', enums: [] }
  });

  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPILE_OUTCOME_UNVERIFIED');
});

test('contradictory output cannot pass', async t => {
  const r = await probe(t, {
    success: true,
    result: {
      ilTemplate: 'claimed-output',
      errors2: [{ message: 'Syntax error' }]
    }
  });

  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPILE_OUTCOME_UNVERIFIED');
});

test('missing success acknowledgement cannot pass', async t => {
  const r = await probe(t, {
    result: { functions2: [], types: [], enums: [] }
  });

  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPILE_OUTCOME_UNVERIFIED');
});

test('explicit service rejection cannot pass despite IL output', async t => {
  const r = await probe(t, {
    success: false,
    result: { ilTemplate: 'claimed-output' }
  });

  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPILE_OUTCOME_UNVERIFIED');
});


test('success true with errors is contradictory', async t => {
  const r = await probe(t, {
    success: true,
    result: { errors2: [{ message: 'Syntax error' }] }
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPILE_OUTCOME_UNVERIFIED');
});

test('success false without diagnostics is unverified', async t => {
  const r = await probe(t, {
    success: false,
    result: { errors2: [] }
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPILE_OUTCOME_UNVERIFIED');
});

test('success false with malformed diagnostics is unverified', async t => {
  const r = await probe(t, {
    success: false,
    result: { errors2: [{ unexpected: 'missing message' }] }
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'COMPILE_OUTCOME_UNVERIFIED');
});
