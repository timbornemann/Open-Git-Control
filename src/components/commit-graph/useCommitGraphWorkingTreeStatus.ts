import { useCallback, useEffect, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import { isRepoUnavailableError, parseGitStatusDetailed, type GitStatusDetailed } from '@/utils/gitParsing';

type UseCommitGraphWorkingTreeStatusParams = {
  repoPath: string | null;
  externalWorkingTreeStatus?: GitStatusDetailed | null;
  onRefreshWorkingTree?: () => Promise<void>;
};

export const useCommitGraphWorkingTreeStatus = ({ repoPath, externalWorkingTreeStatus, onRefreshWorkingTree }: UseCommitGraphWorkingTreeStatusParams) => {
  const [internalWorkingTreeStatus, setInternalWorkingTreeStatus] = useState<GitStatusDetailed | null>(null);

  const clearWorkingTreeStatus = useCallback(() => {
    setInternalWorkingTreeStatus(null);
  }, []);

  const refreshWorkingTreeStatus = useCallback(async () => {
    if (onRefreshWorkingTree) {
      await onRefreshWorkingTree();
      return;
    }
    if (!repoPath || !gitClient.isAvailable()) return;
    try {
      const { success, data } = await gitClient.runGitCommandForRepo(repoPath, 'status', '-s');
      if (success) {
        setInternalWorkingTreeStatus(parseGitStatusDetailed(data || ''));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (isRepoUnavailableError(message)) {
        setInternalWorkingTreeStatus(null);
        return;
      }
      console.error(error);
    }
  }, [onRefreshWorkingTree, repoPath]);

  useEffect(() => {
    if (repoPath) return;
    setInternalWorkingTreeStatus(null);
  }, [repoPath]);

  useEffect(() => {
    if (onRefreshWorkingTree) return;
    if (!repoPath) return;
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refreshWorkingTreeStatus();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshWorkingTreeStatus();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 3000);
    window.addEventListener('focus', refreshIfVisible);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [refreshWorkingTreeStatus, onRefreshWorkingTree, repoPath]);

  return {
    workingTreeStatus: externalWorkingTreeStatus === undefined ? internalWorkingTreeStatus : externalWorkingTreeStatus,
    refreshWorkingTreeStatus,
    clearWorkingTreeStatus,
  };
};
