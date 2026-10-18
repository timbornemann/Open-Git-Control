import type { GitCommit } from '@/utils/gitParsing';

export type CommitStatsUpdate = {
  stats: GitCommit['stats'];
  state: GitCommit['statsState'];
};

const isRegressiveState = (current: GitCommit['statsState'], next: GitCommit['statsState']): boolean => {
  if (current === 'ready') return next !== 'ready';
  if (current === 'loading') return next === 'missing' || next === 'queued';
  if (current === 'queued') return next === 'missing';
  return false;
};

export const mergePendingCommitStatsUpdate = (current: CommitStatsUpdate, update: CommitStatsUpdate): CommitStatsUpdate => {
  if (isRegressiveState(current.state, update.state)) return current;
  if (
    current.state === update.state &&
    current.stats?.files === update.stats?.files &&
    current.stats?.additions === update.stats?.additions &&
    current.stats?.deletions === update.stats?.deletions &&
    (current.stats === null) === (update.stats === null)
  ) {
    return current;
  }
  return update;
};

export const mergeCommitStatsUpdate = (commit: GitCommit, update: CommitStatsUpdate): GitCommit => {
  const current = { stats: commit.stats, state: commit.statsState };
  const next = mergePendingCommitStatsUpdate(current, update);
  if (next === current) return commit;
  return {
    ...commit,
    stats: next.stats,
    statsState: next.state,
  };
};
