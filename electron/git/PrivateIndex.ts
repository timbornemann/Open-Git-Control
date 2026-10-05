import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { CommitEditGit } from './CommitEditGit';
import { createPrivateTempDir, cleanupPrivateTempDir } from './PrivateTempFiles';

export function acquireRealIndexLock(indexLockPath: string): void {
  fs.mkdirSync(path.dirname(indexLockPath), { recursive: true });
  const descriptor = fs.openSync(indexLockPath, 'wx', 0o600);
  fs.closeSync(descriptor);
}

/** Copy the actual worktree index under its lock; publish only after validation. */
export async function withPrivateIndex<T>(
  git: CommitEditGit,
  repoPath: string,
  work: (indexPath: string, publish: (validate: () => Promise<void>) => Promise<void>) => Promise<T>,
): Promise<T> {
  const actualIndex = path.resolve(repoPath, (await git.run(repoPath, ['rev-parse', '--git-path', 'index'])).trim());
  const lock = `${actualIndex}.lock`;
  try {
    acquireRealIndexLock(lock);
  } catch (error) {
    throw new Error(`The Git index is busy. Close the other Git operation and try again. ${error instanceof Error ? error.message : String(error)}`);
  }
  let tempDir: string | null = null;
  let ownsLock = true;
  try {
    tempDir = createPrivateTempDir('ogc-file-index');
    const index = path.join(tempDir, 'index');
    const original = fs.readFileSync(actualIndex);
    const fingerprint = createHash('sha256').update(original).digest('hex');
    const mode = fs.statSync(actualIndex).mode & 0o777;
    fs.writeFileSync(index, original, { mode: 0o600 });
    // Split-index links are relative to the real Git directory. Materialize a
    // full private index before moving it out of that directory.
    await git.run(repoPath, ['update-index', '--no-split-index'], { envOverrides: { GIT_INDEX_FILE: index } });
    return await work(index, async (validate) => {
      await validate();
      if (createHash('sha256').update(fs.readFileSync(actualIndex)).digest('hex') !== fingerprint)
        throw new Error('The Git index changed outside the lock. Your draft was kept.');
      fs.copyFileSync(index, lock);
      fs.chmodSync(lock, mode);
      const descriptor = fs.openSync(lock, 'r+');
      try {
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(lock, actualIndex);
      ownsLock = false;
    });
  } finally {
    if (ownsLock) fs.rmSync(lock, { force: true });
    cleanupPrivateTempDir(tempDir);
  }
}
