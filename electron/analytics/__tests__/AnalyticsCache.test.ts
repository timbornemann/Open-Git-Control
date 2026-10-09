import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, cleanupAnalyticsFixtures } from './analyticsFixture';
import { AnalyticsCache } from '../AnalyticsCache';
import { DEFAULT_ANALYTICS_FILTERS } from '../../../src/shared/ipc/repositoryAnalytics';
import { RepositoryAnalyticsService } from '../RepositoryAnalyticsService';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAnalyticsFixtures();
});
describe('analytics cache recovery and source validity', () => {
  it('does not publish an aborted report as complete and resumes captured records after an interrupted append', async () => {
    const f = await fixture();
    const controller = new AbortController();
    await expect(
      f.lifecycle.track(
        f.service.refresh({ repoPath: f.repo, filters: DEFAULT_ANALYTICS_FILTERS }, controller.signal, (event) => {
          if (event.snapshot) controller.abort();
        }),
      ),
    ).rejects.toThrow();
    expect(f.service.snapshot({ repoPath: f.repo, filters: DEFAULT_ANALYTICS_FILTERS })?.complete).toBe(false);
    const container = path.dirname(AnalyticsCache.snapshotPath(f.cache, f.repo));
    const directory = fs.readdirSync(container).find((entry) => fs.statSync(path.join(container, entry)).isDirectory())!;
    const records = path.join(container, directory, 'records.jsonl');
    fs.appendFileSync(records, '{"type":"commit","value":');
    const spy = vi.spyOn(f.engine, 'streamReadAtPath');
    const restored = new RepositoryAnalyticsService(f.engine, f.cache);
    const value = await f.lifecycle.track(restored.refresh({ repoPath: f.repo, filters: DEFAULT_ANALYTICS_FILTERS }, f.lifecycle.signal, () => {}));
    expect(value.complete).toBe(true);
    expect(value.totals.commits).toBe(3);
    expect(value.project.blamedLines).toBe(10);
    expect(spy.mock.calls.some((call) => call[1].includes('log'))).toBe(false);
    expect(fs.readFileSync(records, 'utf8')).not.toContain('one\\ntwo\\nthree');
    fs.writeFileSync(AnalyticsCache.snapshotPath(f.cache, f.repo), '{invalid snapshot');
    expect(restored.snapshot({ repoPath: f.repo, filters: DEFAULT_ANALYTICS_FILTERS })).toBeNull();
    expect((await f.refresh()).complete).toBe(true);
  }, 90000);
  it('reaggregates changed ignore rules without re-reading historical diffs', async () => {
    const f = await fixture();
    await f.refresh();
    f.write('.gitignore', 'vendor/*\n!vendor/keep.txt\na.ts\n');
    await f.git('add', '.gitignore');
    await f.git('commit', '-m', 'Ignore tracked file for analytics');
    const spy = vi.spyOn(f.engine, 'streamReadAtPath');
    const value = await f.refresh();
    expect(value.totals.commits).toBe(4);
    expect(value.project.excludedFiles).toBe(2);
    expect(value.hotspots.some((row) => row.path === 'a.ts')).toBe(false);
    expect(
      spy.mock.calls
        .filter((call) => call[1].includes('log'))[0][4]!
        .toString()
        .trim()
        .split('\n'),
    ).toHaveLength(1);
    expect(value.hotspots.find((row) => row.path === 'b.ts')?.changes).toBe(3);
  }, 90000);
  it('explains shallow clones and never lazily fetches missing history or project objects', async () => {
    const f = await fixture();
    const clone = path.join(f.root, 'shallow');
    const url = (await import('node:url')).pathToFileURL(f.repo).href;
    await f.git('clone', '--depth=1', '--no-tags', url, clone);
    f.engine.setRepoPath(clone);
    const service = new RepositoryAnalyticsService(f.engine, f.cache);
    const spy = vi.spyOn(f.engine, 'streamReadAtPath');
    const value = await f.lifecycle.track(service.refresh({ repoPath: clone, filters: DEFAULT_ANALYTICS_FILTERS }, f.lifecycle.signal, () => {}));
    expect(value.totals.commits).toBe(1);
    expect(value.complete).toBe(false);
    expect(value.warnings[0]).toContain('Shallow');
    expect(spy.mock.calls.every((call) => call[5]?.GIT_NO_LAZY_FETCH === '1' && call[5]?.GIT_ALLOW_PROTOCOL === '')).toBe(true);
    expect(spy.mock.calls.some((call) => call[1].includes('fetch'))).toBe(false);
    const blob = (await f.lifecycle.git(clone, 'rev-parse', 'HEAD:a.ts')).trim();
    const objectPath = path.join(clone, '.git', 'objects', blob.slice(0, 2), blob.slice(2));
    if (fs.existsSync(objectPath)) {
      fs.unlinkSync(objectPath);
      await expect(
        f.lifecycle.track(service.refresh({ repoPath: clone, filters: { ...DEFAULT_ANALYTICS_FILTERS, path: 'a.ts' } }, f.lifecycle.signal, () => {})),
      ).rejects.toThrow(/missing|read|bad object|unable/i);
    }
  }, 90000);
});
