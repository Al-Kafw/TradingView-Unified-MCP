
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = `
import { buildRuntime } from './src/runtime.mjs';
import { ToolRegistry } from './src/core/registry.mjs';

const runtime = buildRuntime();
const direct = new ToolRegistry();

direct.add({
  name: 'fixture_write',
  mutates: true,
  handler: async () => ({ ok: true })
});

let blocked = false;
try {
  direct.get('fixture_write');
} catch (error) {
  blocked = error.code === 'UNKNOWN_TOOL';
}

process.stdout.write(JSON.stringify({
  runtime_readonly: runtime.registry.readonly,
  direct_readonly: direct.readonly,
  direct_write_blocked: blocked,
  pine_write_visible: runtime.registry.list()
    .some(tool => tool.name === 'pine_save_next')
}));
`;

function inspect(overrides) {
  const env = { ...process.env };
  delete env.TV_READONLY;
  delete env.TV_ENABLE_WRITES;
  Object.assign(env, overrides);

  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: process.cwd(), env, encoding: 'utf8', timeout: 15000 }
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const [name, env, writable] of [
  ['default environment', {}, false],
  ['readonly disabled alone', { TV_READONLY: '0' }, false],
  ['write opt-in alone', { TV_ENABLE_WRITES: '1' }, false],
  ['both explicit opt-ins', {
    TV_READONLY: '0',
    TV_ENABLE_WRITES: '1'
  }, true],
  ['explicit readonly overrides opt-in', {
    TV_READONLY: '1',
    TV_ENABLE_WRITES: '1'
  }, false]
]) {
  test(name, () => {
    assert.deepEqual(inspect(env), {
      runtime_readonly: !writable,
      direct_readonly: !writable,
      direct_write_blocked: !writable,
      pine_write_visible: writable
    });
  });
}
