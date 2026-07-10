import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import {
  compactGitError,
  isMissingRemotePushError,
  isNoLocalCommitPushError,
  isRemoteRepositoryMissingError,
  shouldOfferGithubRepoRecoveryOnPushFailure,
} from '@/utils/gitPushRecovery';
import type { AppTabId } from '@/app/state/contracts';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import { stripGitSuffix } from './repoWorkflowUtils';
import { useBareRepoRecoveryWorkflow } from './useBareRepoRecoveryWorkflow';
import { useInitialCommitRecoveryWorkflow } from './useInitialCommitRecoveryWorkflow';
import { useGithubConnectionGuard } from './useGithubConnectionGuard';

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

type PushConnectedRepositoryResult = {
  completed: boolean;
  showGenericSuccess: boolean;
};

const suggestRepositoryName = (repoPath: string | null): string => stripGitSuffix((repoPath || '').split(/[\\/]/).pop() || '') || 'repository';

const parseRemoteNames = (value: unknown): string[] =>
  String(value || '')
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);

export const useRemoteRecoveryWorkflow = ({ workspace, settings, triggerRefresh, setConfirmDialog, setGitActionToast }: Params) => {
  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [forceGithubRepoCreationPrompt, setForceGithubRepoCreationPrompt] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const activeRepoRef = useRef<string | null>(workspace.activeRepo);

  const { t } = useLanguageTranslations(settings.language as AppLanguage);

  const isStillActiveRepo = useCallback((repoPath: string | null) => Boolean(repoPath && activeRepoRef.current === repoPath), []);
  const {
    begin: beginGithubConnection,
    isCurrent: isCurrentGithubConnection,
    finish: finishGithubConnection,
    invalidate: invalidateGithubConnection,
  } = useGithubConnectionGuard(isStillActiveRepo, setIsConnectingGithubRepo);

  useEffect(() => {
    activeRepoRef.current = workspace.activeRepo;
    invalidateGithubConnection();
    setNewRepoName('');
    setNewRepoDescription('');
    setConnectError(null);
    setForceGithubRepoCreationPrompt(false);
  }, [invalidateGithubConnection, workspace.activeRepo]);

  const { recoverBareRepoForPush } = useBareRepoRecoveryWorkflow({
    workspace,
    settings,
    triggerRefresh,
    setGitActionToast,
  });

  const { ensureInitialCommitForPush, requestInitialCommitConfirmationIfNeeded } = useInitialCommitRecoveryWorkflow({
    recoverBareRepoForPush,
    setActiveTab: workspace.setActiveTab,
    setConfirmDialog,
    setGitActionToast,
    language: settings.language,
  });
  const openGithubRepoCreationRecovery = useCallback(
    (failureMessage: unknown) => {
      const suggestedName = suggestRepositoryName(workspace.activeRepo);
      setNewRepoName((prev) => {
        const trimmed = String(prev || '').trim();
        return trimmed || suggestedName;
      });
      setForceGithubRepoCreationPrompt(true);
      const shortError = compactGitError(failureMessage, 320);
      setConnectError(
        shortError || t('generated.components.layout.workflows.useremoterecoveryworkflow.the_current_remote_is_no_longer_usable_please_create_a_n_3133bbff'),
      );
      workspace.setActiveTab('repo');
    },
    [t, workspace],
  );

  const maybeRecoverRemoteSetup = useCallback(
    async ({ command, options, failureMessage }: RemoteSetupRecoveryParams): Promise<boolean> => {
      const repoAtStart = activeRepoRef.current;
      if (!repoAtStart) return false;
      const supportsRecovery = command === 'push' || command === 'pull' || command === 'fetch';
      if (!supportsRecovery || options?.skipGithubRecoveryOnPushFailure || !shouldOfferGithubRepoRecoveryOnPushFailure(failureMessage)) {
        return false;
      }
      const missingRemote = isMissingRemotePushError(failureMessage);

      if (isRemoteRepositoryMissingError(failureMessage)) {
        if (!isStillActiveRepo(repoAtStart)) return false;
        const removeOriginResult = await gitClient.removeRemote('origin');
        if (!isStillActiveRepo(repoAtStart)) return false;
        const removeOriginError = String(removeOriginResult.error || '').trim();
        const originAlreadyMissing = /no such remote\s+'?origin'?/i.test(removeOriginError);
        if (!removeOriginResult.success && !originAlreadyMissing) {
          setGitActionToast({
            msg:
              removeOriginResult.error ||
              t('generated.components.layout.workflows.useremoterecoveryworkflow.could_not_automatically_remove_the_invalid_origin_remote_117d0832'),
            isError: true,
          });
          return false;
        }

        const suggestedName = suggestRepositoryName(repoAtStart);
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
        const suggestedName = suggestRepositoryName(workspace.activeRepo);
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
        if (!isStillActiveRepo(repoAtStart)) return false;
        isGithubAuthenticated = Boolean(authStatus.authenticated);
      } catch {
        if (!isStillActiveRepo(repoAtStart)) return false;
        isGithubAuthenticated = false;
      }

      if (!isGithubAuthenticated) {
        setConfirmDialog({
          variant: 'confirm',
          title: t('generated.components.layout.workflows.useremoterecoveryworkflow.github_connection_required_065a4af5'),
          message: t('generated.components.layout.workflows.useremoterecoveryworkflow.the_remote_is_no_longer_valid_sign_in_to_github_then_you_ce6305ac'),
          contextItems: shortError
            ? [{ label: t('generated.components.layout.workflows.useremoterecoveryworkflow.git_error_91da27d4'), value: shortError }]
            : [],
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
    },
    [isStillActiveRepo, openGithubRepoCreationRecovery, setConfirmDialog, setGitActionToast, t, triggerRefresh, workspace],
  );

  const maybeHandlePushWithoutOrigin = useCallback(
    async ({ command, options }: PushWithoutOriginParams): Promise<boolean> => {
      const repoAtStart = activeRepoRef.current;
      if (!repoAtStart) return false;
      if (command !== 'push' || options?.skipGithubRecoveryOnPushFailure) {
        return false;
      }

      const remotesResult = await gitClient.listRemotes();
      if (!isStillActiveRepo(repoAtStart)) return false;
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

      const suggestedName = suggestRepositoryName(repoAtStart);
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
    },
    [isStillActiveRepo, setGitActionToast, t, triggerRefresh, workspace],
  );

  const ensureOriginRemote = useCallback(
    async (remoteUrl: string, replaceOriginIfExists: boolean): Promise<void> => {
      const repoAtStart = activeRepoRef.current;
      if (!repoAtStart) {
        throw new Error(t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_setting_git_remote_2d2ed41d'));
      }
      const remotesResult = await gitClient.listRemotes();
      if (!isStillActiveRepo(repoAtStart)) return;
      const remoteNames = remotesResult.success ? parseRemoteNames(remotesResult.data) : [];

      if (!remoteNames.includes('origin')) {
        const addRemoteResult = await gitClient.addRemote('origin', remoteUrl);
        if (!isStillActiveRepo(repoAtStart)) return;
        if (!addRemoteResult.success) {
          throw new Error(
            addRemoteResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_setting_git_remote_2d2ed41d'),
          );
        }
        return;
      }

      const originUrlResult = await gitClient.getRemoteUrl('origin');
      if (!isStillActiveRepo(repoAtStart)) return;
      const currentOriginUrl = originUrlResult.success ? String(originUrlResult.data || '').trim() : '';
      if (currentOriginUrl === remoteUrl) return;

      if (!replaceOriginIfExists) {
        throw new Error(t('generated.components.layout.workflows.useremoterecoveryworkflow.remote_origin_already_exists_with_a_different_url_06d60d88'));
      }

      const setUrlResult = await gitClient.setRemoteUrl('origin', remoteUrl);
      if (!isStillActiveRepo(repoAtStart)) return;
      if (!setUrlResult.success) {
        throw new Error(setUrlResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_updating_remote_origin_74dca838'));
      }
    },
    [isStillActiveRepo, t],
  );

  const pushConnectedRepository = useCallback(
    async (confirmedAutoInitialCommit: boolean): Promise<PushConnectedRepositoryResult> => {
      const repoAtStart = activeRepoRef.current;
      if (!repoAtStart) return { completed: false, showGenericSuccess: false };
      const pushResult = await gitClient.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });
      if (!isStillActiveRepo(repoAtStart)) return { completed: false, showGenericSuccess: false };
      if (pushResult.success) {
        return { completed: true, showGenericSuccess: true };
      }

      const errorMessage = String(pushResult.error || '');
      if (!isNoLocalCommitPushError(errorMessage)) {
        throw new Error(pushResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_pushing_to_github_f44c5f17'));
      }

      if (!confirmedAutoInitialCommit) {
        const confirmationOpened = await requestInitialCommitConfirmationIfNeeded({
          commandLabel: 'git push -u origin HEAD',
          confirmLabel: t('generated.components.layout.workflows.usegitcommandworkflow.commit_all_changes_and_push_72c5fb04'),
          onConfirm: async () => {
            if (!gitClient.isAvailable()) return;
            const confirmRepo = activeRepoRef.current;
            if (!confirmRepo) return;
            const connectionRun = beginGithubConnection(confirmRepo);
            if (!connectionRun) return;
            try {
              const prepared = await ensureInitialCommitForPush();
              if (!isCurrentGithubConnection(connectionRun)) return;
              if (!prepared) return;

              const retryPushResult = await gitClient.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });
              if (!isCurrentGithubConnection(connectionRun)) return;
              if (!retryPushResult.success) {
                throw new Error(
                  retryPushResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_pushing_to_github_f44c5f17'),
                );
              }
              setGitActionToast({
                msg: t('generated.components.layout.workflows.useremoterecoveryworkflow.github_repository_created_initial_commit_created_and_pus_b5ecc5f6'),
                isError: false,
              });
              setForceGithubRepoCreationPrompt(false);
              setConnectError(null);
              triggerRefresh();
            } catch (confirmError: any) {
              if (!isCurrentGithubConnection(connectionRun)) return;
              const message = confirmError?.message || t('generated.components.layout.workflows.useremoterecoveryworkflow.could_not_prepare_push_ca1050f2');
              setConnectError(message);
              setGitActionToast({ msg: message, isError: true });
            } finally {
              finishGithubConnection(connectionRun);
            }
          },
        });
        if (confirmationOpened) {
          return { completed: false, showGenericSuccess: false };
        }
      }

      const prepared = await ensureInitialCommitForPush();
      if (!isStillActiveRepo(repoAtStart)) return { completed: false, showGenericSuccess: false };
      if (!prepared) {
        throw new Error(t('generated.components.layout.workflows.useremoterecoveryworkflow.could_not_auto_prepare_push_15a11b83'));
      }

      const retryPushResult = await gitClient.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });
      if (!isStillActiveRepo(repoAtStart)) return { completed: false, showGenericSuccess: false };
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
      return { completed: true, showGenericSuccess: false };
    },
    [
      beginGithubConnection,
      ensureInitialCommitForPush,
      finishGithubConnection,
      isCurrentGithubConnection,
      isStillActiveRepo,
      requestInitialCommitConfirmationIfNeeded,
      setGitActionToast,
      t,
      triggerRefresh,
    ],
  );

  const createGithubRepoAndConnect = useCallback(
    async (
      options: {
        replaceOriginIfExists?: boolean;
        pushAfterConnect?: boolean;
        confirmedAutoInitialCommit?: boolean;
      } = {},
    ): Promise<boolean> => {
      if (!gitClient.isAvailable() || !githubClient.isAvailable() || !workspace.activeRepo) return false;

      const { replaceOriginIfExists = true, pushAfterConnect = true, confirmedAutoInitialCommit = false } = options;
      const folderName = suggestRepositoryName(workspace.activeRepo);
      const name = (newRepoName || folderName).trim();
      const description = newRepoDescription.trim();

      if (!name) {
        const message = t('generated.components.layout.workflows.useremoterecoveryworkflow.repository_name_must_not_be_empty_d1636d83');
        setConnectError(message);
        setGitActionToast({ msg: message, isError: true });
        return false;
      }

      const repoAtStart = workspace.activeRepo;
      if (!repoAtStart) return false;
      const connectionRun = beginGithubConnection(repoAtStart);
      if (!connectionRun) return false;
      setConnectError(null);

      try {
        const result = await githubClient.createRepository(name, description, newRepoPrivate);
        if (!isCurrentGithubConnection(connectionRun)) return false;
        if (!result.success) {
          throw new Error(
            result.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_creating_the_github_repository_8f0393dd'),
          );
        }

        const remoteUrl = result.data.cloneUrl;
        await ensureOriginRemote(remoteUrl, replaceOriginIfExists);
        if (!isCurrentGithubConnection(connectionRun)) return false;

        let showGenericSuccess = true;
        if (pushAfterConnect) {
          const pushOutcome = await pushConnectedRepository(confirmedAutoInitialCommit);
          if (!isCurrentGithubConnection(connectionRun)) return false;
          if (!pushOutcome.completed) return false;
          showGenericSuccess = pushOutcome.showGenericSuccess;
        }

        if (showGenericSuccess) {
          setGitActionToast({
            msg: pushAfterConnect
              ? t('generated.components.layout.workflows.useremoterecoveryworkflow.created_new_github_repository_connected_it_and_pushed_th_da33aa0c')
              : t('generated.components.layout.workflows.useremoterecoveryworkflow.created_and_connected_new_github_repository_68f5adac'),
            isError: false,
          });
        }
        setForceGithubRepoCreationPrompt(false);
        setConnectError(null);
        triggerRefresh();
        return true;
      } catch (e: any) {
        if (!isCurrentGithubConnection(connectionRun)) return false;
        const message =
          e?.message || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_creating_and_connecting_github_repository_7e19e737');
        setConnectError(message);
        setGitActionToast({ msg: message, isError: true });
        return false;
      } finally {
        finishGithubConnection(connectionRun);
      }
    },
    [
      beginGithubConnection,
      ensureOriginRemote,
      finishGithubConnection,
      isCurrentGithubConnection,
      newRepoDescription,
      newRepoName,
      newRepoPrivate,
      pushConnectedRepository,
      setGitActionToast,
      t,
      triggerRefresh,
      workspace.activeRepo,
    ],
  );

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
