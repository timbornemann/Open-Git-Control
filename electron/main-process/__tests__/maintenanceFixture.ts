import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { StorageMaintenanceService, DAY } from '../StorageMaintenanceService';
import type { StoredData } from '../repoStore';
import type { RepositoryHealth } from '../../../src/shared/ipc/storageMaintenance';
import { repositoryPathKey } from '../activeRepositoryAuthorization';

export function maintenanceFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-maintenance-test-'));
  const root = path.join(directory, 'profile'),
    repo = path.join(directory, 'repository');
  fs.mkdirSync(root);
  let now = Date.UTC(2026, 0, 1),
    health: RepositoryHealth = 'missing',
    busy = false;
  let data: StoredData = { repos: [{ path: repo, pinned: true, createdAt: 11, lastOpened: 23 }], activeRepo: null, sortBy: 'nameAsc', revision: 1 };
  const probe = vi.fn(async () => health);
  const deps = {
    root,
    readRepos: () => structuredClone(data),
    writeRepos: (next: StoredData) => {
      service.beforeRegistryChange(data, next);
      data = structuredClone({ ...next, revision: (data.revision || 0) + 1 });
    },
    probe,
    isRepoBusy: () => busy,
    now: () => now,
  };
  let service = new StorageMaintenanceService(deps);
  const file = (relative: string, content: string | object) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
    return target;
  };
  return {
    directory,
    root,
    repo,
    probe,
    file,
    deps,
    get service() {
      return service;
    },
    get data() {
      return data;
    },
    set data(value: StoredData) {
      data = value;
    },
    get now() {
      return now;
    },
    advance: (days: number) => {
      now += days * DAY;
    },
    health: (value: RepositoryHealth) => {
      health = value;
    },
    busy: (value: boolean) => {
      busy = value;
    },
    restart: () => {
      service.dispose();
      service = new StorageMaintenanceService(deps);
    },
    remove: () => deps.writeRepos({ ...data, repos: [], activeRepo: null }),
    preview: () => {
      const value = {
        version: 1,
        key: ['resource', 'git', repositoryPathKey(repo), 'getCommitLogPage'],
        savedAt: now,
        sourceRevision: 'head',
        complete: true,
        data: { success: true, data: { raw: 'history', hasMore: false } },
      };
      return file(`preview-cache-v1/${createHash('sha256').update(JSON.stringify(value.key)).digest('hex')}.json`, value);
    },
    dispose: () => {
      service.dispose();
      if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith('ogc-maintenance-test-')) throw new Error('Unsafe fixture cleanup');
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
