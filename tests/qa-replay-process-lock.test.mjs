import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mkdtemp, mkdir, readFile, writeFile, rm, stat
} from 'node:fs/promises';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  withQaReplayProcessLock,
  QA_LOCK_NAME
} from '../src/core/qa-replay-process-lock.mjs';

async function fixture() {
  const root = await mkdtemp(
    join(tmpdir(), 'tv-qa-process-lock-')
  );

  return {
    root,
    lockDir: join(root, QA_LOCK_NAME),
    close: () => rm(root, {
      recursive: true,
      force: true
    })
  };
}

test('lock is released after successful operation', async () => {
  const f = await fixture();

  try {
    const result = await withQaReplayProcessLock(
      async () => {
        const owner = JSON.parse(await readFile(
          join(f.lockDir, 'owner.json'), 'utf8'
        ));

        assert.equal(owner.pid, process.pid);
        assert.equal(typeof owner.token, 'string');
        return 'VERIFIED';
      },
      { lockRoot: f.root }
    );

    assert.equal(result, 'VERIFIED');

    await assert.rejects(
      stat(f.lockDir),
      e => e.code === 'ENOENT'
    );
  } finally {
    await f.close();
  }
});

test('overlapping runners cannot acquire same lock', async () => {
  const f = await fixture();

  let release;
  let entered;

  const gate = new Promise(resolve => {
    release = resolve;
  });

  const ready = new Promise(resolve => {
    entered = resolve;
  });

  try {
    const first = withQaReplayProcessLock(
      async () => {
        entered();
        await gate;
        return 'FIRST_COMPLETED';
      },
      { lockRoot: f.root }
    );

    await ready;

    await assert.rejects(
      withQaReplayProcessLock(
        async () => 'SHOULD_NOT_RUN',
        { lockRoot: f.root }
      ),
      /QA_CANARY_LOCK_HELD/
    );

    release();

    assert.equal(await first, 'FIRST_COMPLETED');

    const third = await withQaReplayProcessLock(
      async () => 'REACQUIRED',
      { lockRoot: f.root }
    );

    assert.equal(third, 'REACQUIRED');
  } finally {
    release();
    await f.close();
  }
});

test('operation failure still releases owned lock', async () => {
  const f = await fixture();

  try {
    await assert.rejects(
      withQaReplayProcessLock(
        async () => {
          throw Error('SIMULATED_REPLAY_FAILURE');
        },
        { lockRoot: f.root }
      ),
      /SIMULATED_REPLAY_FAILURE/
    );

    const result = await withQaReplayProcessLock(
      async () => 'REACQUIRED_AFTER_FAILURE',
      { lockRoot: f.root }
    );

    assert.equal(result, 'REACQUIRED_AFTER_FAILURE');
  } finally {
    await f.close();
  }
});

test('stale lock is never automatically reclaimed', async () => {
  const f = await fixture();

  try {
    await mkdir(f.lockDir);

    let executed = false;

    await assert.rejects(
      withQaReplayProcessLock(
        async () => {
          executed = true;
        },
        { lockRoot: f.root }
      ),
      /QA_CANARY_LOCK_HELD/
    );

    assert.equal(executed, false);
    assert.equal((await stat(f.lockDir)).isDirectory(), true);
  } finally {
    await f.close();
  }
});

test('tampered lock ownership prevents unsafe release', async () => {
  const f = await fixture();

  try {
    await assert.rejects(
      withQaReplayProcessLock(
        async () => {
          await writeFile(
            join(f.lockDir, 'owner.json'),
            '{"token":"REPLACED"}'
          );
        },
        { lockRoot: f.root }
      ),
      /QA_CANARY_LOCK_RELEASE_UNSAFE/
    );

    assert.equal((await stat(f.lockDir)).isDirectory(), true);
  } finally {
    await f.close();
  }
});
