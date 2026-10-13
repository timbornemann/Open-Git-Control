import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { HostedRepository, HostingConnection } from '../../../src/types/hostingDtos';
import { STORAGE_BUDGETS } from '../../../src/shared/ipc/storageMaintenance';
const profile = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => profile.root }, safeStorage: {} }));
vi.mock('../secureStore', () => ({ isSecureStorageAvailable: () => false }));
import { saveGithubCatalogCache, clearGithubCatalogCache, readGithubCatalogCache } from '../githubCatalogCache';
import { HostingCatalogStore } from '../../hosting/HostingCatalogStore';

let root: string;
const connection = { id: 'account', userId: '42', username: 'alice' } as HostingConnection;
const hostingFile = () => path.join(root, 'hosting-catalogs', `${createHash('sha256').update(connection.id).digest('hex')}.json`);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-auxiliary-writes-'));
  profile.root = root;
  fs.mkdirSync(path.join(root, 'GPUCache'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await clearGithubCatalogCache();
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-auxiliary-writes-'))
    throw new Error('Unsafe fixture');
  fs.rmSync(root, { recursive: true, force: true });
});
function holdQuotaScan() {
  const readdir = fs.promises.readdir;
  let release!: () => void;
  let reached = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: Parameters<typeof readdir>) => {
    if (String(args[0]) === path.join(root, 'GPUCache') && !reached) {
      reached = true;
      await held;
    }
    return readdir(...args);
  });
  return { release, reached: () => reached };
}

describe('auxiliary cache publication', () => {
  it('does not resurrect a GitHub catalogue when logout occurs during its quota scan', async () => {
    const scan = holdQuotaScan();
    const saving = saveGithubCatalogCache('github.com', 'alice', []);
    await vi.waitFor(() => expect(scan.reached()).toBe(true));
    const clearing = clearGithubCatalogCache();
    scan.release();
    await Promise.allSettled([saving, clearing]);
    expect(fs.existsSync(path.join(root, 'github-catalog.json'))).toBe(false);
    expect(readGithubCatalogCache('github.com', 'alice')).toBeNull();
  });

  it('keeps externally replaced metadata intact during asynchronous preparation', async () => {
    await saveGithubCatalogCache('github.com', 'alice', []);
    const scan = holdQuotaScan();
    const saving = saveGithubCatalogCache('github.com', 'alice', []);
    const rejected = expect(saving).rejects.toThrow('destination changed');
    await vi.waitFor(() => expect(scan.reached()).toBe(true));
    const file = path.join(root, 'github-catalog.json');
    const foreign = JSON.stringify({ version: 99, private: 'preserve me' });
    fs.writeFileSync(file, foreign);
    scan.release();
    await rejected;
    expect(fs.readFileSync(file, 'utf8')).toBe(foreign);
  });

  it('serializes different catalogue writers against their shared quota', async () => {
    const file = path.join(root, 'GPUCache', 'near-budget');
    const descriptor = fs.openSync(file, 'wx');
    fs.ftruncateSync(descriptor, STORAGE_BUDGETS.auxiliary - 160);
    fs.closeSync(descriptor);
    const store = new HostingCatalogStore(() => path.join(root, 'hosting-catalogs'));
    await Promise.all([saveGithubCatalogCache('github.com', 'alice', []), store.write(connection, [])]);
    const files = [path.join(root, 'github-catalog.json'), hostingFile()].filter((file) => fs.existsSync(file));
    expect(files).toHaveLength(1);
    const total = fs.statSync(file).size + files.reduce((bytes, file) => bytes + fs.statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(STORAGE_BUDGETS.auxiliary);
  });

  it('preserves a pending preview across account identity migration and cancels obsolete writes', async () => {
    const store = new HostingCatalogStore(() => path.join(root, 'hosting-catalogs'));
    const previous = { ...connection, userId: null };
    const items = [{ ref: { connectionId: connection.id, repositoryId: '1' }, name: 'example', private: false }] as HostedRepository[];
    const scan = holdQuotaScan();
    const old = store.write(previous, items);
    await vi.waitFor(() => expect(scan.reached()).toBe(true));
    expect(store.read(previous)).toEqual(items);
    const current = store.write(connection, store.read(previous)!);
    scan.release();
    await Promise.all([old, current]);
    expect(store.read(connection)).toEqual(items);
    expect(store.read(previous)).toBeNull();
    expect(JSON.parse(fs.readFileSync(hostingFile(), 'utf8')).userId).toBe('42');
  });

  it('does not publish a removed hosting account after pending I/O completes', async () => {
    const store = new HostingCatalogStore(() => path.join(root, 'hosting-catalogs'));
    const scan = holdQuotaScan();
    const saving = store.write(connection, []);
    await vi.waitFor(() => expect(scan.reached()).toBe(true));
    const removing = store.remove(connection.id);
    scan.release();
    await Promise.allSettled([saving, removing]);
    expect(fs.existsSync(hostingFile())).toBe(false);
    expect(store.read(connection)).toBeNull();
  });
});
