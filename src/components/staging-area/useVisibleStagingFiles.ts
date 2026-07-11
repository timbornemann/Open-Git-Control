import { useMemo } from 'react';
import type { GitStatusWithConflicts } from './types';

type UseVisibleStagingFilesParams = {
  status: GitStatusWithConflicts | null;
  searchQuery: string;
};

export const useVisibleStagingFiles = ({ status, searchQuery }: UseVisibleStagingFilesParams) => {
  const visibleFiles = useMemo(() => {
    if (!status) {
      return { staged: [], unstaged: [], untracked: [], conflicts: [] };
    }
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const bySearch = <T extends { path: string }>(entries: T[]) =>
      entries.filter((entry) => !normalizedQuery || entry.path.toLowerCase().includes(normalizedQuery)).sort((a, b) => a.path.localeCompare(b.path));
    return {
      staged: bySearch(status.staged),
      unstaged: bySearch(status.unstaged),
      untracked: bySearch(status.untracked),
      conflicts: bySearch(status.conflicts),
    };
  }, [searchQuery, status]);

  return {
    visibleFiles,
  };
};
