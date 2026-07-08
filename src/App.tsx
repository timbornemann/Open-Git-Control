import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSidebar } from './components/layout/AppSidebar';
import { MainView } from './components/layout/MainView';
import { BranchContextMenu } from './components/layout/BranchContextMenu';
import { CloneProgressModal } from './components/layout/CloneProgressModal';
import { GitTransferProgressOverlay } from './components/layout/GitTransferProgressOverlay';
import { Confirm } from './components/Confirm';
import { DangerConfirm } from './components/DangerConfirm';
import { Input } from './components/Input';
import { useAppState } from './components/layout/useAppState';
import { SettingsTabId } from './components/layout/sidebar/AppSidebar.types';
import { I18nProvider, translateFromCatalog, type TranslationVariables } from './i18n';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { CommandPalette, PaletteCommand } from './components/CommandPalette';
import { ActionToastViewport } from './components/ActionToastViewport';
import {
  AppStateSlicesProvider,
  createAppStateSlices,
  type AppContextValue,
} from './contexts/AppStateContext';
import { ProjectPlannerProvider } from './contexts/ProjectPlannerContext';
import './index.css';

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 260;
const APP_RESIZER_WIDTH = 8;
const MIN_MAIN_VIEW_WIDTH = 608;
const COMPACT_LAYOUT_MAX_WIDTH = 900;
const SIDEBAR_WIDTH_STORAGE_KEY = 'open-git-control.sidebar-width';
const SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY = 'open-git-control.sidebar-manually-collapsed';
const REPO_SWITCH_EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], select';

const getSidebarMaxWidthForViewport = (viewportWidth: number): number => {
  if (viewportWidth <= COMPACT_LAYOUT_MAX_WIDTH) {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - 44));
  }
  const maxFromWindow = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - MIN_MAIN_VIEW_WIDTH - APP_RESIZER_WIDTH);
  return Math.min(SIDEBAR_MAX_WIDTH, maxFromWindow);
};

const clampSidebarWidthForViewport = (width: number, viewportWidth: number): number => (
  Math.max(SIDEBAR_MIN_WIDTH, Math.min(getSidebarMaxWidthForViewport(viewportWidth), width))
);

const readInitialSidebarWidth = (): number => {
  const storedWidthValue = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  const width = Number.isFinite(storedWidthValue) ? Math.round(storedWidthValue) : SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidthForViewport(width, window.innerWidth);
};

const isRepoSwitchEditableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : document.activeElement;
  return Boolean(element?.closest(REPO_SWITCH_EDITABLE_SELECTOR));
};

