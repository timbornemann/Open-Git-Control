import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { streamJsonlLines } from './boundedJsonl';
import { validatePreview } from './previewCache';
import { STORAGE_BUDGETS, type MaintenanceRequest } from '../../src/shared/ipc/storageMaintenance';
import type { StorageFile } from './storageCatalogue';
import type { MaintenanceState } from './maintenanceState';
import { DAY } from './maintenanceState';
import { readStorageJson, assertManagedPath } from './storageSafety';
import { isStorageBusy } from './managedStorage';
import { isAnalyticsSnapshot } from '../analytics/analyticsSnapshotFormat';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { isLfsInventoryDocument, LFS_INVENTORY_DIRECTORY } from '../git/GitLfsInventoryFormat';

export async function recognizedCache(root: string, file: StorageFile): Promise<boolean> {
  assertManagedPath(root, file.file);
  if (file.category === 'statistics' || (file.category === 'analytics' && file.relative.endsWith('.jsonl'))) {
    for await (const line of streamJsonlLines(file.file)) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > 8 * 1024 ** 2) return false;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      if (file.category === 'statistics' ? entry.schema !== 2 : !['commit', 'blob', 'blame', 'classified'].includes(entry.type) || 'version' in entry)
        return false;
    }
    return true;
  }
  const value = readStorageJson(root, file.file) as Record<string, unknown>;
  if (!value || typeof value !== 'object') return false;
  if (file.relative.startsWith(`${LFS_INVENTORY_DIRECTORY}/`)) return isLfsInventoryDocument(value) && path.basename(file.file, '.json') === value.namespace;
  if (file.category === 'previews')
    return validatePreview(value) && path.basename(file.file, '.json') === createHash('sha256').update(JSON.stringify(value.key)).digest('hex');
  if (file.relative.startsWith('repository-icons/'))
    return (
      value.version === 1 &&
      typeof value.repoPath === 'string' &&
      path.isAbsolute(value.repoPath) &&
      path.basename(file.file, '.json') ===
        createHash('sha256')
          .update(process.platform === 'win32' ? path.resolve(value.repoPath).toLowerCase() : path.resolve(value.repoPath))
          .digest('hex') &&
      ['auto', 'manual', 'initials'].includes(String(value.mode))
    );
  if (file.category === 'auxiliary')
    return (
      (value.version === 1 && Array.isArray(value.publicItems)) ||
      (file.relative === 'github-catalog.json' && !('version' in value) && Array.isArray(value.publicRepos))
    );
  return (
    file.category === 'analytics' &&
    isAnalyticsSnapshot(value) &&
    path.isAbsolute(value.repoPath) &&
    file.relative.split('/')[2] === createHash('sha256').update(repositoryPathKey(value.repoPath)).digest('hex')
  );
}

export function selectedCategory(request: MaintenanceRequest, category: string): boolean {
  return !request.categories || request.categories.includes(category as never);
}
export function cacheCandidates(files: StorageFile[], state: MaintenanceState, now: number, request?: MaintenanceRequest): StorageFile[] {
  const result = new Set<StorageFile>();
  for (const category of ['previews', 'analytics', 'statistics', 'auxiliary'] as const) {
    if (request && !selectedCategory(request, category)) continue;
    const entries = files
      .filter((file) => file.category === category && (file.managed || file.relative.startsWith('repository-icons/')))
      .sort((a, b) => (state.usage[a.relative] ?? now) - (state.usage[b.relative] ?? now));
    let bytes = files.filter((file) => file.category === category).reduce((sum, file) => sum + file.bytes, 0);
    const perRepository = new Map<string, number>();
    for (const file of entries) {
      const owner = file.relative.split('/')[2];
      perRepository.set(owner, (perRepository.get(owner) || 0) + file.bytes);
    }
    for (const file of entries) {
      const owner = file.relative.split('/')[2];
      if (
        state.invalidated.includes(file.relative) ||
        request?.mode === 'all-caches' ||
        now - (state.usage[file.relative] ?? now) >= 30 * DAY ||
        bytes > STORAGE_BUDGETS[category] ||
        (category === 'analytics' && perRepository.get(owner)! > STORAGE_BUDGETS.analytics / 2)
      ) {
        result.add(file);
        bytes -= file.bytes;
        perRepository.set(owner, perRepository.get(owner)! - file.bytes);
      }
    }
  }
  return [...result];
}

/** Only empty, recognized cache directories can be pruned, never repository folders. */
export function removeEmptyCacheDirectories(root: string): void {
  for (const name of ['preview-cache-v1', 'repository-analytics/v1', 'hosting-catalogs', 'repository-icons', LFS_INVENTORY_DIRECTORY]) {
    const directory = path.join(root, name);
    const visit = (current: string) => {
      if (isStorageBusy(current)) return;
      assertManagedPath(root, current);
      if (!fs.existsSync(current)) return;
      for (const entry of fs.readdirSync(current, { withFileTypes: true }))
        if (entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name)) visit(path.join(current, entry.name));
      if (current !== directory && fs.readdirSync(current).length === 0) fs.rmdirSync(current);
    };
    visit(directory);
  }
}
