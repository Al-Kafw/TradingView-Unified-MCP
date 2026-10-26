import {
  mkdir, lstat, readFile, writeFile, unlink, rmdir
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const QA_LOCK_NAME = 'es-qa-replay-AIibRZIx.lock';

const defaultRoot = () => join(
  homedir(), '.tradingview-unified-mcp', 'locks'
);

/*
 * Exclusive, filesystem-backed lock for participating QA runners.
 * Never steals or automatically removes an existing lock.
 */
export async function withQaReplayProcessLock(
  operation,
  { lockRoot = defaultRoot() } = {}
) {
  if (
    typeof operation !== 'function' ||
    typeof lockRoot !== 'string' ||
    !isAbsolute(lockRoot)
  ) throw Error('QA_CANARY_LOCK_CONFIGURATION_INVALID');

  await mkdir(lockRoot, { recursive: true, mode: 0o700 });

  const rootStat = await lstat(lockRoot);

  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    (rootStat.mode & 0o022) !== 0
  ) throw Error('QA_CANARY_LOCK_DIRECTORY_UNSAFE');

  const lockDir = join(lockRoot, QA_LOCK_NAME);
  const ownerPath = join(lockDir, 'owner.json');

  try {
    await mkdir(lockDir, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST')
      throw Error('QA_CANARY_LOCK_HELD');

    throw error;
  }

  const token = randomUUID();
  const owner = JSON.stringify({
    token,
    pid: process.pid,
    acquired_at: new Date().toISOString()
  });

  const identity = await lstat(lockDir);

  try {
    await writeFile(ownerPath, owner, {
      flag: 'wx',
      mode: 0o600
    });
  } catch (error) {
    // Only remove the directory we just created, if empty.
    try {
      const current = await lstat(lockDir);
      if (
        current.dev === identity.dev &&
        current.ino === identity.ino
      ) await rmdir(lockDir);
    } catch {
      // Leave uncertain state for manual reconciliation.
    }
    throw error;
  }

  try {
    return await operation();
  } finally {
    /*
     * Never release a replacement or another process's lock.
     * Failure here deliberately leaves a lock requiring review.
     */
    const current = await lstat(lockDir);
    const ownerStat = await lstat(ownerPath);
    const content = await readFile(ownerPath, 'utf8');

    if (
      current.dev !== identity.dev ||
      current.ino !== identity.ino ||
      !current.isDirectory() ||
      !ownerStat.isFile() ||
      ownerStat.isSymbolicLink() ||
      content !== owner
    ) throw Error('QA_CANARY_LOCK_RELEASE_UNSAFE');

    await unlink(ownerPath);
    await rmdir(lockDir);
  }
}
