import type { GitStatusDetailed } from '@/utils/gitParsing';

export type WorkingTreeChangeSummary = {
  total: number;
  conflicts: number;
  staged: number;
  unstaged: number;
  untracked: number;
};

const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

export const summarizeWorkingTreeChanges = (status: GitStatusDetailed | null): WorkingTreeChangeSummary => {
  if (!status) return { total: 0, conflicts: 0, staged: 0, unstaged: 0, untracked: 0 };
  const allEntries = [...status.staged, ...status.unstaged, ...status.untracked];
  const conflictPaths = new Set(allEntries.filter((entry) => CONFLICT_CODES.has(`${entry.x}${entry.y}`)).map((entry) => entry.path));
  const uniquePathsWithoutConflicts = (entries: typeof allEntries) =>
    new Set(entries.filter((entry) => !conflictPaths.has(entry.path)).map((entry) => entry.path)).size;
  return {
    total: new Set(allEntries.map((entry) => entry.path)).size,
    conflicts: conflictPaths.size,
    staged: uniquePathsWithoutConflicts(status.staged),
    unstaged: uniquePathsWithoutConflicts(status.unstaged),
    untracked: uniquePathsWithoutConflicts(status.untracked),
  };
};

export const countUniqueWorkingTreeChanges = (status: GitStatusDetailed | null): number => summarizeWorkingTreeChanges(status).total;
