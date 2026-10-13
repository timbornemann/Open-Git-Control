import * as fs from 'node:fs';
import * as path from 'node:path';
import { directoryBytesAsync } from '../analytics/analyticsDiskBudget';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { assertManagedPathAsync } from './storageSafety';

export async function canPersistAuxiliary(root: string, file: string, bytes: number): Promise<boolean> {
  await assertManagedPathAsync(root, file);
  const size = async (target: string) => {
    try {
      return (await fs.promises.stat(target)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }
  };
  const prior = await size(file);
  let total = 0;
  for (const name of ['repository-icons', 'hosting-catalogs', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache'])
    total += await directoryBytesAsync(path.join(root, name));
  const legacy = path.join(root, 'github-catalog.json');
  await assertManagedPathAsync(root, legacy);
  total += await size(legacy);
  return total - prior + bytes <= STORAGE_BUDGETS.auxiliary;
}

const pending = new Map<string, Promise<void>>();
/** All auxiliary writers share the quota; serialize the check and publication. */
export function serializeAuxiliaryWrite(root: string, work: () => Promise<void>): Promise<void> {
  const resolved = path.resolve(root);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const next = (pending.get(key) ?? Promise.resolve()).then(work);
  const completed = next.catch(() => undefined);
  pending.set(key, completed);
  void completed.then(() => {
    if (pending.get(key) === completed) pending.delete(key);
  });
  return next;
}
