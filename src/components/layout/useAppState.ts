import { useState, useEffect, useCallback, useRef } from 'react';
import { DialogContextItem } from '../Confirm';
import { InputDialogField } from '../Input';
import { useToastQueue } from '../../hooks/useToastQueue';
import { BranchInfo, RemoteSyncState } from '../../types/git';
import { GitHubRepositoryDto, PullRequestDto } from '../../global';

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
export const useAppState = () => {
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

  return {
    activeTab,
    setActiveTab,
    activeRepo,
    openRepos,
    handleOpenFolder,
    handleSwitchRepo,
    handleCloseRepo,
    remoteSync,
    isGitActionRunning,
    refreshRemoteState,
    branches,
    isCreatingBranch,
    newBranchName,
    newBranchInputRef,
    setIsCreatingBranch,
    setNewBranchName,
    handleCreateBranch,
    runGitCommand,
    setBranchContextMenu,
    tags,
    handleCreateTag,
    handlePushTags,
    handleDeleteTag,
    remotes,
    remoteStatus,
    remoteOnlyBranches,
    handleAddRemote,
    handleRemoveRemote,
    hasRemoteOrigin,
    isConnectingGithubRepo,
    connectError,
    newRepoName,
    setNewRepoName,
    newRepoDescription,
    setNewRepoDescription,
    newRepoPrivate,
    setNewRepoPrivate,
    handleCreateGithubRepoForCurrent,
    isAuthenticated,
    tokenInput,
    setTokenInput,
    isAuthenticating,
    authError,
    setAuthError,
    handleTokenLogin,
    githubUser,
    githubRepos,
    handleLogout,
    handleClone,
    isCloning,
    prOwnerRepo,
    prFilter,
    setPrFilter,
    prLoading,
    pullRequests,
    showCreatePR,
    setShowCreatePR,
    currentBranch,
    setNewPRHead,
    newPRTitle,
    setNewPRTitle,
    newPRBody,
    setNewPRBody,
    newPRHead,
    newPRBase,
    setNewPRBase,
    handleCreatePR,
    selectedCommit,
    setSelectedCommit,
    refreshTrigger,
    triggerRefresh,
    activeGitActionLabel,
    gitActionToast,
    branchContextMenu,
    handleMergeBranch,
    handleRenameBranch,
    handleDeleteBranch,
    confirmDialog,
    inputDialog,
    executeConfirmDialog,
    closeConfirmDialog,
    executeInputDialog,
    closeInputDialog,
    cloneRepoName,
    cloneFinished,
    cloneError,
    cloneLog,
    setIsCloning,
  };
};

