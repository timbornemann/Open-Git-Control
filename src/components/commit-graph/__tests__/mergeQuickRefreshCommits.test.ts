import { describe, expect, it } from 'vitest';
import type { GitCommit } from '@/utils/gitParsing';
import { mergeQuickRefreshCommits } from '@/components/commit-graph/mergeQuickRefreshCommits';

const commit = (hash: string): GitCommit => ({
  hash,
  abbrevHash: hash,
  author: 'Test',
  date: '2026-06-12',
  subject: hash,
  parentHashes: [],
  refs: [],
  stats: {
    files: 0,
    additions: 0,
    deletions: 0,
  },
});

const hashes = (commits: GitCommit[]) => commits.map((entry) => entry.hash);

describe('mergeQuickRefreshCommits', () => {
  it('prepends a new commit and preserves the loaded history tail', () => {
    const existing = ['a', 'b', 'c', 'd'].map(commit);
    const refreshedHead = ['new', 'a', 'b'].map(commit);

    expect(hashes(mergeQuickRefreshCommits(existing, refreshedHead))).toEqual(['new', 'a', 'b', 'c', 'd']);
  });

  it('replaces the previous head after an amended commit', () => {
    const existing = ['old-head', 'b', 'c', 'd'].map(commit);
    const refreshedHead = ['amended-head', 'b', 'c'].map(commit);

    expect(hashes(mergeQuickRefreshCommits(existing, refreshedHead))).toEqual(['amended-head', 'b', 'c', 'd']);
  });

  it('uses the refreshed head when rewritten history has no overlap', () => {
    const existing = ['a', 'b', 'c'].map(commit);
    const refreshedHead = ['x', 'y'].map(commit);

    expect(hashes(mergeQuickRefreshCommits(existing, refreshedHead))).toEqual(['x', 'y']);
  });

  it('removes obsolete decorations and unreachable cached branches using the current refs', () => {
    const existing = [commit('head'), commit('base'), commit('old-remote'), commit('root')];
    existing[0].parentHashes = ['base'];
    existing[1].parentHashes = ['root'];
    existing[2].parentHashes = ['root'];
    existing[2].refs = ['origin/topic'];
    const snapshot = { refs: { head: ['HEAD -> main', 'origin/topic'] }, scope: 'all' as const };
    const result = mergeQuickRefreshCommits(existing, existing.slice(0, 2), snapshot);
    expect(hashes(result)).toEqual(['head', 'base', 'root']);
    expect(result[0].refs).toEqual(['HEAD -> main', 'origin/topic']);
    expect(existing[2].refs).toEqual(['origin/topic']);
  });

  it('retains a branch beyond the refreshed page when it is still referenced', () => {
    const existing = [commit('head'), commit('base'), commit('remote'), commit('root')];
    existing[0].parentHashes = ['base'];
    existing[1].parentHashes = ['root'];
    existing[2].parentHashes = ['root'];
    const refs = { head: ['HEAD -> main'], remote: ['origin/older'] };
    expect(hashes(mergeQuickRefreshCommits(existing, existing.slice(0, 2), { refs, scope: 'all' }))).toEqual(hashes(existing));
    expect(hashes(mergeQuickRefreshCommits(existing, existing.slice(0, 2), { refs, scope: 'head' }))).toEqual(['head', 'base', 'root']);
  });
});
