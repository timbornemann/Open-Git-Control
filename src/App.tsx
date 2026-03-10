import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GitBranch, Settings, FolderGit2, Plus, Github, DownloadCloud, Key, ExternalLink, LogOut, RefreshCw, GitPullRequest } from 'lucide-react';
import { CommitGraph } from './components/CommitGraph';
import { StagingArea } from './components/StagingArea';
import { CommitDetails } from './components/CommitDetails';
import { RepoList } from './components/sidebar/RepoList';
import { BranchPanel } from './components/sidebar/BranchPanel';
import { TagPanel } from './components/sidebar/TagPanel';
import { RemotePanel } from './components/sidebar/RemotePanel';
import { TopbarActions } from './components/topbar/TopbarActions';
import { Confirm, DialogContextItem } from './components/Confirm';
import { DangerConfirm } from './components/DangerConfirm';
import { Input, InputDialogField } from './components/Input';
import { useToastQueue } from './hooks/useToastQueue';
import { BranchInfo, RemoteSyncState } from './types/git';
import { GitHubRepositoryDto, PullRequestDto } from './global';
import './index.css';

const REMOTE_SYNC_INTERVAL_MS = 60_000;


type ConfirmDialogState = {
  variant: 'confirm' | 'danger';
  title: string;
  message: string;
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

type InputDialogState = {
  title: string;
  message: string;
  fields: InputDialogField[];
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'repos' | 'github'>('repos');

  // Multi-repo
  const [openRepos, setOpenRepos] = useState<string[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [reposLoaded, setReposLoaded] = useState(false);
  
  // Branch state
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  
  // Refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // GitHub Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoryDto[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // GitHub connect for local repo
  const [hasRemoteOrigin, setHasRemoteOrigin] = useState<boolean | null>(null);
  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  // Clone state
  const [isCloning, setIsCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [cloneRepoName, setCloneRepoName] = useState<string | null>(null);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // Pull Requests
  const [pullRequests, setPullRequests] = useState<PullRequestDto[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prOwnerRepo, setPrOwnerRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [newPRTitle, setNewPRTitle] = useState('');
  const [newPRBody, setNewPRBody] = useState('');
  const [newPRHead, setNewPRHead] = useState('');
  const [newPRBase, setNewPRBase] = useState('main');
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open');

  // Branch management
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchContextMenu, setBranchContextMenu] = useState<{ x: number; y: number; branch: string; isHead: boolean } | null>(null);
  const newBranchInputRef = useRef<HTMLInputElement | null>(null);

  // Tags
  const [tags, setTags] = useState<string[]>([]);

  // Remotes
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([]);
  const [remoteSync, setRemoteSync] = useState<RemoteSyncState>({
    isFetching: false,
    lastFetchedAt: null,
    lastFetchError: null,
    ahead: 0,
    behind: 0,
    hasUpstream: false,
  });

  // UI state
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const { toast: gitActionToast, setToast: setGitActionToast } = useToastQueue(3000);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);
  const isRemoteFetchRunningRef = useRef(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);

  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), []);

  const executeConfirmDialog = useCallback(async () => {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }, [confirmDialog]);

  const closeInputDialog = useCallback(() => setInputDialog(null), []);

  const executeInputDialog = useCallback(async (values: Record<string, string>) => {
    if (!inputDialog) return;
    const action = inputDialog.onSubmit;
    setInputDialog(null);
    await action(values);
  }, [inputDialog]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const getRemoteBranchShortName = useCallback((branchName: string) => (
    branchName.replace(/^remotes\/[^/]+\//, '')
  ), []);


  const formatLastFetchedAt = useCallback((timestamp: number | null) => {
    if (!timestamp) return 'Noch nicht aktualisiert';
    return `Zuletzt aktualisiert: ${new Date(timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;
  }, []);

  // Load stored repos on startup
  useEffect(() => {
    const loadStored = async () => {
      if (!window.electronAPI) return;
      try {
        const data = await window.electronAPI.getStoredRepos();
        if (data.repos.length > 0) {
          const paths = data.repos.map(r => r.path);
          setOpenRepos(paths);
          const active = data.activeRepo && paths.includes(data.activeRepo) ? data.activeRepo : paths[0];
          await window.electronAPI.setRepoPath(active);
          setActiveRepo(active);
        }
      } catch (e) {
        console.error(e);
      }
      setReposLoaded(true);
    };
    loadStored();
  }, []);

  // Persist repos whenever they change
  useEffect(() => {
    if (!reposLoaded || !window.electronAPI) return;
    window.electronAPI.setStoredRepos({
      repos: openRepos.map(p => ({ path: p, lastOpened: Date.now() })),
      activeRepo,
    });
  }, [openRepos, activeRepo, reposLoaded]);

  useEffect(() => {
    isGitActionRunningRef.current = isGitActionRunning;
  }, [isGitActionRunning]);

  // Fetch branches
  useEffect(() => {
    if (!activeRepo || !window.electronAPI) {
      setBranches([]);
      setCurrentBranch('');
      setHasRemoteOrigin(null);
      return;
    }

    const fetchBranches = async () => {
      try {
        const { success, data } = await window.electronAPI.runGitCommand('branch', '-a');
        if (success && data) {
          const lines = data.split('\n').filter((l: string) => l.trim().length > 0);
          const parsedBranches = lines
            .map((line: string): BranchInfo | null => {
              const isHead = line.startsWith('*');
              const name = line.replace('*', '').trim();
              if (name.includes(' -> ')) return null;

              const scope: BranchInfo['scope'] = name.startsWith('remotes/') ? 'remote' : 'local';
              return { name, isHead, scope };
            })
            .filter((branch: BranchInfo | null): branch is BranchInfo => branch !== null);

          const head = parsedBranches.find((b: BranchInfo) => b.isHead)?.name ?? '';
          setCurrentBranch(head);
          setBranches(parsedBranches);
        } else {
          setCurrentBranch('');
          setBranches([]);
        }
      } catch (e) {
        console.error(e);
        setCurrentBranch('');
        setBranches([]);
      }
    };
    fetchBranches();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    const fetchRemoteTracking = async () => {
      if (!activeRepo || !window.electronAPI) {
        setRemoteSync(prev => ({
          ...prev,
          ahead: 0,
          behind: 0,
          hasUpstream: false,
        }));
        return;
      }

      try {
        const { success, data } = await window.electronAPI.runGitCommand('status', '-sb');
        if (!success || !data) {
          setRemoteSync(prev => ({
            ...prev,
            ahead: 0,
            behind: 0,
            hasUpstream: false,
          }));
          return;
        }

        const header = String(data).split('\n')[0]?.trim() ?? '';
        const aheadMatch = header.match(/ahead (\d+)/);
        const behindMatch = header.match(/behind (\d+)/);

        setRemoteSync(prev => ({
          ...prev,
          ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
          behind: behindMatch ? Number(behindMatch[1]) : 0,
          hasUpstream: header.includes('...'),
        }));
      } catch {
        setRemoteSync(prev => ({
          ...prev,
          ahead: 0,
          behind: 0,
          hasUpstream: false,
        }));
      }
    };

    fetchRemoteTracking();
  }, [activeRepo, refreshTrigger]);

  // Check remote origin / remotes
  useEffect(() => {
    const checkRemote = async () => {
      if (!activeRepo || !window.electronAPI) {
        setHasRemoteOrigin(null);
        setRemotes([]);
        return;
      }
      try {
        const r = await window.electronAPI.runGitCommand('remote', '-v');
        if (!r.success || !r.data) {
          setHasRemoteOrigin(false);
          setRemotes([]);
          return;
        }
        const lines = String(r.data)
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        const hasOrigin = lines.some(line => line.startsWith('origin'));
        setHasRemoteOrigin(hasOrigin);
        const seen = new Set<string>();
        const parsed: { name: string; url: string }[] = [];
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2 && !seen.has(parts[0])) {
            seen.add(parts[0]);
            parsed.push({ name: parts[0], url: parts[1] });
          }
        }
        setRemotes(parsed);
      } catch {
        setHasRemoteOrigin(false);
        setRemotes([]);
      }
    };
    checkRemote();
  }, [activeRepo, refreshTrigger]);

  // Fetch tags
  useEffect(() => {
    if (!activeRepo || !window.electronAPI) {
      setTags([]);
      return;
    }
    const fetchTags = async () => {
      try {
        const { success, data } = await window.electronAPI.runGitCommand('tag', '-l');
        if (success && data) {
          setTags(
            String(data)
              .split('\n')
              .map((t: string) => t.trim())
              .filter((t: string) => t.length > 0)
          );
        } else {
          setTags([]);
        }
      } catch {
        setTags([]);
      }
    };
    fetchTags();
  }, [activeRepo, refreshTrigger]);

  // Parse GitHub owner/repo from origin and fetch PRs
  useEffect(() => {
    const parseOwnerRepo = async () => {
      if (!activeRepo || !window.electronAPI || !isAuthenticated) {
        setPrOwnerRepo(null);
        setPullRequests([]);
        return;
      }
      try {
        const r = await window.electronAPI.runGitCommand('remote', 'get-url', 'origin');
        if (r.success && r.data) {
          const url = String(r.data).trim();
          const https = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
          const ssh = url.match(/github\.com:([^/]+)\/([^/.]+)/);
          const m = https || ssh;
          if (m) {
            setPrOwnerRepo({ owner: m[1], repo: m[2] });
            return;
          }
        }
      } catch {
        // ignore
      }
      setPrOwnerRepo(null);
      setPullRequests([]);
    };
    parseOwnerRepo();
  }, [activeRepo, isAuthenticated, refreshTrigger]);

  useEffect(() => {
    const fetchPRs = async () => {
      if (!prOwnerRepo || !window.electronAPI || !isAuthenticated) {
        setPullRequests([]);
        return;
      }
      setPrLoading(true);
      try {
        const result = await window.electronAPI.githubGetPRs(prOwnerRepo.owner, prOwnerRepo.repo, prFilter);
        if (result.success) {
          setPullRequests(result.data || []);
        }
      } catch {
        // ignore
      }
      setPrLoading(false);
    };
    fetchPRs();
  }, [prOwnerRepo, isAuthenticated, prFilter, refreshTrigger]);

  // Focus new branch input
  useEffect(() => {
    if (isCreatingBranch && newBranchInputRef.current) {
      newBranchInputRef.current.focus();
    }
  }, [isCreatingBranch]);

  // Close branch context menu on click / esc
  useEffect(() => {
    if (!branchContextMenu) return;
    const close = () => setBranchContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [branchContextMenu]);

  // Auto-login GitHub via token stored in main process secure storage
  useEffect(() => {
    const loginWithSavedToken = async () => {
      if (!window.electronAPI) return;

      setIsAuthenticating(true);
      try {
        const status = await window.electronAPI.githubGetSavedAuthStatus();
        if (!status.hasSavedToken) {
          setIsAuthenticated(status.authenticated);
          setGithubUser(status.username);
          return;
        }

        const loginResult = await window.electronAPI.githubLoginWithSavedToken();
        if (loginResult.success && loginResult.authenticated) {
          setIsAuthenticated(true);
          setGithubUser(loginResult.username);
          const reposResult = await window.electronAPI.githubGetRepos();
          if (reposResult.success) setGithubRepos(reposResult.data || []);
        } else {
          setIsAuthenticated(false);
          setGithubUser(null);
        }
      } catch {
        setIsAuthenticated(false);
        setGithubUser(null);
      } finally {
        setIsAuthenticating(false);
      }
    };

    loginWithSavedToken();
  }, []);

  const refreshRemoteState = useCallback(async (showToast = false) => {
    if (!window.electronAPI || !activeRepo) return false;
    if (isRemoteFetchRunningRef.current || isGitActionRunningRef.current) return false;

    isRemoteFetchRunningRef.current = true;
    setActiveGitActionLabel('Fetch wird ausgefuehrt...');
    setRemoteSync(prev => ({
      ...prev,
      isFetching: true,
      lastFetchError: null,
    }));

    try {
      const result = await window.electronAPI.runGitCommand('fetch', '--all', '--prune', '--tags', '--quiet');
      if (result.success) {
        setRemoteSync(prev => ({
          ...prev,
          isFetching: false,
          lastFetchedAt: Date.now(),
          lastFetchError: null,
        }));
        triggerRefresh();
        if (showToast) {
          setGitActionToast({ msg: 'Remote aktualisiert.', isError: false });
        }
        return true;
      }

      const errorMessage = String(result.error || 'Remote konnte nicht aktualisiert werden.');
      setRemoteSync(prev => ({
        ...prev,
        isFetching: false,
        lastFetchError: errorMessage,
      }));
      if (showToast) {
        setGitActionToast({ msg: errorMessage, isError: true });
      }
      return false;
    } catch (e: any) {
      const errorMessage = e?.message || 'Remote konnte nicht aktualisiert werden.';
      setRemoteSync(prev => ({
        ...prev,
        isFetching: false,
        lastFetchError: errorMessage,
      }));
      if (showToast) {
        setGitActionToast({ msg: errorMessage, isError: true });
      }
      return false;
    } finally {
      isRemoteFetchRunningRef.current = false;
      setActiveGitActionLabel(current => (current === 'Fetch wird ausgefuehrt...' ? null : current));
    }
  }, [activeRepo, triggerRefresh]);

  useEffect(() => {
    if (!activeRepo) {
      setRemoteSync({
        isFetching: false,
        lastFetchedAt: null,
        lastFetchError: null,
        ahead: 0,
        behind: 0,
        hasUpstream: false,
      });
      return;
    }

    refreshRemoteState();
    const intervalId = window.setInterval(() => {
      refreshRemoteState();
    }, REMOTE_SYNC_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeRepo, refreshRemoteState]);

  const handleSwitchRepo = async (repoPath: string) => {
    if (!window.electronAPI || repoPath === activeRepo) return;
    await window.electronAPI.setRepoPath(repoPath);
    setActiveRepo(repoPath);
    setSelectedCommit(null);
    setNewRepoName('');
    setNewRepoDescription('');
    setConnectError(null);
    triggerRefresh();
  };

  const handleCloseRepo = async (repoPath: string) => {
    const next = openRepos.filter(r => r !== repoPath);
    setOpenRepos(next);
    if (activeRepo === repoPath) {
      if (next.length > 0) {
        const newActive = next[0];
        if (window.electronAPI) {
          await window.electronAPI.setRepoPath(newActive);
        }
        setActiveRepo(newActive);
        setSelectedCommit(null);
        triggerRefresh();
      } else {
        setActiveRepo(null);
        setBranches([]);
        setCurrentBranch('');
      }
    }
  };

  const handleOpenFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.openDirectory();
      if (result && result.isRepo) {
        if (!openRepos.includes(result.path)) {
          setOpenRepos(prev => [...prev, result.path]);
        }
        await window.electronAPI.setRepoPath(result.path);
        setActiveRepo(result.path);
        setSelectedCommit(null);
        setNewRepoName('');
        setNewRepoDescription('');
        setConnectError(null);
        triggerRefresh();
      } else if (result && !result.isRepo) {
        setConfirmDialog({
          variant: 'confirm',
          title: 'Git-Repository initialisieren?',
          message: 'Das ausgewaehlte Verzeichnis ist noch kein Git-Repository.',
          contextItems: [
            { label: 'Pfad', value: result.path },
            { label: 'Aktion', value: 'git init' },
          ],
          irreversible: false,
          consequences: 'Es wird ein .git-Verzeichnis angelegt und das Verzeichnis als Repository vorbereitet.',
          confirmLabel: 'Repository initialisieren',
          onConfirm: async () => {
            const initResult = await window.electronAPI.gitInit(result.path);
            if (initResult.success) {
              if (!openRepos.includes(result.path)) {
                setOpenRepos(prev => [...prev, result.path]);
              }
              await window.electronAPI.setRepoPath(result.path);
              setActiveRepo(result.path);
              setSelectedCommit(null);
              setGitActionToast({ msg: 'Neues Git-Repository initialisiert.', isError: false });
              triggerRefresh();
            } else {
              setGitActionToast({ msg: initResult.error || 'Fehler bei git init.', isError: true });
            }
          },
        });
      }
    } catch (err) { console.error(err); }
  };

  const handleCreateGithubRepoForCurrent = async () => {
    if (!window.electronAPI || !activeRepo) return;
    if (!isAuthenticated) {
      setConnectError('Bitte zuerst GitHub verbinden (GitHub-Tab).');
      return;
    }

    const folderName = activeRepo.split(/[\\/]/).pop() || 'repository';
    const name = (newRepoName || folderName).trim();
    const description = newRepoDescription.trim();

    if (!name) {
      setConnectError('Repository-Name darf nicht leer sein.');
      return;
    }

    setIsConnectingGithubRepo(true);
    setConnectError(null);

    try {
      const result = await window.electronAPI.githubCreateRepo(name, description, newRepoPrivate);
      if (!result.success) {
        throw new Error(result.error || 'Fehler beim Erstellen des GitHub-Repositories.');
      }

      const remoteUrl = result.data.cloneUrl;

      let r = await window.electronAPI.runGitCommand('remote', 'add', 'origin', remoteUrl);
      if (!r.success) {
        throw new Error(r.error || 'Fehler beim Setzen des Git-Remotes.');
      }

      r = await window.electronAPI.runGitCommand('push', '-u', 'origin', 'HEAD');
      if (!r.success) {
        throw new Error(r.error || 'Fehler beim Pushen nach GitHub.');
      }

      setHasRemoteOrigin(true);
      setGitActionToast({ msg: 'Neues GitHub-Repository erstellt und verbunden.', isError: false });
      triggerRefresh();
    } catch (e: any) {
      setConnectError(e?.message || 'Fehler beim Erstellen und Verbinden mit GitHub.');
    } finally {
      setIsConnectingGithubRepo(false);
    }
  };

  const handleTokenLogin = async () => {
    if (!window.electronAPI) return;
    const token = tokenInput.trim();
    if (!token) return;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const success = await window.electronAPI.githubAuth(token);
      if (success) {
        setIsAuthenticated(true);
        setTokenInput('');
        const status = await window.electronAPI.githubCheckAuthStatus();
        setGithubUser(status.username);
        const result = await window.electronAPI.githubGetRepos();
        if (result.success) setGithubRepos(result.data || []);
      } else {
        setAuthError('Token ungültig. Bitte prüfe die Berechtigungen.');
      }
    } catch (e) {
      setAuthError('Fehler bei der Authentifizierung.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.githubLogout();
      }
    } catch (e) {
      console.error('GitHub logout failed:', e);
    } finally {
      setIsAuthenticated(false);
      setGithubUser(null);
      setGithubRepos([]);
      setTokenInput('');
    }
  };

  const handleClone = async (cloneUrl: string, repoName: string) => {
    if (!window.electronAPI) return;
    const targetDir = await window.electronAPI.selectDirectory();
    if (!targetDir) return;

    setIsCloning(true);
    setCloneLog([]);
    setCloneRepoName(repoName);
    setCloneFinished(false);
    setCloneError(null);

    const cleanup = window.electronAPI.onCloneProgress((line: string) => {
      setCloneLog(prev => [...prev, line]);
    });

    try {
      const result = await window.electronAPI.gitClone(cloneUrl, targetDir);
      cleanup();
      if (result.success) {
        setCloneFinished(true);
        setCloneLog(prev => [...prev, `? Repository erfolgreich geklont nach: ${result.repoPath}`]);
        if (!openRepos.includes(result.repoPath)) {
          setOpenRepos(prev => [...prev, result.repoPath]);
        }
        await window.electronAPI.setRepoPath(result.repoPath);
        setActiveRepo(result.repoPath);
        setActiveTab('repos');
      } else {
        setCloneError(result.error || 'Unbekannter Fehler');
        setCloneLog(prev => [...prev, `? Fehler: ${result.error}`]);
      }
    } catch (e: any) {
      cleanup();
      setCloneError(e.message);
      setCloneLog(prev => [...prev, `? Fehler: ${e.message}`]);
    }
  };

  const runGitCommand = async (args: string[], successMsg: string, actionLabel?: string) => {
    if (!window.electronAPI || !activeRepo) return;
    setIsGitActionRunning(true);
    setActiveGitActionLabel(actionLabel || `Git ${args[0]} wird ausgefuehrt...`);
    try {
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        setGitActionToast({ msg: successMsg, isError: false });
        triggerRefresh();
      } else {
        setGitActionToast({ msg: r.error || 'Fehler beim Ausführen von git.', isError: true });
      }
    } catch (e: any) {
      setGitActionToast({ msg: e.message, isError: true });
    } finally {
      setIsGitActionRunning(false);
      setActiveGitActionLabel(null);
    }
  };

  // Pull Requests
  const handleCreatePR = async () => {
    if (!window.electronAPI || !prOwnerRepo || !newPRTitle.trim()) return;
    try {
      const result = await window.electronAPI.githubCreatePR({
        owner: prOwnerRepo.owner,
        repo: prOwnerRepo.repo,
        title: newPRTitle.trim(),
        body: newPRBody.trim(),
        head: newPRHead || currentBranch,
        base: newPRBase || 'main',
      });
      if (result.success) {
        setGitActionToast({ msg: `PR #${result.data.number} erstellt.`, isError: false });
        setShowCreatePR(false);
        setNewPRTitle('');
        setNewPRBody('');
        triggerRefresh();
      } else {
        setGitActionToast({ msg: result.error || 'Fehler beim Erstellen des PR.', isError: true });
      }
    } catch (e: any) {
      setGitActionToast({ msg: e.message, isError: true });
    }
  };

  // Branch management
  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setIsCreatingBranch(false);
    setNewBranchName('');
    await runGitCommand(['checkout', '-b', name], `Branch "${name}" erstellt.`);
  };

  const handleDeleteBranch = async (branchName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Branch loeschen?',
      message: 'Der lokale Branch wird entfernt.',
      contextItems: [
        { label: 'Branch', value: branchName },
        { label: 'Aktiver Branch', value: currentBranch || '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Wenn der Branch nicht auf dem Remote liegt, kann Arbeit verloren gehen.',
      confirmLabel: 'Branch loeschen',
      onConfirm: async () => {
        await runGitCommand(['branch', '-d', branchName], `Branch "${branchName}" geloescht.`);
      },
    });
  };

  const handleMergeBranch = async (branchName: string) => {
    setConfirmDialog({
      variant: 'confirm',
      title: 'Branch mergen?',
      message: 'Der ausgewaehlte Branch wird in den aktuellen Branch gemergt.',
      contextItems: [
        { label: 'Quelle', value: branchName },
        { label: 'Ziel', value: currentBranch || '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Es kann zu Konflikten kommen. Bei Erfolg entsteht ggf. ein neuer Merge-Commit.',
      confirmLabel: 'Merge starten',
      onConfirm: async () => {
        await runGitCommand(['merge', branchName], `Branch "${branchName}" gemergt.`);
      },
    });
  };

  const handleRenameBranch = async (oldName: string) => {
    setInputDialog({
      title: 'Branch umbenennen',
      message: 'Gib den neuen Namen fuer den Branch ein.',
      fields: [
        {
          id: 'newName',
          label: 'Neuer Branch-Name',
          defaultValue: oldName,
          required: true,
          helperText: 'Der Name darf nicht leer sein und sollte eindeutig sein.',
        },
      ],
      contextItems: [
        { label: 'Bisheriger Name', value: oldName },
      ],
      irreversible: false,
      consequences: 'Lokale Referenzen werden aktualisiert. Remotes muessen ggf. separat angepasst werden.',
      confirmLabel: 'Umbenennen',
      onSubmit: async (values) => {
        const newName = (values.newName || '').trim();
        if (!newName || newName === oldName) return;
        await runGitCommand(['branch', '-m', oldName, newName], `Branch umbenannt: "${oldName}" -> "${newName}".`);
      },
    });
  };

  // Tag management
  const handleCreateTag = async () => {
    setInputDialog({
      title: 'Tag erstellen',
      message: 'Lege einen neuen Tag an.',
      fields: [
        {
          id: 'name',
          label: 'Tag-Name',
          placeholder: 'v1.2.3',
          required: true,
        },
        {
          id: 'message',
          label: 'Tag-Nachricht (optional)',
          placeholder: 'Release-Notiz',
        },
      ],
      contextItems: [
        { label: 'Branch', value: currentBranch || '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Annotierte Tags speichern zusaetzlich Metadaten und Nachricht.',
      confirmLabel: 'Tag erstellen',
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        if (!name) return;
        const msg = (values.message || '').trim();
        if (msg) {
          await runGitCommand(['tag', '-a', name, '-m', msg], `Tag "${name}" erstellt.`);
        } else {
          await runGitCommand(['tag', name], `Tag "${name}" erstellt.`);
        }
      },
    });
  };

  const handleDeleteTag = async (tagName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Tag loeschen?',
      message: 'Der Tag wird lokal entfernt.',
      contextItems: [
        { label: 'Tag', value: tagName },
      ],
      irreversible: false,
      consequences: 'Falls der Tag bereits gepusht wurde, bleibt er auf dem Remote bestehen bis zum expliziten Entfernen.',
      confirmLabel: 'Tag loeschen',
      onConfirm: async () => {
        await runGitCommand(['tag', '-d', tagName], `Tag "${tagName}" geloescht.`);
      },
    });
  };

  const handlePushTags = async () => {
    await runGitCommand(['push', '--tags'], 'Tags gepusht.');
  };

  // Remote management
  const handleAddRemote = async () => {
    setInputDialog({
      title: 'Remote hinzufuegen',
      message: 'Verbinde dieses Repository mit einem weiteren Remote.',
      fields: [
        {
          id: 'name',
          label: 'Remote-Name',
          placeholder: 'origin',
          required: true,
        },
        {
          id: 'url',
          label: 'Remote-URL',
          placeholder: 'https://github.com/owner/repo.git',
          required: true,
          type: 'url',
        },
      ],
      contextItems: [
        { label: 'Repository', value: activeRepo ? (activeRepo.split(/[\\/]/).pop() || activeRepo) : '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Der Remote wird in der lokalen Git-Konfiguration gespeichert.',
      confirmLabel: 'Remote speichern',
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        const url = (values.url || '').trim();
        if (!name || !url) return;
        await runGitCommand(['remote', 'add', name, url], `Remote "${name}" hinzugefuegt.`);
      },
    });
  };

  const handleRemoveRemote = async (remoteName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Remote entfernen?',
      message: 'Der Remote wird aus der lokalen Konfiguration entfernt.',
      contextItems: [
        { label: 'Remote', value: remoteName },
        { label: 'Repository', value: activeRepo ? (activeRepo.split(/[\\/]/).pop() || activeRepo) : '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Push/Pull ueber diesen Remote ist danach nicht mehr moeglich, bis er erneut angelegt wird.',
      confirmLabel: 'Remote entfernen',
      onConfirm: async () => {
        await runGitCommand(['remote', 'remove', remoteName], `Remote "${remoteName}" entfernt.`);
      },
    });
  };

  const localBranchNames = new Set(
    branches
      .filter(branch => branch.scope === 'local')
      .map(branch => branch.name)
  );

  const remoteOnlyBranches = branches.filter(branch => (
    branch.scope === 'remote' && !localBranchNames.has(getRemoteBranchShortName(branch.name))
  ));

  const remoteStatus = (() => {
    if (remoteSync.isFetching) {
      return {
        title: 'Remote wird aktualisiert...',
        detail: 'Fetch laeuft gerade.',
        color: '#7cb8ff',
        backgroundColor: 'rgba(31, 111, 235, 0.14)',
        borderColor: 'rgba(31, 111, 235, 0.28)',
      };
    }

    if (remoteSync.lastFetchError) {
      return {
        title: 'Remote-Check fehlgeschlagen',
        detail: remoteSync.lastFetchError,
        color: '#f85149',
        backgroundColor: 'rgba(248, 81, 73, 0.14)',
        borderColor: 'rgba(248, 81, 73, 0.28)',
      };
    }

    if (hasRemoteOrigin === false) {
      return {
        title: 'Kein Remote konfiguriert',
        detail: 'Dieses Repository hat noch kein Remote.',
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (remoteSync.lastFetchedAt === null) {
      return {
        title: 'Remote noch nicht geprueft',
        detail: 'Noch kein erfolgreicher Fetch fuer dieses Repository.',
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (!remoteSync.hasUpstream) {
      return {
        title: 'Kein Tracking-Branch',
        detail: 'Der aktuelle lokale Branch tracked keinen Remote-Branch.',
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.ahead > 0 && remoteSync.behind > 0) {
      return {
        title: 'Lokal und Remote sind unterschiedlich',
        detail: `Lokal ${remoteSync.ahead} voraus, Remote ${remoteSync.behind} voraus.`,
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.behind > 0) {
      return {
        title: `Remote ist ${remoteSync.behind} Commit${remoteSync.behind === 1 ? '' : 's'} voraus`,
        detail: 'Der Remote hat neuere Commits als dein lokaler Branch.',
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.ahead > 0) {
      return {
        title: `Lokal ist ${remoteSync.ahead} Commit${remoteSync.ahead === 1 ? '' : 's'} voraus`,
        detail: 'Deine lokalen Commits wurden noch nicht gepusht.',
        color: '#7cb8ff',
        backgroundColor: 'rgba(31, 111, 235, 0.14)',
        borderColor: 'rgba(31, 111, 235, 0.28)',
      };
    }

    if (remoteOnlyBranches.length > 0) {
      return {
        title: `${remoteOnlyBranches.length} zusaetzl. Remote-Branch${remoteOnlyBranches.length === 1 ? '' : 'es'}`,
        detail: 'Auf dem Remote gibt es weitere Branches.',
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    return {
      title: 'Remote ist aktuell',
      detail: formatLastFetchedAt(remoteSync.lastFetchedAt),
      color: '#3fb950',
      backgroundColor: 'rgba(63, 185, 80, 0.14)',
      borderColor: 'rgba(63, 185, 80, 0.28)',
    };
  })();

  return (
    <div className="app-container">
      {/* Activity Bar */}
      <div className="activity-bar">
        <button className={`icon-btn ${activeTab === 'repos' ? 'active' : ''}`} onClick={() => setActiveTab('repos')} title="Repositories">
          <FolderGit2 size={22} />
        </button>
        <button className={`icon-btn ${activeTab === 'github' ? 'active' : ''}`} onClick={() => setActiveTab('github')} title="GitHub">
          <Github size={22} />
        </button>
        <div style={{ flex: 1 }}></div>
        <button className="icon-btn" title="Settings">
          <Settings size={22} />
        </button>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{activeTab === 'repos' ? 'Repositories' : 'GitHub'}</span>
          {activeTab === 'repos' && (
            <div style={{ display: 'flex', gap: '2px' }}>
              <button className="icon-btn" style={{ padding: '4px' }} onClick={handleOpenFolder} title="Repository hinzufügen">
                <Plus size={16} />
              </button>
              {activeRepo && (
                <button
                  className="icon-btn"
                  style={{ padding: '4px' }}
                  onClick={() => refreshRemoteState(true)}
                  title="Remote aktualisieren"
                  disabled={remoteSync.isFetching || isGitActionRunning}
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="pane-content" style={{ padding: '8px' }}>
          {/* Repos Tab */}
          {activeTab === 'repos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <RepoList
                openRepos={openRepos}
                activeRepo={activeRepo}
                onSwitchRepo={handleSwitchRepo}
                onCloseRepo={handleCloseRepo}
                onOpenFolder={handleOpenFolder}
              />

              {activeRepo && (
                <BranchPanel
                  branches={branches}
                  isCreatingBranch={isCreatingBranch}
                  newBranchName={newBranchName}
                  newBranchInputRef={newBranchInputRef}
                  onSetCreatingBranch={setIsCreatingBranch}
                  onSetNewBranchName={setNewBranchName}
                  onCreateBranch={handleCreateBranch}
                  onCheckoutBranch={(name) => runGitCommand(['checkout', name], `Ausgecheckt: ${name}`)}
                  onSetBranchContextMenu={setBranchContextMenu}
                />
              )}

              {activeRepo && (
                <TagPanel
                  tags={tags}
                  onCreateTag={handleCreateTag}
                  onPushTags={handlePushTags}
                  onDeleteTag={handleDeleteTag}
                />
              )}

              {activeRepo && (
                <RemotePanel
                  remotes={remotes}
                  remoteSync={remoteSync}
                  remoteStatus={remoteStatus}
                  remoteOnlyBranchesCount={remoteOnlyBranches.length}
                  onAddRemote={handleAddRemote}
                  onRemoveRemote={handleRemoveRemote}
                  onRefreshRemote={() => refreshRemoteState(true)}
                />
              )}

              {/* GitHub connect for active repo */}
              {activeRepo && hasRemoteOrigin === false && (
                <>
                  <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-panel)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      Noch nicht mit GitHub verbunden.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input
                        type="text"
                        placeholder="Repository-Name auf GitHub"
                        value={newRepoName}
                        onChange={e => setNewRepoName(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-dark)',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                        }}
                      />
                      <textarea
                        placeholder="Beschreibung (optional)"
                        value={newRepoDescription}
                        onChange={e => setNewRepoDescription(e.target.value)}
                        rows={2}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-dark)',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          resize: 'vertical',
                        }}
                      />
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newRepoPrivate}
                          onChange={e => setNewRepoPrivate(e.target.checked)}
                        />
                        Privat
                      </label>
                    </div>
                    {connectError && (
                      <div style={{ fontSize: '0.8rem', color: '#f85149' }}>
                        {connectError}
                      </div>
                    )}
                    <button
                      onClick={handleCreateGithubRepoForCurrent}
                      disabled={isConnectingGithubRepo}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: !isConnectingGithubRepo ? 'var(--accent-primary)' : 'var(--bg-dark)',
                        color: !isConnectingGithubRepo ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: !isConnectingGithubRepo ? 'pointer' : 'not-allowed',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Github size={14} />
                      {isConnectingGithubRepo ? 'Verbinde...' : 'GitHub-Repo erstellen & verbinden'}
                    </button>
                    {!isAuthenticated && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Hinweis: Bitte zuerst im GitHub-Tab einen Token hinterlegen.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* GitHub Tab */}
          {activeTab === 'github' && !isAuthenticated && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px', textAlign: 'center', marginTop: '16px' }}>
              <Github size={48} style={{ margin: '0 auto', color: 'var(--text-secondary)' }} />
              <h3 style={{ margin: '8px 0 4px', fontSize: '1.1rem' }}>GitHub Connect</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                 Verbinde deinen Account mit einem PAT.
              </p>
              <a href="#" onClick={(e) => { e.preventDefault(); window.open('https://github.com/settings/tokens/new?scopes=repo,user&description=Git-Organizer'); }} style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', textDecoration: 'none' }}>
                <ExternalLink size={12} /> Token erstellen
              </a>
              <div style={{ position: 'relative' }}>
                <Key size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input type="password" placeholder="ghp_xxx" value={tokenInput} onChange={e => { setTokenInput(e.target.value); setAuthError(null); }} onKeyDown={e => { if (e.key === 'Enter') handleTokenLogin(); }} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 8px 8px 28px', borderRadius: '4px', border: authError ? '1px solid #f85149' : '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
              </div>
              {authError && <p style={{ fontSize: '0.8rem', color: '#f85149', margin: 0, textAlign: 'left' }}>{authError}</p>}
              <button disabled={!tokenInput.trim() || isAuthenticating} onClick={handleTokenLogin} style={{ padding: '8px', backgroundColor: tokenInput.trim() && !isAuthenticating ? 'var(--accent-primary)' : 'var(--bg-dark)', color: tokenInput.trim() && !isAuthenticating ? '#fff' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: tokenInput.trim() && !isAuthenticating ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                {isAuthenticating ? 'Verbinde...' : 'Verbinden'}
              </button>
            </div>
          )}

          {activeTab === 'github' && isAuthenticated && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px',
                  backgroundColor: 'var(--bg-panel)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Github size={16} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{githubUser || 'Verbunden'}</span>
                </div>
                <button onClick={handleLogout} className="icon-btn" style={{ padding: '4px' }} title="Abmelden">
                  <LogOut size={14} />
                </button>
              </div>
              {githubRepos.map(repo => (
                <div
                  key={repo.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px',
                    backgroundColor: 'var(--bg-panel)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {repo.name}
                  </span>
                  <button
                    onClick={() => handleClone(repo.cloneUrl, repo.name)}
                    disabled={isCloning}
                    className="icon-btn"
                    style={{ padding: '4px' }}
                    title="Clone Repo"
                  >
                    <DownloadCloud size={14} />
                  </button>
                </div>
              ))}

              {/* PR Section */}
              {prOwnerRepo && (
                <>
                  <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 0 6px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Pull Requests ({prOwnerRepo.owner}/{prOwnerRepo.repo})
                    </span>
                    <button
                      className="icon-btn"
                      style={{ padding: '2px' }}
                      onClick={() => {
                        setShowCreatePR(true);
                        setNewPRHead(currentBranch);
                      }}
                      title="Neuen PR erstellen"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    {(['open', 'closed', 'all'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setPrFilter(f)}
                        style={{
                          flex: 1,
                          padding: '3px 6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          backgroundColor: prFilter === f ? 'var(--accent-primary)' : 'var(--bg-dark)',
                          color: prFilter === f ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${
                            prFilter === f ? 'var(--accent-primary)' : 'var(--border-color)'
                          }`,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {f === 'open' ? 'Offen' : f === 'closed' ? 'Geschlossen' : 'Alle'}
                      </button>
                    ))}
                  </div>

                  {showCreatePR && (
                    <div
                      style={{
                        padding: '8px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-panel)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginBottom: '6px',
                      }}
                    >
                      <input
                        type="text"
                        placeholder="PR Titel"
                        value={newPRTitle}
                        onChange={e => setNewPRTitle(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-dark)',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                        }}
                      />
                      <textarea
                        placeholder="Beschreibung (optional)"
                        value={newPRBody}
                        onChange={e => setNewPRBody(e.target.value)}
                        rows={2}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-dark)',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          resize: 'vertical',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="Head Branch"
                          value={newPRHead}
                          onChange={e => setNewPRHead(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '5px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-dark)',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem',
                          }}
                        />
                        <span
                          style={{
                            color: 'var(--text-secondary)',
                            alignSelf: 'center',
                            fontSize: '0.8rem',
                          }}
                        >
                          ?
                        </span>
                        <input
                          type="text"
                          placeholder="Base Branch"
                          value={newPRBase}
                          onChange={e => setNewPRBase(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '5px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-dark)',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setShowCreatePR(false)}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: 'var(--bg-dark)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                          }}
                        >
                          Abbrechen
                        </button>
                        <button
                          onClick={handleCreatePR}
                          disabled={!newPRTitle.trim()}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: newPRTitle.trim() ? 'var(--accent-primary)' : 'var(--bg-dark)',
                            color: newPRTitle.trim() ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: newPRTitle.trim() ? 'pointer' : 'not-allowed',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                          }}
                        >
                          Erstellen
                        </button>
                      </div>
                    </div>
                  )}

                  {prLoading && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 0' }}>
                      Lade Pull Requests...
                    </div>
                  )}

                  {!prLoading &&
                    pullRequests.map(pr => (
                      <div
                        key={pr.number}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '8px',
                          backgroundColor: 'var(--bg-panel)',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                        }}
                        onClick={() => window.open(pr.htmlUrl, '_blank')}
                      >
                        <GitPullRequest
                          size={14}
                          style={{
                            color: pr.merged ? '#a371f7' : pr.state === 'open' ? '#3fb950' : '#f85149',
                            marginTop: '2px',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {pr.title}
                            {pr.draft && (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  color: 'var(--text-secondary)',
                                  marginLeft: '4px',
                                }}
                              >
                                Draft
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-secondary)',
                              marginTop: '2px',
                            }}
                          >
                            #{pr.number} · {pr.head} ? {pr.base} · {pr.user}
                          </div>
                        </div>
                      </div>
                    ))}

                  {!prLoading && pullRequests.length === 0 && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        padding: '6px 0',
                        textAlign: 'center',
                      }}
                    >
                      Keine Pull Requests.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Main View */}
      <div className="main-view">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>
              {activeRepo ? activeRepo.split(/[\\/]/).pop() : 'Git-Organizer'}
            </span>
            {currentBranch && (
              <span style={{ 
                fontSize: '0.8rem', padding: '4px 8px', borderRadius: '12px', 
                backgroundColor: 'rgba(57, 163, 71, 0.15)', color: '#3fb950', 
                border: '1px solid rgba(57, 163, 71, 0.3)', display: 'flex', alignItems: 'center', gap: '6px' 
              }}>
                <GitBranch size={12} /> {currentBranch}
              </span>
            )}
            {activeRepo && (
              <span style={{
                fontSize: '0.78rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: remoteStatus.backgroundColor,
                color: remoteStatus.color,
                border: `1px solid ${remoteStatus.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <RefreshCw size={12} style={{ opacity: remoteSync.isFetching ? 1 : 0.7 }} />
                {remoteStatus.title}
              </span>
            )}
            {(isGitActionRunning || remoteSync.isFetching) && activeGitActionLabel && (
              <span style={{
                fontSize: '0.78rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(31, 111, 235, 0.14)',
                color: '#7cb8ff',
                border: '1px solid rgba(31, 111, 235, 0.28)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <RefreshCw size={12} className="spin" />
                {activeGitActionLabel}
              </span>
            )}
          </div>
          
          <div style={{ flex: 1 }}></div>
          
          <TopbarActions
            activeRepo={activeRepo}
            isGitActionRunning={isGitActionRunning}
            isFetching={remoteSync.isFetching}
            activeActionLabel={activeGitActionLabel}
            onFetch={() => refreshRemoteState(true)}
            onPull={() => runGitCommand(['pull'], 'Erfolgreich gepullt.', 'Pull wird ausgefuehrt...')}
            onPush={() => runGitCommand(['push'], 'Erfolgreich gepusht.', 'Push wird ausgefuehrt...')}
            onStageCommit={() => setSelectedCommit(null)}
          />
        </div>

        <div className="content-area">
          <div className="pane" style={{ flex: 2 }}>
            <div className="pane-header">Commit Graph</div>
            <div className="pane-content" style={{ padding: 0 }}>
              <CommitGraph 
                repoPath={activeRepo} 
                selectedHash={selectedCommit} 
                onSelectCommit={setSelectedCommit} 
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
          <div className="pane">
            <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{selectedCommit ? 'Commit Inspector' : 'Working Directory'}</span>
              {selectedCommit && (
                <button className="icon-btn" onClick={() => setSelectedCommit(null)} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>? Schließen</button>
              )}
            </div>
            <div className="pane-content" style={{ overflow: 'hidden' }}>
              {selectedCommit ? (
                <CommitDetails hash={selectedCommit} onSelectCommit={setSelectedCommit} />
              ) : (
                <StagingArea repoPath={activeRepo} onRepoChanged={triggerRefresh} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Action Toast */}
      {gitActionToast && (
        <div className={`action-toast ${gitActionToast.isError ? 'error' : 'success'}`}>
          {gitActionToast.isError ? '?' : '?'} {gitActionToast.msg}
        </div>
      )}

      {/* Branch context menu */}
      {branchContextMenu && (
        <div
          className="ctx-menu-backdrop"
          onClick={e => {
            e.stopPropagation();
            setBranchContextMenu(null);
          }}
        >
          <div
            className="ctx-menu"
            style={{ left: branchContextMenu.x, top: branchContextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="ctx-menu-header">{branchContextMenu.branch}</div>
            {!branchContextMenu.isHead && (
              <button
                className="ctx-menu-item"
                onClick={() => {
                  const b = branchContextMenu.branch;
                  setBranchContextMenu(null);
                  runGitCommand(['checkout', b], `Ausgecheckt: ${b}`);
                }}
              >
                <span className="ctx-menu-icon">?</span> Checkout
              </button>
            )}
            {!branchContextMenu.isHead && !branchContextMenu.branch.startsWith('remotes/') && (
              <button
                className="ctx-menu-item"
                onClick={() => {
                  const b = branchContextMenu.branch;
                  setBranchContextMenu(null);
                  handleMergeBranch(b);
                }}
              >
                <span className="ctx-menu-icon">?</span> In aktuellen Branch mergen
              </button>
            )}
            {!branchContextMenu.branch.startsWith('remotes/') && (
            <button
              className="ctx-menu-item"
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                handleRenameBranch(b);
              }}
            >
              <span className="ctx-menu-icon">?</span> Umbenennen
            </button>
            )}
            <div className="ctx-menu-sep" />
            {!branchContextMenu.isHead && !branchContextMenu.branch.startsWith('remotes/') && (
              <button
                className="ctx-menu-item danger"
                onClick={() => {
                  const b = branchContextMenu.branch;
                  setBranchContextMenu(null);
                  handleDeleteBranch(b);
                }}
              >
                <span className="ctx-menu-icon">?</span> Branch löschen
              </button>
            )}
          </div>
        </div>
      )}

      {confirmDialog && confirmDialog.variant === 'confirm' && (
        <Confirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {confirmDialog && confirmDialog.variant === 'danger' && (
        <DangerConfirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {inputDialog && (
        <Input
          open={true}
          title={inputDialog.title}
          message={inputDialog.message}
          fields={inputDialog.fields}
          contextItems={inputDialog.contextItems}
          irreversible={inputDialog.irreversible}
          consequences={inputDialog.consequences}
          confirmLabel={inputDialog.confirmLabel}
          onSubmit={executeInputDialog}
          onCancel={closeInputDialog}
        />
      )}

      {/* Clone Progress Modal */}
      {isCloning && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '10px', width: '520px', maxHeight: '400px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DownloadCloud size={18} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Klone: {cloneRepoName || 'Repository'}</span>
              <div style={{ flex: 1 }} />
              {!cloneFinished && !cloneError && <div className="clone-spinner" />}
              {cloneFinished && <span style={{ color: '#3fb950', fontSize: '0.85rem', fontWeight: 600 }}>? Fertig</span>}
              {cloneError && <span style={{ color: '#f85149', fontSize: '0.85rem', fontWeight: 600 }}>? Fehler</span>}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: '1.6', color: 'var(--text-secondary)', maxHeight: '260px' }}>
              {cloneLog.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Starte Clone-Prozess...</span>}
              {cloneLog.map((line, i) => <div key={i} style={{ color: line.startsWith('?') ? '#3fb950' : line.startsWith('?') ? '#f85149' : 'var(--text-secondary)' }}>{line}</div>)}
            </div>
            {(cloneFinished || cloneError) && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { setIsCloning(false); triggerRefresh(); }} style={{ padding: '6px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                  Schließen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

