import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import { compactGitError, isMissingRemotePushError, isNoLocalCommitPushError, shouldOfferGithubRepoRecoveryOnPushFailure } from '@/utils/gitPushRecovery';
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

const runAtRepo = (repoPath: string, args: ReturnType<typeof gitClient.buildPushCurrentBranchArgs>) =>
  gitClient.runGitCommandForRepo(repoPath, args[0], ...args.slice(1));

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

  useLayoutEffect(() => {
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
    getActiveRepo: () => activeRepoRef.current,
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
      const message =
        shortError || t('generated.components.layout.workflows.useremoterecoveryworkflow.the_current_remote_is_no_longer_usable_please_create_a_n_3133bbff');
      setConnectError(message);
      setGitActionToast({ msg: message, isError: true });
      workspace.setActiveTab('repo');
    },
    [setGitActionToast, t, workspace],
  );

  const requestGithubRepoCreationRecovery = useCallback(
    (failureMessage: unknown): boolean => {
      const repoAtRequest = activeRepoRef.current;
      if (!repoAtRequest) return false;
      const shortError = compactGitError(failureMessage);

      setConfirmDialog({
        variant: 'confirm',
        title: t('generated.components.layout.workflows.useremoterecoveryworkflow.remote_access_failed_9a3129df'),
        message: t(
          'generated.components.layout.workflows.useremoterecoveryworkflow.git_could_not_use_origin_authentication_permissions_or_remote_availability_may_be_the_cause_37fd2e1b',
        ),
        contextItems: shortError ? [{ label: t('generated.components.layout.workflows.useremoterecoveryworkflow.git_error_91da27d4'), value: shortError }] : [],
        irreversible: false,
        consequences: t(
          'generated.components.layout.workflows.useremoterecoveryworkflow.the_existing_origin_will_remain_unchanged_no_remote_is_removed_automatically_29e57d81',
        ),
        confirmLabel: t('generated.components.layout.workflows.useremoterecoveryworkflow.open_recovery_options_3d3a5d62'),
        onConfirm: async () => {
          if (!isStillActiveRepo(repoAtRequest)) return;
          openGithubRepoCreationRecovery(failureMessage);
        },
      });
      return true;
    },
    [isStillActiveRepo, openGithubRepoCreationRecovery, setConfirmDialog, t],
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

      if (missingRemote) {
        return requestGithubRepoCreationRecovery(failureMessage);
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

      return requestGithubRepoCreationRecovery(failureMessage);
    },
    [isStillActiveRepo, requestGithubRepoCreationRecovery, setConfirmDialog, t, workspace],
  );

  const maybeHandlePushWithoutOrigin = useCallback(
    async ({ command, options }: PushWithoutOriginParams): Promise<boolean> => {
      const repoAtStart = activeRepoRef.current;
      if (!repoAtStart) return false;
      if (command !== 'push' || options?.skipGithubRecoveryOnPushFailure) {
        return false;
      }

      const remotesResult = await gitClient.runGitCommandForRepo(repoAtStart, 'remote');
      if (!isStillActiveRepo(repoAtStart)) return false;
      if (!remotesResult.success) {
        return false;
      }

      const remoteNames = String(remotesResult.data || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      // Any configured remote (origin, upstream, github, ...) means the push can
      // target it, so the "create a GitHub repo because origin is missing"
      // recovery must not fire. Only offer it when there is no remote at all.
      if (remoteNames.length > 0) {
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
      const remotesResult = await gitClient.runGitCommandForRepo(repoAtStart, 'remote');
      if (!isStillActiveRepo(repoAtStart)) return;
      const remoteNames = remotesResult.success ? parseRemoteNames(remotesResult.data) : [];

      if (!remoteNames.includes('origin')) {
        const addRemoteResult = await gitClient.runGitCommandForRepo(repoAtStart, 'remote', 'add', 'origin', remoteUrl);
        if (!isStillActiveRepo(repoAtStart)) return;
        if (!addRemoteResult.success) {
          throw new Error(
            addRemoteResult.error || t('generated.components.layout.workflows.useremoterecoveryworkflow.error_while_setting_git_remote_2d2ed41d'),
          );
        }
        return;
      }

      const originUrlResult = await gitClient.runGitCommandForRepo(repoAtStart, 'remote', 'get-url', 'origin');
      if (!isStillActiveRepo(repoAtStart)) return;
      const currentOriginUrl = originUrlResult.success ? String(originUrlResult.data || '').trim() : '';
      if (currentOriginUrl === remoteUrl) return;

      if (!replaceOriginIfExists) {
        throw new Error(t('generated.components.layout.workflows.useremoterecoveryworkflow.remote_origin_already_exists_with_a_different_url_06d60d88'));
      }

      const setUrlResult = await gitClient.runGitCommandForRepo(repoAtStart, 'remote', 'set-url', 'origin', remoteUrl);
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
      const pushResult = await runAtRepo(repoAtStart, gitClient.buildPushCurrentBranchArgs({ remote: 'origin', ref: 'HEAD', setUpstream: true }));
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
          repoPath: repoAtStart,
          confirmLabel: t('generated.components.layout.workflows.usegitcommandworkflow.commit_all_changes_and_push_72c5fb04'),
          onConfirm: async () => {
            if (!gitClient.isAvailable()) return;
            const confirmRepo = activeRepoRef.current;
            if (!confirmRepo || confirmRepo !== repoAtStart) return;
            const connectionRun = beginGithubConnection(confirmRepo);
            if (!connectionRun) return;
            try {
              const prepared = await ensureInitialCommitForPush({ expectedRepoPath: repoAtStart });
              if (!isCurrentGithubConnection(connectionRun)) return;
              if (!prepared) return;

              const retryPushResult = await runAtRepo(repoAtStart, gitClient.buildPushCurrentBranchArgs({ remote: 'origin', ref: 'HEAD', setUpstream: true }));
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

      const prepared = await ensureInitialCommitForPush({ expectedRepoPath: repoAtStart });
      if (!isStillActiveRepo(repoAtStart)) return { completed: false, showGenericSuccess: false };
      if (!prepared) {
        throw new Error(t('generated.components.layout.workflows.useremoterecoveryworkflow.could_not_auto_prepare_push_15a11b83'));
      }

      const retryPushResult = await runAtRepo(repoAtStart, gitClient.buildPushCurrentBranchArgs({ remote: 'origin', ref: 'HEAD', setUpstream: true }));
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
