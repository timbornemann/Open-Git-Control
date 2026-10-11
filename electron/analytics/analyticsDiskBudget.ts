import * as fs from 'node:fs';
import * as path from 'node:path';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { assertManagedPath } from '../main-process/storageSafety';

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

export function canPersistAnalytics(root: string, file: string, bytes: number, replace = false): boolean {
  assertManagedPath(root, file);
  const repositoryDirectory = path.join(root, 'v1', path.relative(path.join(root, 'v1'), file).split(path.sep)[0]);
  const prior = replace && fs.existsSync(file) ? fs.statSync(file).size : 0;
  return (
    directoryBytes(repositoryDirectory) - prior + bytes <= STORAGE_BUDGETS.analytics / 2 && directoryBytes(root) - prior + bytes <= STORAGE_BUDGETS.analytics
  );
}
