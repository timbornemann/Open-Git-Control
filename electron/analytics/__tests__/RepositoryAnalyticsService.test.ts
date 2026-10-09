import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryAnalyticsService } from '../RepositoryAnalyticsService';
import { DEFAULT_ANALYTICS_FILTERS } from '../../../src/shared/ipc/repositoryAnalytics';
import { fixture, cleanupAnalyticsFixtures } from './analyticsFixture';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAnalyticsFixtures();
});
describe('offline repository analytics with real Git', () => {
  it('counts the complete history, ignores tracked paths, computes actual lines, coupling and release net changes', async () => {
    const f = await fixture();
    const value = await f.refresh();
    expect(value.complete).toBe(true);
    expect(value.totals.commits).toBe(3);
    expect(value.totals.contributors).toBe(2);
    expect(value.project).toMatchObject({ files: 4, lines: 10, blamedLines: 10, excludedFiles: 1, textFiles: 4 });
    expect(value.hotspots.find((row) => row.path === 'a.ts')).toMatchObject({ changes: 3, additions: 4, deletions: 0, authors: 2 });
    expect(value.hotspots.some((row) => row.path === 'vendor/ignored.txt')).toBe(false);
    expect(value.coupling.find((pair) => pair.first === 'a.ts' && pair.second === 'b.ts')).toMatchObject({ commits: 3, share: 1 });
    expect(value.comparison).toMatchObject({ from: 'v1.1.0', to: 'HEAD', commits: 1, additions: 2, deletions: 0, files: 2, ancestor: true });
    expect(f.service.details({ repoPath: f.repo, snapshotId: value.id, kind: 'commits', offset: 0, limit: 2 }).total).toBe(3);
    expect(fs.readFileSync(path.join(f.repo, 'a.ts'), 'utf8')).toBe('one\ntwo\nthree\nfour\n');
  }, 90000);
  it('uses cached snapshots across restart and reads only new diffs and changed-file blame', async () => {
    const f = await fixture();
    const first = await f.refresh();
    const restored = new RepositoryAnalyticsService(f.engine, f.cache);
    expect(restored.snapshot({ repoPath: f.repo, filters: DEFAULT_ANALYTICS_FILTERS })?.id).toBe(first.id);
    const spy = vi.spyOn(f.engine, 'streamReadAtPath');
    await f.refresh();
    expect(spy.mock.calls.filter((call) => call[1].includes('--numstat'))).toHaveLength(1); // release comparison only
    expect(spy.mock.calls.some((call) => call[1].includes('blame'))).toBe(false);
    spy.mockClear();
    f.write('a.ts', 'new\n');
    await f.git('add', 'a.ts');
    await f.git('commit', '-m', 'One changed file');
    const next = await f.refresh();
    expect(next.totals.commits).toBe(4);
    expect(next.project.lines).toBe(7);
    const history = spy.mock.calls.filter((call) => call[1].includes('log'));
    expect(history).toHaveLength(1);
    expect(history[0][4]!.toString().trim().split('\n')).toHaveLength(1);
    expect(spy.mock.calls.filter((call) => call[1].includes('blame')).map((call) => call[1].at(-1))).toEqual(['a.ts']);
  }, 90000);
  it('deduplicates branches and remote refs, excludes internal refs and corrects deleted branch membership', async () => {
    const f = await fixture();
    await f.git('checkout', '-b', 'feature', 'v1.0.0');
    f.write('feature.ts', 'feature\n');
    await f.git('add', '.');
    await f.git('commit', '-m', 'Feature');
    const feature = (await f.git('rev-parse', 'HEAD')).trim();
    await f.git('update-ref', 'refs/remotes/origin/feature', feature);
    await f.git('update-ref', 'refs/ogc/internal', feature);
    await f.git('checkout', 'main');
    expect((await f.refresh()).totals.commits).toBe(4);
    await f.git('branch', '-D', 'feature');
    await f.git('update-ref', '-d', 'refs/remotes/origin/feature');
    expect((await f.refresh()).totals.commits).toBe(3);
  }, 90000);
  it('does not count LFS pointers or binary bytes as text lines or churn', async () => {
    const f = await fixture();
    f.write('asset.bin', `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 1000000\n`);
    fs.writeFileSync(path.join(f.repo, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    await f.git('add', '.');
    await f.git('commit', '-m', 'Assets');
    const value = await f.refresh();
    expect(value.project).toMatchObject({ lines: 10, lfsFiles: 1, binaryFiles: 1 });
    expect(value.hotspots.find((row) => row.path === 'asset.bin')).toMatchObject({ additions: 0, deletions: 0, binary: true });
  }, 90000);
});
