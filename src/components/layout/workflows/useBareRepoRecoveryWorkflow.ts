import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/global';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { getElectronApi } from '@/services/electronApi';
import { gitClient } from '@/services/gitClient';
import type { AppTabId } from '@/components/layout/sidebar/AppSidebar.types';
import { normalizeRepoPointer, splitRepoPath, stripGitSuffix } from './repoWorkflowUtils';

type Toast = { msg: string; isError: boolean };

type WorkspaceBridge = {
  activeRepo: string | null;
  addOpenRepo: (repoPath: string) => Promise<void>;
  setActiveRepo: Dispatch<SetStateAction<string | null>>;
  setActiveTab: (tab: AppTabId) => void;
};

type Params = {
  workspace: WorkspaceBridge;
  settings: Pick<AppSettingsDto, 'defaultBranch' | 'language'>;
  triggerRefresh: () => void;
  setGitActionToast: (toast: Toast) => void;
};

export const useBareRepoRecoveryWorkflow = ({ workspace, settings, triggerRefresh, setGitActionToast }: Params) => {
  const { t, tr } = useLanguageTranslations(settings.language as AppLanguage);
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
      const originResult = await gitClient.getRemoteUrl('origin');
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
    const ensureRecoveredRepoSelected = async () => {
      await electronApi.setRepoPath(switchedPath);
      workspace.setActiveRepo(switchedPath);
    };

    await workspace.addOpenRepo(switchedPath);
    await ensureRecoveredRepoSelected();
    // Keep the original bare repo open to avoid a close/switch race that could
    // accidentally redirect follow-up commands to an unrelated repository.
    triggerRefresh();

    await ensureRecoveredRepoSelected();

    const headAfterCloneResult = await gitClient.runGitCommand('show', '--quiet', '--format=%H', 'HEAD');
    const hasLocalCommit = Boolean(headAfterCloneResult.success && String(headAfterCloneResult.data || '').trim());
    if (!hasLocalCommit) {
      const remoteBranchesResult = await gitClient.runGitCommand('branch', '-r');
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
        await ensureRecoveredRepoSelected();
        const checkoutTracked = await gitClient.checkoutRemoteBranch(preferredRemoteBranch, localBranchName);

        if (!checkoutTracked.success) {
          await ensureRecoveredRepoSelected();
          const checkoutForced = await gitClient.runGitCommand('checkout', '-B', localBranchName, preferredRemoteBranch);
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
      await ensureRecoveredRepoSelected();
      const removeOriginResult = await gitClient.removeRemote('origin');
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
      await ensureRecoveredRepoSelected();
      const setUrlResult = await gitClient.setRemoteUrl('origin', existingOriginUrl);
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
  }, [setGitActionToast, settings.defaultBranch, tr, triggerRefresh, workspace]);

  return { recoverBareRepoForPush };
};
