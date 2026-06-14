import { useCallback, useEffect, useRef, useState } from 'react';
import { AppSettingsDto, GitHubCreateReleaseParamsDto, GitJobEventDto } from '../../global';
import { useToastQueue } from '../../hooks/useToastQueue';
import { trByLanguage } from '../../i18n';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useGithubDomain } from './hooks/useGithubDomain';
import { usePullRequests } from '../../hooks/usePullRequests';
import { validateGithubReleaseInput } from '../../utils/githubReleaseValidation';
import {
  buildAlgorithmicChangeListMarkdown,
  buildReleaseNotesPromptHints,
  filterCommitsForReleaseNotes,
} from '../../utils/releaseNotes';
import {
  ReleaseVersionBump,
  suggestNextReleaseTag,
} from '../../utils/releaseTagSuggestion';
import {
  countChangedEntriesFromPorcelainV2,
  isMergeInProgressError,
  parseBranchSyncFromPorcelainV2,
  parseRemoteBranchRef,
  resolveConflictPathAfterGitFailure,
} from '../../utils/gitParsing';
import {
  compactGitError,
  isMissingRemotePushError,
  isMissingUpstreamPushError,
  isNonFastForwardPushError,
  isNoLocalCommitPushError,
  isPullBlockedByLocalChangesError,
  isRemoteRepositoryMissingError,
  isWorkTreeRequiredError,
  shouldOfferGithubRepoRecoveryOnPushFailure,
} from '../../utils/gitPushRecovery';
import {
  DEFAULT_SETTINGS,
  GUARDED_COMMANDS,
  type RunGitCommandOptions,
} from './state/appStateShared';
import { useSidebarCollapseState } from './state/useSidebarCollapseState';
import { usePrAndReleaseState } from './state/usePrAndReleaseState';

const stripGitSuffix = (name: string): string => {
  const normalized = String(name || '').trim();
  if (!normalized) return '';
  const withoutSuffix = normalized.replace(/\.git$/i, '').trim();
  return withoutSuffix || normalized;
};

const splitRepoPath = (repoPath: string): { parentDir: string; baseName: string } => {
  const normalized = String(repoPath || '').trim().replace(/[\\/]+$/, '');
  if (!normalized) {
    return { parentDir: '.', baseName: 'repository' };
  }

  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (separatorIndex < 0) {
    return { parentDir: '.', baseName: normalized };
  }

  const rawParent = normalized.slice(0, separatorIndex);
  const rawBase = normalized.slice(separatorIndex + 1) || 'repository';
  const parentDir = rawParent || (normalized.startsWith('/') ? '/' : '.');
  return {
    parentDir: /^[A-Za-z]:$/.test(parentDir) ? `${parentDir}\\` : parentDir,
    baseName: rawBase,
  };
};

