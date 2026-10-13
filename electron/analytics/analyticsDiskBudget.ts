import * as fs from 'node:fs';
import * as path from 'node:path';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { assertManagedPath, assertManagedPathAsync } from '../main-process/storageSafety';

export function directoryBytes(root: string): number {
  if (!fs.existsSync(root)) return 0;
  assertManagedPath(root, root);
  let bytes = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile()) bytes += fs.statSync(file).size;
    }
  }
  return bytes;
}

export async function directoryBytesAsync(root: string): Promise<number> {
  await assertManagedPathAsync(root, root);
  let bytes = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await assertManagedPathAsync(root, file);
        pending.push(file);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.lstat(file);
          if (stat.isFile() && !stat.isSymbolicLink()) bytes += stat.size;
        } catch (error) {
          // Browser caches may evict files while their storage is counted.
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
  return bytes;
}

export async function canPersistAnalytics(root: string, file: string, bytes: number, replace = false): Promise<boolean> {
  await assertManagedPathAsync(root, file);
  const repositoryDirectory = path.join(root, 'v1', path.relative(path.join(root, 'v1'), file).split(path.sep)[0]);
  let prior = 0;
  if (replace) {
    try {
      prior = (await fs.promises.stat(file)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return (
    (await directoryBytesAsync(repositoryDirectory)) - prior + bytes <= STORAGE_BUDGETS.analytics / 2 &&
    (await directoryBytesAsync(root)) - prior + bytes <= STORAGE_BUDGETS.analytics
  );
}
