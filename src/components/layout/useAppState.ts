import { useCallback, useEffect, useRef, useState } from 'react';
import { AppSettingsDto, GitJobEventDto } from '../../global';
import { useToastQueue } from '../../hooks/useToastQueue';
import { trByLanguage } from '../../i18n';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useGithubDomain } from './hooks/useGithubDomain';
import { usePullRequests } from '../../hooks/usePullRequests';

const DEFAULT_SETTINGS: AppSettingsDto = {
  theme: 'dark',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  aiAutoCommitEnabled: false,
  aiProvider: 'ollama',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-3-flash-preview',
  hasGeminiApiKey: false,
};

type RunGitCommandOptions = {
  skipDirtyGuard?: boolean;
};

const GUARDED_COMMANDS = new Set(['checkout', 'merge', 'reset']);
const SIDEBAR_COLLAPSE_STORAGE_KEY = 'git-organizer:sidebar-collapse-by-repo:v1';

type SidebarCollapseState = {
  branchPanelCollapsed: boolean;
  remotePanelCollapsed: boolean;
};

type SidebarCollapseByRepo = Record<string, SidebarCollapseState>;

const DEFAULT_SIDEBAR_COLLAPSE_STATE: SidebarCollapseState = {
  branchPanelCollapsed: false,
  remotePanelCollapsed: false,
};

