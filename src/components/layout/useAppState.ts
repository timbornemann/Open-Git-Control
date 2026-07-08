import { useCallback, useEffect, useRef, useState } from 'react';
import { AppSettingsDto, GitJobEventDto } from '../../global';
import { useToastQueue } from '../../hooks/useToastQueue';
import { trByLanguage } from '../../i18n';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useGithubDomain } from './hooks/useGithubDomain';
import { usePullRequests } from '../../hooks/usePullRequests';
import { aiClient } from '../../services/aiClient';
import { appClient } from '../../services/appClient';
import { githubClient } from '../../services/githubClient';
import { parseRemoteBranchRef } from '../../utils/gitParsing';
import { DEFAULT_SETTINGS } from './state/appStateShared';
import { useSidebarCollapseState } from './state/useSidebarCollapseState';
import { usePrAndReleaseState } from './state/usePrAndReleaseState';
import { useConflictResolverWorkflow } from './workflows/useConflictResolverWorkflow';
import { compactTransferProgressJobs } from './workflows/jobWorkflowUtils';
import { useGitCommandWorkflow } from './workflows/useGitCommandWorkflow';
import { usePullRequestWorkflow } from './workflows/usePullRequestWorkflow';
import { useRepoUnavailableWorkflow } from './workflows/useRepoUnavailableWorkflow';
import { useReleaseWorkflow } from './workflows/useReleaseWorkflow';
import {
  deriveRepoNameFromCloneSource,
  isCloneSourceLikelyRemote,
  normalizeGitHost,
  parseGithubRepoReference,
} from './workflows/repoWorkflowUtils';

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


  const [settings, setSettings] = useState<AppSettingsDto>(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<GitJobEventDto[]>([]);
  const [plannerRefreshSignal, setPlannerRefreshSignal] = useState(0);

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
    activeGitActionLabel,
    activeGitCommand,
    connectError,
    createGithubRepoAndConnect,
    forceGithubRepoCreationPrompt,
    isConnectingGithubRepo,
    isGitActionRunning,
    isGitActionRunningRef,
    newRepoDescription,
    newRepoName,
    newRepoPrivate,
    runGitCommand,
    setActiveGitActionLabel,
    setConnectError,
    setNewRepoDescription,
    setNewRepoName,
    setNewRepoPrivate,
  } = useGitCommandWorkflow({
    workspace: {
      activeRepo: workspace.activeRepo,
      addOpenRepo: workspace.addOpenRepo,
      setActiveRepo: workspace.setActiveRepo,
      setActiveTab: workspace.setActiveTab,
    },
    settings,
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
    setConflictResolverPath: setAutoOpenConflictResolverPath,
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
    if (!appClient.isAvailable()) return;

    try {
      const next = await appClient.setSettings(partial);
      setSettings(next);
      setGitActionToast({ msg: tr('Einstellungen gespeichert.', 'Settings saved.'), isError: false });
    } catch (e: any) {
      setGitActionToast({ msg: e?.message || tr('Einstellungen konnten nicht gespeichert werden.', 'Could not save settings.'), isError: true });
    }
  }, [setGitActionToast, tr]);

  useEffect(() => {
    const loadSettings = async () => {
      if (!appClient.isAvailable()) return;
      try {
        const loaded = await appClient.getSettings();
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
    if (!aiClient.isAvailable()) return;

    const unsubscribe = aiClient.onJobEvent((event) => {
      setJobs(prev => compactTransferProgressJobs(prev, event));
    });

    return unsubscribe;
  }, []);

  useRepoUnavailableWorkflow({
    activeRepo: workspace.activeRepo,
    handleCloseRepo: workspace.handleCloseRepo,
    setPlannerRefreshSignal,
    setConfirmDialog,
    setGitActionToast,
    language: settings.language,
  });

  const { openConflictResolverForPath } = useConflictResolverWorkflow({
    setActiveTab: workspace.setActiveTab,
    setConflictResolverPath: setAutoOpenConflictResolverPath,
    setGitActionToast,
    triggerRefresh,
    language: settings.language,
  });
  const navigateToCommit = useCallback((hash: string) => {
    const normalizedHash = String(hash || '').trim();
    if (!/^[0-9a-f]{7,64}$/i.test(normalizedHash)) return;

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
    if (!githubClient.isAvailable()) return;
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
        const forkResult = await githubClient.forkRepository({
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
    if (!githubClient.isAvailable() || !workspace.activeRepo) return;
    if (!github.isAuthenticated) {
      setConnectError(tr('Bitte zuerst GitHub verbinden (GitHub-Tab).', 'Please connect GitHub first (GitHub tab).'));
      return;
    }
    await createGithubRepoAndConnect({ replaceOriginIfExists: true, pushAfterConnect: true });
  };

  const {
    closeReleaseCreator,
    generateReleaseNotesWithAI,
    handleCreateRelease,
    openReleaseCreator,
    refreshReleaseContext,
    setReleaseForm,
  } = useReleaseWorkflow({
    isGithubAuthenticated: github.isAuthenticated,
    ownerRepo: pullRequestDomain.prOwnerRepo,
    currentBranch: repository.currentBranch,
    releaseForm,
    setReleaseFormState,
    releaseContext,
    setReleaseContext,
    setReleaseContextError,
    setReleaseContextLoading,
    setReleaseError,
    setReleaseSuccess,
    setReleaseSubmitting,
    showReleaseCreator,
    setShowReleaseCreator,
    setReleaseNotesGenerating,
    releaseNotesLanguage,
    releaseNotesOptions,
    setConfirmDialog,
    setGitActionToast,
    setActiveTab: workspace.setActiveTab,
    triggerRefresh,
    language: settings.language,
  });
  const {
    handleCheckoutPR,
    handleCopyPRUrl,
    handleCreatePR,
    handleMergePR,
    handleOpenPR,
  } = usePullRequestWorkflow({
    ownerRepo: pullRequestDomain.prOwnerRepo,
    createPullRequest: pullRequestDomain.createPR,
    currentBranch: repository.currentBranch,
    newPRTitle,
    newPRBody,
    newPRHead,
    newPRBase,
    runGitCommand,
    refreshRemoteState: repository.refreshRemoteState,
    confirmDangerousOps: settings.confirmDangerousOps,
    setConfirmDialog,
    setGitActionToast,
    triggerRefresh,
    language: settings.language,
  });
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
    addOpenRepo: workspace.addOpenRepo,
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
    onNavigateToCommit: navigateToCommit,
    autoOpenConflictResolverPath,
    clearAutoOpenConflictResolverPath,
    openConflictResolverForPath,

    isGitActionRunning,
    activeGitCommand,
    activeGitActionLabel,
    runGitCommand,
    gitActionToast,
    gitActionToasts,
    setGitActionToast,
    dismissToast,

    branches: repository.branches,
    currentBranch: repository.currentBranch,
    isCreatingBranch: repository.isCreatingBranch,
    setIsCreatingBranch: repository.setIsCreatingBranch,
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
    githubReposHasMore: github.githubReposHasMore,
    isLoadingGithubRepos: github.isLoadingRepos,
    isLoadingMoreGithubRepos: github.isLoadingMoreRepos,
    loadMoreGithubRepos: () => { void github.loadMoreRepos(); },
    refreshGithubRepos: (search?: string) => { void github.refreshRepos(search); },
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
    closeCloneProgress: github.closeCloneProgress,
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
    plannerRefreshSignal,
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
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    executeConfirmDialogSecondary,
    closeInputDialog,
    executeInputDialog,
  };
};


