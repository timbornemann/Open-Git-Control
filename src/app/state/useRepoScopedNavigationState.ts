import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppTabId, CommitNavigationRequest } from './contracts';
import type { GitHubReleaseContextDto } from '@/global';

type UseRepoScopedNavigationStateParams = {
  setShowReleaseCreator: Dispatch<SetStateAction<boolean>>;
  setReleaseContext: Dispatch<SetStateAction<GitHubReleaseContextDto | null>>;
  setReleaseContextError: Dispatch<SetStateAction<string | null>>;
};

export const useRepoScopedNavigationState = ({ setShowReleaseCreator, setReleaseContext, setReleaseContextError }: UseRepoScopedNavigationStateParams) => {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [commitNavigationRequest, setCommitNavigationRequest] = useState<CommitNavigationRequest | null>(null);
  const commitNavigationSequenceRef = useRef(0);
  const [autoOpenConflictResolverPath, setAutoOpenConflictResolverPath] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [commitRefreshTrigger, setCommitRefreshTrigger] = useState(0);

  const clearAutoOpenConflictResolverPath = useCallback(() => {
    setAutoOpenConflictResolverPath(null);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const triggerCommitRefresh = useCallback(() => {
    setCommitRefreshTrigger((prev) => prev + 1);
  }, []);

  const resetRepoScopedUi = useCallback(() => {
    setSelectedCommit(null);
    setCommitNavigationRequest(null);
    setAutoOpenConflictResolverPath(null);
    setShowReleaseCreator(false);
    setReleaseContext(null);
    setReleaseContextError(null);
  }, [setReleaseContext, setReleaseContextError, setShowReleaseCreator]);

  const navigateToCommit = useCallback(
    (hash: string, setActiveTab: (tab: AppTabId) => void) => {
      const normalizedHash = String(hash || '').trim();
      if (!/^[0-9a-f]{7,64}$/i.test(normalizedHash)) return;

      setActiveTab('repo');
      setShowReleaseCreator(false);
      setSelectedCommit(normalizedHash);
      commitNavigationSequenceRef.current += 1;
      setCommitNavigationRequest({
        hash: normalizedHash,
        requestId: commitNavigationSequenceRef.current,
      });
    },
    [setShowReleaseCreator],
  );

  return {
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
    autoOpenConflictResolverPath,
    setAutoOpenConflictResolverPath,
    clearAutoOpenConflictResolverPath,
    refreshTrigger,
    triggerRefresh,
    commitRefreshTrigger,
    triggerCommitRefresh,
    resetRepoScopedUi,
    navigateToCommit,
  };
};
