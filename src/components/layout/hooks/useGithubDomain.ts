import { useEffect, useRef, useState } from 'react';
import { DeviceFlowPollDto, DeviceFlowStartDto, GitHubRepositoryDto } from '../../../global';

type Params = {
  onRepoCloned: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: 'repos' | 'github' | 'settings') => void;
};

export const useGithubDomain = ({
  onRepoCloned,
  setActiveTab,
}: Params) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepositoryDto[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStartDto | null>(null);
  const [isDeviceFlowRunning, setIsDeviceFlowRunning] = useState(false);
  const [deviceFlowError, setDeviceFlowError] = useState<string | null>(null);

  const pollingRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  const [isCloning, setIsCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [cloneRepoName, setCloneRepoName] = useState<string | null>(null);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);



  const clearDevicePolling = () => {
    if (pollingRef.current !== null) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    const loginWithSavedToken = async () => {
      if (!window.electronAPI) return;

      setIsAuthenticating(true);
      try {
        const status = await window.electronAPI.githubGetSavedAuthStatus();
        setOauthConfigured(status.oauthConfigured);

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
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
      clearDevicePolling();
    };
  }, []);

  const handleTokenLogin = async () => {
    if (!window.electronAPI) return;
    const token = tokenInput.trim();
    if (!token) return;

    clearDevicePolling();
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);

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
        setAuthError('Token ungueltig. Bitte pruefe die Berechtigungen.');
      }
    } catch {
      setAuthError('Fehler bei der Authentifizierung.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const schedulePoll = (deviceCode: string, intervalSeconds: number) => {
    clearDevicePolling();
    pollingRef.current = window.setTimeout(async () => {
      if (stoppedRef.current || !window.electronAPI) return;

      try {
        const pollResult = await window.electronAPI.githubDevicePoll(deviceCode);
        if (!pollResult.success) {
          setIsDeviceFlowRunning(false);
          setDeviceFlowError(pollResult.error || 'Device Flow Polling fehlgeschlagen.');
          return;
        }

        const data = pollResult.data as DeviceFlowPollDto;
        if (data.status === 'pending') {
          schedulePoll(deviceCode, data.interval || intervalSeconds);
          return;
        }

        if (data.status === 'error') {
          setIsDeviceFlowRunning(false);
          setDeviceFlowError(data.errorDescription || data.error || 'Device Flow fehlgeschlagen.');
          return;
        }

        setIsDeviceFlowRunning(false);
        setDeviceFlow(null);
        setDeviceFlowError(null);
        setIsAuthenticated(true);
        setGithubUser(data.username || null);

        const reposResult = await window.electronAPI.githubGetRepos();
        if (reposResult.success) {
          setGithubRepos(reposResult.data || []);
        }
      } catch (error: any) {
        setIsDeviceFlowRunning(false);
        setDeviceFlowError(error?.message || 'Device Flow Polling fehlgeschlagen.');
      }
    }, Math.max(2, intervalSeconds) * 1000);
  };

  const handleStartDeviceFlowLogin = async () => {
    if (!window.electronAPI) return;

    clearDevicePolling();
    setDeviceFlowError(null);
    setAuthError(null);

    const startResult = await window.electronAPI.githubDeviceStart();
    if (!startResult.success) {
      setDeviceFlowError(startResult.error || 'Device Flow konnte nicht gestartet werden.');
      return;
    }

    const flow = startResult.data;
    setDeviceFlow(flow);
    setIsDeviceFlowRunning(true);

    window.open(flow.verificationUri, '_blank');
    schedulePoll(flow.deviceCode, flow.interval);
  };

  const handleCancelDeviceFlow = () => {
    clearDevicePolling();
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
  };

  const handleLogout = async () => {
    clearDevicePolling();
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);

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
        setCloneLog(prev => [...prev, `Repository erfolgreich geklont nach: ${result.repoPath}`]);
        await onRepoCloned(result.repoPath);
        setActiveTab('repos');
      } else {
        setCloneError(result.error || 'Unbekannter Fehler');
        setCloneLog(prev => [...prev, `Fehler: ${result.error}`]);
      }
    } catch (e: any) {
      cleanup();
      setCloneError(e.message);
      setCloneLog(prev => [...prev, `Fehler: ${e.message}`]);
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
    oauthConfigured,
    deviceFlow,
    isDeviceFlowRunning,
    deviceFlowError,
    handleStartDeviceFlowLogin,
    handleCancelDeviceFlow,
    handleLogout,

    isCloning,
    setIsCloning,
    cloneLog,
    cloneRepoName,
    cloneFinished,
    cloneError,
    handleClone,

  };
};
