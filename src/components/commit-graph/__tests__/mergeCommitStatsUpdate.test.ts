import { describe, expect, it } from 'vitest';
import type { GitCommit } from '@/utils/gitParsing';
import { mergeCommitStatsUpdate } from '@/components/commit-graph/mergeCommitStatsUpdate';

const createCommit = (statsState: GitCommit['statsState'], stats: GitCommit['stats'] = null): GitCommit => ({
  hash: 'a'.repeat(40),
  abbrevHash: 'aaaaaaa',
  author: 'Test',
  date: '2026-06-14',
  subject: 'Test commit',
  parentHashes: [],
  refs: [],
  stats,
  statsState,
});

describe('mergeCommitStatsUpdate', () => {
  it('does not let a queued response overwrite a completed event', () => {
    const ready = createCommit('ready', { files: 2, additions: 12, deletions: 3 });

    expect(mergeCommitStatsUpdate(ready, { state: 'queued', stats: null })).toBe(ready);
  });

  it('does not move an active calculation back to queued', () => {
    const loading = createCommit('loading');

    expect(mergeCommitStatsUpdate(loading, { state: 'queued', stats: null })).toBe(loading);
  });

  it('applies each completed statistic as soon as it arrives', () => {
    const queued = createCommit('queued');
    const updated = mergeCommitStatsUpdate(queued, {
      state: 'ready',
      stats: { files: 4, additions: 25, deletions: 8 },
    });

    expect(updated).toMatchObject({
      statsState: 'ready',
      stats: { files: 4, additions: 25, deletions: 8 },
    });
  });
});
