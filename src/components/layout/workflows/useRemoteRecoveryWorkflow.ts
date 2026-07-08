import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '../../../global';
import { trByLanguage, type AppLanguage } from '../../../i18n';
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
    setConnectError(shortError || tr(
      'Der aktuelle Remote ist nicht mehr nutzbar. Bitte neues GitHub-Repository anlegen oder origin aktualisieren.',
      'The current remote is no longer usable. Please create a new GitHub repository or update origin.',
    ));
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
          msg: removeOriginResult.error || tr(
            'Das nicht mehr gueltige origin-Remote konnte nicht automatisch entfernt werden.',
            'Could not automatically remove the invalid origin remote.',
          ),
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
        msg: tr(
          'GitHub-Repository nicht mehr vorhanden: origin wurde entfernt. Bitte jetzt Name/Private setzen und neues GitHub-Repository erstellen.',
          'GitHub repository no longer exists: origin was removed. Please set name/private and create a new GitHub repository now.',
        ),
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
        msg: tr(
          'Kein gueltiges origin-Remote konfiguriert. Bitte jetzt Name/Private setzen und GitHub-Repository erstellen.',
          'No valid origin remote is configured. Please set name/private and create a GitHub repository now.',
        ),
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
        title: tr('GitHub-Verbindung erforderlich', 'GitHub connection required'),
        message: tr(
          'Das Remote ist nicht mehr gueltig. Melde dich bei GitHub an, danach kannst du direkt ein neues Repository anlegen und verbinden.',
          'The remote is no longer valid. Sign in to GitHub, then you can create and connect a new repository directly.',
        ),
        contextItems: shortError ? [{ label: tr('Git-Fehler', 'Git error'), value: shortError }] : [],
        irreversible: false,
        consequences: tr(
          'Nach dem Login wird im Repo-Tab wieder das Formular fuer Name/Beschreibung/Private sichtbar.',
          'After login the repo tab will show the form for name/description/private again.',
        ),
        confirmLabel: tr('Zum GitHub-Tab', 'Go to GitHub tab'),
        onConfirm: async () => {
          workspace.setActiveTab('github');
        },
      });
      return true;
    }

    openGithubRepoCreationRecovery(failureMessage);
    setGitActionToast({
      msg: tr(
        'Remote auf GitHub nicht mehr gueltig. Bitte im Repo-Tab Name/Private einstellen und "GitHub-Repo erstellen & verbinden" ausfuehren.',
        'GitHub remote is no longer valid. Please set name/private in the repo tab and run "Create & connect GitHub repo".',
      ),
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
      msg: tr(
        'Kein origin-Remote vorhanden. Bitte jetzt Name/Private setzen und GitHub-Repository erstellen.',
        'No origin remote is configured. Please set name/private and create a GitHub repository now.',
      ),
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
      const message = tr('Repository-Name darf nicht leer sein.', 'Repository name must not be empty.');
      setConnectError(message);
      setGitActionToast({ msg: message, isError: true });
      return false;
    }

    setIsConnectingGithubRepo(true);
    setConnectError(null);

    try {
      const result = await githubClient.createRepository(name, description, newRepoPrivate);
      if (!result.success) {
        throw new Error(result.error || tr('Fehler beim Erstellen des GitHub-Repositories.', 'Error while creating the GitHub repository.'));
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
            throw new Error(tr('Remote "origin" existiert bereits mit anderer URL.', 'Remote "origin" already exists with a different URL.'));
          }
          const setUrlResult = await gitClient.setRemoteUrl('origin', remoteUrl);
          if (!setUrlResult.success) {
            throw new Error(setUrlResult.error || tr('Fehler beim Aktualisieren von remote "origin".', 'Error while updating remote "origin".'));
          }
        }
      } else {
        const addRemoteResult = await gitClient.addRemote('origin', remoteUrl);
        if (!addRemoteResult.success) {
          throw new Error(addRemoteResult.error || tr('Fehler beim Setzen des Git-Remotes.', 'Error while setting Git remote.'));
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
                confirmLabel: tr('Alle Aenderungen committen und pushen', 'Commit all changes and push'),
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
                      throw new Error(retryPushResult.error || tr('Fehler beim Pushen nach GitHub.', 'Error while pushing to GitHub.'));
                    }
                    setGitActionToast({
                      msg: tr(
                        'GitHub-Repository erstellt, Initial-Commit erstellt und gepusht.',
                        'GitHub repository created, initial commit created, and pushed.',
                      ),
                      isError: false,
                    });
                    setForceGithubRepoCreationPrompt(false);
                    setConnectError(null);
                    triggerRefresh();
                  } catch (confirmError: any) {
                    const message = confirmError?.message || tr('Push konnte nicht vorbereitet werden.', 'Could not prepare push.');
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
              throw new Error(tr('Push konnte nicht automatisch vorbereitet werden.', 'Could not auto-prepare push.'));
            }
            const retryPushResult = await gitClient.pushCurrentBranch({ remote: 'origin', ref: 'HEAD', setUpstream: true });
            if (!retryPushResult.success) {
              throw new Error(retryPushResult.error || tr('Fehler beim Pushen nach GitHub.', 'Error while pushing to GitHub.'));
            }
            setGitActionToast({
              msg: tr(
                'GitHub-Repository erstellt, Initial-Commit erstellt und gepusht.',
                'GitHub repository created, initial commit created, and pushed.',
              ),
              isError: false,
            });
            setForceGithubRepoCreationPrompt(false);
            setConnectError(null);
            triggerRefresh();
            return true;
          }
          throw new Error(pushResult.error || tr('Fehler beim Pushen nach GitHub.', 'Error while pushing to GitHub.'));
        }
      }

      setGitActionToast({
        msg: pushAfterConnect
          ? tr('Neues GitHub-Repository erstellt, verbunden und Branch gepusht.', 'Created new GitHub repository, connected it, and pushed the branch.')
          : tr('Neues GitHub-Repository erstellt und verbunden.', 'Created and connected new GitHub repository.'),
        isError: false,
      });
      setForceGithubRepoCreationPrompt(false);
      setConnectError(null);
      triggerRefresh();
      return true;
    } catch (e: any) {
      const message = e?.message || tr('Fehler beim Erstellen und Verbinden mit GitHub.', 'Error while creating and connecting GitHub repository.');
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
