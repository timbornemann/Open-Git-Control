import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import type { RepoOwnerRef } from '@/types/git';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';

type Toast = { msg: string; isError: boolean };

type CreatePullRequest = (input: { title: string; body: string; head: string; base: string; currentBranch: string }) => Promise<boolean>;

type RunGitCommand = (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;

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
  const { t, tr } = useLanguageTranslations(language);
  const mergeInFlightRef = useRef(new Set<string>());
  const ownerRepoScope = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : '';
  const ownerRepoScopeRef = useRef(ownerRepoScope);
  ownerRepoScopeRef.current = ownerRepoScope;

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

  const handleCopyPRUrl = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        setGitActionToast({ msg: t('generated.components.layout.workflows.usepullrequestworkflow.copied_pr_url_5326d67e'), isError: false });
      } catch {
        setGitActionToast({ msg: t('generated.components.layout.workflows.usepullrequestworkflow.could_not_copy_pr_url_15ef5c92'), isError: true });
      }
    },
    [setGitActionToast, t],
  );

  const handleMergePR = useCallback(
    async (prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge') => {
      if (!githubClient.isAvailable() || !ownerRepo) return;
      const mergeKey = `${ownerRepo.owner}/${ownerRepo.repo}#${prNumber}`;
      const scopeAtStart = ownerRepoScope;

      const executeMerge = async () => {
        if (mergeInFlightRef.current.has(mergeKey)) return;
        mergeInFlightRef.current.add(mergeKey);
        try {
          const result = await githubClient.mergePullRequest({
            owner: ownerRepo.owner,
            repo: ownerRepo.repo,
            pullNumber: prNumber,
            mergeMethod,
          });
          if (ownerRepoScopeRef.current !== scopeAtStart) return;

          if (!result.success || result.data.merged !== true) {
            setGitActionToast({
              msg:
                (!result.success ? result.error : result.data.message) ||
                t('generated.components.layout.workflows.usepullrequestworkflow.could_not_merge_pr_964a5a04'),
              isError: true,
            });
            return;
          }

          setGitActionToast({ msg: tr(`PR #${prNumber} wurde gemergt.`, `PR #${prNumber} merged.`), isError: false });
          refreshRemoteState(true);
          triggerRefresh();
        } catch (error: any) {
          if (ownerRepoScopeRef.current !== scopeAtStart) return;
          setGitActionToast({
            msg: error?.message || t('generated.components.layout.workflows.usepullrequestworkflow.could_not_merge_pr_964a5a04'),
            isError: true,
          });
        } finally {
          mergeInFlightRef.current.delete(mergeKey);
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
            { label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'), value: `${ownerRepo.owner}/${ownerRepo.repo}` },
            { label: t('generated.components.layout.workflows.usepullrequestworkflow.method_bde313dd'), value: mergeMethod },
          ],
          irreversible: true,
          consequences: t('generated.components.layout.workflows.usepullrequestworkflow.the_remote_pr_will_be_completed_on_github_and_the_target_b6cc8731'),
          confirmLabel: t('generated.components.layout.sidebar.githubconnectedcontent.merge_pr_4b999c62'),
          onConfirm: executeMerge,
        });
        return;
      }

      await executeMerge();
    },
    [confirmDangerousOps, ownerRepo, ownerRepoScope, refreshRemoteState, setConfirmDialog, setGitActionToast, t, tr, triggerRefresh],
  );

  const handleCheckoutPR = useCallback(
    async (prNumber: number, headRef: string) => {
      const targetBranch = gitClient.getPullRequestBranchName(prNumber, headRef);
      const fetched = await runGitCommand(
        gitClient.buildFetchPullRequestBranchArgs(prNumber),
        tr(`PR #${prNumber} Branch geladen.`, `Loaded branch for PR #${prNumber}.`),
        tr(`PR #${prNumber} wird geladen...`, `Loading PR #${prNumber}...`),
        { skipDirtyGuard: true },
      );
      if (!fetched) return;
      await runGitCommand(
        gitClient.buildCheckoutPullRequestBranchArgs(targetBranch),
        tr(`PR-Branch ${targetBranch} ausgecheckt.`, `Checked out PR branch ${targetBranch}.`),
      );
    },
    [runGitCommand, tr],
  );

  return {
    handleCheckoutPR,
    handleCopyPRUrl,
    handleCreatePR,
    handleMergePR,
    handleOpenPR,
  };
};
