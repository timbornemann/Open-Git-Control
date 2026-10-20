import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { StorageCategory, StorageIssue } from '../../src/shared/ipc/storageMaintenance';
import { assertManagedPath } from './storageSafety';

export interface StorageFile {
  file: string;
  relative: string;
  category: StorageCategory;
  bytes: number;
  mtimeMs: number;
  managed: boolean;
}
export interface StorageAdapter {
  name: string;
  category: StorageCategory;
  disposable: boolean;
  matches: (relative: string) => boolean;
}
/** Every persisted area must declare its ownership and retention here. */
export const STORAGE_ADAPTERS: readonly StorageAdapter[] = [
  { name: 'branch-cleanup-protection', category: 'protected', disposable: false, matches: (p) => p === 'branch-cleanup.json' },
  // Kept available offline; the notes synchronizer owns retention and pruning.
  { name: 'user-notes', category: 'auxiliary', disposable: false, matches: (p) => p === 'user-notes-v1.json' },
  { name: 'user-notes-acknowledgements', category: 'metadata', disposable: false, matches: (p) => p === 'user-notes-acknowledgements-v1.json' },
  { name: 'previews', category: 'previews', disposable: true, matches: (p) => /^preview-cache-v1\/[a-f0-9]{64}\.json$/.test(p) },
  {
    name: 'analytics',
    category: 'analytics',
    disposable: true,
    matches: (p) => /^repository-analytics\/v1\/[a-f0-9]{64}\/(snapshot\.json|[a-f0-9]{64}\/records\.jsonl)$/.test(p),
  },
  { name: 'statistics', category: 'statistics', disposable: true, matches: (p) => p === 'commit-stats-v1.jsonl' },
  { name: 'lfs-inventory', category: 'auxiliary', disposable: true, matches: (p) => /^lfs-inventory-v1\/[a-f0-9]{64}\.json$/.test(p) },
  { name: 'icons', category: 'auxiliary', disposable: false, matches: (p) => /^repository-icons\/[a-f0-9]{64}\.json$/.test(p) },
  {
    name: 'catalogs',
    category: 'auxiliary',
    disposable: true,
    matches: (p) => /^hosting-catalogs\/[a-f0-9]{64}\.json$/.test(p) || p === 'github-catalog.json',
  },
  { name: 'http', category: 'http', disposable: false, matches: (p) => p.startsWith('Cache/') },
  { name: 'code', category: 'code', disposable: false, matches: (p) => p.startsWith('Code Cache/') || p.startsWith('development-code-cache/') },
  { name: 'graphics', category: 'auxiliary', disposable: false, matches: (p) => /^(GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache)\//.test(p) },
  { name: 'code-maintenance-context', category: 'protected', disposable: false, matches: (p) => p.startsWith('Partitions/ogc-inactive-code-maintenance/') },
  { name: 'inactive-http', category: 'http', disposable: false, matches: (p) => p.startsWith('browser-cache-maintenance/Cache/') },
  { name: 'http-maintenance-context', category: 'protected', disposable: false, matches: (p) => p.startsWith('browser-cache-maintenance/') },
  {
    name: 'metadata',
    category: 'metadata',
    disposable: false,
    matches: (p) => /^(repos|repository-remotes|repository-ui-state|run-approvals|repository-publications|secret-scan-allowlist-migration)\.json$/.test(p),
  },
  {
    name: 'user-data',
    category: 'protected',
    disposable: false,
    matches: (p) =>
      /^(settings\.json|project-planner\.json|window-state-v1\.json|hosting-connections\.json|hosting-credentials\.json|.*\.bin|storage-maintenance-v1\.json|storage-usage-v1\.json|startup(?:\.previous)?\.log|Local State|Preferences|\.updaterId|lockfile)$/.test(
        p,
      ) || /^(Local Storage|Session Storage|IndexedDB|Network|WebStorage|Service Worker|SharedStorage|Shared Dictionary|blob_storage)\//.test(p),
  },
];

export async function inventoryStorage(root: string, issues: StorageIssue[]): Promise<StorageFile[]> {
  const files: StorageFile[] = [];
  const directories = [root];
  while (directories.length) {
    const directory = directories.shift()!;
    try {
      assertManagedPath(root, directory);
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const file = path.join(directory, entry.name);
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (entry.isSymbolicLink()) {
          issues.push({ category: 'unknown', path: relative, reason: 'redirected-path' });
          continue;
        }
        assertManagedPath(root, file);
        if (entry.isDirectory()) {
          directories.push(file);
          continue;
        }
        const stat = await fs.lstat(file);
        if (!stat.isFile()) continue;
        const adapter = STORAGE_ADAPTERS.find((candidate) => candidate.matches(relative));
        files.push({
          file,
          relative,
          category: adapter?.category || 'unknown',
          bytes: stat.size,
          mtimeMs: stat.mtimeMs,
          managed: adapter?.disposable || false,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        issues.push({ category: 'unknown', path: path.relative(root, directory), reason: 'inventory-failed' });
    }
  }
  return files;
}
