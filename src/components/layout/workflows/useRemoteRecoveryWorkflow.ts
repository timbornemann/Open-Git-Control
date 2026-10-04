import { useCallback, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { compactGitError, isMissingRemotePushError, isPushAuthOrPermissionError } from '@/utils/gitPushRecovery';
import type { AppTabId } from '@/app/state/contracts';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { RunGitCommandOptions } from '@/components/layout/state/appStateShared';
import { useBareRepoRecoveryWorkflow } from './useBareRepoRecoveryWorkflow';
import { useInitialCommitRecoveryWorkflow } from './useInitialCommitRecoveryWorkflow';
import { openRemoteTransferDialog } from '@/components/hosting/remoteTransferDialogState';

type Toast = { msg: string; isError: boolean };

type WorkspaceBridge = {
  activeRepo: string | null;
  addOpenRepo: (repoPath: string) => Promise<boolean | void>;
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

export const useRemoteRecoveryWorkflow = ({ workspace, settings, triggerRefresh, setConfirmDialog, setGitActionToast }: Params) => {
  const activeRepoRef = useRef<string | null>(workspace.activeRepo);
  const { t, tr } = useLanguageTranslations(settings.language as AppLanguage);
  const isStillActiveRepo = useCallback((repoPath: string | null) => Boolean(repoPath && activeRepoRef.current === repoPath), []);
  useLayoutEffect(() => {
    activeRepoRef.current = workspace.activeRepo;
  }, [workspace.activeRepo]);

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
  const openRemoteSetupRecovery = useCallback(
    (failureMessage: unknown) => {
      const repoPath = activeRepoRef.current;
      if (!repoPath) return;
      setGitActionToast({ msg: compactGitError(failureMessage) || 'Configure a remote and select its hosting account.', isError: true });
      workspace.setActiveTab('repo');
      openRemoteTransferDialog({ repoPath, mode: 'remotes' });
    },
    [setGitActionToast, workspace],
  );

  const requestRemoteSetupRecovery = useCallback(
    (failureMessage: unknown): boolean => {
      const repoAtRequest = activeRepoRef.current;
      if (!repoAtRequest) return false;
      const shortError = compactGitError(failureMessage);

      setConfirmDialog({
        variant: 'confirm',
        title: t('generated.components.layout.workflows.useremoterecoveryworkflow.remote_access_failed_9a3129df'),
        message: tr(
          'Git konnte den gewählten Endpunkt nicht verwenden. Konto, Berechtigungen und Remote-URL prüfen.',
          'Git could not use the selected endpoint. Check the account, permissions, and remote URL.',
        ),
        contextItems: shortError ? [{ label: t('generated.components.layout.workflows.useremoterecoveryworkflow.git_error_91da27d4'), value: shortError }] : [],
        irreversible: false,
        consequences: t(
          'generated.components.layout.workflows.useremoterecoveryworkflow.the_existing_origin_will_remain_unchanged_no_remote_is_removed_automatically_29e57d81',
        ),
        confirmLabel: t('generated.components.layout.workflows.useremoterecoveryworkflow.open_recovery_options_3d3a5d62'),
        onConfirm: async () => {
          if (!isStillActiveRepo(repoAtRequest)) return;
          openRemoteSetupRecovery(failureMessage);
        },
      });
      return true;
    },
    [isStillActiveRepo, openRemoteSetupRecovery, setConfirmDialog, t, tr],
  );

  const maybeRecoverRemoteSetup = useCallback(
    async ({ command, options, failureMessage }: RemoteSetupRecoveryParams): Promise<boolean> => {
      const repoAtStart = activeRepoRef.current;
      if (!repoAtStart) return false;
      const supportsRecovery = command === 'push' || command === 'pull' || command === 'fetch';
      if (
        !supportsRecovery ||
        options?.skipGithubRecoveryOnPushFailure ||
        !(isMissingRemotePushError(failureMessage) || isPushAuthOrPermissionError(failureMessage))
      ) {
        return false;
      }
      return requestRemoteSetupRecovery(failureMessage);
    },
    [requestRemoteSetupRecovery],
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

      workspace.setActiveTab('repo');
      openRemoteTransferDialog({ repoPath: repoAtStart, mode: 'remotes' });
      setGitActionToast({
        msg: tr(
          'Noch kein Remote eingerichtet. Ein Git-Ziel hinzufügen und das Konto auswählen.',
          'No remote is configured. Add a Git endpoint and select its account.',
        ),
        isError: false,
      });
      return true;
    },
    [isStillActiveRepo, setGitActionToast, tr, workspace],
  );

  return {
    ensureInitialCommitForPush,
    maybeHandlePushWithoutOrigin,
    maybeRecoverRemoteSetup,
    recoverBareRepoForPush,
    requestInitialCommitConfirmationIfNeeded,
  };
};
