import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const profile = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => profile.root }, safeStorage: {} }));
vi.mock('../secureStore', () => ({ isSecureStorageAvailable: () => false }));
import { RepositoryIconService } from '../RepositoryIconService';
import { saveGithubCatalogCache, clearGithubCatalogCache } from '../githubCatalogCache';
import { HostingCatalogStore } from '../../hosting/HostingCatalogStore';
import { AnalyticsCache } from '../../analytics/AnalyticsCache';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
import type { HostingConnection } from '../../../src/types/hostingDtos';
import type { RepositoryAnalyticsSnapshot } from '../../../src/shared/ipc/repositoryAnalytics';

describe('cache writers preserve unsupported or foreign data', () => {
  let root: string, repo: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-cache-format-test-'));
    profile.root = root;
    repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
  });
  afterEach(() => {
    clearGithubCatalogCache();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-cache-format-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = (target: string, value: unknown) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const raw = JSON.stringify(value);
    fs.writeFileSync(target, raw);
    return raw;
  };
  it('does not replace a logo preference belonging to another repository', async () => {
    const directory = path.join(root, 'repository-icons');
    const target = path.join(directory, createHash('sha256').update(repositoryPathKey(repo)).digest('hex') + '.json');
    const raw = file(target, { version: 1, repoPath: path.join(root, 'other'), mode: 'initials' });
    const service = new RepositoryIconService({ directory, storedPaths: () => [repo], validatePng: (value) => value });
    const record = await service.get(repo, true);
    await expect(service.choose(repo, { mode: 'initials', expectedSelectionVersion: record.selectionVersion })).rejects.toThrow('unsupported');
    expect(fs.readFileSync(target, 'utf8')).toBe(raw);
  });
  it('does not overwrite unfamiliar catalogues even when JSON is readable', () => {
    const legacy = path.join(root, 'github-catalog.json');
    const raw = file(legacy, { data: 'unknown catalogue shape' });
    saveGithubCatalogCache('github.com', 'alice', []);
    expect(fs.readFileSync(legacy, 'utf8')).toBe(raw);
    const directory = path.join(root, 'hosting-catalogs');
    const connection = { id: 'connection', userId: '42', username: 'alice' } as HostingConnection;
    const target = path.join(directory, createHash('sha256').update(connection.id).digest('hex') + '.json');
    const unsupported = file(target, { version: 1, data: 'unknown catalogue shape' });
    new HostingCatalogStore(() => directory).write(connection, []);
    expect(fs.readFileSync(target, 'utf8')).toBe(unsupported);
  });
  it('preserves an unfamiliar unversioned analytics snapshot when recomputing', async () => {
    const directory = path.join(root, 'repository-analytics');
    const cache = new AnalyticsCache(directory, repo, 'context');
    await cache.load();
    const target = AnalyticsCache.snapshotPath(directory, repo);
    const raw = file(target, { repoPath: repo, data: 'unknown snapshot shape' });
    cache.saveSnapshot(directory, { repoPath: repo } as RepositoryAnalyticsSnapshot);
    expect(fs.readFileSync(target, 'utf8')).toBe(raw);
  });
});
