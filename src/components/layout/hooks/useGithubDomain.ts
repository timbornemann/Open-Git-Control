import { useEffect, useState } from 'react';
import { GitHubRepositoryDto, PullRequestDto } from '../../../global';

type Params = {
  activeRepo: string | null;
  currentBranch: string;
  refreshTrigger: number;
  triggerRefresh: () => void;
  setGitActionToast: (toast: { msg: string; isError: boolean }) => void;
  onRepoCloned: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: 'repos' | 'github' | 'settings') => void;
};

export const useGithubDomain = ({
  activeRepo,
  currentBranch,
  refreshTrigger,
  triggerRefresh,
  setGitActionToast,
  onRepoCloned,
  setActiveTab,
}: Params) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoryDto[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isCloning, setIsCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [cloneRepoName, setCloneRepoName] = useState<string | null>(null);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [pullRequests, setPullRequests] = useState<PullRequestDto[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [prOwnerRepo, setPrOwnerRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [newPRTitle, setNewPRTitle] = useState('');
  const [newPRBody, setNewPRBody] = useState('');
  const [newPRHead, setNewPRHead] = useState('');
  const [newPRBase, setNewPRBase] = useState('main');
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open');

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
    } catch {
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
        await onRepoCloned(result.repoPath);
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

  return {
    isAuthenticated,
    setIsAuthenticated,
    githubUser,
    setGithubUser,
    githubRepos,
    setGithubRepos,
    tokenInput,
    setTokenInput,
    isAuthenticating,
    authError,
    setAuthError,
    handleTokenLogin,
    handleLogout,

    isCloning,
    setIsCloning,
    cloneLog,
    cloneRepoName,
    cloneFinished,
    cloneError,
    handleClone,

    pullRequests,
    prLoading,
    prOwnerRepo,
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
    prFilter,
    setPrFilter,
    handleCreatePR,
  };
};

