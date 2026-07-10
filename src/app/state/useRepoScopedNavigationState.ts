import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppTabId, CommitNavigationRequest, ConfirmDialogState, InputDialogState } from './contracts';
import type { GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto } from '@/types/githubDtos';

type UseRepoScopedNavigationStateParams = {
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  setShowCreatePR: Dispatch<SetStateAction<boolean>>;
  setNewPRTitle: Dispatch<SetStateAction<string>>;
  setNewPRBody: Dispatch<SetStateAction<string>>;
  setNewPRHead: Dispatch<SetStateAction<string>>;
  setNewPRBase: Dispatch<SetStateAction<string>>;
  setShowReleaseCreator: Dispatch<SetStateAction<boolean>>;
  setReleaseFormState: Dispatch<SetStateAction<GitHubCreateReleaseParamsDto>>;
  setReleaseSubmitting: Dispatch<SetStateAction<boolean>>;
  setReleaseError: Dispatch<SetStateAction<string | null>>;
  setReleaseSuccess: Dispatch<SetStateAction<GitHubReleaseDto | null>>;
  setReleaseContextLoading: Dispatch<SetStateAction<boolean>>;
  setReleaseContext: Dispatch<SetStateAction<GitHubReleaseContextDto | null>>;
  setReleaseContextError: Dispatch<SetStateAction<string | null>>;
  setReleaseNotesGenerating: Dispatch<SetStateAction<boolean>>;
};

export const useRepoScopedNavigationState = ({
  setConfirmDialog,
  setInputDialog,
  setShowCreatePR,
  setNewPRTitle,
  setNewPRBody,
  setNewPRHead,
  setNewPRBase,
  setShowReleaseCreator,
  setReleaseFormState,
  setReleaseSubmitting,
  setReleaseError,
  setReleaseSuccess,
  setReleaseContextLoading,
  setReleaseContext,
  setReleaseContextError,
  setReleaseNotesGenerating,
}: UseRepoScopedNavigationStateParams) => {
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
    // Dialog callbacks capture repository-scoped operations. Closing them on a
    // repository switch prevents a confirmation created for repo A from
    // mutating repo B later.
    setConfirmDialog(null);
    setInputDialog(null);
    setShowCreatePR(false);
    setNewPRTitle('');
    setNewPRBody('');
    setNewPRHead('');
    setNewPRBase('main');
    setShowReleaseCreator(false);
    setReleaseFormState({
      owner: '',
      repo: '',
      tagName: '',
      targetCommitish: '',
      releaseName: '',
      body: '',
      draft: false,
      prerelease: false,
    });
    setReleaseSubmitting(false);
    setReleaseError(null);
    setReleaseSuccess(null);
    setReleaseContextLoading(false);
    setReleaseContext(null);
    setReleaseContextError(null);
    setReleaseNotesGenerating(false);
  }, [
    setConfirmDialog,
    setInputDialog,
    setNewPRBase,
    setNewPRBody,
    setNewPRHead,
    setNewPRTitle,
    setReleaseContext,
    setReleaseContextError,
    setReleaseContextLoading,
    setReleaseError,
    setReleaseFormState,
    setReleaseNotesGenerating,
    setReleaseSubmitting,
    setReleaseSuccess,
    setShowCreatePR,
    setShowReleaseCreator,
  ]);

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
