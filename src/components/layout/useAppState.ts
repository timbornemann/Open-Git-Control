import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettingsDto, GitJobEventDto } from '@/global';
import { useToastQueue } from '@/hooks/useToastQueue';
import { translateFromCatalog, trByLanguage, type TranslationVariables } from '@/i18n';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useGithubDomain } from './hooks/useGithubDomain';
import { usePullRequests } from '@/hooks/usePullRequests';
import { aiClient } from '@/services/aiClient';
import { appClient } from '@/services/appClient';
import { githubClient } from '@/services/githubClient';
import { parseRemoteBranchRef } from '@/utils/gitParsing';
import { DEFAULT_SETTINGS } from './state/appStateShared';
import { useSidebarCollapseState } from './state/useSidebarCollapseState';
import { usePrAndReleaseState } from './state/usePrAndReleaseState';
import { useConflictResolverWorkflow } from './workflows/useConflictResolverWorkflow';
import { compactTransferProgressJobs } from './workflows/jobWorkflowUtils';
import { useGitCommandWorkflow } from './workflows/useGitCommandWorkflow';
import { usePullRequestWorkflow } from './workflows/usePullRequestWorkflow';
import { useRepoUnavailableWorkflow } from './workflows/useRepoUnavailableWorkflow';
import { useReleaseWorkflow } from './workflows/useReleaseWorkflow';
import { deriveRepoNameFromCloneSource, isCloneSourceLikelyRemote, normalizeGitHost, parseGithubRepoReference } from './workflows/repoWorkflowUtils';

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

  const {
    toast: gitActionToast,
    toasts: gitActionToasts,
    setToast: setGitActionToast,
    dismiss: dismissToast,
  } = useToastQueue({
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

  const tr = useCallback(
    (deText: string, enText: string) => {
      return trByLanguage(settings.language, deText, enText);
    },
    [settings.language],
  );
  const t = useCallback((key: string, variables?: TranslationVariables) => translateFromCatalog(settings.language, key, variables), [settings.language]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const triggerCommitRefresh = useCallback(() => {
    setCommitRefreshTrigger((prev) => prev + 1);
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

  const handleUpdateSettings = useCallback(
    async (partial: Partial<AppSettingsDto>) => {
      if (!appClient.isAvailable()) return;

      try {
        const next = await appClient.setSettings(partial);
        setSettings(next);
        setGitActionToast({ msg: t('generated.components.layout.useappstate.settings_saved_d81d1258'), isError: false });
      } catch (e: any) {
        setGitActionToast({ msg: e?.message || t('generated.components.layout.useappstate.could_not_save_settings_bc762a3b'), isError: true });
      }
    },
    [setGitActionToast, tr],
  );

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
      setJobs((prev) => compactTransferProgressJobs(prev, event));
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
  const navigateToCommit = useCallback(
    (hash: string) => {
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
    },
    [setShowReleaseCreator, workspace.setActiveTab],
  );

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

  const cloneFromRemoteSource = useCallback(
    async (cloneSourceRaw: string, targetNameRaw?: string): Promise<boolean> => {
      const cloneSource = String(cloneSourceRaw || '').trim();
      if (!cloneSource) {
        setGitActionToast({ msg: t('generated.components.layout.useappstate.clone_source_is_required_0f140f6c'), isError: true });
        return false;
      }
      if (!isCloneSourceLikelyRemote(cloneSource)) {
        setGitActionToast({
          msg: t('generated.components.layout.useappstate.please_provide_an_http_https_ssh_url_for_example_https_s_834268dc'),
          isError: true,
        });
        return false;
      }

      const targetName = String(targetNameRaw || '').trim();
      return github.cloneRepository(cloneSource, {
        repoName: deriveRepoNameFromCloneSource(cloneSource),
        targetName: targetName || undefined,
      });
    },
    [github, setGitActionToast, tr],
  );

  const handleCloneByUrl = useCallback(() => {
    setInputDialog({
      title: t('generated.components.sidebar.repolist.clone_repository_from_url_b2415d88'),
      message: t('generated.components.layout.useappstate.enter_an_http_https_or_ssh_url_and_choose_a_target_direc_4e24ef1b'),
      fields: [
        {
          id: 'cloneSource',
          label: t('generated.components.layout.useappstate.clone_url_449646ea'),
          placeholder: 'https://github.com/owner/repo.git',
          required: true,
          validate: (value) => {
            const normalized = String(value || '').trim();
            if (!normalized) return null;
            if (isCloneSourceLikelyRemote(normalized)) return null;
            return t('generated.components.layout.useappstate.please_provide_an_http_https_ssh_url_for_example_https_o_f3e16379');
          },
        },
        {
          id: 'targetName',
          label: t('generated.components.layout.useappstate.folder_name_optional_bcb3f976'),
          placeholder: t('generated.components.layout.useappstate.default_name_from_url_3a3ad316'),
          required: false,
        },
      ],
      contextItems: [],
      irreversible: false,
      consequences: t('generated.components.layout.useappstate.a_target_folder_will_be_created_and_the_repository_will_c295fbf1'),
      confirmLabel: t('generated.components.layout.useappstate.clone_6a063226'),
      onSubmit: async (values) => {
        const cloned = await cloneFromRemoteSource(values.cloneSource || '', values.targetName || '');
        if (!cloned) return;
        setGitActionToast({
          msg: t('generated.components.layout.useappstate.repository_cloned_successfully_7b3b2cd9'),
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
        msg: t('generated.components.layout.useappstate.please_sign_in_first_in_the_github_tab_d5addce9'),
        isError: true,
      });
      return;
    }

    setInputDialog({
      title: t('generated.components.layout.useappstate.fork_github_repository_1007beda'),
      message: t('generated.components.layout.useappstate.enter_a_github_repository_url_the_fork_will_be_created_a_d4393eec'),
      fields: [
        {
          id: 'sourceUrl',
          label: t('generated.components.layout.useappstate.source_url_7796b5a2'),
          placeholder: 'https://github.com/owner/repo',
          required: true,
          validate: (value) => {
            const normalized = String(value || '').trim();
            if (!normalized) return null;
            return parseGithubRepoReference(normalized)
              ? null
              : t('generated.components.layout.useappstate.please_provide_a_valid_github_url_https_ssh_or_git_host_e46862d3');
          },
        },
        {
          id: 'forkName',
          label: t('generated.components.layout.useappstate.fork_name_optional_0bb173f5'),
          placeholder: t('generated.components.layout.useappstate.default_same_name_beadebe3'),
          required: false,
        },
      ],
      contextItems: [
        {
          label: t('generated.components.layout.useappstate.github_host_fe3a52b8'),
          value: normalizeGitHost(settings.githubHost),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.useappstate.a_fork_will_be_created_in_your_github_account_and_cloned_b2f425e5'),
      confirmLabel: t('generated.components.layout.useappstate.fork_clone_b5d1214a'),
      onSubmit: async (values) => {
        const sourceUrl = String(values.sourceUrl || '').trim();
        const parsed = parseGithubRepoReference(sourceUrl);
        if (!parsed) {
          setGitActionToast({
            msg: t('generated.components.layout.useappstate.invalid_github_url_926331e1'),
            isError: true,
          });
          return;
        }

        const configuredHost = normalizeGitHost(settings.githubHost);
        if (parsed.host !== configuredHost) {
          setGitActionToast({
            msg: tr(`Host passt nicht zum aktiven GitHub-Host (${configuredHost}).`, `Host does not match the active GitHub host (${configuredHost}).`),
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
            msg: forkResult.error || t('generated.components.layout.useappstate.could_not_create_fork_bbfec539'),
            isError: true,
          });
          return;
        }

        setGitActionToast({
          msg: tr(`Fork erstellt: ${forkResult.data.fullName}. Starte Clone...`, `Fork created: ${forkResult.data.fullName}. Starting clone...`),
          isError: false,
        });

        const cloneSuccess = await github.cloneRepository(forkResult.data.cloneUrl, {
          repoName: forkResult.data.name,
        });
        if (!cloneSuccess) {
          setGitActionToast({
            msg: t('generated.components.layout.useappstate.fork_created_but_clone_failed_please_retry_cloning_939a65a0'),
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
      setConnectError(t('generated.components.layout.useappstate.please_connect_github_first_github_tab_68715c85'));
      return;
    }
    await createGithubRepoAndConnect({ replaceOriginIfExists: true, pushAfterConnect: true });
  };

  const { closeReleaseCreator, generateReleaseNotesWithAI, handleCreateRelease, openReleaseCreator, refreshReleaseContext, setReleaseForm } =
    useReleaseWorkflow({
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
  const { handleCheckoutPR, handleCopyPRUrl, handleCreatePR, handleMergePR, handleOpenPR } = usePullRequestWorkflow({
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
      tr(
        `Tracking gesetzt: ${repository.currentBranch} -> origin/${repository.currentBranch}`,
        `Tracking set: ${repository.currentBranch} -> origin/${repository.currentBranch}`,
      ),
    );

    if (!setTracking) {
      await runGitCommand(
        ['push', '-u', 'origin', repository.currentBranch],
        tr(`Branch ${repository.currentBranch} mit Upstream gepusht.`, `Pushed branch ${repository.currentBranch} with upstream.`),
      );
    }
  }, [repository.currentBranch, runGitCommand, workspace.activeRepo, tr]);

  const handleCheckoutRemoteBranch = useCallback(
    async (remoteBranchName: string) => {
      const normalized = (remoteBranchName || '').trim();
      if (!normalized) return;

      const parsed = parseRemoteBranchRef(normalized);
      if (!parsed) {
        setGitActionToast({
          msg: t('generated.components.layout.useappstate.invalid_remote_branch_3042f288'),
          isError: true,
        });
        return;
      }

      const { remoteRef, localBranchName } = parsed;
      const createdTrackingBranch = await runGitCommand(
        ['checkout', '--track', remoteRef],
        tr(`Branch ${localBranchName} aus ${remoteRef} ausgecheckt.`, `Checked out branch ${localBranchName} from ${remoteRef}.`),
      );

      if (createdTrackingBranch) return;

      await runGitCommand(['checkout', localBranchName], tr(`Branch ${localBranchName} ausgecheckt.`, `Checked out branch ${localBranchName}.`));
    },
    [runGitCommand, setGitActionToast, tr],
  );

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
    loadMoreGithubRepos: () => {
      void github.loadMoreRepos();
    },
    refreshGithubRepos: (search?: string) => {
      void github.refreshRepos(search);
    },
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