const getRepoDisplayName = (repoPath: string) => repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath;

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
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth);
  const sidebarManuallyCollapsedRef = useRef(
    window.localStorage.getItem(SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY) === 'true',
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return window.innerWidth <= COMPACT_LAYOUT_MAX_WIDTH || sidebarManuallyCollapsedRef.current;
  });
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [repoSwitcherIndex, setRepoSwitcherIndex] = useState<number | null>(null);
  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const repoSwitcherIndexRef = useRef<number | null>(null);
  const repoSwitcherListRef = useRef<HTMLDivElement | null>(null);

  const getSidebarMaxWidth = useCallback(() => {
    return getSidebarMaxWidthForViewport(window.innerWidth);
  }, []);

  const clampSidebarWidth = useCallback((width: number) => {
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(getSidebarMaxWidth(), width));
  }, [getSidebarMaxWidth]);

  const resetLayout = useCallback(() => {
    setSidebarWidth(clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH));
    sidebarManuallyCollapsedRef.current = false;
    window.localStorage.setItem(SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY, 'false');
    setIsSidebarCollapsed(false);
  }, [clampSidebarWidth]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      sidebarManuallyCollapsedRef.current = next;
      window.localStorage.setItem(SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const handleSidebarResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    sidebarResizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    setIsSidebarResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = sidebarResizeStateRef.current;
      if (!dragState) return;

      const delta = event.clientX - dragState.startX;
      const nextWidth = Math.round(dragState.startWidth + delta);
      const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(getSidebarMaxWidth(), nextWidth));
      setSidebarWidth(clampedWidth);
    };

    const stopResize = () => {
      if (!sidebarResizeStateRef.current) return;
      sidebarResizeStateRef.current = null;
      setIsSidebarResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [getSidebarMaxWidth]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const compactViewport = window.matchMedia(`(max-width: ${COMPACT_LAYOUT_MAX_WIDTH}px)`);
    const syncSidebarWithViewport = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsSidebarCollapsed(event.matches || sidebarManuallyCollapsedRef.current);
    };

    syncSidebarWithViewport(compactViewport);
    compactViewport.addEventListener('change', syncSidebarWithViewport);
    return () => compactViewport.removeEventListener('change', syncSidebarWithViewport);
  }, []);

  useEffect(() => {
    const clampToViewport = () => {
      const maxWidth = getSidebarMaxWidth();
      setSidebarWidth((previous) => Math.max(SIDEBAR_MIN_WIDTH, Math.min(previous, maxWidth)));
    };

    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [getSidebarMaxWidth]);

  useEffect(() => {
    repoSwitcherIndexRef.current = repoSwitcherIndex;
  }, [repoSwitcherIndex]);

  useEffect(() => {
    if (repoSwitcherIndex === null) return;

    const listElement = repoSwitcherListRef.current;
    const selectedElement = listElement?.querySelector<HTMLElement>(`#repo-switcher-item-${repoSwitcherIndex}`);
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [repoSwitcherIndex, state.openRepos.length]);

  const closeRepoSwitcher = useCallback(() => {
    repoSwitcherIndexRef.current = null;
    setRepoSwitcherIndex(null);
  }, []);

  const moveRepoSwitcherSelection = useCallback((delta: number) => {
    const repos = state.openRepos;
    if (repos.length === 0) return;

    setRepoSwitcherIndex((previous) => {
      const activeIndex = state.activeRepo ? repos.indexOf(state.activeRepo) : -1;
      const fallbackIndex = activeIndex >= 0 ? activeIndex : (delta > 0 ? -1 : 0);
      const baseIndex = previous ?? fallbackIndex;
      const nextIndex = repos.length <= 1
        ? 0
        : (baseIndex + delta + repos.length) % repos.length;

      repoSwitcherIndexRef.current = nextIndex;
      return nextIndex;
    });
  }, [state.activeRepo, state.openRepos]);

  const commitRepoSwitcherSelection = useCallback(() => {
    const selectedIndex = repoSwitcherIndexRef.current;
    if (selectedIndex === null) return;

    const targetRepo = state.openRepos[selectedIndex];
    closeRepoSwitcher();

    if (!targetRepo) return;
    void state.handleSwitchRepo(targetRepo);
    state.setActiveTab('repo');
  }, [closeRepoSwitcher, state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && repoSwitcherIndexRef.current !== null) {
        event.preventDefault();
        closeRepoSwitcher();
        return;
      }

      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey || event.shiftKey) return;
      if (isRepoSwitchEditableTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      moveRepoSwitcherSelection(event.key === 'ArrowDown' ? 1 : -1);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (repoSwitcherIndexRef.current === null) return;

      const isModifierRelease = event.key === 'Control' || event.key === 'Meta';
      const isArrowReleaseWithoutModifier = (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.ctrlKey && !event.metaKey;
      if (!isModifierRelease && !isArrowReleaseWithoutModifier) return;

      event.preventDefault();
      event.stopPropagation();
      commitRepoSwitcherSelection();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', closeRepoSwitcher);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', closeRepoSwitcher);
    };
  }, [closeRepoSwitcher, commitRepoSwitcherSelection, moveRepoSwitcherSelection]);

  const paletteCommands: PaletteCommand[] = [
    // Navigation
    { id: 'tab-repos', label: t('generated.app.local_repos_c90bebd3'), keywords: ['local', 'repos', 'lokal'], action: () => state.setActiveTab('localRepos') },
    { id: 'tab-repo', label: t('generated.app.repository_view_400eb999'), keywords: ['repo', 'branch', 'commits'], action: () => state.setActiveTab('repo') },
    { id: 'tab-planner', label: t('generated.components.layout.main.maintopbar.project_planning_71556778'), keywords: ['todo', 'ideas', 'bugs', 'features', 'planung'], action: () => state.setActiveTab('planner') },
    { id: 'tab-github', label: t('generated.components.layout.settingsmaincontent.github_6d98f785'), keywords: ['github', 'pr', 'pull request'], action: () => state.setActiveTab('github') },
    { id: 'tab-settings', label: t('generated.components.layout.main.mainprimarypane.settings_c6256784'), keywords: ['settings', 'preferences'], action: () => state.setActiveTab('settings') },
    // Remote
    { id: 'fetch', label: t('generated.app.fetch_refresh_remote_88270faa'), keywords: ['fetch', 'remote', 'sync'], action: () => state.refreshRemoteState(true) },
    { id: 'pull', label: t('generated.app.pull_8c55fb85'), keywords: ['pull', 'download'], action: () => state.runGitCommand(['pull'], t('generated.app.pull_completed_successfully_a760cd36')) },
    { id: 'pull-rebase', label: t('generated.app.pull_rebase_5d462c6a'), keywords: ['pull', 'rebase'], action: () => state.runGitCommand(['pull', '--rebase'], t('generated.app.pull_with_rebase_completed_a6e6129f')) },
    { id: 'push', label: t('generated.app.push_61ad6264'), keywords: ['push', 'upload'], action: () => state.runGitCommand(['push'], t('generated.app.push_completed_successfully_edf8c1c9')) },
    { id: 'push-force', label: t('generated.app.push_force_with_lease_f7c67bfe'), keywords: ['push', 'force'], action: () => state.runGitCommand(['push', '--force-with-lease'], t('generated.app.force_push_completed_1f9d562e')) },
    // Branches
    { id: 'branch-create', label: t('generated.app.create_branch_d8083e45'), keywords: ['branch', 'new', 'erstellen'], action: () => { state.setActiveTab('repo'); state.setIsCreatingBranch(true); } },
    // Stash
    { id: 'stash-push', label: t('generated.components.staging_area.usefileoperations.create_stash_ebe60340'), keywords: ['stash', 'save', 'speichern'], action: () => state.runGitCommand(['stash', 'push', '-m', 'Quick stash'], t('generated.app.stash_created_56116f06')) },
    { id: 'stash-pop', label: t('generated.app.apply_last_stash_pop_120593db'), keywords: ['stash', 'pop', 'apply', 'anwenden'], action: () => state.runGitCommand(['stash', 'pop'], t('generated.app.stash_applied_4b30902e')) },
    // Merge / Rebase
    { id: 'merge-abort', label: t('generated.components.layout.main.mainprimarypane.abort_merge_8f3c2f66'), keywords: ['merge', 'abort', 'abbrechen'], action: () => state.runGitCommand(['mergeAbort'], t('generated.app.merge_aborted_b602bf32')) },
    { id: 'merge-continue', label: t('generated.app.continue_merge_56cfed8e'), keywords: ['merge', 'continue', 'fortsetzen'], action: () => state.runGitCommand(['mergeContinue'], t('generated.app.merge_continued_63b9ee36')) },
    { id: 'rebase-abort', label: t('generated.components.layout.main.mainprimarypane.abort_rebase_c924fd71'), keywords: ['rebase', 'abort', 'abbrechen'], action: () => state.runGitCommand(['rebaseAbort'], t('generated.app.rebase_aborted_74ce61c8')) },
    { id: 'rebase-continue', label: t('generated.components.layout.main.mainprimarypane.continue_rebase_828a1cd9'), keywords: ['rebase', 'continue', 'fortsetzen'], action: () => state.runGitCommand(['rebaseContinue'], t('generated.app.rebase_continued_181b298d')) },
    // Repo
    { id: 'open-folder', label: t('generated.app.open_repository_09ccbb87'), keywords: ['open', 'folder', 'öffnen'], action: () => state.handleOpenFolder() },
    { id: 'clone-url', label: t('generated.app.clone_repository_from_url_94b504ff'), keywords: ['clone', 'url', 'ssh', 'http'], action: () => state.handleCloneByUrl() },
    { id: 'fork-url', label: t('generated.app.fork_github_repository_from_url_6e2cc177'), keywords: ['fork', 'github', 'url'], action: () => state.handleForkByUrl() },
    { id: 'add-remote', label: t('generated.app.add_remote_3a4267c1'), keywords: ['remote', 'add', 'hinzufügen'], action: () => { state.setActiveTab('repo'); state.handleAddRemote(); } },
  ];

  useGlobalKeyboardShortcuts({
    setActiveTab: state.setActiveTab,
    onFetch: () => state.refreshRemoteState(true),
    onOpenCommandPalette: () => setIsPaletteOpen(true),
  });

  const activeTransferCommand = state.activeGitCommand === 'pull' || state.activeGitCommand === 'fetch'
    ? state.activeGitCommand
    : null;
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
    onPullRebase: () => state.runGitCommand(['pull', '--rebase'], t('generated.app.pull_with_rebase_completed_successfully_732a6b7f'), t('generated.app.running_pull_rebase_f9ca4da2')),
    onPullFfOnly: () => state.runGitCommand(['pull', '--ff-only'], t('generated.app.pull_with_ff_only_completed_successfully_01a725eb'), t('generated.app.running_pull_ff_only_efd80da9')),
    onPullNoFf: () => state.runGitCommand(['pull', '--no-ff'], t('generated.app.pull_with_no_ff_completed_0271e730'), t('generated.app.running_pull_no_ff_222dffa5')),
    onPush: () => state.runGitCommand(['push'], t('generated.app.push_completed_successfully_edf8c1c9'), t('generated.app.running_push_0ab33329')),
    onPushForceWithLease: () => state.runGitCommand(['push', '--force-with-lease'], t('generated.app.push_with_force_with_lease_completed_successfully_a27c0ef4'), t('generated.app.running_push_force_with_lease_590e0aba')),
    onPushSetUpstream: () => { const b = state.currentBranch; if (b) void state.runGitCommand(['push', '-u', 'origin', b], tr(`Branch "${b}" gepusht & Upstream gesetzt.`, `Pushed "${b}" & set upstream.`), 'Push -u...'); },
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
    onConflictMergeContinue: () => { void state.runGitCommand(['mergeContinue'], t('generated.app.merge_continued_63b9ee36'), t('generated.app.continuing_merge_9ed78a88')); },
    onConflictMergeAbort: () => { void state.runGitCommand(['mergeAbort'], t('generated.app.merge_aborted_b602bf32'), t('generated.app.aborting_merge_4f4ac264')); },
    onConflictRebaseContinue: () => { void state.runGitCommand(['rebaseContinue'], t('generated.app.rebase_continued_181b298d'), t('generated.app.continuing_rebase_21242ce6')); },
    onConflictRebaseAbort: () => { void state.runGitCommand(['rebaseAbort'], t('generated.app.rebase_aborted_74ce61c8'), t('generated.app.aborting_rebase_bd30693b')); },
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

          {repoSwitcherIndex !== null && state.openRepos.length > 0 && (
            <div className="repo-switcher-backdrop">
              <div className="repo-switcher-modal" role="dialog" aria-label={t('generated.app.switch_repository_84935354')}>
                <div className="repo-switcher-title">{t('generated.app.switch_repository_84935354')}</div>
                <div
                  ref={repoSwitcherListRef}
                  className="repo-switcher-list"
                  role="listbox"
                  aria-activedescendant={`repo-switcher-item-${repoSwitcherIndex}`}
                >
                  {state.openRepos.map((repoPath, index) => {
                    const isSelected = index === repoSwitcherIndex;
                    const isActive = repoPath === state.activeRepo;

                    return (
                      <div
                        key={repoPath}
                        id={`repo-switcher-item-${index}`}
                        className={`repo-switcher-item${isSelected ? ' selected' : ''}`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="repo-switcher-copy">
                          <span className="repo-switcher-name">{getRepoDisplayName(repoPath)}</span>
                          <span className="repo-switcher-path">{repoPath}</span>
                        </div>
                        {isActive && <span className="repo-switcher-active">{t('generated.app.active_28dac35a')}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <ActionToastViewport
            toasts={state.gitActionToasts}
            onDismiss={state.dismissToast}
          />

          <BranchContextMenu
            branchContextMenu={state.branchContextMenu}
            setBranchContextMenu={state.setBranchContextMenu}
            onCheckout={(branch) => {
              if (branch.startsWith('remotes/')) {
                void state.handleCheckoutRemoteBranch(branch);
                return;
              }
              void state.runGitCommand(['checkout', branch], tr(`Ausgecheckt: ${branch}`, `Checked out: ${branch}`));
            }}
            onMerge={state.handleMergeBranch}
            onRename={state.handleRenameBranch}
            onDelete={state.handleDeleteBranch}
          />

          {state.confirmDialog && state.confirmDialog.variant === 'confirm' && (
            <Confirm
              open={true}
              title={state.confirmDialog.title}
              message={state.confirmDialog.message}
              contextItems={state.confirmDialog.contextItems}
              irreversible={state.confirmDialog.irreversible}
              consequences={state.confirmDialog.consequences}
              confirmLabel={state.confirmDialog.confirmLabel}
              onConfirm={state.executeConfirmDialog}
              secondaryActionLabel={state.confirmDialog.secondaryActionLabel}
              secondaryActionVariant={state.confirmDialog.secondaryActionVariant}
              onSecondaryAction={state.confirmDialog.onSecondaryAction
                ? state.executeConfirmDialogSecondary
                : undefined}
              onCancel={state.closeConfirmDialog}
            />
          )}

          {state.confirmDialog && state.confirmDialog.variant === 'danger' && (
            <DangerConfirm
              open={true}
              title={state.confirmDialog.title}
              message={state.confirmDialog.message}
              contextItems={state.confirmDialog.contextItems}
              irreversible={state.confirmDialog.irreversible}
              consequences={state.confirmDialog.consequences}
              confirmLabel={state.confirmDialog.confirmLabel}
              onConfirm={state.executeConfirmDialog}
              secondaryActionLabel={state.confirmDialog.secondaryActionLabel}
              secondaryActionVariant={state.confirmDialog.secondaryActionVariant}
              onSecondaryAction={state.confirmDialog.onSecondaryAction
                ? state.executeConfirmDialogSecondary
                : undefined}
              onCancel={state.closeConfirmDialog}
            />
          )}

          {state.inputDialog && (
            <Input
              open={true}
              title={state.inputDialog.title}
              message={state.inputDialog.message}
              fields={state.inputDialog.fields}
              contextItems={state.inputDialog.contextItems}
              irreversible={state.inputDialog.irreversible}
              consequences={state.inputDialog.consequences}
              confirmLabel={state.inputDialog.confirmLabel}
              onSubmit={state.executeInputDialog}
              onCancel={state.closeInputDialog}
            />
          )}

          <GitTransferProgressOverlay
            open={showGitTransferProgress}
            title={state.activeGitActionLabel}
            events={activeTransferEvents}
          />

          <CloneProgressModal
            isCloning={state.isCloning}
            cloneRepoName={state.cloneRepoName}
            cloneFinished={state.cloneFinished}
            cloneError={state.cloneError}
            cloneLog={state.cloneLog}
            onClose={() => {
              state.closeCloneProgress();
              state.triggerRefresh();
            }}
          />

          <CommandPalette
            open={isPaletteOpen}
            commands={paletteCommands}
            onClose={() => setIsPaletteOpen(false)}
          />
        </div>
        </ProjectPlannerProvider>
      </AppStateSlicesProvider>
    </I18nProvider>
  );
};

export default App;

