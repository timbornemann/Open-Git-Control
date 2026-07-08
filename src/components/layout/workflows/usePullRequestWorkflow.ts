import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import { gitClient } from '../../../services/gitClient';
import { githubClient } from '../../../services/githubClient';
import type { RepoOwnerRef } from '../../../types/git';
import type { RunGitCommandOptions } from '../state/appStateShared';
import type { ConfirmDialogState } from '../layoutTypes';

type Toast = { msg: string; isError: boolean };

type CreatePullRequest = (input: {
  title: string;
  body: string;
  head: string;
  base: string;
  currentBranch: string;
}) => Promise<boolean>;

type RunGitCommand = (
  args: string[],
  successMsg: string,
  actionLabel?: string,
  options?: RunGitCommandOptions,
) => Promise<boolean>;

type Params = {
  ownerRepo: RepoOwnerRef | null;
  createPullRequest: CreatePullRequest;
  currentBranch: string;
  newPRTitle: string;
  newPRBody: string;
  newPRHead: string;
  newPRBase: string;
  runGitCommand: RunGitCommand;
  refreshRemoteState: (showToast?: boolean) => unknown;
  confirmDangerousOps: boolean;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  triggerRefresh: () => void;
  language: AppLanguage;
};

export const usePullRequestWorkflow = ({
  ownerRepo,
  createPullRequest,
  currentBranch,
  newPRTitle,
  newPRBody,
  newPRHead,
  newPRBase,
  runGitCommand,
  refreshRemoteState,
  confirmDangerousOps,
  setConfirmDialog,
  setGitActionToast,
  triggerRefresh,
  language,
}: Params) => {
  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(language, deText, enText);
  }, [language]);

  const handleCreatePR = useCallback(async () => {
    await createPullRequest({
      title: newPRTitle,
      body: newPRBody,
      head: newPRHead,
      base: newPRBase,
      currentBranch,
    });
  }, [createPullRequest, currentBranch, newPRBase, newPRBody, newPRHead, newPRTitle]);

  const handleOpenPR = useCallback((url: string) => {
    if (!githubClient.isAvailable()) return;
    void githubClient.openExternalUrl(url);
  }, []);

  const handleCopyPRUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setGitActionToast({ msg: tr('PR-URL kopiert.', 'Copied PR URL.'), isError: false });
    } catch {
      setGitActionToast({ msg: tr('PR-URL konnte nicht kopiert werden.', 'Could not copy PR URL.'), isError: true });
    }
  }, [setGitActionToast, tr]);

  const handleMergePR = useCallback(async (
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
  ) => {
    if (!githubClient.isAvailable() || !ownerRepo) return;

    const executeMerge = async () => {
      try {
        const result = await githubClient.mergePullRequest({
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          pullNumber: prNumber,
          mergeMethod,
        });

        if (!result.success) {
          setGitActionToast({ msg: result.error || tr('PR konnte nicht gemergt werden.', 'Could not merge PR.'), isError: true });
          return;
        }

        setGitActionToast({ msg: tr(`PR #${prNumber} wurde gemergt.`, `PR #${prNumber} merged.`), isError: false });
        refreshRemoteState(true);
        triggerRefresh();
      } catch (error: any) {
        setGitActionToast({ msg: error?.message || tr('PR konnte nicht gemergt werden.', 'Could not merge PR.'), isError: true });
      }
    };

    if (confirmDangerousOps) {
      setConfirmDialog({
        variant: 'danger',
        title: tr(`Pull Request #${prNumber} mergen?`, `Merge pull request #${prNumber}?`),
        message: tr(
          `Dieser Vorgang merged PR #${prNumber} per ${mergeMethod} in ${ownerRepo.owner}/${ownerRepo.repo}.`,
          `This will merge PR #${prNumber} with ${mergeMethod} into ${ownerRepo.owner}/${ownerRepo.repo}.`,
        ),
        contextItems: [
          { label: tr('Repository', 'Repository'), value: `${ownerRepo.owner}/${ownerRepo.repo}` },
          { label: tr('Methode', 'Method'), value: mergeMethod },
        ],
        irreversible: true,
        consequences: tr(
          'Der Remote-PR wird auf GitHub abgeschlossen und der Ziel-Branch verandert.',
          'The remote PR will be completed on GitHub and the target branch will change.',
        ),
        confirmLabel: tr('PR mergen', 'Merge PR'),
        onConfirm: executeMerge,
      });
      return;
    }

    await executeMerge();
  }, [
    confirmDangerousOps,
    ownerRepo,
    refreshRemoteState,
    setConfirmDialog,
    setGitActionToast,
    tr,
    triggerRefresh,
  ]);

  const handleCheckoutPR = useCallback(async (prNumber: number, headRef: string) => {
    const targetBranch = gitClient.getPullRequestBranchName(prNumber, headRef);
    const fetched = await runGitCommand(
      gitClient.buildFetchPullRequestBranchArgs(prNumber, targetBranch),
      tr(`PR #${prNumber} Branch geladen.`, `Loaded branch for PR #${prNumber}.`),
      tr(`PR #${prNumber} wird geladen...`, `Loading PR #${prNumber}...`),
      { skipDirtyGuard: true },
    );
    if (!fetched) return;
    await runGitCommand(
      gitClient.buildCheckoutBranchArgs(targetBranch),
      tr(`PR-Branch ${targetBranch} ausgecheckt.`, `Checked out PR branch ${targetBranch}.`),
    );
  }, [runGitCommand, tr]);

  return {
    handleCheckoutPR,
    handleCopyPRUrl,
    handleCreatePR,
    handleMergePR,
    handleOpenPR,
  };
};
