import * as fs from 'node:fs';
import * as path from 'node:path';
import { directoryBytes } from '../analytics/analyticsDiskBudget';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { assertManagedPath } from './storageSafety';

export function canPersistAuxiliary(root: string, file: string, bytes: number): boolean {
  assertManagedPath(root, file);
  const prior = fs.existsSync(file) ? fs.statSync(file).size : 0;
  let total = 0;
  for (const name of ['repository-icons', 'hosting-catalogs', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache'])
    total += directoryBytes(path.join(root, name));
  const legacy = path.join(root, 'github-catalog.json');
  assertManagedPath(root, legacy);
  if (fs.existsSync(legacy)) total += fs.statSync(legacy).size;
  return total - prior + bytes <= STORAGE_BUDGETS.auxiliary;
}
