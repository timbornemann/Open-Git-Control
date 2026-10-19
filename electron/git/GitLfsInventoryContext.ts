import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GitRunOptions } from './GitProcessTypes';
import { readRepositoryFileBytes } from './RepositoryFileRead';
import { lfsInventoryHash } from './GitLfsInventoryFormat';

/** Pointer contents describe objects actually sent by push, never replacement objects or text filters. */
export function lfsInventoryOptions(options: GitRunOptions): GitRunOptions {
  return { ...options, envOverrides: { ...options.envOverrides, GIT_NO_REPLACE_OBJECTS: '1' } };
}
export async function lfsHistoryContext(common: string | null, options: GitRunOptions): Promise<string | undefined> {
  if (!common) return;
  const environment = Object.fromEntries(
    Object.entries({ ...process.env, ...options.envOverrides })
      // A complete local inventory is identical with or without permission to
      // lazily fetch. Missing objects never publish a snapshot. Excluding this
      // transport flag lets offline idle preparation serve a foreground push.
      .filter(([key]) => key.toUpperCase().startsWith('GIT_') && key.toUpperCase() !== 'GIT_NO_LAZY_FETCH')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  // Redirected Git directories or custom boundary files are scanned afresh;
  // they must not borrow snapshots from the worktree's normal common directory.
  if (
    Object.entries(environment).some(([key, value]) => value && ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_SHALLOW_FILE', 'GIT_GRAFT_FILE'].includes(key.toUpperCase()))
  )
    return;
  const read = async (file: string) => {
    try {
      return (await readRepositoryFileBytes(file, 1024 * 1024)).data.toString('utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  };
  try {
    const stat = await fs.stat(common);
    const boundaries = await Promise.all(['shallow', 'info/grafts'].map((name) => read(path.join(common, name))));
    options.signal?.throwIfAborted();
    return lfsInventoryHash([stat.dev, stat.ino, stat.birthtimeMs, environment, boundaries]);
  } catch {
    options.signal?.throwIfAborted();
    return undefined;
  }
}
