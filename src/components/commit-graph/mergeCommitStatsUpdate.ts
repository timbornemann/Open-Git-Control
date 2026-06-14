import type { GitCommit } from '../../utils/gitParsing';

export type CommitStatsUpdate = {
  stats: GitCommit['stats'];
  state: GitCommit['statsState'];
};

const isRegressiveState = (
  current: GitCommit['statsState'],
  next: GitCommit['statsState'],
): boolean => {
  if (current === 'ready') return next !== 'ready';
  if (current === 'loading') return next === 'missing' || next === 'queued';
  if (current === 'queued') return next === 'missing';
  return false;
};

export const mergeCommitStatsUpdate = (
  commit: GitCommit,
  update: CommitStatsUpdate,
): GitCommit => {
  if (isRegressiveState(commit.statsState, update.state)) return commit;
  if (
    commit.statsState === update.state
    && commit.stats?.files === update.stats?.files
    && commit.stats?.additions === update.stats?.additions
    && commit.stats?.deletions === update.stats?.deletions
    && (commit.stats === null) === (update.stats === null)
  ) {
    return commit;
  }
  return {
    ...commit,
    stats: update.stats,
    statsState: update.state,
  };
};