const normalizeRepoPointer = (value: string): string => (
  String(value || '')
    .trim()
    .replace(/^file:\/\//i, '')
    .replace(/[\\]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
);

type ParsedGithubRepoReference = {
  host: string;
  owner: string;
  repo: string;
};

const normalizeGitHost = (value: string): string => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return 'github.com';
  const withoutProtocol = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return withoutProtocol.startsWith('www.') ? withoutProtocol.slice(4) : withoutProtocol;
};

const deriveRepoNameFromCloneSource = (cloneSource: string): string => {
  const normalizedSource = String(cloneSource || '').trim();
  if (!normalizedSource) return 'repository';

  const withoutProtocol = normalizedSource.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const normalizedPath = withoutProtocol
    .replace(/^git@[^:]+:/i, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const lastSegment = normalizedPath.split('/').pop() || 'repository';
  return lastSegment || 'repository';
};

const isCloneSourceLikelyRemote = (cloneSource: string): boolean => {
  const normalizedSource = String(cloneSource || '').trim();
  if (!normalizedSource) return false;
  return /^(https?:\/\/|ssh:\/\/|git@[^:]+:)/i.test(normalizedSource);
};

const parseGithubRepoReference = (cloneSource: string): ParsedGithubRepoReference | null => {
  const normalizedSource = String(cloneSource || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!normalizedSource) return null;

  const fromHostAndPath = (hostRaw: string, pathRaw: string): ParsedGithubRepoReference | null => {
    const host = normalizeGitHost(hostRaw);
    const cleanedPath = String(pathRaw || '').replace(/^\/+/, '');
    const segments = cleanedPath.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const owner = segments[0];
    const repo = segments[1];
    if (!owner || !repo) return null;
    return { host, owner, repo };
  };

  const scpLikeMatch = normalizedSource.match(/^git@([^:]+):(.+)$/i);
  if (scpLikeMatch) {
    return fromHostAndPath(scpLikeMatch[1], scpLikeMatch[2]);
  }

  const sshLikeMatch = normalizedSource.match(/^ssh:\/\/(?:.+@)?([^/]+)\/(.+)$/i);
  if (sshLikeMatch) {
    return fromHostAndPath(sshLikeMatch[1], sshLikeMatch[2]);
  }

  try {
    const parsed = new URL(normalizedSource);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return fromHostAndPath(parsed.host, parsed.pathname);
  } catch {
    return null;
  }
};

export const useAppState = () => {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [commitNavigationRequest, setCommitNavigationRequest] = useState<{ hash: string; requestId: number } | null>(null);
  const commitNavigationSequenceRef = useRef(0);
  const [autoOpenConflictResolverPath, setAutoOpenConflictResolverPath] = useState<string | null>(null);
  const clearAutoOpenConflictResolverPath = useCallback(() => {
    setAutoOpenConflictResolverPath(null);
  }, []);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [commitRefreshTrigger, setCommitRefreshTrigger] = useState(0);
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);
  const repoUnavailableHandlingRef = useRef<string | null>(null);

  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [forceGithubRepoCreationPrompt, setForceGithubRepoCreationPrompt] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const [settings, setSettings] = useState<AppSettingsDto>(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<GitJobEventDto[]>([]);

  const {
    showCreatePR,
    setShowCreatePR,
    newPRTitle,
    setNewPRTitle,
    newPRBody,
    setNewPRBody,
    newPRHead,
    setNewPRHead,
    newPRBase,
    setNewPRBase,
    releaseForm,
    setReleaseFormState,
    releaseSubmitting,
    setReleaseSubmitting,
    releaseError,
    setReleaseError,
    releaseSuccess,
    setReleaseSuccess,
    showReleaseCreator,
    setShowReleaseCreator,
    releaseContextLoading,
    setReleaseContextLoading,
    releaseContextError,
    setReleaseContextError,
    releaseContext,
    setReleaseContext,
    releaseNotesGenerating,
    setReleaseNotesGenerating,
    releaseNotesLanguage,
    setReleaseNotesLanguage,
    releaseNotesOptions,
    setReleaseNotesOptions,
  } = usePrAndReleaseState();

  const { toast: gitActionToast, toasts: gitActionToasts, setToast: setGitActionToast, dismiss: dismissToast } = useToastQueue({
    autoHideMs: 3000,
    errorAutoHideMs: null,
  });

  const {
    confirmDialog,
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    executeConfirmDialogSecondary,
    closeInputDialog,
    executeInputDialog,
  } = useDialogControllers();

  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(settings.language, deText, enText);
  }, [settings.language]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const triggerCommitRefresh = useCallback(() => {
    setCommitRefreshTrigger(prev => prev + 1);
  }, []);

  const resetRepoScopedUi = useCallback(() => {
    setSelectedCommit(null);
    setCommitNavigationRequest(null);
    setAutoOpenConflictResolverPath(null);
    setNewRepoName('');
    setNewRepoDescription('');
    setConnectError(null);
    setForceGithubRepoCreationPrompt(false);
    setShowReleaseCreator(false);
    setReleaseContext(null);
    setReleaseContextError(null);
  }, []);

  const workspace = useWorkspaceDomain({
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
    onRepoActivated: resetRepoScopedUi,
    onNoActiveRepo: resetRepoScopedUi,
    language: settings.language,
  });

  const {
    activeSidebarCollapseState,
    sidebarGeneralCollapseState,
    toggleBranchPanelCollapsed,
    toggleTagPanelCollapsed,
    toggleRemotePanelCollapsed,
    toggleSubmodulePanelCollapsed,
    toggleRepoPanelCollapsed,
  } = useSidebarCollapseState({
    activeRepo: workspace.activeRepo,
  });

  const handleUpdateSettings = useCallback(async (partial: Partial<AppSettingsDto>) => {
    if (!window.electronAPI) return;

    try {
      const next = await window.electronAPI.setSettings(partial);
      setSettings(next);
      setGitActionToast({ msg: tr('Einstellungen gespeichert.', 'Settings saved.'), isError: false });
    } catch (e: any) {
      setGitActionToast({ msg: e?.message || tr('Einstellungen konnten nicht gespeichert werden.', 'Could not save settings.'), isError: true });
    }
  }, [setGitActionToast, tr]);

  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) return;
      try {
        const loaded = await window.electronAPI.getSettings();
        setSettings(loaded);
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onJobEvent((event) => {
      setJobs(prev => [event, ...prev].slice(0, 200));
    });

    return unsubscribe;
  }, []);

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
  }, [tr, workspace.activeRepo, workspace]);

  const createGithubRepoAndConnect = useCallback(async (
    options: {
      replaceOriginIfExists?: boolean;
      pushAfterConnect?: boolean;
    } = {},
  ): Promise<boolean> => {
    if (!window.electronAPI || !workspace.activeRepo) return false;

    const { replaceOriginIfExists = true, pushAfterConnect = true } = options;
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
                'GitHub-Repository erstellt, Initial-Commit automatisch erstellt und gepusht.',
                'GitHub repository created, initial commit auto-created, and pushed.',
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
  }, [ensureInitialCommitForPush, newRepoDescription, newRepoName, newRepoPrivate, setGitActionToast, tr, triggerRefresh, workspace.activeRepo]);

  const runGitCommand = useCallback(async (
    args: string[],
    successMsg: string,
    actionLabel?: string,
    options?: RunGitCommandOptions,
  ): Promise<boolean> => {
    if (!window.electronAPI || !workspace.activeRepo || args.length === 0) return false;

    const command = args[0];
    const tryAutoSetUpstreamPush = async (failureMessage: unknown): Promise<boolean> => {
      if (command !== 'push' || options?.skipAutoSetUpstreamOnPushFailure || !isMissingUpstreamPushError(failureMessage)) {
        return false;
      }

      const fallbackArgs = ['push', ...args.slice(1), '-u', 'origin', 'HEAD'];
      const fallbackSuccess = await runGitCommand(
        fallbackArgs,
        tr('Branch gepusht und Upstream gesetzt.', 'Pushed branch and set upstream.'),
        tr('Push mit Upstream wird ausgefuehrt...', 'Running push with upstream...'),
        { ...options, skipAutoSetUpstreamOnPushFailure: true },
      );
      return fallbackSuccess;
    };
    const maybeRecoverRemoteSetup = async (failureMessage: unknown): Promise<boolean> => {
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
    };
    const maybeHandlePushWithoutOrigin = async (): Promise<boolean> => {
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
    };
    const runRemoteAheadQuickFix = async (): Promise<void> => {
      const quickFixOptions: RunGitCommandOptions = {
        ...options,
        skipDirtyGuard: true,
        skipRemoteAheadDirtyGuard: true,
        skipSecretScan: true,
      };
      const quickFixStashMessage = 'Open Git Control quick sync fix';

      const stashed = await runGitCommand(
        ['stash', 'push', '-u', '-m', quickFixStashMessage],
        tr('Quick-Fix: Aenderungen wurden im Stash gesichert.', 'Quick fix: saved changes to stash.'),
        tr('Quick-Fix: stash wird erstellt...', 'Quick fix: creating stash...'),
        quickFixOptions,
      );
      if (!stashed) {
        return;
      }

      const pulled = await runGitCommand(
        ['pull', '--rebase'],
        tr('Quick-Fix: pull --rebase abgeschlossen.', 'Quick fix: pull --rebase completed.'),
        tr('Quick-Fix: pull --rebase wird ausgefuehrt...', 'Quick fix: running pull --rebase...'),
        quickFixOptions,
      );
      if (!pulled) {
        setGitActionToast({
          msg: tr(
            'Quick-Fix gestoppt: Pull/Rebase ist fehlgeschlagen. Deine Aenderungen bleiben im neuesten Stash gesichert.',
            'Quick fix stopped: pull/rebase failed. Your changes remain safe in the latest stash.',
          ),
          isError: true,
        });
        return;
      }

      const popped = await runGitCommand(
        ['stash', 'pop'],
        tr('Quick-Fix: Stash wurde wieder angewendet.', 'Quick fix: stash reapplied.'),
        tr('Quick-Fix: Stash wird wieder angewendet...', 'Quick fix: reapplying stash...'),
        quickFixOptions,
      );
      if (!popped) {
        setGitActionToast({
          msg: tr(
            'Quick-Fix fast fertig: Pull/Rebase war erfolgreich, aber Stash-Pop braucht manuelle Aufloesung.',
            'Quick fix nearly finished: pull/rebase succeeded, but stash pop needs manual resolution.',
          ),
          isError: true,
        });
        return;
      }

      setGitActionToast({
        msg: tr(
          command === 'push'
            ? 'Quick-Fix abgeschlossen (stash -> pull --rebase -> stash pop). Du kannst jetzt erneut pushen.'
            : 'Quick-Fix abgeschlossen (stash -> pull --rebase -> stash pop).',
          command === 'push'
            ? 'Quick fix completed (stash -> pull --rebase -> stash pop). You can push again now.'
            : 'Quick fix completed (stash -> pull --rebase -> stash pop).',
        ),
        isError: false,
      });
    };
    const runAutostashPullFlow = async (
      originalArgs: string[],
      originalSuccessMsg: string,
      originalActionLabel?: string,
      originalOptions?: RunGitCommandOptions,
    ): Promise<void> => {
      const autostashOptions: RunGitCommandOptions = {
        ...originalOptions,
        skipDirtyGuard: true,
        skipRemoteAheadDirtyGuard: true,
        skipSecretScan: true,
      };
      const stashMessage = `Open Git Control autostash before pull: git ${originalArgs.join(' ')}`;

      const stashed = await runGitCommand(
        ['stash', 'push', '-u', '-m', stashMessage],
        tr('Autostash: Aenderungen wurden im Stash gesichert.', 'Autostash: saved local changes to stash.'),
        tr('Autostash: stash wird erstellt...', 'Autostash: creating stash...'),
        autostashOptions,
      );
      if (!stashed) {
        return;
      }

      const pulled = await runGitCommand(
        originalArgs,
        originalSuccessMsg,
        originalActionLabel,
        autostashOptions,
      );
      if (!pulled) {
        setGitActionToast({
          msg: tr(
            'Autostash gestoppt: Pull ist fehlgeschlagen. Deine Aenderungen bleiben im neuesten Stash gesichert.',
            'Autostash stopped: pull failed. Your changes remain safe in the latest stash.',
          ),
          isError: true,
        });
        return;
      }

      const popped = await runGitCommand(
        ['stash', 'pop'],
        tr('Autostash: Stash wurde wieder angewendet.', 'Autostash: stash reapplied.'),
        tr('Autostash: Stash wird wieder angewendet...', 'Autostash: reapplying stash...'),
        autostashOptions,
      );
      if (!popped) {
        setGitActionToast({
          msg: tr(
            'Autostash fast fertig: Pull war erfolgreich, aber Stash-Pop braucht manuelle Aufloesung.',
            'Autostash nearly finished: pull succeeded, but stash pop needs manual resolution.',
          ),
          isError: true,
        });
        return;
      }

      setGitActionToast({
        msg: tr(
          'Autostash-Pull erfolgreich abgeschlossen (stash -> pull -> stash pop).',
          'Autostash pull completed successfully (stash -> pull -> stash pop).',
        ),
        isError: false,
      });
    };
    const maybeHandleSyncMismatchFailure = (failureMessage: unknown): boolean => {
      if (command === 'push' && isNonFastForwardPushError(failureMessage)) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: tr(
            'Push abgelehnt: Remote ist neuer als lokal. Bitte zuerst committen/stashen, dann pull (oder pull --rebase) und danach erneut pushen.',
            'Push rejected: remote is newer than local. Commit or stash first, then pull (or pull --rebase), and push again.',
          ),
          isError: true,
        });
        return true;
      }

      if (command === 'pull' && isPullBlockedByLocalChangesError(failureMessage)) {
        workspace.setActiveTab('repo');
        setConfirmDialog({
          variant: 'danger',
          title: tr('Pull durch uncommitted Aenderungen blockiert', 'Pull blocked by uncommitted changes'),
          message: tr(
            'Der Pull wurde abgebrochen, da uncommitted Aenderungen ueberschrieben werden koennten. Moechtest du ein Autostash ausfuehren (lokale uncommitted Aenderungen stashen, pullen und Stash wieder anwenden)?',
            'The pull was aborted because uncommitted changes would be overwritten. Do you want to perform an autostash (stash changes, pull, and reapply stash)?',
          ),
          contextItems: [
            { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
            {
              label: tr('Hinweis', 'Hint'),
              value: tr(
                'Deine lokalen uncommitted Aenderungen werden voruebergehend gesichert.',
                'Your local uncommitted changes will be stashed temporarily.',
              ),
            },
          ],
          irreversible: false,
          consequences: tr(
            'Falls beim Wiederanwenden des Stashs Konflikte entstehen, wird der Konflikt-Resolver geoeffnet.',
            'If conflicts occur when reapplying the stash, the conflict resolver will open.',
          ),
          confirmLabel: tr('Mit Autostash ausfuehren', 'Run with autostash'),
          onConfirm: async () => {
            await runAutostashPullFlow(args, successMsg, actionLabel, options);
          },
        });
        return true;
      }

      return false;
    };
    const shouldGuard = settings.confirmDangerousOps && !options?.skipDirtyGuard && GUARDED_COMMANDS.has(command);
    const isForcePushLike = command === 'push' && args.some((arg) => arg === '-f' || arg === '--force' || arg === '--force-with-lease');
    const shouldGuardRemoteAheadWithDirtyState = (
      !options?.skipRemoteAheadDirtyGuard
      && (command === 'pull' || (command === 'push' && !isForcePushLike))
    );
    const shouldScanPushSecrets =
      command === 'push'
      && settings.secretScanBeforePushEnabled
      && !options?.skipSecretScan;

    if (await maybeHandlePushWithoutOrigin()) {
      return false;
    }

    if (shouldGuardRemoteAheadWithDirtyState) {
      try {
        const statusResult = await window.electronAPI.runGitCommand('status', '--porcelain=v2', '--branch');
        const statusText = statusResult.success ? String(statusResult.data || '') : '';
        const remoteSyncState = parseBranchSyncFromPorcelainV2(statusText);
        const behindCount = remoteSyncState.behind;
        const hasUpstream = remoteSyncState.hasUpstream;

        const changedFiles = countChangedEntriesFromPorcelainV2(statusText);
        const hasLocalChanges = changedFiles > 0;

        if (hasLocalChanges && hasUpstream && behindCount > 0) {
          const isPushGuard = command === 'push';
          setConfirmDialog({
            variant: 'danger',
            title: tr(
              isPushGuard ? 'Push jetzt wahrscheinlich blockiert' : 'Pull in diesem Zustand riskant',
              isPushGuard ? 'Push is likely blocked in this state' : 'Pull is risky in this state',
            ),
            message: tr(
              isPushGuard
                ? `Remote ist ${behindCount} Commit${behindCount === 1 ? '' : 's'} voraus und es gibt lokale uncommitted Aenderungen. Ein normaler Push wird so oft mit "non-fast-forward" abgelehnt.`
                : `Remote ist ${behindCount} Commit${behindCount === 1 ? '' : 's'} voraus und es gibt lokale uncommitted Aenderungen. Pull kann so fehlschlagen oder Konflikte erzeugen.`,
              isPushGuard
                ? `Remote is ahead by ${behindCount} commit${behindCount === 1 ? '' : 's'} and local changes are still uncommitted. A regular push is often rejected with a non-fast-forward error.`
                : `Remote is ahead by ${behindCount} commit${behindCount === 1 ? '' : 's'} and local changes are still uncommitted. Pull may fail or create conflicts in this state.`,
            ),
            contextItems: [
              { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
              { label: tr('Remote voraus', 'Remote ahead'), value: String(behindCount) },
              {
                label: tr('Lokale Aenderungen', 'Local changes'),
                value: tr(
                  `${changedFiles} Datei${changedFiles === 1 ? '' : 'en'} uncommitted`,
                  `${changedFiles} file${changedFiles === 1 ? '' : 's'} uncommitted`,
                ),
              },
            ],
            irreversible: false,
            consequences: tr(
              'Empfohlen: zuerst committen oder stashen, dann pull (ggf. --rebase), danach push.',
              'Recommended: commit or stash first, then pull (optionally --rebase), then push.',
            ),
            confirmLabel: tr(
              isPushGuard ? 'Trotzdem pushen' : 'Trotzdem pullen',
              isPushGuard ? 'Push anyway' : 'Pull anyway',
            ),
            secondaryActionLabel: tr('Quick-Fix ausfuehren', 'Run quick fix'),
            secondaryActionVariant: 'default',
            onSecondaryAction: async () => {
              await runRemoteAheadQuickFix();
            },
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, {
                ...options,
                skipRemoteAheadDirtyGuard: true,
              });
            },
          });
          return false;
        }
      } catch {
        // continue without blocking if preflight state checks fail
      }
    }

    if (shouldGuard) {
      try {
        const status = await window.electronAPI.runGitCommand('statusPorcelain');
        const hasLocalChanges = Boolean(status.success && String(status.data || '').trim().length > 0);
        if (hasLocalChanges) {
          setConfirmDialog({
            variant: 'danger',
            title: tr('Ungesicherte Änderungen erkannt', 'Uncommitted changes detected'),
            message: tr(`Vor "git ${args.join(' ')}" wurden lokale Änderungen gefunden.`, `Local changes were found before "git ${args.join(' ')}".`),
            contextItems: [
              { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
              { label: tr('Hinweis', 'Hint'), value: tr('Working Tree ist nicht sauber', 'Working tree is dirty') },
            ],
            irreversible: false,
            consequences: tr('Je nach Operation können unstaged oder staged Änderungen betroffen sein.', 'Depending on the operation, unstaged or staged changes may be affected.'),
            confirmLabel: tr('Trotzdem ausführen', 'Run anyway'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, { skipDirtyGuard: true });
            },
          });
          return false;
        }
      } catch {
        // continue without blocking if status check fails
      }
    }

    if (shouldScanPushSecrets) {
      try {
        const SCAN_TIMEOUT_MS = 15000;
        let scanTimeoutId: number | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          scanTimeoutId = window.setTimeout(() => reject(new Error('__timeout__')), SCAN_TIMEOUT_MS);
        });
        let scanResult: Awaited<ReturnType<typeof window.electronAPI.scanPushSecrets>>;
        try {
          scanResult = await Promise.race([window.electronAPI.scanPushSecrets(), timeoutPromise]);
        } catch (timeoutErr: any) {
          if (timeoutErr?.message === '__timeout__') {
            await window.electronAPI.cancelSecretScan();
            setConfirmDialog({
              variant: 'danger',
              title: tr('Secret-Scan Timeout', 'Secret scan timed out'),
              message: tr(
                'Der Secret-Scan hat zu lange gedauert (>15s) und wurde abgebrochen. Trotzdem pushen?',
                'The secret scan took too long (>15s) and was cancelled. Push anyway?',
              ),
              contextItems: [],
              irreversible: false,
              consequences: tr(
                'Ohne Secret-Scan könnten vertrauliche Daten gepusht werden.',
                'Without a secret scan, sensitive data could be pushed.',
              ),
              confirmLabel: tr('Trotzdem pushen', 'Push anyway'),
              onConfirm: async () => {
                await runGitCommand(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
              },
            });
            return false;
          }
          throw timeoutErr;
        } finally {
          if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId);
        }
        if (!scanResult.success) {
          setGitActionToast({
            msg: scanResult.error || tr('Secret-Scan vor Push fehlgeschlagen.', 'Secret scan before push failed.'),
            isError: true,
          });
          return false;
        }

        const findings = scanResult.data.findings || [];
        if (findings.length > 0) {
          const contextItems = findings.slice(0, 8).map((finding, index) => ({
            label: tr(`Treffer ${index + 1}`, `Finding ${index + 1}`),
            value: `${finding.filePath}:${finding.lineNumber}  ${finding.contextLine}`,
          }));

          setConfirmDialog({
            variant: 'danger',
            title: tr('Moegliche Secrets vor Push erkannt', 'Potential secrets detected before push'),
            message: tr(
              `${findings.length} moegliche Secret-Treffer wurden im staged/zu-pushenden Diff gefunden.`,
              `${findings.length} potential secret hit(s) were found in staged/to-push diffs.`,
            ),
            contextItems,
            irreversible: true,
            consequences: tr(
              'Bitte pruefe die Treffer. Ein Push kann vertrauliche Werte unwiderruflich veroeffentlichen.',
              'Please review these findings. Pushing can irreversibly publish sensitive values.',
            ),
            confirmLabel: tr('Trotzdem pushen', 'Push anyway'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
            },
          });
          return false;
        }
      } catch (error: any) {
        setGitActionToast({
          msg: error?.message || tr('Secret-Scan vor Push fehlgeschlagen.', 'Secret scan before push failed.'),
          isError: true,
        });
        return false;
      }
    }

    setIsGitActionRunning(true);
    setActiveGitActionLabel(actionLabel || tr(`Git ${command} wird ausgeführt...`, `Running git ${command}...`));

    try {
      const r = await window.electronAPI.runGitCommand(command, ...args.slice(1));
      if (r.success) {
        if (forceGithubRepoCreationPrompt && (command === 'push' || command === 'pull' || command === 'fetch')) {
          setForceGithubRepoCreationPrompt(false);
          setConnectError(null);
        }
        setGitActionToast({ msg: successMsg, isError: false });
        triggerRefresh();
        return true;
      }
      if (command === 'push' && isNoLocalCommitPushError(r.error)) {
        if (options?.skipAutoInitialCommitOnPushFailure) {
          workspace.setActiveTab('repo');
          setGitActionToast({
            msg: tr(
              'Push nicht moeglich: Es gibt noch keinen lokalen Commit. Bitte zuerst committen.',
              'Push not possible: there is no local commit yet. Please commit first.',
            ),
            isError: true,
          });
          return false;
        }

        const prepared = await ensureInitialCommitForPush();
        if (!prepared) {
          return false;
        }

        const argsWithUpstream = args.some((arg) => arg === '-u' || arg === '--set-upstream')
          ? args
          : ['push', '-u', 'origin', 'HEAD'];

        return runGitCommand(
          argsWithUpstream,
          tr('Initial-Commit automatisch erstellt und gepusht.', 'Initial commit auto-created and pushed.'),
          tr('Initial-Commit wird gepusht...', 'Pushing initial commit...'),
          {
            ...options,
            skipAutoInitialCommitOnPushFailure: true,
            skipAutoSetUpstreamOnPushFailure: true,
          },
        );
      }
      const missingUpstream = isMissingUpstreamPushError(r.error);
      if (await tryAutoSetUpstreamPush(r.error)) {
        return true;
      }
      if (missingUpstream) {
        return false;
      }
      if (await maybeRecoverRemoteSetup(r.error)) {
        return false;
      }
      if (maybeHandleSyncMismatchFailure(r.error)) {
        return false;
      }
      const mergeInProgress = isMergeInProgressError(r.error);
      triggerRefresh();
      try {
        const statusAfter = await window.electronAPI.runGitCommand('statusPorcelain');
        const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
        const conflictPath = resolveConflictPathAfterGitFailure(porcelain, r.error);
        if (conflictPath) {
          workspace.setActiveTab('repo');
          setAutoOpenConflictResolverPath(conflictPath);
          setGitActionToast({
            msg: tr(
              mergeInProgress
                ? 'Ein laufender Merge ist noch nicht abgeschlossen. Konflikt-Resolver wird geoeffnet.'
                : 'Merge-Konflikt: Konflikt-Resolver wird geoeffnet.',
              mergeInProgress
                ? 'A merge is already in progress and not finished yet. Opening the conflict resolver.'
                : 'Merge conflict: opening the conflict resolver.',
            ),
            isError: false,
          });
          triggerRefresh();
          return false;
        }
      } catch {
        // ignore; fall through to generic error toast
      }
      if (mergeInProgress) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: tr(
            'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen ausfuehren.',
            'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
          ),
          isError: true,
        });
        return false;
      }
      setGitActionToast({ msg: r.error || tr('Fehler beim Ausführen von git.', 'Error while running git.'), isError: true });
      return false;
    } catch (e: any) {
      if (command === 'push' && isNoLocalCommitPushError(e?.message)) {
        if (options?.skipAutoInitialCommitOnPushFailure) {
          workspace.setActiveTab('repo');
          setGitActionToast({
            msg: tr(
              'Push nicht moeglich: Es gibt noch keinen lokalen Commit. Bitte zuerst committen.',
              'Push not possible: there is no local commit yet. Please commit first.',
            ),
            isError: true,
          });
          return false;
        }

        const prepared = await ensureInitialCommitForPush();
        if (!prepared) {
          return false;
        }

        const argsWithUpstream = args.some((arg) => arg === '-u' || arg === '--set-upstream')
          ? args
          : ['push', '-u', 'origin', 'HEAD'];

        return runGitCommand(
          argsWithUpstream,
          tr('Initial-Commit automatisch erstellt und gepusht.', 'Initial commit auto-created and pushed.'),
          tr('Initial-Commit wird gepusht...', 'Pushing initial commit...'),
          {
            ...options,
            skipAutoInitialCommitOnPushFailure: true,
            skipAutoSetUpstreamOnPushFailure: true,
          },
        );
      }
      const missingUpstream = isMissingUpstreamPushError(e?.message);
      if (await tryAutoSetUpstreamPush(e?.message)) {
        return true;
      }
      if (missingUpstream) {
        return false;
      }
      if (await maybeRecoverRemoteSetup(e?.message)) {
        return false;
      }
      if (maybeHandleSyncMismatchFailure(e?.message)) {
        return false;
      }
      const mergeInProgress = isMergeInProgressError(e?.message);
      triggerRefresh();
      try {
        const statusAfter = await window.electronAPI.runGitCommand('statusPorcelain');
        const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
        const conflictPath = resolveConflictPathAfterGitFailure(porcelain, e?.message);
        if (conflictPath) {
          workspace.setActiveTab('repo');
          setAutoOpenConflictResolverPath(conflictPath);
          setGitActionToast({
            msg: tr(
              mergeInProgress
                ? 'Ein laufender Merge ist noch nicht abgeschlossen. Konflikt-Resolver wird geoeffnet.'
                : 'Merge-Konflikt: Konflikt-Resolver wird geoeffnet.',
              mergeInProgress
                ? 'A merge is already in progress and not finished yet. Opening the conflict resolver.'
                : 'Merge conflict: opening the conflict resolver.',
            ),
            isError: false,
          });
          triggerRefresh();
          return false;
        }
      } catch {
        // ignore
      }
      if (mergeInProgress) {
        workspace.setActiveTab('repo');
        setGitActionToast({
          msg: tr(
            'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen ausfuehren.',
            'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
          ),
          isError: true,
        });
        return false;
      }
      setGitActionToast({ msg: e.message, isError: true });
      return false;
    } finally {
      setIsGitActionRunning(false);
      setActiveGitActionLabel(null);
    }
  }, [ensureInitialCommitForPush, forceGithubRepoCreationPrompt, openGithubRepoCreationRecovery, setConfirmDialog, setGitActionToast, settings.confirmDangerousOps, settings.secretScanBeforePushEnabled, triggerRefresh, workspace, tr]);

  useEffect(() => {
    if (!window.electronAPI?.onRepoUnavailable) return;

    const unsubscribe = window.electronAPI.onRepoUnavailable(() => {
      const repoPath = workspace.activeRepo;
      if (!repoPath) return;
      if (repoUnavailableHandlingRef.current === repoPath) return;

      repoUnavailableHandlingRef.current = repoPath;

      void (async () => {
        try {
          await workspace.handleCloseRepo(repoPath);
          const repoName = repoPath.split(/[\\/]/).pop() || repoPath;
          setGitActionToast({
            msg: tr(
              `Repository nicht mehr verfuegbar und geschlossen: ${repoName}`,
              `Repository is no longer available and was closed: ${repoName}`,
            ),
            isError: true,
          });
        } finally {
          window.setTimeout(() => {
            if (repoUnavailableHandlingRef.current === repoPath) {
              repoUnavailableHandlingRef.current = null;
            }
          }, 800);
        }
      })();
    });

    return unsubscribe;
  }, [setGitActionToast, tr, workspace]);

  /** For UI paths that call `electronAPI.runGitCommand` directly (e.g. CommitGraph) — opens repo tab + conflict resolver. */
  const openConflictResolverForPath = useCallback((path: string) => {
    workspace.setActiveTab('repo');
    setAutoOpenConflictResolverPath(path);
    setGitActionToast({
      msg: tr(
        'Merge-Konflikt: Konflikt-Resolver wird geoeffnet.',
        'Merge conflict: opening the conflict resolver.',
      ),
      isError: false,
    });
    triggerRefresh();
  }, [setGitActionToast, triggerRefresh, workspace, tr]);

  isGitActionRunningRef.current = isGitActionRunning;

  const navigateToCommit = useCallback((hash: string) => {
    const normalizedHash = String(hash || '').trim();
    if (!/^[0-9a-f]{40}$/i.test(normalizedHash)) return;

    workspace.setActiveTab('repo');
    setShowReleaseCreator(false);
    setSelectedCommit(normalizedHash);
    commitNavigationSequenceRef.current += 1;
    setCommitNavigationRequest({
      hash: normalizedHash,
      requestId: commitNavigationSequenceRef.current,
    });
  }, [setShowReleaseCreator, workspace.setActiveTab]);

  const repository = useRepositoryDomain({
    activeRepo: workspace.activeRepo,
    refreshTrigger,
    triggerRefresh,
    setGitActionToast,
    setActiveGitActionLabel,
    isGitActionRunningRef,
    runGitCommand,
    setConfirmDialog,
    setInputDialog,
    autoFetchIntervalMs: settings.autoFetchIntervalMs,
    language: settings.language,
    onNavigateToCommit: navigateToCommit,
  });

  const github = useGithubDomain({
    onRepoCloned: workspace.addOpenRepo,
    setActiveTab: workspace.setActiveTab,
    language: settings.language,
    githubOauthClientId: settings.githubOauthClientId,
    githubHost: settings.githubHost,
  });

  const cloneFromRemoteSource = useCallback(async (
    cloneSourceRaw: string,
    targetNameRaw?: string,
  ): Promise<boolean> => {
    const cloneSource = String(cloneSourceRaw || '').trim();
    if (!cloneSource) {
      setGitActionToast({ msg: tr('Clone-Quelle fehlt.', 'Clone source is required.'), isError: true });
      return false;
    }
    if (!isCloneSourceLikelyRemote(cloneSource)) {
      setGitActionToast({
        msg: tr(
          'Bitte eine HTTP/HTTPS/SSH URL angeben (z.B. https://..., ssh://... oder git@host:owner/repo.git).',
          'Please provide an HTTP/HTTPS/SSH URL (for example https://..., ssh://..., or git@host:owner/repo.git).',
        ),
        isError: true,
      });
      return false;
    }

    const targetName = String(targetNameRaw || '').trim();
    return github.cloneRepository(cloneSource, {
      repoName: deriveRepoNameFromCloneSource(cloneSource),
      targetName: targetName || undefined,
    });
  }, [github, setGitActionToast, tr]);

  const handleCloneByUrl = useCallback(() => {
    setInputDialog({
      title: tr('Repository per URL klonen', 'Clone repository from URL'),
      message: tr(
        'HTTP/HTTPS oder SSH URL eingeben und Zielordner waehlen.',
        'Enter an HTTP/HTTPS or SSH URL and choose a target directory.',
      ),
      fields: [
        {
          id: 'cloneSource',
          label: tr('Clone-URL', 'Clone URL'),
          placeholder: 'https://github.com/owner/repo.git',
          required: true,
          validate: (value) => {
            const normalized = String(value || '').trim();
            if (!normalized) return null;
            if (isCloneSourceLikelyRemote(normalized)) return null;
            return tr(
              'Bitte HTTP/HTTPS/SSH URL angeben (z.B. https://... oder git@host:owner/repo.git).',
              'Please provide an HTTP/HTTPS/SSH URL (for example https://... or git@host:owner/repo.git).',
            );
          },
        },
        {
          id: 'targetName',
          label: tr('Ordnername (optional)', 'Folder name (optional)'),
          placeholder: tr('Standard: Name aus URL', 'Default: name from URL'),
          required: false,
        },
      ],
      contextItems: [],
      irreversible: false,
      consequences: tr(
        'Der Zielordner wird erstellt und das Repository lokal geklont.',
        'A target folder will be created and the repository will be cloned locally.',
      ),
      confirmLabel: tr('Klonen', 'Clone'),
      onSubmit: async (values) => {
        const cloned = await cloneFromRemoteSource(values.cloneSource || '', values.targetName || '');
        if (!cloned) return;
        setGitActionToast({
          msg: tr('Repository erfolgreich geklont.', 'Repository cloned successfully.'),
          isError: false,
        });
      },
    });
  }, [cloneFromRemoteSource, setGitActionToast, setInputDialog, tr]);

  const handleForkByUrl = useCallback(() => {
    if (!window.electronAPI) return;
    if (!github.isAuthenticated) {
      workspace.setActiveTab('github');
      setGitActionToast({
        msg: tr('Bitte zuerst im GitHub-Tab anmelden.', 'Please sign in first in the GitHub tab.'),
        isError: true,
      });
      return;
    }

    setInputDialog({
      title: tr('GitHub-Repository forken', 'Fork GitHub repository'),
      message: tr(
        'GitHub Repository-URL eingeben. Der Fork wird erstellt und danach geklont.',
        'Enter a GitHub repository URL. The fork will be created and then cloned.',
      ),
      fields: [
        {
          id: 'sourceUrl',
          label: tr('Quell-URL', 'Source URL'),
          placeholder: 'https://github.com/owner/repo',
          required: true,
          validate: (value) => {
            const normalized = String(value || '').trim();
            if (!normalized) return null;
            return parseGithubRepoReference(normalized)
              ? null
              : tr(
                'Bitte gueltige GitHub-URL angeben (https://..., ssh://... oder git@host:owner/repo.git).',
                'Please provide a valid GitHub URL (https://..., ssh://..., or git@host:owner/repo.git).',
              );
          },
        },
        {
          id: 'forkName',
          label: tr('Fork-Name (optional)', 'Fork name (optional)'),
          placeholder: tr('Standard: gleicher Name', 'Default: same name'),
          required: false,
        },
      ],
      contextItems: [
        {
          label: tr('GitHub Host', 'GitHub host'),
          value: normalizeGitHost(settings.githubHost),
        },
      ],
      irreversible: false,
      consequences: tr(
        'Ein Fork wird in deinem GitHub-Account erstellt und direkt lokal geklont.',
        'A fork will be created in your GitHub account and cloned locally right away.',
      ),
      confirmLabel: tr('Forken & Klonen', 'Fork & clone'),
      onSubmit: async (values) => {
        const sourceUrl = String(values.sourceUrl || '').trim();
        const parsed = parseGithubRepoReference(sourceUrl);
        if (!parsed) {
          setGitActionToast({
            msg: tr('Ungueltige GitHub-URL.', 'Invalid GitHub URL.'),
            isError: true,
          });
          return;
        }

        const configuredHost = normalizeGitHost(settings.githubHost);
        if (parsed.host !== configuredHost) {
          setGitActionToast({
            msg: tr(
              `Host passt nicht zum aktiven GitHub-Host (${configuredHost}).`,
              `Host does not match the active GitHub host (${configuredHost}).`,
            ),
            isError: true,
          });
          return;
        }

        const requestedForkName = String(values.forkName || '').trim();
        const forkResult = await window.electronAPI.githubForkRepo({
          owner: parsed.owner,
          repo: parsed.repo,
          name: requestedForkName || undefined,
        });

        if (!forkResult.success) {
          setGitActionToast({
            msg: forkResult.error || tr('Fork konnte nicht erstellt werden.', 'Could not create fork.'),
            isError: true,
          });
          return;
        }

        setGitActionToast({
          msg: tr(
            `Fork erstellt: ${forkResult.data.fullName}. Starte Clone...`,
            `Fork created: ${forkResult.data.fullName}. Starting clone...`,
          ),
          isError: false,
        });

        const cloneSuccess = await github.cloneRepository(forkResult.data.cloneUrl, {
          repoName: forkResult.data.name,
        });
        if (!cloneSuccess) {
          setGitActionToast({
            msg: tr(
              'Fork erstellt, aber Clone fehlgeschlagen. Bitte Clone erneut starten.',
              'Fork created, but clone failed. Please retry cloning.',
            ),
            isError: true,
          });
        }
      },
    });
  }, [github, setGitActionToast, setInputDialog, settings.githubHost, tr, workspace]);

  const pullRequestDomain = usePullRequests({
    activeRepo: workspace.activeRepo,
    isAuthenticated: github.isAuthenticated,
    refreshTrigger,
    language: settings.language,
    githubHost: settings.githubHost,
    onCreated: (number) => {
      setGitActionToast({ msg: tr(`PR #${number} erstellt.`, `Created PR #${number}.`), isError: false });
      setShowCreatePR(false);
      setNewPRTitle('');
      setNewPRBody('');
      triggerRefresh();
    },
    onError: (message) => {
      setGitActionToast({ msg: message, isError: true });
    },
  });

  const handleCreateGithubRepoForCurrent = async () => {
    if (!window.electronAPI || !workspace.activeRepo) return;
    if (!github.isAuthenticated) {
      setConnectError(tr('Bitte zuerst GitHub verbinden (GitHub-Tab).', 'Please connect GitHub first (GitHub tab).'));
      return;
    }
    await createGithubRepoAndConnect({ replaceOriginIfExists: true, pushAfterConnect: true });
  };

  const handleCreatePR = async () => {
    await pullRequestDomain.createPR({
      title: newPRTitle,
      body: newPRBody,
      head: newPRHead,
      base: newPRBase,
      currentBranch: repository.currentBranch,
    });
  };


  const setReleaseForm = useCallback((updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => {
    setReleaseFormState(prev => {
      const next = updater(prev);
      return {
        ...next,
        owner: pullRequestDomain.prOwnerRepo?.owner || '',
        repo: pullRequestDomain.prOwnerRepo?.repo || '',
      };
    });
  }, [pullRequestDomain.prOwnerRepo]);

  const resetReleaseDraft = useCallback((options?: { clearContext?: boolean; clearSuccess?: boolean }) => {
    const clearContext = options?.clearContext ?? false;
    const clearSuccess = options?.clearSuccess ?? false;
    const owner = pullRequestDomain.prOwnerRepo?.owner || '';
    const repo = pullRequestDomain.prOwnerRepo?.repo || '';
    const targetCommitish = repository.currentBranch || '';

    setReleaseFormState({
      owner,
      repo,
      tagName: '',
      targetCommitish,
      releaseName: '',
      body: '',
      draft: false,
      prerelease: false,
    });
    setReleaseError(null);
    if (clearSuccess) {
      setReleaseSuccess(null);
    }
    if (clearContext) {
      setReleaseContext(null);
      setReleaseContextError(null);
    }
  }, [
    pullRequestDomain.prOwnerRepo?.owner,
    pullRequestDomain.prOwnerRepo?.repo,
    repository.currentBranch,
  ]);

  useEffect(() => {
    setReleaseFormState(prev => ({
      ...prev,
      owner: pullRequestDomain.prOwnerRepo?.owner || '',
      repo: pullRequestDomain.prOwnerRepo?.repo || '',
      targetCommitish: prev.targetCommitish || repository.currentBranch,
    }));
  }, [pullRequestDomain.prOwnerRepo, repository.currentBranch]);

  const refreshReleaseContext = useCallback(async (targetCommitishOverride?: string) => {
    if (!window.electronAPI || !github.isAuthenticated || !pullRequestDomain.prOwnerRepo) {
      setReleaseContext(null);
      setReleaseContextError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
      return;
    }

    setReleaseContextLoading(true);
    setReleaseContextError(null);

    try {
      const targetCommitish = (targetCommitishOverride ?? releaseForm.targetCommitish ?? '').trim() || repository.currentBranch;
      const result = await window.electronAPI.githubGetReleaseContext({
        owner: pullRequestDomain.prOwnerRepo.owner,
        repo: pullRequestDomain.prOwnerRepo.repo,
        targetCommitish,
      });

      if (!result.success) {
        setReleaseContext(null);
        setReleaseContextError(result.error || tr('Release-Kontext konnte nicht geladen werden.', 'Could not load release context.'));
        return;
      }

      setReleaseContext(result.data);
      const suggestion = suggestNextReleaseTag(result.data.existingTags || []);
      const existingTags = new Set((result.data.existingTags || []).map((tag) => tag.toLowerCase()));

      setReleaseFormState((prev) => {
        const currentTag = (prev.tagName || '').trim();
        const currentTagExists = Boolean(currentTag && existingTags.has(currentTag.toLowerCase()));
        const shouldSuggestTag = !currentTag || currentTagExists;
        if (!shouldSuggestTag) {
          return prev;
        }

        const currentReleaseName = (prev.releaseName || '').trim();
        const shouldSuggestReleaseName = (
          !currentReleaseName
          || currentReleaseName === `Release ${currentTag}`
          || currentTagExists
        );
        const nextTag = suggestion;
        return {
          ...prev,
          tagName: nextTag,
          releaseName: shouldSuggestReleaseName ? `Release ${nextTag}` : prev.releaseName,
        };
      });
    } catch (error: any) {
      setReleaseContext(null);
      setReleaseContextError(error?.message || tr('Release-Kontext konnte nicht geladen werden.', 'Could not load release context.'));
    } finally {
      setReleaseContextLoading(false);
    }
  }, [
    github.isAuthenticated,
    pullRequestDomain.prOwnerRepo,
    releaseForm.targetCommitish,
    repository.currentBranch,
    tr,
  ]);

  const handleCreateRelease = useCallback(async () => {
    if (!window.electronAPI || !github.isAuthenticated || !pullRequestDomain.prOwnerRepo) {
      setReleaseError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
      return;
    }

    const validation = validateGithubReleaseInput({
      tagName: releaseForm.tagName,
      releaseName: releaseForm.releaseName,
    });
    const normalizedTag = (releaseForm.tagName || '').trim().toLowerCase();
    const existingTags = new Set((releaseContext?.existingTags || []).map((tag) => tag.toLowerCase()));

    if (!validation.valid) {
      if (validation.errors.tagName === 'release.validation.tagRequired') {
        setReleaseError(tr('Tag-Name darf nicht leer sein.', 'Tag name must not be empty.'));
        return;
      }
      if (validation.errors.tagName === 'release.validation.tagInvalid') {
        setReleaseError(tr('Tag-Name enthält ungültige Zeichen oder Leerzeichen.', 'Tag name contains invalid characters or whitespace.'));
        return;
      }
      if (validation.errors.releaseName === 'release.validation.nameRequired') {
        setReleaseError(tr('Release-Name darf nicht leer sein.', 'Release name must not be empty.'));
        return;
      }
      setReleaseError(tr('Release-Name ist zu kurz (mind. 3 Zeichen).', 'Release name is too short (min. 3 chars).'));
      return;
    }

    if (normalizedTag && existingTags.has(normalizedTag)) {
      setReleaseError(tr('Dieser Tag existiert bereits. Waehle einen anderen Tag.', 'This tag already exists. Choose a different tag.'));
      return;
    }

    setReleaseSubmitting(true);
    setReleaseError(null);
    setReleaseSuccess(null);

    try {
      const result = await window.electronAPI.githubCreateRelease({
        owner: pullRequestDomain.prOwnerRepo.owner,
        repo: pullRequestDomain.prOwnerRepo.repo,
        tagName: releaseForm.tagName.trim(),
        targetCommitish: (releaseForm.targetCommitish || '').trim() || repository.currentBranch,
        releaseName: releaseForm.releaseName.trim(),
        body: (releaseForm.body || '').trim(),
        draft: Boolean(releaseForm.draft),
        prerelease: Boolean(releaseForm.prerelease),
      });

      if (!result.success) {
        const errorText = result.error || '';
        const normalized = errorText.toLowerCase();

        if (normalized.includes('tag existiert bereits') || normalized.includes('already_exists')) {
          setReleaseError(tr('Dieser Tag existiert bereits. Wähle einen anderen Tag oder verwende den bestehenden Tag.', 'This tag already exists. Choose a different tag or use the existing tag.'));
          return;
        }

        if (normalized.includes('berechtigung') || normalized.includes('permission') || normalized.includes('forbidden')) {
          setReleaseError(tr('Fehlende Berechtigung für das Repository. Prüfe Token-Scopes und Repo-Zugriff.', 'Missing repository permission. Check token scopes and repo access.'));
          return;
        }

        if (normalized.includes('targetcommitish') || normalized.includes('target_commitish')) {
          setReleaseError(tr('Ziel-Branch/Ziel-Commit ist ungültig. Bitte Branch oder SHA prüfen.', 'Target branch/commit is invalid. Please verify branch or SHA.'));
          return;
        }

        setReleaseError(errorText || tr('Release konnte nicht erstellt werden.', 'Could not create release.'));
        return;
      }

      setReleaseSuccess(result.data);
      setGitActionToast({
        msg: tr(`Release ${result.data.tagName} erstellt.`, `Release ${result.data.tagName} created.`),
        isError: false,
      });
      triggerRefresh();
      resetReleaseDraft({ clearContext: true, clearSuccess: false });
      await refreshReleaseContext(repository.currentBranch || undefined);
    } catch (error: any) {
      setReleaseError(error?.message || tr('Release konnte nicht erstellt werden.', 'Could not create release.'));
    } finally {
      setReleaseSubmitting(false);
    }
  }, [
    github.isAuthenticated,
    pullRequestDomain.prOwnerRepo,
    refreshReleaseContext,
    releaseContext?.existingTags,
    releaseForm,
    repository.currentBranch,
    resetReleaseDraft,
    setGitActionToast,
    tr,
    triggerRefresh,
  ]);

  const generateReleaseNotesWithAI = useCallback(async (versionBump: ReleaseVersionBump) => {
    if (!window.electronAPI) return;
    if (!github.isAuthenticated || !pullRequestDomain.prOwnerRepo) {
      setReleaseError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
      return;
    }

    const sourceCommits = releaseContext?.commitsSinceLastRelease || [];
    if (sourceCommits.length === 0) {
      setReleaseError(tr('Keine Commit-Basis fuer KI vorhanden.', 'No commit base for AI generation available.'));
      return;
    }
    const commits = filterCommitsForReleaseNotes(sourceCommits, releaseNotesOptions);
    const promptHints = buildReleaseNotesPromptHints(releaseNotesOptions, releaseNotesLanguage);

    const tagName = (releaseForm.tagName || '').trim();
    const releaseName = (releaseForm.releaseName || '').trim() || `Release ${tagName || 'next'}`;
    if (!tagName) {
      setReleaseError(tr('Bitte zuerst einen Tag-Namen setzen.', 'Please set a tag name first.'));
      return;
    }

    setReleaseNotesGenerating(true);
    setReleaseError(null);

    try {
      const result = await window.electronAPI.aiGenerateReleaseNotes({
        tagName,
        releaseName,
        lastReleaseTag: releaseContext?.lastReleaseTag || null,
        commits,
        language: releaseNotesLanguage,
        versionBump,
        hints: promptHints,
      });

      if (!result.success) {
        setReleaseError(result.error || tr('KI Release Notes konnten nicht erstellt werden.', 'Could not generate AI release notes.'));
        return;
      }

      let markdown = result.data.markdown || '';
      if (releaseNotesOptions.appendAlgorithmicChangeList) {
        const automaticList = buildAlgorithmicChangeListMarkdown(
          commits,
          releaseNotesLanguage,
          releaseNotesOptions.includeHashesInAlgorithmicList,
        );
        if (automaticList) {
          markdown = `${markdown.trim()}\n\n${automaticList}`.trim();
        }
      }

      setReleaseFormState((prev) => ({
        ...prev,
        releaseName: prev.releaseName || releaseName,
        body: markdown,
      }));
      setGitActionToast({ msg: tr('Release Notes mit KI erstellt.', 'AI release notes generated.'), isError: false });
    } catch (error: any) {
      setReleaseError(error?.message || tr('KI Release Notes konnten nicht erstellt werden.', 'Could not generate AI release notes.'));
    } finally {
      setReleaseNotesGenerating(false);
    }
  }, [
    github.isAuthenticated,
    pullRequestDomain.prOwnerRepo,
    releaseContext,
    releaseForm.tagName,
    releaseForm.releaseName,
    releaseNotesLanguage,
    releaseNotesOptions,
    tr,
    setGitActionToast,
  ]);

  const openReleaseCreator = useCallback(() => {
    workspace.setActiveTab('repo');
    resetReleaseDraft({ clearContext: true, clearSuccess: true });
    setShowReleaseCreator(true);
  }, [resetReleaseDraft, workspace]);

  const closeReleaseCreator = useCallback(() => {
    setShowReleaseCreator(false);
  }, []);

  useEffect(() => {
    if (!showReleaseCreator) return;
    void refreshReleaseContext();
  }, [showReleaseCreator, refreshReleaseContext]);

  const handleOpenPR = (url: string) => {
    window.open(url, '_blank');
  };

  const handleCopyPRUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setGitActionToast({ msg: tr('PR-URL kopiert.', 'Copied PR URL.'), isError: false });
    } catch {
      setGitActionToast({ msg: tr('PR-URL konnte nicht kopiert werden.', 'Could not copy PR URL.'), isError: true });
    }
  };

  const handleMergePR = async (
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
  ) => {
    if (!window.electronAPI || !pullRequestDomain.prOwnerRepo) return;

    try {
      const result = await window.electronAPI.githubMergePR({
        owner: pullRequestDomain.prOwnerRepo.owner,
        repo: pullRequestDomain.prOwnerRepo.repo,
        pullNumber: prNumber,
        mergeMethod,
      });

      if (!result.success) {
        setGitActionToast({ msg: result.error || tr('PR konnte nicht gemergt werden.', 'Could not merge PR.'), isError: true });
        return;
      }

      setGitActionToast({ msg: tr(`PR #${prNumber} wurde gemergt.`, `PR #${prNumber} merged.`), isError: false });
      // Fetch remote state so local graph reflects the merge
      repository.refreshRemoteState(true);
      triggerRefresh();
    } catch (error: any) {
      setGitActionToast({ msg: error?.message || tr('PR konnte nicht gemergt werden.', 'Could not merge PR.'), isError: true });
    }
  };

  const handleCheckoutPR = async (prNumber: number, headRef: string) => {
    const targetBranch = `pr-${prNumber}-${headRef.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const fetched = await runGitCommand(
      ['fetch', 'origin', `pull/${prNumber}/head:${targetBranch}`],
      tr(`PR #${prNumber} Branch geladen.`, `Loaded branch for PR #${prNumber}.`),
      tr(`PR #${prNumber} wird geladen...`, `Loading PR #${prNumber}...`),
      { skipDirtyGuard: true },
    );
    if (!fetched) return;
    await runGitCommand(['checkout', targetBranch], tr(`PR-Branch ${targetBranch} ausgecheckt.`, `Checked out PR branch ${targetBranch}.`));
  };

  const handleSetUpstreamForCurrentBranch = useCallback(async () => {
    if (!workspace.activeRepo || !repository.currentBranch) return;

    const setTracking = await runGitCommand(
      ['branch', '--set-upstream-to', `origin/${repository.currentBranch}`, repository.currentBranch],
      tr(`Tracking gesetzt: ${repository.currentBranch} -> origin/${repository.currentBranch}`, `Tracking set: ${repository.currentBranch} -> origin/${repository.currentBranch}`),
    );

    if (!setTracking) {
      await runGitCommand(
        ['push', '-u', 'origin', repository.currentBranch],
        tr(`Branch ${repository.currentBranch} mit Upstream gepusht.`, `Pushed branch ${repository.currentBranch} with upstream.`),
      );
    }
  }, [repository.currentBranch, runGitCommand, workspace.activeRepo, tr]);

  const handleCheckoutRemoteBranch = useCallback(async (remoteBranchName: string) => {
    const normalized = (remoteBranchName || '').trim();
    if (!normalized) return;

    const parsed = parseRemoteBranchRef(normalized);
    if (!parsed) {
      setGitActionToast({
        msg: tr('Ungueltiger Remote-Branch.', 'Invalid remote branch.'),
        isError: true,
      });
      return;
    }

    const { remoteRef, localBranchName } = parsed;
    const createdTrackingBranch = await runGitCommand(
      ['checkout', '--track', remoteRef],
      tr(
        `Branch ${localBranchName} aus ${remoteRef} ausgecheckt.`,
        `Checked out branch ${localBranchName} from ${remoteRef}.`,
      ),
    );

    if (createdTrackingBranch) return;

    await runGitCommand(
      ['checkout', localBranchName],
      tr(
        `Branch ${localBranchName} ausgecheckt.`,
        `Checked out branch ${localBranchName}.`,
      ),
    );
  }, [runGitCommand, setGitActionToast, tr]);

  const clearJobs = () => setJobs([]);

  return {
    activeTab: workspace.activeTab,
    setActiveTab: workspace.setActiveTab,
    openRepos: workspace.openRepos,
    repoMeta: workspace.repoMeta,
    repoSortBy: workspace.repoSortBy,
    setRepoSortBy: workspace.setRepoSortBy,
    activeRepo: workspace.activeRepo,
    handleOpenFolder: workspace.handleOpenFolder,
    handleSwitchRepo: workspace.handleSwitchRepo,
    handleCloseRepo: workspace.handleCloseRepo,
    handleToggleRepoPin: workspace.toggleRepoPin,

    refreshTrigger,
    triggerRefresh,
    commitRefreshTrigger,
    triggerCommitRefresh,
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
    autoOpenConflictResolverPath,
    clearAutoOpenConflictResolverPath,
    openConflictResolverForPath,

    isGitActionRunning,
    activeGitActionLabel,
    runGitCommand,
    gitActionToast,
    gitActionToasts,
    dismissToast,

    branches: repository.branches,
    currentBranch: repository.currentBranch,
    isCreatingBranch: repository.isCreatingBranch,
    setIsCreatingBranch: repository.setIsCreatingBranch,
    newBranchName: repository.newBranchName,
    setNewBranchName: repository.setNewBranchName,
    newBranchInputRef: repository.newBranchInputRef,
    branchContextMenu: repository.branchContextMenu,
    setBranchContextMenu: repository.setBranchContextMenu,
    isBranchPanelCollapsed: activeSidebarCollapseState.branchPanelCollapsed,
    toggleBranchPanelCollapsed,
    isTagPanelCollapsed: activeSidebarCollapseState.tagPanelCollapsed,
    toggleTagPanelCollapsed,
    isRepoPanelCollapsed: sidebarGeneralCollapseState.repoPanelCollapsed,
    toggleRepoPanelCollapsed,

    tags: repository.tags,
    remotes: repository.remotes,
    submodules: repository.submodules,
    hasRemoteOrigin: repository.hasRemoteOrigin,
    forceGithubRepoCreationPrompt,
    remoteSync: repository.remoteSync,
    remoteOnlyBranches: repository.remoteOnlyBranches,
    remoteStatus: repository.remoteStatus,
    refreshRemoteState: repository.refreshRemoteState,
    isRemotePanelCollapsed: activeSidebarCollapseState.remotePanelCollapsed,
    toggleRemotePanelCollapsed,
    isSubmodulePanelCollapsed: activeSidebarCollapseState.submodulePanelCollapsed,
    toggleSubmodulePanelCollapsed,

    handleCreateBranch: repository.handleCreateBranch,
    handleDeleteBranch: repository.handleDeleteBranch,
    handleMergeBranch: repository.handleMergeBranch,
    handleRenameBranch: repository.handleRenameBranch,
    handleCreateTag: repository.handleCreateTag,
    handleDeleteTag: repository.handleDeleteTag,
    handleSelectTag: repository.handleSelectTag,
    handlePushTags: repository.handlePushTags,
    handleAddRemote: repository.handleAddRemote,
    handleRemoveRemote: repository.handleRemoveRemote,
    handleRenameRemote: repository.handleRenameRemote,
    handleSetRemoteUrl: repository.handleSetRemoteUrl,
    handleSubmoduleInitUpdate: repository.handleSubmoduleInitUpdate,
    handleSubmoduleSync: repository.handleSubmoduleSync,
    handleOpenSubmodule: repository.handleOpenSubmodule,
    handleSetUpstreamForCurrentBranch,
    handleCheckoutRemoteBranch,

    isAuthenticated: github.isAuthenticated,
    githubUser: github.githubUser,
    githubRepos: github.githubRepos,
    githubRepoSearch: github.githubRepoSearch,
    setGithubRepoSearch: github.setGithubRepoSearch,
    githubReposHasMore: github.githubReposHasMore,
    isLoadingGithubRepos: github.isLoadingRepos,
    isLoadingMoreGithubRepos: github.isLoadingMoreRepos,
    loadMoreGithubRepos: () => { void github.loadMoreRepos(); },
    refreshGithubRepos: () => { void github.refreshRepos(); },
    tokenInput: github.tokenInput,
    setTokenInput: github.setTokenInput,
    isAuthenticating: github.isAuthenticating,
    authError: github.authError,
    setAuthError: github.setAuthError,
    handleTokenLogin: github.handleTokenLogin,
    oauthConfigured: github.oauthConfigured,
    deviceFlow: github.deviceFlow,
    isDeviceFlowRunning: github.isDeviceFlowRunning,
    deviceFlowError: github.deviceFlowError,
    handleStartDeviceFlowLogin: github.handleStartDeviceFlowLogin,
    handleCancelDeviceFlow: github.handleCancelDeviceFlow,
    isWebFlowRunning: github.isWebFlowRunning,
    webFlowError: github.webFlowError,
    handleStartWebFlowLogin: github.handleStartWebFlowLogin,
    handleLogout: github.handleLogout,

    isCloning: github.isCloning,
    setIsCloning: github.setIsCloning,
    cloneLog: github.cloneLog,
    cloneRepoName: github.cloneRepoName,
    cloneFinished: github.cloneFinished,
    cloneError: github.cloneError,
    handleClone: github.handleClone,
    handleCloneByUrl,
    handleForkByUrl,

    prOwnerRepo: pullRequestDomain.prOwnerRepo,
    prFilter: pullRequestDomain.prFilter,
    setPrFilter: pullRequestDomain.setPrFilter,
    prLoading: pullRequestDomain.prLoading,
    pullRequests: pullRequestDomain.pullRequests,
    prCiByNumber: pullRequestDomain.prCiByNumber,
    showCreatePR,
    setShowCreatePR,
    newPRTitle,
    setNewPRTitle,
    newPRBody,
    setNewPRBody,
    newPRHead,
    setNewPRHead,
    newPRBase,
    setNewPRBase,
    handleCreatePR,
    releaseForm,
    setReleaseForm,
    releaseSubmitting,
    releaseError,
    releaseSuccess,
    showReleaseCreator,
    openReleaseCreator,
    closeReleaseCreator,
    releaseContextLoading,
    releaseContextError,
    releaseContext,
    refreshReleaseContext,
    releaseNotesGenerating,
    generateReleaseNotesWithAI,
    releaseNotesLanguage,
    setReleaseNotesLanguage,
    releaseNotesOptions,
    setReleaseNotesOptions,
    handleCreateRelease,
    handleOpenPR,
    handleCopyPRUrl,
    handleCheckoutPR,
    handleMergePR,

    settings,
    handleUpdateSettings,
    jobs,
    clearJobs,

    isConnectingGithubRepo,
    connectError,
    newRepoName,
    setNewRepoName,
    newRepoDescription,
    setNewRepoDescription,
    newRepoPrivate,
    setNewRepoPrivate,
    handleCreateGithubRepoForCurrent,

    confirmDialog,
    inputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    executeConfirmDialogSecondary,
    closeInputDialog,
    executeInputDialog,
  };
};





