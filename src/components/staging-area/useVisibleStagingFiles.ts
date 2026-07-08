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

  const visibleTotal = visibleFiles.staged.length + visibleFiles.unstaged.length + visibleFiles.untracked.length + visibleFiles.conflicts.length;

  const visibleSectionCount = [visibleFiles.conflicts.length, visibleFiles.staged.length, visibleFiles.unstaged.length, visibleFiles.untracked.length].filter(
    (count) => count > 0,
  ).length;

  const maxListHeight = (itemCount: number) => {
    if (itemCount <= 0) return 0;
    if (visibleSectionCount <= 1) return 720;
    if (visibleSectionCount === 2) return 520;
    return 380;
  };

  return {
    visibleFiles,
    visibleTotal,
    maxListHeight,
  };
};
