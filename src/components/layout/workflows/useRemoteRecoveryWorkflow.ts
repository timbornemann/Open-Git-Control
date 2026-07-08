import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '../../../global';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import {
  compactGitError,
  isMissingRemotePushError,
  isNoLocalCommitPushError,
  isRemoteRepositoryMissingError,
  isWorkTreeRequiredError,
  shouldOfferGithubRepoRecoveryOnPushFailure,
} from '../../../utils/gitPushRecovery';
import type { AppTabId } from '../sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '../layoutTypes';
import type { RunGitCommandOptions } from '../state/appStateShared';
import {
  normalizeRepoPointer,
  splitRepoPath,
  stripGitSuffix,
} from './repoWorkflowUtils';

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

  const recoverBareRepoForPush = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI || !workspace.activeRepo) return false;

    const sourceRepoPath = workspace.activeRepo;
    const { parentDir, baseName } = splitRepoPath(sourceRepoPath);
    const preferredNameBase = stripGitSuffix(baseName) || `${baseName}-worktree`;
    const candidateNames = Array.from(new Set([
      preferredNameBase,
      `${preferredNameBase}-worktree`,
      ...Array.from({ length: 24 }, (_value, index) => `${preferredNameBase}-worktree-${index + 2}`),
    ]));

    let existingOriginUrl: string | null = null;
    try {
      const originResult = await window.electronAPI.runGitCommand('remote', 'get-url', 'origin');
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
      const nextResult = await window.electronAPI.gitClone(sourceRepoPath, parentDir, candidateName);
      if (nextResult.success) {
        cloneResult = nextResult;
        break;
      }

      lastCloneError = String(nextResult.error || '').trim();
      const alreadyExists = (
        /destination path.*already exists/i.test(lastCloneError)
        || /already exists and is not an empty directory/i.test(lastCloneError)
      );
      if (!alreadyExists) {
        break;
      }
    }

    if (!cloneResult) {
      workspace.setActiveTab('repo');
      setGitActionToast({
        msg: lastCloneError || tr(
          'Bare-Repository konnte nicht automatisch in ein Arbeitsverzeichnis ueberfuehrt werden.',
          'Could not automatically convert bare repository into a working directory.',
        ),
        isError: true,
      });
      return false;
    }

    const switchedPath = cloneResult.repoPath;
    const ensureRecoveredRepoSelected = async () => {
      await window.electronAPI.setRepoPath(switchedPath);
      workspace.setActiveRepo(switchedPath);
    };

    await workspace.addOpenRepo(switchedPath);
    await ensureRecoveredRepoSelected();
    // Keep the original bare repo open to avoid a close/switch race that could
    // accidentally redirect follow-up commands to an unrelated repository.
    triggerRefresh();

    await ensureRecoveredRepoSelected();

    const headAfterCloneResult = await window.electronAPI.runGitCommand('show', '--quiet', '--format=%H', 'HEAD');
    const hasLocalCommit = Boolean(headAfterCloneResult.success && String(headAfterCloneResult.data || '').trim());
    if (!hasLocalCommit) {
      const remoteBranchesResult = await window.electronAPI.runGitCommand('branch', '-r');
      const remoteBranches = remoteBranchesResult.success
        ? String(remoteBranchesResult.data || '')
          .split('\n')
          .map((line: string) => line.replace(/^\*\s*/, '').trim())
          .filter((line: string) => line.startsWith('origin/'))
          .filter((line: string) => !/^origin\/head\b/i.test(line))
        : [];

      const preferredRemoteBranch = [
        `origin/${(settings.defaultBranch || '').trim()}`,
        'origin/main',
        'origin/master',
      ].find((candidate) => remoteBranches.includes(candidate)) || remoteBranches[0];

      if (preferredRemoteBranch) {
        const localBranchName = preferredRemoteBranch.replace(/^origin\//, '').trim();
        await ensureRecoveredRepoSelected();
        const checkoutTracked = await window.electronAPI.runGitCommand(
          'checkout',
          '-b',
          localBranchName,
          '--track',
          preferredRemoteBranch,
        );

        if (!checkoutTracked.success) {
          await ensureRecoveredRepoSelected();
          const checkoutForced = await window.electronAPI.runGitCommand(
            'checkout',
            '-B',
            localBranchName,
            preferredRemoteBranch,
          );
          if (!checkoutForced.success) {
            workspace.setActiveTab('repo');
            setGitActionToast({
              msg: checkoutForced.error || checkoutTracked.error || tr(
                'Arbeitsverzeichnis wurde erstellt, aber ein Start-Branch konnte nicht automatisch ausgecheckt werden.',
                'Working directory was created, but a starter branch could not be checked out automatically.',
              ),
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
      const removeOriginResult = await window.electronAPI.runGitCommand('remote', 'remove', 'origin');
      if (!removeOriginResult.success) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: removeOriginResult.error || tr(
            'Arbeitsverzeichnis wurde erstellt, aber lokales origin-Remote konnte nicht entfernt werden.',
            'Working directory was created, but local origin remote could not be removed.',
          ),
          isError: true,
        });
        return false;
      }
    } else {
      await ensureRecoveredRepoSelected();
      const setUrlResult = await window.electronAPI.runGitCommand('remote', 'set-url', 'origin', existingOriginUrl);
      if (!setUrlResult.success) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: setUrlResult.error || tr(
            'Arbeitsverzeichnis wurde erstellt, aber origin-Remote konnte nicht auf die vorherige URL gesetzt werden.',
            'Working directory was created, but origin remote could not be set to the previous URL.',
          ),
          isError: true,
        });
        return false;
      }
    }

    workspace.setActiveTab('repo');
    setGitActionToast({
      msg: tr(
        'Bare-Repository erkannt: automatisch in ein Arbeitsverzeichnis geklont und umgeschaltet.',
        'Bare repository detected: automatically cloned to a working directory and switched.',
      ),
      isError: false,
    });
    triggerRefresh();
    return true;
  }, [setGitActionToast, settings.defaultBranch, tr, triggerRefresh, workspace]);

  const ensureInitialCommitForPush = useCallback(async (
    options: { skipBareRepoRecovery?: boolean } = {},
  ): Promise<boolean> => {
    if (!window.electronAPI) return false;

    const commitMessage = tr('Initial commit', 'Initial commit');
    const isIdentityMissingError = (message: string) => (
      /please tell me who you are/i.test(message)
      || /unable to auto-detect email address/i.test(message)
      || /user\.name/i.test(message)
      || /user\.email/i.test(message)
    );
    const isNothingToCommitError = (message: string) => (
      /nothing to commit/i.test(message)
      || /working tree clean/i.test(message)
    );

    const statusResult = await window.electronAPI.runGitCommand('statusPorcelain');
    const hasChanges = Boolean(statusResult.success && String(statusResult.data || '').trim().length > 0);

    if (hasChanges) {
      const addResult = await window.electronAPI.runGitCommand('add', '-A');
      if (!addResult.success) {
        setGitActionToast({
          msg: addResult.error || tr('Konnte Aenderungen nicht automatisch stagen.', 'Could not stage changes automatically.'),
          isError: true,
        });
        return false;
      }
    }

    const commitArgs = hasChanges
      ? ['commit', '-m', commitMessage]
      : ['commit', '--allow-empty', '-m', commitMessage];

    const commitResult = await window.electronAPI.runGitCommand(commitArgs[0], ...commitArgs.slice(1));
    if (commitResult.success) {
      return true;
    }

    const commitError = String(commitResult.error || '');
    if (isNothingToCommitError(commitError)) {
      const emptyCommitResult = await window.electronAPI.runGitCommand('commit', '--allow-empty', '-m', commitMessage);
      if (emptyCommitResult.success) {
        return true;
      }
      const emptyCommitError = String(emptyCommitResult.error || '');
      if (!options.skipBareRepoRecovery && isWorkTreeRequiredError(emptyCommitError)) {
        const recovered = await recoverBareRepoForPush();
        if (!recovered) {
          return false;
        }
        return ensureInitialCommitForPush({ skipBareRepoRecovery: true });
      }
      if (isIdentityMissingError(String(emptyCommitResult.error || ''))) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: tr(
            'Push konnte nicht automatisch vorbereitet werden: Git user.name/user.email fehlt. Bitte Git-Identity konfigurieren.',
            'Could not auto-prepare push: missing Git user.name/user.email. Please configure your Git identity.',
          ),
          isError: true,
        });
        return false;
      }
      setGitActionToast({
        msg: emptyCommitResult.error || tr('Automatischer Initial-Commit fehlgeschlagen.', 'Automatic initial commit failed.'),
        isError: true,
      });
      return false;
    }

    if (!options.skipBareRepoRecovery && isWorkTreeRequiredError(commitError)) {
      const recovered = await recoverBareRepoForPush();
      if (!recovered) {
        return false;
      }
      return ensureInitialCommitForPush({ skipBareRepoRecovery: true });
    }

    if (isIdentityMissingError(commitError)) {
      workspace.setActiveTab('repo');
      setGitActionToast({
        msg: tr(
          'Push konnte nicht automatisch vorbereitet werden: Git user.name/user.email fehlt. Bitte Git-Identity konfigurieren.',
          'Could not auto-prepare push: missing Git user.name/user.email. Please configure your Git identity.',
        ),
        isError: true,
      });
      return false;
    }

    setGitActionToast({
      msg: commitResult.error || tr('Automatischer Initial-Commit fehlgeschlagen.', 'Automatic initial commit failed.'),
      isError: true,
    });
    return false;
  }, [recoverBareRepoForPush, setGitActionToast, tr, workspace]);

  const requestInitialCommitConfirmationIfNeeded = useCallback(async (
    params: {
      commandLabel: string;
      confirmLabel: string;
      onConfirm: () => Promise<void>;
    },
  ): Promise<boolean> => {
    if (!window.electronAPI) return false;

    let changedFiles: number | null = null;
    try {
      const statusResult = await window.electronAPI.runGitCommand('statusPorcelain');
      if (statusResult.success) {
        changedFiles = String(statusResult.data || '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .length;
      }
    } catch {
      changedFiles = null;
    }

    if (changedFiles === 0) {
      return false;
    }

    workspace.setActiveTab('repo');
    setConfirmDialog({
      variant: 'danger',
      title: tr('Initial-Commit mit allen lokalen Aenderungen?', 'Initial commit with all local changes?'),
      message: tr(
        'Dieses Repository hat noch keinen lokalen Commit. Zum Pushen muessten jetzt alle lokalen Aenderungen inklusive untracked Dateien gestaged und als Initial-Commit gespeichert werden.',
        'This repository has no local commit yet. To push it now, all local changes including untracked files would be staged and saved as the initial commit.',
      ),
      contextItems: [
        { label: tr('Befehl', 'Command'), value: params.commandLabel },
        {
          label: tr('Lokale Aenderungen', 'Local changes'),
          value: changedFiles === null
            ? tr('Status konnte nicht gelesen werden', 'Status could not be read')
            : tr(
              `${changedFiles} Datei${changedFiles === 1 ? '' : 'en'} betroffen`,
              `${changedFiles} file${changedFiles === 1 ? '' : 's'} affected`,
            ),
        },
        {
          label: tr('Automatischer Schritt', 'Automatic step'),
          value: 'git add -A && git commit -m "Initial commit"',
        },
      ],
      irreversible: false,
      consequences: tr(
        'Bitte pruefe vorher, ob keine lokalen Artefakte, Secrets oder versehentlich erzeugten Dateien im Working Tree liegen.',
        'Please check first that the working tree does not contain local artifacts, secrets, or accidentally generated files.',
      ),
      confirmLabel: params.confirmLabel,
      onConfirm: params.onConfirm,
    });
    return true;
  }, [setConfirmDialog, tr, workspace]);

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
      const removeOriginResult = await window.electronAPI.runGitCommand('remote', 'remove', 'origin');
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
      const authStatus = await window.electronAPI.githubCheckAuthStatus();
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

    const remotesResult = await window.electronAPI.runGitCommand('remote');
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
    if (!window.electronAPI || !workspace.activeRepo) return false;

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
      const result = await window.electronAPI.githubCreateRepo(name, description, newRepoPrivate);
      if (!result.success) {
        throw new Error(result.error || tr('Fehler beim Erstellen des GitHub-Repositories.', 'Error while creating the GitHub repository.'));
      }

      const remoteUrl = result.data.cloneUrl;
      const remotesResult = await window.electronAPI.runGitCommand('remote');
      const remoteNames = remotesResult.success
        ? String(remotesResult.data || '')
          .split('\n')
          .map((line: string) => line.trim())
          .filter(Boolean)
        : [];

      if (remoteNames.includes('origin')) {
        const originUrlResult = await window.electronAPI.runGitCommand('remote', 'get-url', 'origin');
        const currentOriginUrl = originUrlResult.success ? String(originUrlResult.data || '').trim() : '';
        const needsUpdate = currentOriginUrl !== remoteUrl;

        if (needsUpdate) {
          if (!replaceOriginIfExists) {
            throw new Error(tr('Remote "origin" existiert bereits mit anderer URL.', 'Remote "origin" already exists with a different URL.'));
          }
          const setUrlResult = await window.electronAPI.runGitCommand('remote', 'set-url', 'origin', remoteUrl);
          if (!setUrlResult.success) {
            throw new Error(setUrlResult.error || tr('Fehler beim Aktualisieren von remote "origin".', 'Error while updating remote "origin".'));
          }
        }
      } else {
        const addRemoteResult = await window.electronAPI.runGitCommand('remote', 'add', 'origin', remoteUrl);
        if (!addRemoteResult.success) {
          throw new Error(addRemoteResult.error || tr('Fehler beim Setzen des Git-Remotes.', 'Error while setting Git remote.'));
        }
      }

      if (pushAfterConnect) {
        const pushResult = await window.electronAPI.runGitCommand('push', '-u', 'origin', 'HEAD');
        if (!pushResult.success) {
          const errorMessage = String(pushResult.error || '');
          if (isNoLocalCommitPushError(errorMessage)) {
            if (!confirmedAutoInitialCommit) {
              const confirmationOpened = await requestInitialCommitConfirmationIfNeeded({
                commandLabel: 'git push -u origin HEAD',
                confirmLabel: tr('Alle Aenderungen committen und pushen', 'Commit all changes and push'),
                onConfirm: async () => {
                  if (!window.electronAPI) return;
                  setIsConnectingGithubRepo(true);
                  try {
                    const prepared = await ensureInitialCommitForPush();
                    if (!prepared) {
                      return;
                    }
                    const retryPushResult = await window.electronAPI.runGitCommand('push', '-u', 'origin', 'HEAD');
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
            const retryPushResult = await window.electronAPI.runGitCommand('push', '-u', 'origin', 'HEAD');
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
