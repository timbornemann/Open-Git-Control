import { getActiveResourceRepository, invalidateResources } from '@/data/clientCache';
import { gitMutationAffects } from '@/data/mutationEffects';
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppTabId, CommitNavigationRequest, ConfirmDialogState, InputDialogState } from './contracts';

type UseRepoScopedNavigationStateParams = {
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
};

export const useRepoScopedNavigationState = ({ setConfirmDialog, setInputDialog }: UseRepoScopedNavigationStateParams) => {
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
    invalidateResources('git', getActiveResourceRepository(), undefined, (key) => gitMutationAffects('createCommit', [], key));
    setCommitRefreshTrigger((prev) => prev + 1);
  }, []);

  const consumeCommitNavigationRequest = useCallback((requestId: number) => {
    setCommitNavigationRequest((current) => (current?.requestId === requestId ? null : current));
  }, []);

  const resetRepoScopedUi = useCallback(() => {
    setSelectedCommit(null);
    setCommitNavigationRequest(null);
    setAutoOpenConflictResolverPath(null);
    // Dialog callbacks capture repository-scoped operations. Closing them on a
    // repository switch prevents a confirmation created for repo A from
    // mutating repo B later.
    setConfirmDialog(null);
    setInputDialog(null);
  }, [setConfirmDialog, setInputDialog]);

  const navigateToCommit = useCallback((hash: string, setActiveTab: (tab: AppTabId) => void) => {
    const normalizedHash = String(hash || '').trim();
    if (!/^[0-9a-f]{7,64}$/i.test(normalizedHash)) return;

    setActiveTab('repo');
    setSelectedCommit(normalizedHash);
    commitNavigationSequenceRef.current += 1;
    setCommitNavigationRequest({
      hash: normalizedHash,
      requestId: commitNavigationSequenceRef.current,
    });
  }, []);

  return {
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
    consumeCommitNavigationRequest,
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
