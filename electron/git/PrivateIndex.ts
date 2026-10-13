import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommitEditGit } from './CommitEditGit';
import { createPrivateTempDir, cleanupPrivateTempDirAsync } from './PrivateTempFiles';
import { copyIndexIfPresent, indexFileHash, syncIndexFile } from './IndexFileIO';

export async function acquireRealIndexLock(indexLockPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(indexLockPath), { recursive: true });
  const handle = await fs.promises.open(indexLockPath, 'wx', 0o600);
  await handle.close();
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
    await acquireRealIndexLock(lock);
  } catch (error) {
    throw new Error(`The Git index is busy. Close the other Git operation and try again. ${error instanceof Error ? error.message : String(error)}`);
  }
  let tempDir: string | null = null;
  let ownsLock = true;
  try {
    tempDir = createPrivateTempDir('ogc-file-index');
    const index = path.join(tempDir, 'index');
    const original = await copyIndexIfPresent(actualIndex, index);
    const fingerprint = original ? await indexFileHash(index) : null;
    const mode = original ? original.mode & 0o777 : 0o644;
    if (original) await fs.promises.chmod(index, 0o600);
    else await git.run(repoPath, ['read-tree', '--empty'], { envOverrides: { GIT_INDEX_FILE: index } });
    // Split-index links are relative to the real Git directory. Materialize a
    // full private index before moving it out of that directory.
    await git.run(repoPath, ['update-index', '--no-split-index'], { envOverrides: { GIT_INDEX_FILE: index } });
    return await work(index, async (validate) => {
      await validate();
      await fs.promises.copyFile(index, lock);
      await fs.promises.chmod(lock, mode);
      await syncIndexFile(lock);
      // Preparation can take time on a large index. Validate again after I/O,
      // retaining the lock and checking for foreign changes before promotion.
      await validate();
      const current = await indexFileHash(actualIndex);
      if (current !== fingerprint) throw new Error('The Git index changed outside the lock. Your draft was kept.');
      git.signal?.throwIfAborted();
      await fs.promises.rename(lock, actualIndex);
      ownsLock = false;
    });
  } finally {
    if (ownsLock) await fs.promises.rm(lock, { force: true });
    await cleanupPrivateTempDirAsync(tempDir);
  }
}
