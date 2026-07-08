import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '../../../global';
import { translateFromCatalog, trByLanguage, type AppLanguage, type TranslationVariables } from '../../../i18n';
import { gitClient } from '../../../services/gitClient';
import { githubClient } from '../../../services/githubClient';
import {
  compactGitError,
  isMissingRemotePushError,
  isNoLocalCommitPushError,
  isRemoteRepositoryMissingError,
  shouldOfferGithubRepoRecoveryOnPushFailure,
} from '../../../utils/gitPushRecovery';
import type { AppTabId } from '../sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '../layoutTypes';
import type { RunGitCommandOptions } from '../state/appStateShared';
import { stripGitSuffix } from './repoWorkflowUtils';
import { useBareRepoRecoveryWorkflow } from './useBareRepoRecoveryWorkflow';
import { useInitialCommitRecoveryWorkflow } from './useInitialCommitRecoveryWorkflow';

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
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
};

type RemoteSetupRecoveryParams = {
  command: string;
  options?: RunGitCommandOptions;
  failureMessage: unknown;
};

type PushWithoutOriginParams = {
  command: string;
  options?: RunGitCommandOptions;
};

export const useRemoteRecoveryWorkflow = ({
  workspace,
  settings,
  triggerRefresh,
  setConfirmDialog,
  setGitActionToast,
}: Params) => {
  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [forceGithubRepoCreationPrompt, setForceGithubRepoCreationPrompt] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(settings.language as AppLanguage, deText, enText);
  }, [settings.language]);
  const t = useCallback((key: string, variables?: TranslationVariables) => translateFromCatalog(settings.language as AppLanguage, key, variables), [settings.language]);

  useEffect(() => {
    setNewRepoName('');
    setNewRepoDescription('');
    setConnectError(null);
    setForceGithubRepoCreationPrompt(false);
  }, [workspace.activeRepo]);

  const { recoverBareRepoForPush } = useBareRepoRecoveryWorkflow({
    workspace,
    settings,
    triggerRefresh,
    setGitActionToast,
  });

  const {
    ensureInitialCommitForPush,
    requestInitialCommitConfirmationIfNeeded,
  } = useInitialCommitRecoveryWorkflow({
    recoverBareRepoForPush,
    setActiveTab: workspace.setActiveTab,
    setConfirmDialog,
    setGitActionToast,
    language: settings.language,
  });
  const openGithubRepoCreationRecovery = useCallback((failureMessage: unknown) => {
    const activeRepoPath = workspace.activeRepo || '';
    const suggestedName = stripGitSuffix(activeRepoPath.split(/[\\/]/).pop() || '') || 'repository';
    setNewRepoName((prev) => {
      const trimmed = String(prev || '').trim();
      return trimmed || suggestedName;
    });
    setForceGithubRepoCreationPrompt(true);
    const shortError = compactGitError(failureMessage, 320);
    setConnectError(shortError || t('generated.components.layout.workflows.useremoterecoveryworkflow.the_current_remote_is_no_longer_usable_please_create_a_n_3133bbff'));
    workspace.setActiveTab('repo');
  }, [tr, workspace]);

  const maybeRecoverRemoteSetup = useCallback(async ({
    command,
    options,
    failureMessage,
  }: RemoteSetupRecoveryParams): Promise<boolean> => {
    const supportsRecovery = command === 'push' || command === 'pull' || command === 'fetch';
    if (!supportsRecovery || options?.skipGithubRecoveryOnPushFailure || !shouldOfferGithubRepoRecoveryOnPushFailure(failureMessage)) {
      return false;
    }
    const missingRemote = isMissingRemotePushError(failureMessage);

    if (isRemoteRepositoryMissingError(failureMessage)) {
      const removeOriginResult = await gitClient.removeRemote('origin');
      const removeOriginError = String(removeOriginResult.error || '').trim();
      const originAlreadyMissing = /no such remote\s+'?origin'?/i.test(removeOriginError);
      if (!removeOriginResult.success && !originAlreadyMissing) {
        setGitActionToast({
          msg: removeOriginResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.could_not_automatically_remove_the_invalid_origin_remote_117d0832'),
          isError: true,
        });
        return false;
      }

      const activeRepoPath = workspace.activeRepo || '';
      const suggestedName = stripGitSuffix(activeRepoPath.split(/[\\/]/).pop() || '') || 'repository';
      setNewRepoName((prev) => {
        const trimmed = String(prev || '').trim();
        return trimmed || suggestedName;
      });
      setForceGithubRepoCreationPrompt(true);
      setConnectError(null);
      workspace.setActiveTab('repo');
      triggerRefresh();
      setGitActionToast({
        msg: t('generated.components.layout.workflows.useremoterecoveryworkflow.github_repository_no_longer_exists_origin_was_removed_pl_d880ec95'),
        isError: false,
      });
      return true;
    }

    if (missingRemote) {
      const activeRepoPath = workspace.activeRepo || '';
      const suggestedName = stripGitSuffix(activeRepoPath.split(/[\\/]/).pop() || '') || 'repository';
      setNewRepoName((prev) => {
        const trimmed = String(prev || '').trim();
        return trimmed || suggestedName;
      });
      setForceGithubRepoCreationPrompt(true);
      setConnectError(null);
      workspace.setActiveTab('repo');
      setGitActionToast({
        msg: t('generated.components.layout.workflows.useremoterecoveryworkflow.no_valid_origin_remote_is_configured_please_set_name_pri_c0095a48'),
        isError: false,
      });
      return true;
    }

    const shortError = compactGitError(failureMessage);
    let isGithubAuthenticated = false;
    try {
      const authStatus = await githubClient.checkAuthStatus();
      isGithubAuthenticated = Boolean(authStatus.authenticated);
    } catch {
      isGithubAuthenticated = false;
    }

    if (!isGithubAuthenticated) {
      setConfirmDialog({
        variant: 'confirm',
        title: t('generated.components.layout.workflows.useremoterecoveryworkflow.github_connection_required_065a4af5'),
        message: t('generated.components.layout.workflows.useremoterecoveryworkflow.the_remote_is_no_longer_valid_sign_in_to_github_then_you_ce6305ac'),
        contextItems: shortError ? [{ label: t('generated.components.layout.workflows.useremoterecoveryworkflow.git_error_91da27d4'), value: shortError }] : [],
        irreversible: false,
        consequences: t('generated.components.layout.workflows.useremoterecoveryworkflow.after_login_the_repo_tab_will_show_the_form_for_name_des_bef9f3d7'),
        confirmLabel: t('generated.components.layout.sidebar.reposidebarcontent.go_to_github_tab_f834a24c'),
        onConfirm: async () => {
          workspace.setActiveTab('github');
        },
      });
      return true;
    }

    openGithubRepoCreationRecovery(failureMessage);
    setGitActionToast({
      msg: t('generated.components.layout.workflows.useremoterecoveryworkflow.github_remote_is_no_longer_valid_please_set_name_private_6fe27238'),
      isError: true,
    });
    return true;
  }, [openGithubRepoCreationRecovery, setConfirmDialog, setGitActionToast, tr, triggerRefresh, workspace]);

  const maybeHandlePushWithoutOrigin = useCallback(async ({
    command,
    options,
  }: PushWithoutOriginParams): Promise<boolean> => {
    if (command !== 'push' || options?.skipGithubRecoveryOnPushFailure) {
      return false;
    }

    const remotesResult = await gitClient.listRemotes();
    if (!remotesResult.success) {
      return false;
    }

    const remoteNames = String(remotesResult.data || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (remoteNames.includes('origin')) {
      return false;
    }

    const activeRepoPath = workspace.activeRepo || '';
    const suggestedName = stripGitSuffix(activeRepoPath.split(/[\\/]/).pop() || '') || 'repository';
    setNewRepoName((prev) => {
      const trimmed = String(prev || '').trim();
      return trimmed || suggestedName;
    });
    setForceGithubRepoCreationPrompt(true);
    setConnectError(null);
    workspace.setActiveTab('repo');
    triggerRefresh();
    setGitActionToast({
      msg: t('generated.components.layout.workflows.useremoterecoveryworkflow.no_origin_remote_is_configured_please_set_name_private_a_7c734d64'),
      isError: false,
    });
    return true;
  }, [setGitActionToast, tr, triggerRefresh, workspace]);

  const createGithubRepoAndConnect = useCallback(async (
    options: {
      replaceOriginIfExists?: boolean;
      pushAfterConnect?: boolean;
      confirmedAutoInitialCommit?: boolean;
    } = {},
  ): Promise<boolean> => {
    if (!gitClient.isAvailable() || !githubClient.isAvailable() || !workspace.activeRepo) return false;

    const { replaceOriginIfExists = true, pushAfterConnect = true, confirmedAutoInitialCommit = false } = options;
    const folderName = stripGitSuffix(workspace.activeRepo.split(/[\\/]/).pop() || '') || 'repository';
    const name = (newRepoName || folderName).trim();
    const description = newRepoDescription.trim();

    if (!name) {
      const message = t('generated.components.layout.workflows.useremoterecoveryworkflow.repository_name_must_not_be_empty_d1636d83');
      setConnectError(message);
      setGitActionToast({ msg: message, isError: true });
      return false;
    }

    setIsConnectingGithubRepo(true);
    setConnectError(null);

    try {
      const result = await githubClient.createRepository(name, description, newRepoPrivate);
      if (!result.success) {
        throw new Error(result.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_creating_the_github_repository_8f0393dd'));
      }

      const remoteUrl = result.data.cloneUrl;
      const remotesResult = await gitClient.listRemotes();
      const remoteNames = remotesResult.success
        ? String(remotesResult.data || '')
          .split('\n')
          .map((line: string) => line.trim())
          .filter(Boolean)
        : [];

      if (remoteNames.includes('origin')) {
        const originUrlResult = await gitClient.getRemoteUrl('origin');
        const currentOriginUrl = originUrlResult.success ? String(originUrlResult.data || '').trim() : '';
        const needsUpdate = currentOriginUrl !== remoteUrl;

        if (needsUpdate) {
          if (!replaceOriginIfExists) {
            throw new Error(t('generated.components.layout.workflows.useremoterecoveryworkflow.remote_origin_already_exists_with_a_different_url_06d60d88'));
          }
          const setUrlResult = await gitClient.setRemoteUrl('origin', remoteUrl);
          if (!setUrlResult.success) {
            throw new Error(setUrlResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_updating_remote_origin_74dca838'));
          }
        }
      } else {
        const addRemoteResult = await gitClient.addRemote('origin', remoteUrl);
        if (!addRemoteResult.success) {
          throw new Error(addRemoteResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_setting_git_remote_2d2ed41d'));
        }
      }

      if (pushAfterConnect) {
        const pushResult = await gitClient.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });
        if (!pushResult.success) {
          const errorMessage = String(pushResult.error || '');
          if (isNoLocalCommitPushError(errorMessage)) {
            if (!confirmedAutoInitialCommit) {
              const confirmationOpened = await requestInitialCommitConfirmationIfNeeded({
                commandLabel: 'git push -u origin HEAD',
                confirmLabel: t('generated.components.layout.workflows.usegitcommandworkflow.commit_all_changes_and_push_72c5fb04'),
                onConfirm: async () => {
                  if (!gitClient.isAvailable()) return;
                  setIsConnectingGithubRepo(true);
                  try {
                    const prepared = await ensureInitialCommitForPush();
                    if (!prepared) {
                      return;
                    }
                    const retryPushResult = await gitClient.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });
                    if (!retryPushResult.success) {
                      throw new Error(retryPushResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_pushing_to_github_f44c5f17'));
                    }
                    setGitActionToast({
                      msg: t('generated.components.layout.workflows.useremoterecoveryworkflow.github_repository_created_initial_commit_created_and_pus_b5ecc5f6'),
                      isError: false,
                    });
                    setForceGithubRepoCreationPrompt(false);
                    setConnectError(null);
                    triggerRefresh();
                  } catch (confirmError: any) {
                    const message = confirmError?.message || t('generated.components.layout.workflows.useremoterecoveryworkflow.could_not_prepare_push_ca1050f2');
                    setConnectError(message);
                    setGitActionToast({ msg: message, isError: true });
                  } finally {
                    setIsConnectingGithubRepo(false);
                  }
                },
              });
              if (confirmationOpened) {
                return false;
              }
            }
            const prepared = await ensureInitialCommitForPush();
            if (!prepared) {
              throw new Error(t('generated.components.layout.workflows.useremoterecoveryworkflow.could_not_auto_prepare_push_15a11b83'));
            }
            const retryPushResult = await gitClient.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });
            if (!retryPushResult.success) {
              throw new Error(retryPushResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_pushing_to_github_f44c5f17'));
            }
            setGitActionToast({
              msg: t('generated.components.layout.workflows.useremoterecoveryworkflow.github_repository_created_initial_commit_created_and_pus_b5ecc5f6'),
              isError: false,
            });
            setForceGithubRepoCreationPrompt(false);
            setConnectError(null);
            triggerRefresh();
            return true;
          }
          throw new Error(pushResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_pushing_to_github_f44c5f17'));
        }
      }

      setGitActionToast({
        msg: pushAfterConnect
          ? t('generated.components.layout.workflows.useremoterecoveryworkflow.created_new_github_repository_connected_it_and_pushed_th_da33aa0c')
          : t('generated.components.layout.workflows.useremoterecoveryworkflow.created_and_connected_new_github_repository_68f5adac'),
        isError: false,
      });
      setForceGithubRepoCreationPrompt(false);
      setConnectError(null);
      triggerRefresh();
      return true;
    } catch (e: any) {
      const message = e?.message || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_creating_and_connecting_github_repository_7e19e737');
      setConnectError(message);
      setGitActionToast({ msg: message, isError: true });
      return false;
    } finally {
      setIsConnectingGithubRepo(false);
    }
  }, [ensureInitialCommitForPush, newRepoDescription, newRepoName, newRepoPrivate, requestInitialCommitConfirmationIfNeeded, setGitActionToast, tr, triggerRefresh, workspace]);

  return {
    connectError,
    createGithubRepoAndConnect,
    ensureInitialCommitForPush,
    forceGithubRepoCreationPrompt,
    isConnectingGithubRepo,
    maybeHandlePushWithoutOrigin,
    maybeRecoverRemoteSetup,
    newRepoDescription,
    newRepoName,
    newRepoPrivate,
    openGithubRepoCreationRecovery,
    recoverBareRepoForPush,
    requestInitialCommitConfirmationIfNeeded,
    setConnectError,
    setForceGithubRepoCreationPrompt,
    setNewRepoDescription,
    setNewRepoName,
    setNewRepoPrivate,
  };
};
