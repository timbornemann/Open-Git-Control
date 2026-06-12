import { describe, expect, it } from 'vitest';
import type { GitCommit } from '../../../utils/gitParsing';
import { mergeQuickRefreshCommits } from '../mergeQuickRefreshCommits';

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

    expect(hashes(mergeQuickRefreshCommits(existing, refreshedHead)))
      .toEqual(['new', 'a', 'b', 'c', 'd']);
  });

  it('replaces the previous head after an amended commit', () => {
    const existing = ['old-head', 'b', 'c', 'd'].map(commit);
    const refreshedHead = ['amended-head', 'b', 'c'].map(commit);

    expect(hashes(mergeQuickRefreshCommits(existing, refreshedHead)))
      .toEqual(['amended-head', 'b', 'c', 'd']);
  });

  it('uses the refreshed head when rewritten history has no overlap', () => {
    const existing = ['a', 'b', 'c'].map(commit);
    const refreshedHead = ['x', 'y'].map(commit);

    expect(hashes(mergeQuickRefreshCommits(existing, refreshedHead)))
      .toEqual(['x', 'y']);
  });
});
