import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, cleanupAnalyticsFixtures } from './analyticsFixture';
import { DEFAULT_ANALYTICS_FILTERS } from '../../../src/shared/ipc/repositoryAnalytics';
import { RepositoryAnalyticsService } from '../RepositoryAnalyticsService';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAnalyticsFixtures();
});
describe('analytics history and project identities', () => {
  it('counts merge activity once, keeps ordinary changes separate and handles a rewritten branch', async () => {
    const f = await fixture();
    await f.refresh();
    await f.git('checkout', '-b', 'feature', 'v1.0.0');
    f.write('feature.ts', 'feature\n');
    await f.git('add', '.');
    await f.git('commit', '-m', 'Feature');
    await f.git('checkout', 'main');
    f.write('main.ts', 'main\n');
    await f.git('add', '.');
    await f.git('commit', '-m', 'Main');
    await f.git('merge', '--no-ff', 'feature', '-m', 'Merge feature');
    const spy = vi.spyOn(f.engine, 'streamReadAtPath');
    const value = await f.refresh();
    expect(value.totals).toMatchObject({ commits: 6, merges: 1 });
    expect(value.project.lines).toBe(12);
    expect(value.hotspots.find((row) => row.path === 'feature.ts')).toMatchObject({ changes: 1, additions: 1 });
    expect(spy.mock.calls.filter((call) => call[1].includes('blame')).map((call) => call[1].at(-1))).toContain('b.ts');
    const featureComparison = await f.refresh({ ...DEFAULT_ANALYTICS_FILTERS, compareFrom: 'v1.1.0', compareTo: 'feature' });
    expect(featureComparison.comparison).toMatchObject({ ancestor: false, commits: 1, files: 3, additions: 1, deletions: 2 });
    await f.git('branch', '-D', 'feature');
    await f.git('reset', '--hard', 'v1.0.0');
    spy.mockClear();
    const rewrite = await f.refresh();
    expect(rewrite.totals.commits).toBe(1);
    expect(rewrite.project.lines).toBe(6);
    expect(spy.mock.calls.some((call) => call[1].includes('log'))).toBe(false);
  }, 90000);
  it('uses versioned nested ignore rules and mailmap, never unstaged rules or global exclusions', async () => {
    const f = await fixture();
    f.write('nested/.gitignore', '*.txt\n!keep.txt\n');
    f.write('nested/keep.txt', 'keep\n');
    f.write('nested/hidden.txt', 'hidden\n');
    f.write('.mailmap', 'Alice <alice@example.invalid> Bob <bob@example.invalid>\n');
    await f.git('add', '--force', '.');
    await f.git('commit', '-m', 'Project rules');
    const external = path.join(f.root, 'global-ignore');
    fs.writeFileSync(external, 'b.ts\n');
    await f.git('config', 'core.excludesFile', external);
    f.write('.gitignore', '*\n');
    const first = await f.refresh();
    expect(first.totals.contributors).toBe(1);
    expect(first.project.excludedFiles).toBe(2);
    expect(first.hotspots.map((row) => row.path)).toContain('b.ts');
    expect(first.hotspots.map((row) => row.path)).not.toContain('nested/hidden.txt');
    expect(first.project.ownership).toHaveLength(1);
    const historical = await f.refresh({ ...DEFAULT_ANALYTICS_FILTERS, revision: 'v1.1.0' });
    expect(historical.totals.contributors).toBe(2);
    expect(historical.project.ownership).toHaveLength(2);
    await f.git('restore', '.gitignore');
    f.write('.mailmap', 'Alice <bob@example.invalid> Bob <bob@example.invalid>\n');
    await f.git('add', '.mailmap');
    await f.git('commit', '-m', 'Separate identities');
    const next = await f.refresh();
    expect(next.totals.contributors).toBe(2);
    expect(next.authors.map((person) => person.name)).toEqual(['Alice', 'Alice']);
    expect(next.project.ownership).toHaveLength(2);
  }, 90000);
  it('recomputes blame for a file changed and then reverted, while reusing unrelated files', async () => {
    const f = await fixture();
    await f.refresh();
    const original = fs.readFileSync(path.join(f.repo, 'a.ts'));
    f.write('a.ts', 'temporary\n');
    await f.git('add', 'a.ts');
    await f.git('commit', '-m', 'Temporary');
    f.write('a.ts', original);
    await f.git('add', 'a.ts');
    await f.git('commit', '-m', 'Reverted content');
    const spy = vi.spyOn(f.engine, 'streamReadAtPath');
    const value = await f.refresh();
    expect(value.project.lines).toBe(10);
    expect(spy.mock.calls.filter((call) => call[1].includes('blame')).map((call) => call[1].at(-1))).toEqual(['a.ts']);
    expect(
      spy.mock.calls
        .filter((call) => call[1].includes('log'))[0][4]!
        .toString()
        .trim()
        .split('\n'),
    ).toHaveLength(2);
  }, 90000);
  it('supports an unborn repository and a linked worktree without modifying the index or work files', async () => {
    const empty = await fixture(false);
    const unborn = await empty.refresh();
    expect(unborn.complete).toBe(true);
    expect(unborn.totals.commits).toBe(0);
    expect(unborn.project.files).toBe(0);
    expect(fs.existsSync(path.join(empty.repo, '.git', 'index'))).toBe(false);
    const f = await fixture();
    const worktree = path.join(f.root, 'worktree');
    await f.git('worktree', 'add', '-b', 'linked', worktree);
    fs.writeFileSync(path.join(worktree, 'a.ts'), 'unstaged content\n');
    const index = (await f.lifecycle.git(worktree, 'rev-parse', '--path-format=absolute', '--git-path', 'index')).trim();
    const original = fs.readFileSync(index);
    f.engine.setRepoPath(worktree);
    const service = new RepositoryAnalyticsService(f.engine, f.cache);
    const value = await f.lifecycle.track(service.refresh({ repoPath: worktree, filters: DEFAULT_ANALYTICS_FILTERS }, f.lifecycle.signal, () => {}));
    expect(value.totals.commits).toBe(3);
    expect(value.project.lines).toBe(10);
    expect(fs.readFileSync(index)).toEqual(original);
    expect(fs.readFileSync(path.join(worktree, 'a.ts'), 'utf8')).toBe('unstaged content\n');
  }, 90000);
  it('keeps literal unusual paths and physical encoded text lines through renames and deletions', async () => {
    const f = await fixture();
    const file = process.platform === 'win32' ? 'space [ä] file.txt' : 'space [ä]\t\nfile.txt';
    f.write(file, 'a\r\nb\rc');
    f.write('utf16.txt', Buffer.concat([Buffer.from([255, 254]), Buffer.from('one\r\ntwo\r\n', 'utf16le')]));
    await f.git('add', '.');
    await f.git('commit', '-m', 'Encoded paths');
    await f.git('mv', '--', file, 'renamed.txt');
    await f.git('commit', '-m', 'Rename');
    await f.git('rm', 'b.ts');
    await f.git('commit', '-m', 'Delete');
    const value = await f.refresh();
    expect(value.project.lines).toBe(12);
    expect(value.hotspots.find((row) => row.path === 'renamed.txt')).toMatchObject({ oldPath: file, changes: 1 });
    expect(value.hotspots.find((row) => row.path === 'b.ts')).toMatchObject({ changes: 4, deletions: 3 });
  }, 90000);
});