export const useAppState = () => {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);

  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const [settings, setSettings] = useState<AppSettingsDto>(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<GitJobEventDto[]>([]);
  const [sidebarCollapseByRepo, setSidebarCollapseByRepo] = useState<SidebarCollapseByRepo>({});

  const { toast: gitActionToast, setToast: setGitActionToast } = useToastQueue(3000);

  const {
    confirmDialog,
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    closeInputDialog,
    executeInputDialog,
  } = useDialogControllers();

  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(settings.language, deText, enText);
  }, [settings.language]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const resetRepoScopedUi = useCallback(() => {
    setSelectedCommit(null);
    setNewRepoName('');
    setNewRepoDescription('');
    setConnectError(null);
  }, []);

  const workspace = useWorkspaceDomain({
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
    onRepoActivated: resetRepoScopedUi,
    onNoActiveRepo: resetRepoScopedUi,
    language: settings.language,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SidebarCollapseByRepo;
      if (parsed && typeof parsed === 'object') {
        setSidebarCollapseByRepo(parsed);
      }
    } catch {
      // ignore malformed local storage values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify(sidebarCollapseByRepo));
    } catch {
      // ignore write errors (e.g. private mode / quota)
    }
  }, [sidebarCollapseByRepo]);

  const activeSidebarCollapseState = workspace.activeRepo
    ? (sidebarCollapseByRepo[workspace.activeRepo] || DEFAULT_SIDEBAR_COLLAPSE_STATE)
    : DEFAULT_SIDEBAR_COLLAPSE_STATE;

  const updateActiveRepoSidebarCollapse = useCallback((partial: Partial<SidebarCollapseState>) => {
    const repoPath = workspace.activeRepo;
    if (!repoPath) return;

    setSidebarCollapseByRepo(prev => {
      const current = prev[repoPath] || DEFAULT_SIDEBAR_COLLAPSE_STATE;
      return {
        ...prev,
        [repoPath]: {
          ...current,
          ...partial,
        },
      };
    });
  }, [workspace.activeRepo]);

  const toggleBranchPanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      branchPanelCollapsed: !activeSidebarCollapseState.branchPanelCollapsed,
    });
  }, [activeSidebarCollapseState.branchPanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleRemotePanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      remotePanelCollapsed: !activeSidebarCollapseState.remotePanelCollapsed,
    });
  }, [activeSidebarCollapseState.remotePanelCollapsed, updateActiveRepoSidebarCollapse]);

  const handleUpdateSettings = useCallback(async (partial: Partial<AppSettingsDto>) => {
    if (!window.electronAPI) return;

    try {
      const next = await window.electronAPI.setSettings(partial);
      setSettings(next);
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

  const runGitCommand = useCallback(async (
    args: string[],
    successMsg: string,
    actionLabel?: string,
    options?: RunGitCommandOptions,
  ): Promise<boolean> => {
    if (!window.electronAPI || !workspace.activeRepo || args.length === 0) return false;

    const command = args[0];
    const shouldGuard = settings.confirmDangerousOps && !options?.skipDirtyGuard && GUARDED_COMMANDS.has(command);

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

    setIsGitActionRunning(true);
    setActiveGitActionLabel(actionLabel || tr(`Git ${command} wird ausgeführt...`, `Running git ${command}...`));

    try {
      const r = await window.electronAPI.runGitCommand(command, ...args.slice(1));
      if (r.success) {
        setGitActionToast({ msg: successMsg, isError: false });
        triggerRefresh();
        return true;
      }
      setGitActionToast({ msg: r.error || tr('Fehler beim Ausführen von git.', 'Error while running git.'), isError: true });
      return false;
    } catch (e: any) {
      setGitActionToast({ msg: e.message, isError: true });
      return false;
    } finally {
      setIsGitActionRunning(false);
      setActiveGitActionLabel(null);
    }
  }, [setConfirmDialog, setGitActionToast, settings.confirmDangerousOps, triggerRefresh, workspace.activeRepo, tr]);

  isGitActionRunningRef.current = isGitActionRunning;

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
  });

  const github = useGithubDomain({
    onRepoCloned: workspace.addOpenRepo,
    setActiveTab: workspace.setActiveTab,
    language: settings.language,
  });

  const [showCreatePR, setShowCreatePR] = useState(false);
  const [newPRTitle, setNewPRTitle] = useState('');
  const [newPRBody, setNewPRBody] = useState('');
  const [newPRHead, setNewPRHead] = useState('');
  const [newPRBase, setNewPRBase] = useState('main');

  const pullRequestDomain = usePullRequests({
    activeRepo: workspace.activeRepo,
    isAuthenticated: github.isAuthenticated,
    refreshTrigger,
    language: settings.language,
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

    const folderName = workspace.activeRepo.split(/[\\/]/).pop() || 'repository';
    const name = (newRepoName || folderName).trim();
    const description = newRepoDescription.trim();

    if (!name) {
      setConnectError(tr('Repository-Name darf nicht leer sein.', 'Repository name must not be empty.'));
      return;
    }

    setIsConnectingGithubRepo(true);
    setConnectError(null);

    try {
      const result = await window.electronAPI.githubCreateRepo(name, description, newRepoPrivate);
      if (!result.success) {
        throw new Error(result.error || tr('Fehler beim Erstellen des GitHub-Repositories.', 'Error while creating the GitHub repository.'));
      }

      const remoteUrl = result.data.cloneUrl;

      let r = await window.electronAPI.runGitCommand('remote', 'add', 'origin', remoteUrl);
      if (!r.success) {
        throw new Error(r.error || tr('Fehler beim Setzen des Git-Remotes.', 'Error while setting Git remote.'));
      }

      r = await window.electronAPI.runGitCommand('push', '-u', 'origin', 'HEAD');
      if (!r.success) {
        throw new Error(r.error || tr('Fehler beim Pushen nach GitHub.', 'Error while pushing to GitHub.'));
      }

      repository.setHasRemoteOrigin(true);
      setGitActionToast({ msg: tr('Neues GitHub-Repository erstellt und verbunden.', 'Created and connected new GitHub repository.'), isError: false });
      triggerRefresh();
    } catch (e: any) {
      setConnectError(e?.message || tr('Fehler beim Erstellen und Verbinden mit GitHub.', 'Error while creating and connecting GitHub repository.'));
    } finally {
      setIsConnectingGithubRepo(false);
    }
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

    const shortName = normalized.replace(/^remotes\//, '').replace(/^origin\//, '').replace(/^[^/]+\//, '');
    await runGitCommand(
      ['checkout', '-b', shortName, '--track', normalized],
      tr(`Branch ${shortName} aus ${normalized} ausgecheckt.`, `Checked out branch ${shortName} from ${normalized}.`),
    );
  }, [runGitCommand, tr]);

  const clearJobs = () => setJobs([]);

  return {
    activeTab: workspace.activeTab,
    setActiveTab: workspace.setActiveTab,
    openRepos: workspace.openRepos,
    repoMeta: workspace.repoMeta,
    activeRepo: workspace.activeRepo,
    handleOpenFolder: workspace.handleOpenFolder,
    handleSwitchRepo: workspace.handleSwitchRepo,
    handleCloseRepo: workspace.handleCloseRepo,
    handleToggleRepoPin: workspace.toggleRepoPin,

    refreshTrigger,
    triggerRefresh,
    selectedCommit,
    setSelectedCommit,

    isGitActionRunning,
    activeGitActionLabel,
    runGitCommand,
    gitActionToast,

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

    tags: repository.tags,
    remotes: repository.remotes,
    hasRemoteOrigin: repository.hasRemoteOrigin,
    remoteSync: repository.remoteSync,
    remoteOnlyBranches: repository.remoteOnlyBranches,
    remoteStatus: repository.remoteStatus,
    refreshRemoteState: repository.refreshRemoteState,
    isRemotePanelCollapsed: activeSidebarCollapseState.remotePanelCollapsed,
    toggleRemotePanelCollapsed,

    handleCreateBranch: repository.handleCreateBranch,
    handleDeleteBranch: repository.handleDeleteBranch,
    handleMergeBranch: repository.handleMergeBranch,
    handleRenameBranch: repository.handleRenameBranch,
    handleCreateTag: repository.handleCreateTag,
    handleDeleteTag: repository.handleDeleteTag,
    handlePushTags: repository.handlePushTags,
    handleAddRemote: repository.handleAddRemote,
    handleRemoveRemote: repository.handleRemoveRemote,
    handleSetUpstreamForCurrentBranch,
    handleCheckoutRemoteBranch,

    isAuthenticated: github.isAuthenticated,
    githubUser: github.githubUser,
    githubRepos: github.githubRepos,
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
    handleLogout: github.handleLogout,

    isCloning: github.isCloning,
    setIsCloning: github.setIsCloning,
    cloneLog: github.cloneLog,
    cloneRepoName: github.cloneRepoName,
    cloneFinished: github.cloneFinished,
    cloneError: github.cloneError,
    handleClone: github.handleClone,

    prOwnerRepo: pullRequestDomain.prOwnerRepo,
    prFilter: pullRequestDomain.prFilter,
    setPrFilter: pullRequestDomain.setPrFilter,
    prLoading: pullRequestDomain.prLoading,
    pullRequests: pullRequestDomain.pullRequests,
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
    handleOpenPR,
    handleCopyPRUrl,
    handleCheckoutPR,

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
    closeInputDialog,
    executeInputDialog,
  };
};
