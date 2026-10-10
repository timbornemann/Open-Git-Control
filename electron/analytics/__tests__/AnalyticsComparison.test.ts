import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeComparison } from '../AnalyticsComparison';
import type { FileChange } from '../AnalyticsTypes';
import { fixture, cleanupAnalyticsFixtures } from './analyticsFixture';
import { DEFAULT_ANALYTICS_FILTERS } from '../../../src/shared/ipc/repositoryAnalytics';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAnalyticsFixtures();
});
const change = (path: string, status: string, additions = 1, deletions = 0, binary = false): FileChange => ({
  path,
  status,
  additions,
  deletions,
  binary,
  before: 'a'.repeat(40),
  after: 'b'.repeat(40),
  mode: '100644',
});
describe('release comparison aggregate statistics', () => {
  it('counts each changed entry once, including renames, copies, type changes and non-text entries', () => {
    const summary = summarizeComparison([
      change('src/a.ts', 'A', 2),
      change('src/b.ts', 'M', 3, 1),
      change('src/renamed.ts', 'R100', 0),
      change('docs/old.md', 'D', 0, 4),
      change('README.md', 'C100', 5),
      change('asset.bin', 'T', 0, 0, true),
    ]);
    expect(summary.fileChanges).toEqual({ added: 2, modified: 2, deleted: 1, renamed: 1 });
    expect(summary.textFiles).toBe(5);
    expect(summary.nonTextFiles).toBe(1);
    expect(summary.areas).toEqual([
      { path: 'src/', files: 3, additions: 5, deletions: 1 },
      { path: '.', files: 2, additions: 5, deletions: 0 },
      { path: 'docs/', files: 1, additions: 0, deletions: 4 },
    ]);
    expect(summarizeComparison([])).toEqual({ fileChanges: { added: 0, modified: 0, deleted: 0, renamed: 0 }, textFiles: 0, nonTextFiles: 0, areas: [] });
  });
  it('aggregates the full real Git comparison beyond the preview limit and resolves the default tag independently of a same-named branch', async () => {
    const f = await fixture(false);
    await f.git('commit', '--allow-empty', '-m', 'Base');
    await f.git('tag', 'v1.0.0');
    const base = (await f.git('rev-parse', 'HEAD')).trim();
    for (let index = 0; index < 105; index++) f.write(`src/file-${index}.txt`, 'line\n');
    for (let index = 0; index < 5; index++) f.write(`docs/file-${index}.txt`, 'one\ntwo\n');
    await f.git('add', '.');
    await f.git('commit', '-m', 'Many files');
    await f.git('branch', 'v1.0.0');
    const report = await f.refresh({ ...DEFAULT_ANALYTICS_FILTERS, revision: 'refs/tags/v1.0.0' });
    expect(report.comparison).toMatchObject({ fromOid: base, files: 110, commits: 1, additions: 115, deletions: 0 });
    expect(report.comparison!.paths).toHaveLength(100);
    expect(report.comparison!.summary).toEqual({
      fileChanges: { added: 110, modified: 0, deleted: 0, renamed: 0 },
      textFiles: 110,
      nonTextFiles: 0,
      areas: [
        { path: 'src/', files: 105, additions: 105, deletions: 0 },
        { path: 'docs/', files: 5, additions: 10, deletions: 0 },
      ],
    });
  }, 90000);
  it('keeps real tree-diff additions, modifications, renames, deletions and binary content separate', async () => {
    const f = await fixture(false);
    f.write('src/keep.txt', 'one\ntwo\n');
    f.write('src/old.txt', 'rename\n');
    f.write('src/deleted.txt', 'gone\n');
    await f.git('add', '.');
    await f.git('commit', '-m', 'Base');
    await f.git('tag', 'v1.0.0');
    f.write('src/keep.txt', 'one\ntwo\nthree\n');
    await f.git('mv', 'src/old.txt', 'src/new.txt');
    await f.git('rm', 'src/deleted.txt');
    f.write('docs/readme.md', 'one\ntwo\n');
    f.write('assets/image.bin', Buffer.from([0, 1, 2, 3]));
    await f.git('add', '.');
    await f.git('commit', '-m', 'Release');
    const report = await f.refresh({ ...DEFAULT_ANALYTICS_FILTERS, revision: 'refs/tags/v1.0.0' });
    expect(report.comparison).toMatchObject({ files: 5, additions: 3, deletions: 1, commits: 1, contributors: 1 });
    expect(report.comparison!.summary).toEqual({
      fileChanges: { added: 2, modified: 1, deleted: 1, renamed: 1 },
      textFiles: 4,
      nonTextFiles: 1,
      areas: [
        { path: 'src/', files: 3, additions: 1, deletions: 1 },
        { path: 'assets/', files: 1, additions: 0, deletions: 0 },
        { path: 'docs/', files: 1, additions: 2, deletions: 0 },
      ],
    });
    const identical = await f.refresh({
      ...DEFAULT_ANALYTICS_FILTERS,
      compareFrom: 'refs/tags/v1.0.0',
      compareTo: 'refs/tags/v1.0.0',
      revision: 'refs/tags/v1.0.0',
    });
    expect(identical.comparison).toMatchObject({ ancestor: true, files: 0, commits: 0, additions: 0, deletions: 0 });
    expect(identical.comparison!.summary?.areas).toEqual([]);
  }, 90000);
});
