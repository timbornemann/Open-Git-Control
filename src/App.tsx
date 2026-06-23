import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppSidebar } from './components/layout/AppSidebar';
import { MainView } from './components/layout/MainView';
import { BranchContextMenu } from './components/layout/BranchContextMenu';
import { CloneProgressModal } from './components/layout/CloneProgressModal';
import { Confirm } from './components/Confirm';
import { DangerConfirm } from './components/DangerConfirm';
import { Input } from './components/Input';
import { useAppState } from './components/layout/useAppState';
import { SettingsTabId } from './components/layout/sidebar/AppSidebar.types';
import { I18nProvider } from './i18n';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { CommandPalette, PaletteCommand } from './components/CommandPalette';
import { AppStateContext, AppContextValue } from './contexts/AppStateContext';
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

const isRepoSwitchEditableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : document.activeElement;
  return Boolean(element?.closest(REPO_SWITCH_EDITABLE_SELECTOR));
};

const getRepoDisplayName = (repoPath: string) => repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath;

const App: React.FC = () => {
  const state = useAppState();
  const tr = (deText: string, enText: string) => (state.settings.language === 'en' ? enText : deText);
  const [selectedGithubAuthHelpMethod, setSelectedGithubAuthHelpMethod] = useState<'pat' | 'device' | 'web' | null>('pat');
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
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

  const getSidebarMaxWidth = useCallback(() => {
    if (window.innerWidth <= COMPACT_LAYOUT_MAX_WIDTH) {
      return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - 44));
    }
    const maxFromWindow = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - MIN_MAIN_VIEW_WIDTH - APP_RESIZER_WIDTH);
    return Math.min(SIDEBAR_MAX_WIDTH, maxFromWindow);
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

  const copyToastMessage = useCallback(async (message: string) => {
    const text = String(message || '');
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // fallback below
    }

    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.focus();
    area.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore fallback copy errors
    } finally {
      document.body.removeChild(area);
    }
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
    const storedWidthRaw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const storedWidthValue = Number(storedWidthRaw);
    const normalizedWidth = Number.isFinite(storedWidthValue) ? storedWidthValue : SIDEBAR_DEFAULT_WIDTH;
    setSidebarWidth(clampSidebarWidth(Math.round(normalizedWidth)));
  }, [clampSidebarWidth]);

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
    { id: 'tab-repos', label: tr('Lokale Repos', 'Local repos'), keywords: ['local', 'repos', 'lokal'], action: () => state.setActiveTab('localRepos') },
    { id: 'tab-repo', label: tr('Repository-Ansicht', 'Repository view'), keywords: ['repo', 'branch', 'commits'], action: () => state.setActiveTab('repo') },
    { id: 'tab-planner', label: tr('Projektplanung', 'Project planning'), keywords: ['todo', 'ideas', 'bugs', 'features', 'planung'], action: () => state.setActiveTab('planner') },
    { id: 'tab-github', label: tr('GitHub', 'GitHub'), keywords: ['github', 'pr', 'pull request'], action: () => state.setActiveTab('github') },
    { id: 'tab-settings', label: tr('Einstellungen', 'Settings'), keywords: ['settings', 'preferences'], action: () => state.setActiveTab('settings') },
    // Remote
    { id: 'fetch', label: tr('Fetch (Remote aktualisieren)', 'Fetch (refresh remote)'), keywords: ['fetch', 'remote', 'sync'], action: () => state.refreshRemoteState(true) },
    { id: 'pull', label: tr('Pull', 'Pull'), keywords: ['pull', 'download'], action: () => state.runGitCommand(['pull'], tr('Erfolgreich gepullt.', 'Pull completed successfully.')) },
    { id: 'pull-rebase', label: tr('Pull --rebase', 'Pull --rebase'), keywords: ['pull', 'rebase'], action: () => state.runGitCommand(['pull', '--rebase'], tr('Pull mit Rebase abgeschlossen.', 'Pull with rebase completed.')) },
    { id: 'push', label: tr('Push', 'Push'), keywords: ['push', 'upload'], action: () => state.runGitCommand(['push'], tr('Erfolgreich gepusht.', 'Push completed successfully.')) },
    { id: 'push-force', label: tr('Push --force-with-lease', 'Push --force-with-lease'), keywords: ['push', 'force'], action: () => state.runGitCommand(['push', '--force-with-lease'], tr('Force-Push abgeschlossen.', 'Force push completed.')) },
    // Branches
    { id: 'branch-create', label: tr('Branch erstellen...', 'Create branch...'), keywords: ['branch', 'new', 'erstellen'], action: () => { state.setActiveTab('repo'); state.setIsCreatingBranch(true); state.setNewBranchName(''); setTimeout(() => state.newBranchInputRef.current?.focus(), 100); } },
    // Stash
    { id: 'stash-push', label: tr('Stash erstellen', 'Create stash'), keywords: ['stash', 'save', 'speichern'], action: () => state.runGitCommand(['stash', 'push', '-m', 'Quick stash'], tr('Stash erstellt.', 'Stash created.')) },
    { id: 'stash-pop', label: tr('Letzten Stash anwenden (pop)', 'Apply last stash (pop)'), keywords: ['stash', 'pop', 'apply', 'anwenden'], action: () => state.runGitCommand(['stash', 'pop'], tr('Stash angewendet.', 'Stash applied.')) },
    // Merge / Rebase
    { id: 'merge-abort', label: tr('Merge abbrechen', 'Abort merge'), keywords: ['merge', 'abort', 'abbrechen'], action: () => state.runGitCommand(['mergeAbort'], tr('Merge abgebrochen.', 'Merge aborted.')) },
    { id: 'merge-continue', label: tr('Merge fortsetzen', 'Continue merge'), keywords: ['merge', 'continue', 'fortsetzen'], action: () => state.runGitCommand(['mergeContinue'], tr('Merge fortgesetzt.', 'Merge continued.')) },
    { id: 'rebase-abort', label: tr('Rebase abbrechen', 'Abort rebase'), keywords: ['rebase', 'abort', 'abbrechen'], action: () => state.runGitCommand(['rebaseAbort'], tr('Rebase abgebrochen.', 'Rebase aborted.')) },
    { id: 'rebase-continue', label: tr('Rebase fortsetzen', 'Continue rebase'), keywords: ['rebase', 'continue', 'fortsetzen'], action: () => state.runGitCommand(['rebaseContinue'], tr('Rebase fortgesetzt.', 'Rebase continued.')) },
    // Repo
    { id: 'open-folder', label: tr('Repository öffnen...', 'Open repository...'), keywords: ['open', 'folder', 'öffnen'], action: () => state.handleOpenFolder() },
    { id: 'clone-url', label: tr('Repository per URL klonen...', 'Clone repository from URL...'), keywords: ['clone', 'url', 'ssh', 'http'], action: () => state.handleCloneByUrl() },
    { id: 'fork-url', label: tr('GitHub-Repository per URL forken...', 'Fork GitHub repository from URL...'), keywords: ['fork', 'github', 'url'], action: () => state.handleForkByUrl() },
    { id: 'add-remote', label: tr('Remote hinzufügen...', 'Add remote...'), keywords: ['remote', 'add', 'hinzufügen'], action: () => { state.setActiveTab('repo'); state.handleAddRemote(); } },
  ];

  useGlobalKeyboardShortcuts({
    setActiveTab: state.setActiveTab,
    onFetch: () => state.refreshRemoteState(true),
    onOpenCommandPalette: () => setIsPaletteOpen(true),
  });

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
    newBranchName: state.newBranchName,
    newBranchInputRef: state.newBranchInputRef,
    onSetCreatingBranch: state.setIsCreatingBranch,
    onSetNewBranchName: state.setNewBranchName,
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
    githubRepoSearch: state.githubRepoSearch,
    setGithubRepoSearch: state.setGithubRepoSearch,
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

    selectedCommit: state.selectedCommit,
    setSelectedCommit: state.setSelectedCommit,
    commitNavigationRequest: state.commitNavigationRequest,
    refreshTrigger: state.refreshTrigger,
    triggerRefresh: state.triggerRefresh,
    commitRefreshTrigger: state.commitRefreshTrigger,
    triggerCommitRefresh: state.triggerCommitRefresh,
    showSecondaryHistory: state.settings.showSecondaryHistory,

    onFetch: () => state.refreshRemoteState(true),
    onPull: () => state.runGitCommand(['pull'], tr('Erfolgreich gepullt.', 'Pull completed successfully.'), tr('Pull wird ausgefuehrt...', 'Running pull...')),
    onPullRebase: () => state.runGitCommand(['pull', '--rebase'], tr('Erfolgreich mit Rebase gepullt.', 'Pull with rebase completed successfully.'), tr('Pull --rebase wird ausgefuehrt...', 'Running pull --rebase...')),
    onPullFfOnly: () => state.runGitCommand(['pull', '--ff-only'], tr('Erfolgreich mit ff-only gepullt.', 'Pull with ff-only completed successfully.'), tr('Pull --ff-only wird ausgefuehrt...', 'Running pull --ff-only...')),
    onPullNoFf: () => state.runGitCommand(['pull', '--no-ff'], tr('Erfolgreich mit --no-ff gepullt.', 'Pull with --no-ff completed.'), tr('Pull --no-ff wird ausgefuehrt...', 'Running pull --no-ff...')),
    onPush: () => state.runGitCommand(['push'], tr('Erfolgreich gepusht.', 'Push completed successfully.'), tr('Push wird ausgefuehrt...', 'Running push...')),
    onPushForceWithLease: () => state.runGitCommand(['push', '--force-with-lease'], tr('Erfolgreich mit force-with-lease gepusht.', 'Push with force-with-lease completed successfully.'), tr('Push --force-with-lease wird ausgefuehrt...', 'Running push --force-with-lease...')),
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
    onConflictMergeContinue: () => { void state.runGitCommand(['mergeContinue'], tr('Merge fortgesetzt.', 'Merge continued.'), tr('Merge wird fortgesetzt...', 'Continuing merge...')); },
    onConflictMergeAbort: () => { void state.runGitCommand(['mergeAbort'], tr('Merge abgebrochen.', 'Merge aborted.'), tr('Merge wird abgebrochen...', 'Aborting merge...')); },
    onConflictRebaseContinue: () => { void state.runGitCommand(['rebaseContinue'], tr('Rebase fortgesetzt.', 'Rebase continued.'), tr('Rebase wird fortgesetzt...', 'Continuing rebase...')); },
    onConflictRebaseAbort: () => { void state.runGitCommand(['rebaseAbort'], tr('Rebase abgebrochen.', 'Rebase aborted.'), tr('Rebase wird abgebrochen...', 'Aborting rebase...')); },
  };

  return (
    <I18nProvider language={state.settings.language}>
      <AppStateContext.Provider value={ctxValue}>
        <ProjectPlannerProvider
          activeRepo={state.activeRepo}
          onRepositorySelected={state.addOpenRepo}
          onRepositoryMaterialized={async (repoPath) => {
            await state.addOpenRepo(repoPath);
            state.setActiveTab('planner');
            state.setGitActionToast({
              msg: tr('Projektordner erstellt und Git-Repository initialisiert.', 'Created project folder and initialized Git repository.'),
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
          <AppSidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapsed={handleToggleSidebar}
          />

          {!isSidebarCollapsed && (
            <div
              className={`pane-resizer app-sidebar-resizer ${isSidebarResizing ? 'dragging' : ''}`}
              role="separator"
              aria-orientation="vertical"
              aria-label={tr('Sidebar-Breite anpassen', 'Resize sidebar width')}
              onPointerDown={handleSidebarResizeStart}
            />
          )}

          <MainView />

          {repoSwitcherIndex !== null && state.openRepos.length > 0 && (
            <div className="repo-switcher-backdrop">
              <div className="repo-switcher-modal" role="dialog" aria-label={tr('Repository wechseln', 'Switch repository')}>
                <div className="repo-switcher-title">{tr('Repository wechseln', 'Switch repository')}</div>
                <div className="repo-switcher-list" role="listbox" aria-activedescendant={`repo-switcher-item-${repoSwitcherIndex}`}>
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
                        {isActive && <span className="repo-switcher-active">{tr('Aktiv', 'Active')}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {state.gitActionToasts.length > 0 && (
            <div className="toast-container">
              {state.gitActionToasts.map((t) => (
                <div
                  key={t.id}
                  className={`action-toast ${t.isError ? 'error' : 'success'}`}
                  role="status"
                >
                  <div className="toast-main">
                    <span className="toast-icon">{t.isError ? 'x' : 'ok'}</span>
                    <span className="toast-msg">{t.msg}</span>
                  </div>
                  <div className="toast-actions">
                    {t.isError && (
                      <button
                        type="button"
                        className="toast-action-btn"
                        onClick={() => { void copyToastMessage(t.msg); }}
                        title={tr('Fehlermeldung kopieren', 'Copy error message')}
                      >
                        {tr('Kopieren', 'Copy')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="toast-action-btn toast-action-btn-close"
                      onClick={() => state.dismissToast(t.id)}
                      title={tr('Meldung schliessen', 'Close message')}
                    >
                      {tr('Schliessen', 'Close')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

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

          <CloneProgressModal
            isCloning={state.isCloning}
            cloneRepoName={state.cloneRepoName}
            cloneFinished={state.cloneFinished}
            cloneError={state.cloneError}
            cloneLog={state.cloneLog}
            onClose={() => {
              state.setIsCloning(false);
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
      </AppStateContext.Provider>
    </I18nProvider>
  );
};

export default App;

