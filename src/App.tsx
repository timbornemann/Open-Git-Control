import React, { useCallback, useMemo, useState } from 'react';
import { AppSidebar } from './components/layout/AppSidebar';
import { MainView } from './components/layout/MainView';
import { OverlayManager } from './components/layout/OverlayManager';
import { useAppState } from './components/layout/useAppState';
import type { SettingsTabId } from './components/layout/sidebar/AppSidebar.types';
import { I18nProvider, translateFromCatalog, type TranslationVariables } from './i18n';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { useRepoSwitcherKeyboard } from './hooks/useRepoSwitcherKeyboard';
import { useResizableSidebar } from './hooks/useResizableSidebar';
import type { PaletteCommand } from './components/CommandPalette';
import { AppStateSlicesProvider, createAppStateSlices, type AppContextValue } from './contexts/AppStateContext';
import { ProjectPlannerProvider } from './contexts/ProjectPlannerContext';
import './index.css';

const App: React.FC = () => {
  const state = useAppState();
  const tr = (deText: string, enText: string) => (state.settings.language === 'en' ? enText : deText);
  const t = useCallback(
    (key: string, variables?: TranslationVariables) => translateFromCatalog(state.settings.language, key, variables),
    [state.settings.language],
  );
  const [selectedGithubAuthHelpMethod, setSelectedGithubAuthHelpMethod] = useState<'pat' | 'device' | 'web' | null>('pat');
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const { sidebarWidth, isSidebarCollapsed, isSidebarResizing, resetLayout, handleToggleSidebar, handleSidebarResizeStart } = useResizableSidebar();
  const { repoSwitcherIndex, repoSwitcherListRef } = useRepoSwitcherKeyboard({
    openRepos: state.openRepos,
    activeRepo: state.activeRepo,
    onSwitchRepo: state.handleSwitchRepo,
    onRepositoryCommitted: () => state.setActiveTab('repo'),
  });

  const paletteCommands: PaletteCommand[] = [
    // Navigation
    { id: 'tab-repos', label: t('generated.app.local_repos_c90bebd3'), keywords: ['local', 'repos', 'lokal'], action: () => state.setActiveTab('localRepos') },
    { id: 'tab-repo', label: t('generated.app.repository_view_400eb999'), keywords: ['repo', 'branch', 'commits'], action: () => state.setActiveTab('repo') },
    {
      id: 'tab-planner',
      label: t('generated.components.layout.main.maintopbar.project_planning_71556778'),
      keywords: ['todo', 'ideas', 'bugs', 'features', 'planung'],
      action: () => state.setActiveTab('planner'),
    },
    {
      id: 'tab-github',
      label: t('generated.components.layout.settingsmaincontent.github_6d98f785'),
      keywords: ['github', 'pr', 'pull request'],
      action: () => state.setActiveTab('github'),
    },
    {
      id: 'tab-settings',
      label: t('generated.components.layout.main.mainprimarypane.settings_c6256784'),
      keywords: ['settings', 'preferences'],
      action: () => state.setActiveTab('settings'),
    },
    // Remote
    {
      id: 'fetch',
      label: t('generated.app.fetch_refresh_remote_88270faa'),
      keywords: ['fetch', 'remote', 'sync'],
      action: () => state.refreshRemoteState(true),
    },
    {
      id: 'pull',
      label: t('generated.app.pull_8c55fb85'),
      keywords: ['pull', 'download'],
      action: () => state.runGitCommand(['pull'], t('generated.app.pull_completed_successfully_a760cd36')),
    },
    {
      id: 'pull-rebase',
      label: t('generated.app.pull_rebase_5d462c6a'),
      keywords: ['pull', 'rebase'],
      action: () => state.runGitCommand(['pull', '--rebase'], t('generated.app.pull_with_rebase_completed_a6e6129f')),
    },
    {
      id: 'push',
      label: t('generated.app.push_61ad6264'),
      keywords: ['push', 'upload'],
      action: () => state.runGitCommand(['push'], t('generated.app.push_completed_successfully_edf8c1c9')),
    },
    {
      id: 'push-force',
      label: t('generated.app.push_force_with_lease_f7c67bfe'),
      keywords: ['push', 'force'],
      action: () => state.runGitCommand(['push', '--force-with-lease'], t('generated.app.force_push_completed_1f9d562e')),
    },
    // Branches
    {
      id: 'branch-create',
      label: t('generated.app.create_branch_d8083e45'),
      keywords: ['branch', 'new', 'erstellen'],
      action: () => {
        state.setActiveTab('repo');
        state.setIsCreatingBranch(true);
      },
    },
    // Stash
    {
      id: 'stash-push',
      label: t('generated.components.staging_area.usefileoperations.create_stash_ebe60340'),
      keywords: ['stash', 'save', 'speichern'],
      action: () => state.runGitCommand(['stash', 'push', '-m', 'Quick stash'], t('generated.app.stash_created_56116f06')),
    },
    {
      id: 'stash-pop',
      label: t('generated.app.apply_last_stash_pop_120593db'),
      keywords: ['stash', 'pop', 'apply', 'anwenden'],
      action: () => state.runGitCommand(['stash', 'pop'], t('generated.app.stash_applied_4b30902e')),
    },
    // Merge / Rebase
    {
      id: 'merge-abort',
      label: t('generated.components.layout.main.mainprimarypane.abort_merge_8f3c2f66'),
      keywords: ['merge', 'abort', 'abbrechen'],
      action: () => state.runGitCommand(['mergeAbort'], t('generated.app.merge_aborted_b602bf32')),
    },
    {
      id: 'merge-continue',
      label: t('generated.app.continue_merge_56cfed8e'),
      keywords: ['merge', 'continue', 'fortsetzen'],
      action: () => state.runGitCommand(['mergeContinue'], t('generated.app.merge_continued_63b9ee36')),
    },
    {
      id: 'rebase-abort',
      label: t('generated.components.layout.main.mainprimarypane.abort_rebase_c924fd71'),
      keywords: ['rebase', 'abort', 'abbrechen'],
      action: () => state.runGitCommand(['rebaseAbort'], t('generated.app.rebase_aborted_74ce61c8')),
    },
    {
      id: 'rebase-continue',
      label: t('generated.components.layout.main.mainprimarypane.continue_rebase_828a1cd9'),
      keywords: ['rebase', 'continue', 'fortsetzen'],
      action: () => state.runGitCommand(['rebaseContinue'], t('generated.app.rebase_continued_181b298d')),
    },
    // Repo
    { id: 'open-folder', label: t('generated.app.open_repository_09ccbb87'), keywords: ['open', 'folder', 'öffnen'], action: () => state.handleOpenFolder() },
    {
      id: 'clone-url',
      label: t('generated.app.clone_repository_from_url_94b504ff'),
      keywords: ['clone', 'url', 'ssh', 'http'],
      action: () => state.handleCloneByUrl(),
    },
    {
      id: 'fork-url',
      label: t('generated.app.fork_github_repository_from_url_6e2cc177'),
      keywords: ['fork', 'github', 'url'],
      action: () => state.handleForkByUrl(),
    },
    {
      id: 'add-remote',
      label: t('generated.app.add_remote_3a4267c1'),
      keywords: ['remote', 'add', 'hinzufügen'],
      action: () => {
        state.setActiveTab('repo');
        state.handleAddRemote();
      },
    },
  ];

  useGlobalKeyboardShortcuts({
    setActiveTab: state.setActiveTab,
    onFetch: () => state.refreshRemoteState(true),
    onOpenCommandPalette: () => setIsPaletteOpen(true),
  });

  const activeTransferCommand = state.activeGitCommand === 'pull' || state.activeGitCommand === 'fetch' ? state.activeGitCommand : null;
  const activeTransferEvents = useMemo(() => {
    if (!activeTransferCommand) return [];

    const operation = `git:${activeTransferCommand}`;
    const latestEvent = state.jobs.find((event) => event.operation === operation);
    if (!latestEvent || latestEvent.status === 'done' || latestEvent.status === 'failed' || latestEvent.status === 'cancelled') {
      return [];
    }

    return state.jobs
      .filter((event) => event.id === latestEvent.id)
      .slice()
      .reverse();
  }, [activeTransferCommand, state.jobs]);
  const showGitTransferProgress = Boolean(activeTransferCommand && state.isGitActionRunning && !state.isCloning);
  const handleBranchMenuCheckout = useCallback(
    (branch: string) => {
      if (branch.startsWith('remotes/')) {
        void state.handleCheckoutRemoteBranch(branch);
        return;
      }
      void state.runGitCommand(['checkout', branch], tr(`Ausgecheckt: ${branch}`, `Checked out: ${branch}`));
    },
    [state, tr],
  );
  const handleCloneProgressClose = useCallback(() => {
    state.closeCloneProgress();
    state.triggerRefresh();
  }, [state]);

  const ctxValue: AppContextValue = {
    // ── AppSidebarProps ────────────────────────────────────────────────────
    activeTab: state.activeTab,
    setActiveTab: state.setActiveTab,

    activeRepo: state.activeRepo,
    openRepos: state.openRepos,
    repoMeta: state.repoMeta,
    repoSortBy: state.repoSortBy,
    onSetRepoSortBy: state.setRepoSortBy,
    onToggleRepoPin: state.handleToggleRepoPin,
    onOpenFolder: state.handleOpenFolder,
    onCloneByUrl: state.handleCloneByUrl,
    onSwitchRepo: state.handleSwitchRepo,
    onCloseRepo: state.handleCloseRepo,
    isRepoPanelCollapsed: state.isRepoPanelCollapsed,
    onToggleRepoPanelCollapsed: state.toggleRepoPanelCollapsed,

    remoteSync: state.remoteSync,
    isGitActionRunning: state.isGitActionRunning,
    onRefreshRemoteQuick: () => state.refreshRemoteState(true),

    branches: state.branches,
    isCreatingBranch: state.isCreatingBranch,
    onSetCreatingBranch: state.setIsCreatingBranch,
    onCreateBranch: state.handleCreateBranch,
    onCheckoutBranch: (name) => state.runGitCommand(['checkout', name], tr(`Ausgecheckt: ${name}`, `Checked out: ${name}`)),
    onSetBranchContextMenu: state.setBranchContextMenu,
    isBranchPanelCollapsed: state.isBranchPanelCollapsed,
    onToggleBranchPanelCollapsed: state.toggleBranchPanelCollapsed,

    tags: state.tags,
    onCreateTag: state.handleCreateTag,
    onPushTags: state.handlePushTags,
    onDeleteTag: state.handleDeleteTag,
    onSelectTag: state.handleSelectTag,
    isTagPanelCollapsed: state.isTagPanelCollapsed,
    onToggleTagPanelCollapsed: state.toggleTagPanelCollapsed,

    remotes: state.remotes,
    remoteStatus: state.remoteStatus,
    onAddRemote: state.handleAddRemote,
    onRemoveRemote: state.handleRemoveRemote,
    onRenameRemote: state.handleRenameRemote,
    onSetRemoteUrl: state.handleSetRemoteUrl,
    onRefreshRemote: () => state.refreshRemoteState(true),
    onSetUpstreamForCurrentBranch: state.handleSetUpstreamForCurrentBranch,
    isRemotePanelCollapsed: state.isRemotePanelCollapsed,
    onToggleRemotePanelCollapsed: state.toggleRemotePanelCollapsed,

    submodules: state.submodules,
    onSubmoduleInitUpdate: state.handleSubmoduleInitUpdate,
    onSubmoduleSync: state.handleSubmoduleSync,
    onOpenSubmodule: state.handleOpenSubmodule,
    isSubmodulePanelCollapsed: state.isSubmodulePanelCollapsed,
    onToggleSubmodulePanelCollapsed: state.toggleSubmodulePanelCollapsed,

    hasRemoteOrigin: state.hasRemoteOrigin,
    forceGithubRepoCreationPrompt: state.forceGithubRepoCreationPrompt,
    isConnectingGithubRepo: state.isConnectingGithubRepo,
    connectError: state.connectError,
    newRepoName: state.newRepoName,
    setNewRepoName: state.setNewRepoName,
    newRepoDescription: state.newRepoDescription,
    setNewRepoDescription: state.setNewRepoDescription,
    newRepoPrivate: state.newRepoPrivate,
    setNewRepoPrivate: state.setNewRepoPrivate,
    onCreateGithubRepoForCurrent: state.handleCreateGithubRepoForCurrent,

    isAuthenticated: state.isAuthenticated,
    tokenInput: state.tokenInput,
    setTokenInput: state.setTokenInput,
    isAuthenticating: state.isAuthenticating,
    authError: state.authError,
    setAuthError: state.setAuthError,
    onTokenLogin: state.handleTokenLogin,
    oauthConfigured: state.oauthConfigured,
    deviceFlow: state.deviceFlow,
    isDeviceFlowRunning: state.isDeviceFlowRunning,
    deviceFlowError: state.deviceFlowError,
    onStartDeviceFlowLogin: state.handleStartDeviceFlowLogin,
    onCancelDeviceFlow: state.handleCancelDeviceFlow,
    isWebFlowRunning: state.isWebFlowRunning,
    webFlowError: state.webFlowError,
    onStartWebFlowLogin: state.handleStartWebFlowLogin,
    selectedGithubAuthHelpMethod,
    onSelectGithubAuthHelpMethod: setSelectedGithubAuthHelpMethod,

    githubUser: state.githubUser,
    githubRepos: state.githubRepos,
    githubReposHasMore: state.githubReposHasMore,
    isLoadingGithubRepos: state.isLoadingGithubRepos,
    isLoadingMoreGithubRepos: state.isLoadingMoreGithubRepos,
    loadMoreGithubRepos: state.loadMoreGithubRepos,
    refreshGithubRepos: state.refreshGithubRepos,
    onLogout: state.handleLogout,
    onClone: state.handleClone,
    onForkByUrl: state.handleForkByUrl,
    isCloning: state.isCloning,

    prOwnerRepo: state.prOwnerRepo,
    prFilter: state.prFilter,
    setPrFilter: state.setPrFilter,
    prLoading: state.prLoading,
    pullRequests: state.pullRequests,
    prCiByNumber: state.prCiByNumber,
    onOpenPR: state.handleOpenPR,
    onCopyPRUrl: state.handleCopyPRUrl,
    onCheckoutPR: state.handleCheckoutPR,
    onMergePR: state.handleMergePR,

    showCreatePR: state.showCreatePR,
    setShowCreatePR: state.setShowCreatePR,
    currentBranch: state.currentBranch,
    setNewPRHead: state.setNewPRHead,
    newPRTitle: state.newPRTitle,
    setNewPRTitle: state.setNewPRTitle,
    newPRBody: state.newPRBody,
    setNewPRBody: state.setNewPRBody,
    newPRHead: state.newPRHead,
    setNewPRHeadInput: state.setNewPRHead,
    newPRBase: state.newPRBase,
    setNewPRBase: state.setNewPRBase,
    onCreatePR: state.handleCreatePR,

    releaseForm: state.releaseForm,
    setReleaseForm: state.setReleaseForm,
    releaseSubmitting: state.releaseSubmitting,
    releaseError: state.releaseError,
    releaseSuccess: state.releaseSuccess,
    onCreateRelease: state.handleCreateRelease,

    settings: state.settings,
    onUpdateSettings: state.handleUpdateSettings,
    jobs: state.jobs,
    onClearJobs: state.clearJobs,
    settingsTab,
    onSelectSettingsTab: setSettingsTab,

    // ── AppContextValue extras ─────────────────────────────────────────────
    onClearGithubAuthHelpMethod: () => setSelectedGithubAuthHelpMethod(null),
    onResetLayout: resetLayout,

    activeGitActionLabel: state.activeGitActionLabel,
    runGitCommand: state.runGitCommand,

    selectedCommit: state.selectedCommit,
    setSelectedCommit: state.setSelectedCommit,
    commitNavigationRequest: state.commitNavigationRequest,
    onNavigateToCommit: state.onNavigateToCommit,
    refreshTrigger: state.refreshTrigger,
    triggerRefresh: state.triggerRefresh,
    commitRefreshTrigger: state.commitRefreshTrigger,
    triggerCommitRefresh: state.triggerCommitRefresh,
    showSecondaryHistory: state.settings.showSecondaryHistory,

    onFetch: () => state.refreshRemoteState(true),
    onPull: () => state.runGitCommand(['pull'], t('generated.app.pull_completed_successfully_a760cd36'), t('generated.app.running_pull_282e1a76')),
    onPullRebase: () =>
      state.runGitCommand(
        ['pull', '--rebase'],
        t('generated.app.pull_with_rebase_completed_successfully_732a6b7f'),
        t('generated.app.running_pull_rebase_f9ca4da2'),
      ),
    onPullFfOnly: () =>
      state.runGitCommand(
        ['pull', '--ff-only'],
        t('generated.app.pull_with_ff_only_completed_successfully_01a725eb'),
        t('generated.app.running_pull_ff_only_efd80da9'),
      ),
    onPullNoFf: () =>
      state.runGitCommand(['pull', '--no-ff'], t('generated.app.pull_with_no_ff_completed_0271e730'), t('generated.app.running_pull_no_ff_222dffa5')),
    onPush: () => state.runGitCommand(['push'], t('generated.app.push_completed_successfully_edf8c1c9'), t('generated.app.running_push_0ab33329')),
    onPushForceWithLease: () =>
      state.runGitCommand(
        ['push', '--force-with-lease'],
        t('generated.app.push_with_force_with_lease_completed_successfully_a27c0ef4'),
        t('generated.app.running_push_force_with_lease_590e0aba'),
      ),
    onPushSetUpstream: () => {
      const b = state.currentBranch;
      if (b)
        void state.runGitCommand(['push', '-u', 'origin', b], tr(`Branch "${b}" gepusht & Upstream gesetzt.`, `Pushed "${b}" & set upstream.`), 'Push -u...');
    },
    onMergeBranch: state.handleMergeBranch,
    onOpenRepoWorkspace: () => state.setActiveTab('repo'),

    showReleaseCreator: state.showReleaseCreator,
    onOpenReleaseCreator: state.openReleaseCreator,
    onCloseReleaseCreator: state.closeReleaseCreator,
    releaseContextLoading: state.releaseContextLoading,
    releaseContextError: state.releaseContextError,
    releaseContext: state.releaseContext,
    onRefreshReleaseContext: state.refreshReleaseContext,
    onGenerateReleaseNotes: state.generateReleaseNotesWithAI,
    releaseNotesGenerating: state.releaseNotesGenerating,
    releaseNotesLanguage: state.releaseNotesLanguage,
    setReleaseNotesLanguage: state.setReleaseNotesLanguage,
    releaseNotesOptions: state.releaseNotesOptions,
    setReleaseNotesOptions: (updater) => state.setReleaseNotesOptions(updater),

    autoOpenConflictResolverPath: state.autoOpenConflictResolverPath,
    onAutoOpenConflictResolverConsumed: state.clearAutoOpenConflictResolverPath,
    onOpenConflictResolverForPath: state.openConflictResolverForPath,
    onConflictMergeContinue: () => {
      void state.runGitCommand(['mergeContinue'], t('generated.app.merge_continued_63b9ee36'), t('generated.app.continuing_merge_9ed78a88'));
    },
    onConflictMergeAbort: () => {
      void state.runGitCommand(['mergeAbort'], t('generated.app.merge_aborted_b602bf32'), t('generated.app.aborting_merge_4f4ac264'));
    },
    onConflictRebaseContinue: () => {
      void state.runGitCommand(['rebaseContinue'], t('generated.app.rebase_continued_181b298d'), t('generated.app.continuing_rebase_21242ce6'));
    },
    onConflictRebaseAbort: () => {
      void state.runGitCommand(['rebaseAbort'], t('generated.app.rebase_aborted_74ce61c8'), t('generated.app.aborting_rebase_bd30693b'));
    },
  };
  const appStateSlices = createAppStateSlices(ctxValue, {
    sidebarWidth,
    isSidebarCollapsed,
    isSidebarResizing,
    onToggleSidebar: handleToggleSidebar,
    onSidebarResizeStart: handleSidebarResizeStart,
    isCommandPaletteOpen: isPaletteOpen,
    setCommandPaletteOpen: setIsPaletteOpen,
    branchContextMenu: state.branchContextMenu,
    setBranchContextMenu: state.setBranchContextMenu,
    confirmDialog: state.confirmDialog,
    setConfirmDialog: state.setConfirmDialog,
    inputDialog: state.inputDialog,
    setInputDialog: state.setInputDialog,
    closeConfirmDialog: state.closeConfirmDialog,
    executeConfirmDialog: state.executeConfirmDialog,
    executeConfirmDialogSecondary: state.executeConfirmDialogSecondary,
    closeInputDialog: state.closeInputDialog,
    executeInputDialog: state.executeInputDialog,
  });

  return (
    <I18nProvider language={state.settings.language}>
      <AppStateSlicesProvider value={appStateSlices}>
        <ProjectPlannerProvider
          activeRepo={state.activeRepo}
          refreshSignal={state.plannerRefreshSignal}
          onRepositorySelected={state.addOpenRepo}
          onRepositoryMaterialized={async (repoPath) => {
            await state.addOpenRepo(repoPath);
            state.setActiveTab('planner');
            state.setGitActionToast({
              msg: t('generated.app.created_project_folder_and_initialized_git_repository_1d314004'),
              isError: false,
            });
          }}
          onToast={(message, isError) => state.setGitActionToast({ msg: message, isError })}
          setConfirmDialog={state.setConfirmDialog}
        >
          <div
            className={`app-container${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
            style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
          >
            <AppSidebar />

            {!isSidebarCollapsed && (
              <div
                className={`pane-resizer app-sidebar-resizer ${isSidebarResizing ? 'dragging' : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label={t('generated.app.resize_sidebar_width_d9368c0f')}
                onPointerDown={handleSidebarResizeStart}
              />
            )}

            <MainView />

            <OverlayManager
              repoSwitcher={{
                selectedIndex: repoSwitcherIndex,
                listRef: repoSwitcherListRef,
                openRepos: state.openRepos,
                activeRepo: state.activeRepo,
              }}
              toasts={{
                items: state.gitActionToasts,
                onDismiss: state.dismissToast,
              }}
              branchMenu={{
                menu: state.branchContextMenu,
                setMenu: state.setBranchContextMenu,
                onCheckout: handleBranchMenuCheckout,
                onMerge: state.handleMergeBranch,
                onRename: state.handleRenameBranch,
                onDelete: state.handleDeleteBranch,
              }}
              dialogs={{
                confirmDialog: state.confirmDialog,
                inputDialog: state.inputDialog,
                onConfirm: state.executeConfirmDialog,
                onSecondaryConfirm: state.executeConfirmDialogSecondary,
                onCancelConfirm: state.closeConfirmDialog,
                onSubmitInput: state.executeInputDialog,
                onCancelInput: state.closeInputDialog,
              }}
              gitTransfer={{
                open: showGitTransferProgress,
                title: state.activeGitActionLabel,
                events: activeTransferEvents,
              }}
              cloneProgress={{
                isCloning: state.isCloning,
                cloneRepoName: state.cloneRepoName,
                cloneFinished: state.cloneFinished,
                cloneError: state.cloneError,
                cloneLog: state.cloneLog,
                onClose: handleCloneProgressClose,
              }}
              commandPalette={{
                open: isPaletteOpen,
                commands: paletteCommands,
                onClose: () => setIsPaletteOpen(false),
              }}
            />
          </div>
        </ProjectPlannerProvider>
      </AppStateSlicesProvider>
    </I18nProvider>
  );
};

export default App;
