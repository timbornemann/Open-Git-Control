import { useCallback } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { getElectronApi } from '@/services/electronApi';
import { gitClient } from '@/services/gitClient';
import type { AppTabId } from '@/app/state/contracts';
import { normalizeRepoPointer, splitRepoPath, stripGitSuffix } from './repoWorkflowUtils';

type Toast = { msg: string; isError: boolean };

type WorkspaceBridge = {
  activeRepo: string | null;
  addOpenRepo: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: AppTabId) => void;
};

type Params = {
  workspace: WorkspaceBridge;
  settings: Pick<AppSettingsDto, 'defaultBranch' | 'language'>;
  triggerRefresh: () => void;
  setGitActionToast: (toast: Toast) => void;
};

export const useBareRepoRecoveryWorkflow = ({ workspace, settings, triggerRefresh, setGitActionToast }: Params) => {
  const { t } = useLanguageTranslations(settings.language as AppLanguage);
  const recoverBareRepoForPush = useCallback(async (): Promise<boolean> => {
    const electronApi = getElectronApi();
    if (!electronApi || !gitClient.isAvailable() || !workspace.activeRepo) return false;

    const sourceRepoPath = workspace.activeRepo;
    const { parentDir, baseName } = splitRepoPath(sourceRepoPath);
    const preferredNameBase = stripGitSuffix(baseName) || `${baseName}-worktree`;
    const candidateNames = Array.from(
      new Set([
        preferredNameBase,
        `${preferredNameBase}-worktree`,
        ...Array.from({ length: 24 }, (_value, index) => `${preferredNameBase}-worktree-${index + 2}`),
      ]),
    );

    let existingOriginUrl: string | null = null;
    try {
      const originResult = await gitClient.runGitCommandForRepo(sourceRepoPath, 'remote', 'get-url', 'origin');
      if (originResult.success) {
        const rawOrigin = String(originResult.data || '').trim();
        existingOriginUrl = rawOrigin || null;
      }
    } catch {
      existingOriginUrl = null;
    }

    let cloneResult: { success: boolean; repoPath: string; error?: string } | null = null;
    let lastCloneError = '';

    for (const candidateName of candidateNames) {
      const nextResult = await electronApi.gitClone(sourceRepoPath, parentDir, candidateName);
      if (nextResult.success) {
        cloneResult = nextResult;
        break;
      }

      lastCloneError = String(nextResult.error || '').trim();
      const alreadyExists = /destination path.*already exists/i.test(lastCloneError) || /already exists and is not an empty directory/i.test(lastCloneError);
      if (!alreadyExists) {
        break;
      }
    }

    if (!cloneResult) {
      workspace.setActiveTab('repo');
      setGitActionToast({
        msg:
          lastCloneError ||
          t('generated.components.layout.workflows.usebarereporecoveryworkflow.could_not_automatically_convert_bare_repository_into_a_w_ebc84e9d'),
        isError: true,
      });
      return false;
    }

    const switchedPath = cloneResult.repoPath;
    // addOpenRepo performs the single sequenced/canonical repository switch.
    // Re-selecting the path before every follow-up command used to bypass the
    // workspace transition guard and could switch back after the user had
    // deliberately selected another repository.
    await workspace.addOpenRepo(switchedPath);
    // Keep the original bare repo open to avoid a close/switch race that could
    // accidentally redirect follow-up commands to an unrelated repository.
    triggerRefresh();

    const headAfterCloneResult = await gitClient.runGitCommandForRepo(switchedPath, 'show', '--quiet', '--format=%H', 'HEAD');
    const hasLocalCommit = Boolean(headAfterCloneResult.success && String(headAfterCloneResult.data || '').trim());
    if (!hasLocalCommit) {
      const remoteBranchesResult = await gitClient.runGitCommandForRepo(switchedPath, 'branch', '-r');
      const remoteBranches = remoteBranchesResult.success
        ? String(remoteBranchesResult.data || '')
            .split('\n')
            .map((line: string) => line.replace(/^\*\s*/, '').trim())
            .filter((line: string) => line.startsWith('origin/'))
            .filter((line: string) => !/^origin\/head\b/i.test(line))
        : [];

      const preferredRemoteBranch =
        [`origin/${(settings.defaultBranch || '').trim()}`, 'origin/main', 'origin/master'].find((candidate) => remoteBranches.includes(candidate)) ||
        remoteBranches[0];

      if (preferredRemoteBranch) {
        const localBranchName = preferredRemoteBranch.replace(/^origin\//, '').trim();
        const checkoutArgs = gitClient.buildCheckoutRemoteBranchArgs(preferredRemoteBranch, localBranchName);
        const checkoutTracked = await gitClient.runGitCommandForRepo(switchedPath, checkoutArgs[0], ...checkoutArgs.slice(1));

        if (!checkoutTracked.success) {
          const checkoutForced = await gitClient.runGitCommandForRepo(switchedPath, 'checkout', '-B', localBranchName, preferredRemoteBranch);
          if (!checkoutForced.success) {
            workspace.setActiveTab('repo');
            setGitActionToast({
              msg:
                checkoutForced.error ||
                checkoutTracked.error ||
                t('generated.components.layout.workflows.usebarereporecoveryworkflow.working_directory_was_created_but_a_starter_branch_could_ae6fb2c4'),
              isError: true,
            });
            return false;
          }
        }
      }
    }

    const sourcePointer = normalizeRepoPointer(sourceRepoPath);
    const currentOriginPointer = normalizeRepoPointer(existingOriginUrl || '');
    const originPointsToSource = Boolean(existingOriginUrl) && currentOriginPointer === sourcePointer;

    if (!existingOriginUrl || originPointsToSource) {
      const removeOriginResult = await gitClient.runGitCommandForRepo(switchedPath, 'remote', 'remove', 'origin');
      if (!removeOriginResult.success) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg:
            removeOriginResult.error ||
            t('generated.components.layout.workflows.usebarereporecoveryworkflow.working_directory_was_created_but_local_origin_remote_co_c12936a4'),
          isError: true,
        });
        return false;
      }
    } else {
      const setUrlResult = await gitClient.runGitCommandForRepo(switchedPath, 'remote', 'set-url', 'origin', existingOriginUrl);
      if (!setUrlResult.success) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg:
            setUrlResult.error ||
            t('generated.components.layout.workflows.usebarereporecoveryworkflow.working_directory_was_created_but_origin_remote_could_no_a615df20'),
          isError: true,
        });
        return false;
      }
    }

    workspace.setActiveTab('repo');
    setGitActionToast({
      msg: t('generated.components.layout.workflows.usebarereporecoveryworkflow.bare_repository_detected_automatically_cloned_to_a_worki_f3a9445c'),
      isError: false,
    });
    triggerRefresh();
    return true;
  }, [setGitActionToast, settings.defaultBranch, t, triggerRefresh, workspace]);

  return { recoverBareRepoForPush };
};
