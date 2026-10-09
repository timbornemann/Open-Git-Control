import { describe, expect, it } from 'vitest';
import { aggregateAnalytics } from '../AnalyticsAggregation';
import type { AnalyticsRules } from '../AnalyticsRules';
import type { CommitRecord } from '../AnalyticsTypes';
import { DEFAULT_ANALYTICS_FILTERS } from '../../../src/shared/ipc/repositoryAnalytics';

const author = { id: 'author', name: 'Person', email: 'person@test.invalid' };
const rules = { ignored: (path: string) => path === 'ignored', author: (value: typeof author) => value } satisfies Pick<AnalyticsRules, 'ignored' | 'author'>;
const commit = (index: number, paths: string[], parents = 1): CommitRecord => ({
  hash: String(index).padStart(40, 'a'),
  parents: Array.from({ length: parents }, () => 'a'.repeat(40)),
  author,
  date: new Date(2026, 9, index + 1, 12).getTime(),
  subject: 'Commit',
  changes: paths.map((path) => ({
    path,
    before: 'b'.repeat(40),
    after: 'c'.repeat(40),
    mode: '100644',
    status: 'M',
    additions: 2,
    deletions: 1,
    binary: false,
  })),
});
describe('analytics definitions', () => {
  it('uses pair-specific union counts and excludes bulk changes only from coupling', async () => {
    const records = [
      commit(0, ['a', 'b', 'ignored'], 0),
      commit(1, ['a', 'b']),
      commit(2, ['a', 'b']),
      commit(3, ['a']),
      commit(
        4,
        Array.from({ length: 51 }, (_, index) => (index === 0 ? 'a' : index === 1 ? 'b' : `file-${index}`)),
      ),
      commit(5, ['a', 'b'], 2),
    ];
    const value = await aggregateAnalytics(records, rules, DEFAULT_ANALYTICS_FILTERS, new Map());
    expect(value.totals).toMatchObject({ commits: 6, merges: 1 });
    expect(value.excludedCouplingCommits).toBe(1);
    expect(value.coupling).toEqual([{ first: 'a', second: 'b', commits: 3, share: 0.75 }]);
    expect(value.hotspots.find((row) => row.path === 'a')).toMatchObject({ changes: 5, additions: 10, deletions: 5 });
    expect(value.additions).toBe(116);
    expect(value.deletions).toBe(58); // 2+2+2+1+51 paths; merge is activity only
  });
  it('groups by local author time, keeps total activity complete and summarizes every ancestor directory', async () => {
    const records = [commit(0, ['src/deep/a.ts']), commit(1, ['src/deep/b.ts']), commit(2, ['src/a.ts'])];
    const value = await aggregateAnalytics(
      records,
      rules,
      { ...DEFAULT_ANALYTICS_FILTERS, aggregation: 'month', since: '2026-10-02', until: '2026-10-03', path: 'src' },
      new Map(),
    );
    expect(value.totals.commits).toBe(3);
    expect(value.filteredCommits).toBe(2);
    expect(value.periods).toEqual([{ date: '2026-10-01', commits: 2, merges: 0, additions: 4, deletions: 2 }]);
    expect(value.directories.find((row) => row.path === 'src')?.changes).toBe(2);
    expect(value.directories.find((row) => row.path === 'src/deep')?.changes).toBe(1);
  });
});
