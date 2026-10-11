import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maintenanceFixture } from './maintenanceFixture';
import { leaseStorage, recordCacheUse } from '../managedStorage';
import { repositoryPathKey } from '../activeRepositoryAuthorization';

describe('storage cleanup integrity and bounded growth', () => {
  let fixture: ReturnType<typeof maintenanceFixture>;
  beforeEach(() => {
    fixture = maintenanceFixture();
  });
  afterEach(() => fixture.dispose());
  it('starts cache TTL at first observation, preserves meaningful use, and does not touch usage during inventory', async () => {
    const preview = fixture.preview();
    fs.utimesSync(preview, new Date(0), new Date(0));
    await fixture.service.run({ mode: 'eligible' });
    expect(fs.existsSync(preview)).toBe(true);
    fixture.advance(29);
    await fixture.service.inspect();
    fixture.advance(1);
    await fixture.service.run({ mode: 'eligible' });
    expect(fs.existsSync(preview)).toBe(false);
    fixture.preview();
    recordCacheUse(preview, fixture.now);
    fixture.advance(29);
    await fixture.service.inspect();
    recordCacheUse(preview, fixture.now);
    fixture.advance(2);
    await fixture.service.run({ mode: 'eligible' });
    expect(fs.existsSync(preview)).toBe(true);
  });
  it('defers active cache writes and makes repeated cleanup idempotent', async () => {
    const preview = fixture.preview(),
      release = leaseStorage(path.dirname(preview));
    const deferred = await fixture.service.run({ mode: 'all-caches' });
    expect(deferred.reports.at(-1)?.deferred[0].reason).toBe('in-use');
    expect(fs.existsSync(preview)).toBe(true);
    release();
    release();
    const first = await fixture.service.run({ mode: 'all-caches' });
    expect(first.reports.at(-1)?.removedFiles).toBe(1);
    const repeated = await fixture.service.run({ mode: 'all-caches' });
    expect(repeated.reports.at(-1)?.removedBytes).toBe(0);
  });
  it('keeps unknown files, future cache formats, corrupt mappings, and protected data', async () => {
    const preview = fixture.preview();
    fs.writeFileSync(preview, '{"version":999}');
    const unknown = fixture.file('unknown/data.json', '{"user":"needed"}'),
      credentials = fixture.file('credentials.bin', 'secret');
    const mapping = fixture.file('repository-remotes.json', '{broken');
    await fixture.service.run({ mode: 'all-caches' });
    for (const [file, content] of [
      [preview, '{"version":999}'],
      [unknown, '{"user":"needed"}'],
      [credentials, 'secret'],
      [mapping, '{broken'],
    ])
      expect(fs.readFileSync(file, 'utf8')).toBe(content);
    expect((await fixture.service.inspect()).groups.find((group) => group.category === 'unknown')?.files).toBeGreaterThan(0);
  });
  it('never treats a failed repository registry read as an empty list', async () => {
    const preview = fixture.preview();
    fixture.deps.readRepos = () => {
      throw new Error('Registry broken');
    };
    await expect(fixture.service.run({ mode: 'all-caches' })).rejects.toThrow('Registry broken');
    expect(fs.existsSync(preview)).toBe(true);
    const overview = await fixture.service.inspect();
    expect(overview.blockedReason).toBe('Registry broken');
    expect(overview.groups.find((group) => group.category === 'previews')?.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(preview)).toBe(true);
  });
  it('fails closed on future or malformed maintenance state across restarts', async () => {
    const preview = fixture.preview();
    fixture.service.dispose();
    fixture.file('storage-maintenance-v1.json', { version: 99 });
    fixture.restart();
    await expect(fixture.service.run({ mode: 'all-caches' })).rejects.toThrow('unreadable');
    expect(fs.existsSync(preview)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.root, 'storage-maintenance-v1.json'), 'utf8')).version).toBe(99);
  });
  it('does not follow junctions during inventory or deletion', async () => {
    const outside = path.join(fixture.directory, 'outside');
    fs.mkdirSync(outside);
    const sentinel = path.join(outside, `${'a'.repeat(64)}.json`);
    fs.writeFileSync(sentinel, 'protected outside');
    fs.symlinkSync(outside, path.join(fixture.root, 'preview-cache-v1'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await fixture.service.run({ mode: 'all-caches' });
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('protected outside');
    expect(result.issues.some((issue) => issue.reason === 'redirected-path')).toBe(true);
  });
  it('keeps open publication and migration journals, and cache-only cleanup cannot delete expired associations', async () => {
    const key = repositoryPathKey(fixture.repo);
    const preferences = fixture.file('repository-remotes.json', { version: 2, repositories: { [key]: {} } });
    const publication = fixture.file('repository-publications.json', {
      version: 1,
      publications: [{ stage: 'uncertain', selection: { repoPath: fixture.repo } }],
    });
    const migration = fixture.file('secret-scan-allowlist-migration.json', {
      version: 1,
      rules: ['keep'],
      repositories: [{ path: fixture.repo, complete: false }],
    });
    await fixture.service.inspect();
    fixture.remove();
    fixture.advance(30);
    await fixture.service.run({ mode: 'all-caches' });
    expect(JSON.parse(fs.readFileSync(preferences, 'utf8')).repositories[key]).toBeDefined();
    await fixture.service.run({ mode: 'eligible' });
    expect(fs.existsSync(publication)).toBe(true);
    expect(fs.existsSync(migration)).toBe(true);
    expect(JSON.parse(fs.readFileSync(preferences, 'utf8')).repositories[key]).toBeDefined();
  });
  it('caps reports at 30 entries and 1 MiB despite repeated runs', async () => {
    for (let i = 0; i < 35; i++) await fixture.service.run({ mode: 'eligible', categories: ['previews'] });
    const result = await fixture.service.inspect();
    expect(result.reports).toHaveLength(30);
    expect(Buffer.byteLength(JSON.stringify(result.reports))).toBeLessThanOrEqual(1024 ** 2);
  });
  it('stops safely when shutdown occurs during an asynchronous repository probe', async () => {
    const preview = fixture.preview();
    let resume!: () => void;
    fixture.probe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resume = () => resolve('missing');
        }),
    );
    const running = fixture.service.run({ mode: 'all-caches' });
    fixture.service.dispose();
    resume();
    await expect(running).rejects.toThrow('stopped');
    expect(fs.existsSync(preview)).toBe(true);
  });
  it('merges concurrent cleanup requests into a single follow-up', async () => {
    let resume!: () => void;
    fixture.probe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resume = () => resolve('missing');
        }),
    );
    const first = fixture.service.run({ mode: 'eligible', categories: ['previews'] });
    const queued = Array.from({ length: 12 }, (_, index) => fixture.service.run({ mode: 'eligible', categories: [index % 2 ? 'analytics' : 'previews'] }));
    expect(new Set(queued).size).toBe(1);
    resume();
    await Promise.all([first, ...queued]);
    expect(fixture.probe).toHaveBeenCalledTimes(2);
    expect((await fixture.service.inspect()).reports).toHaveLength(2);
  });
  it('starts a new seven-day observation period for old owned crash workspaces across restarts', async () => {
    const directory = path.join(fixture.directory, 'old-workspace');
    let entries = [{ directory, bytes: 10, files: 1, eligible: true }];
    const cleanTemporary = vi.fn((allowed: Set<string>) => {
      if (!allowed.has(directory)) return { bytes: 0, files: 0 };
      entries = [];
      return { bytes: 10, files: 1 };
    });
    Object.assign(fixture.deps, { temporary: () => entries, cleanTemporary });
    await fixture.service.run({ mode: 'eligible', categories: ['temporary'] });
    expect(cleanTemporary.mock.lastCall?.[0].size).toBe(0);
    fixture.advance(6);
    fixture.restart();
    await fixture.service.run({ mode: 'eligible', categories: ['temporary'] });
    expect(entries).toHaveLength(1);
    fixture.advance(1);
    const overview = await fixture.service.run({ mode: 'eligible', categories: ['temporary'] });
    expect(entries).toHaveLength(0);
    expect(overview.reports.at(-1)?.removedFiles).toBe(1);
  });
  it('shows reclaimable metadata without changing it during inventory', async () => {
    const file = fixture.file('run-approvals.json', { version: 1, repositories: { [repositoryPathKey(fixture.repo)]: ['a'.repeat(2000)] } });
    await fixture.service.inspect();
    fixture.remove();
    fixture.advance(30);
    const original = fs.readFileSync(file, 'utf8');
    const overview = await fixture.service.inspect();
    expect(overview.groups.find((group) => group.category === 'metadata')?.reclaimableBytes).toBeGreaterThan(1900);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });
  it('defers browser operations during loading and does not extend their cleanup deadline', async () => {
    let browserBusy = true;
    const clearBrowser = vi.fn(async () => {});
    Object.assign(fixture.deps, { clearBrowser, isBrowserBusy: () => browserBusy });
    await fixture.service.inspect();
    fixture.advance(30);
    const deferred = await fixture.service.run({ mode: 'eligible', categories: ['http', 'code'] });
    expect(clearBrowser).not.toHaveBeenCalled();
    expect(deferred.reports.at(-1)?.deferred).toHaveLength(2);
    browserBusy = false;
    await fixture.service.run({ mode: 'eligible', categories: ['http', 'code'] });
    expect(clearBrowser).toHaveBeenCalledWith(['http', 'code']);
  });
  it('reports browser and supported graphics cache bytes and net file removals', async () => {
    const files = [fixture.file('Cache/Cache_Data/data', 'http'), fixture.file('Code Cache/js/data', 'code'), fixture.file('GPUCache/data', 'graphics')];
    Object.assign(fixture.deps, {
      clearBrowser: async () => {
        for (const file of files) fs.unlinkSync(file);
      },
    });
    const overview = await fixture.service.run({ mode: 'all-caches', categories: ['http', 'code', 'auxiliary'] });
    expect(overview.reports.at(-1)).toMatchObject({ removedBytes: 16, removedFiles: 3 });
  });
  it('counts expired disposable logo metadata as a removed file', async () => {
    const hash = createHash('sha256').update(repositoryPathKey(fixture.repo)).digest('hex');
    const file = fixture.file(`repository-icons/${hash}.json`, { version: 1, repoPath: fixture.repo, mode: 'initials' });
    await fixture.service.inspect();
    fixture.remove();
    fixture.advance(30);
    const overview = await fixture.service.run({ mode: 'eligible', categories: ['metadata'] });
    expect(fs.existsSync(file)).toBe(false);
    expect(overview.reports.at(-1)?.removedFiles).toBe(1);
  });
});
