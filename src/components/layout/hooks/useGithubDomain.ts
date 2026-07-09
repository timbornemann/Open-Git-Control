import { useEffect, useRef, useState } from 'react';
import type { DeviceFlowPollDto, DeviceFlowStartDto } from '@/types/githubDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { appClient } from '@/services/appClient';
import { githubClient } from '@/services/githubClient';
import { useGithubCloneWorkflow } from './github/useGithubCloneWorkflow';
import { useGithubRepositoryPages } from './github/useGithubRepositoryPages';

type Params = {
  onRepoCloned: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: 'localRepos' | 'repo' | 'github' | 'settings') => void;
  language: AppLanguage;
  githubOauthClientId: string;
  githubHost: string;
};

export const useGithubDomain = ({ onRepoCloned, setActiveTab, language, githubOauthClientId, githubHost }: Params) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStartDto | null>(null);
  const [isDeviceFlowRunning, setIsDeviceFlowRunning] = useState(false);
  const [deviceFlowError, setDeviceFlowError] = useState<string | null>(null);
  const [isWebFlowRunning, setIsWebFlowRunning] = useState(false);
  const [webFlowError, setWebFlowError] = useState<string | null>(null);

  const pollingRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const initializedHostRef = useRef<string | null>(null);

  const { t } = useLanguageTranslations(language);
  const repositoryPages = useGithubRepositoryPages({ isAuthenticated, t });
  const cloneWorkflow = useGithubCloneWorkflow({ onRepoCloned, setActiveTab, t });
  const { resetRepositoryPages } = repositoryPages;

  const clearDevicePolling = () => {
    if (pollingRef.current !== null) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    const normalizedHost = (githubHost || '').trim().toLowerCase() || 'github.com';
    if (initializedHostRef.current === normalizedHost) return;
    initializedHostRef.current = normalizedHost;

    const loginWithSavedToken = async () => {
      if (!githubClient.isAvailable()) return;

      setIsAuthenticating(true);
      try {
        const status = await githubClient.getSavedAuthStatus();
        setOauthConfigured(status.oauthConfigured);

        if (!status.hasSavedToken) {
          setIsAuthenticated(status.authenticated);
          setGithubUser(status.username);
          return;
        }

        const loginResult = await githubClient.loginWithSavedToken();
        if (loginResult.success && loginResult.authenticated) {
          setIsAuthenticated(true);
          setGithubUser(loginResult.username);
          resetRepositoryPages();
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

    void loginWithSavedToken();
  }, [githubHost, resetRepositoryPages]);

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
      clearDevicePolling();
    };
  }, []);

  useEffect(() => {
    const fromSettings = (githubOauthClientId || '').trim().length > 0;
    if (fromSettings) {
      setOauthConfigured(true);
      return;
    }

    const refreshOauthStatus = async () => {
      if (!githubClient.isAvailable()) {
        setOauthConfigured(false);
        return;
      }

      try {
        const status = await githubClient.getSavedAuthStatus();
        setOauthConfigured(status.oauthConfigured);
      } catch {
        setOauthConfigured(false);
      }
    };

    void refreshOauthStatus();
  }, [githubOauthClientId, githubHost]);

  const handleTokenLogin = async () => {
    if (!githubClient.isAvailable()) return;
    const token = tokenInput.trim();
    if (!token) return;

    clearDevicePolling();
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
    setDeviceFlowError(null);
    setWebFlowError(null);

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const success = await githubClient.auth(token, githubHost);
      if (success) {
        setIsAuthenticated(true);
        setTokenInput('');
        const status = await githubClient.checkAuthStatus();
        setGithubUser(status.username);
        resetRepositoryPages();
      } else {
        setAuthError(t('generated.components.layout.hooks.usegithubdomain.invalid_token_please_check_permissions_73c7b36b'));
      }
    } catch {
      setAuthError(t('generated.components.layout.hooks.usegithubdomain.authentication_error_a366cc27'));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const schedulePoll = (deviceCode: string, intervalSeconds: number) => {
    clearDevicePolling();
    pollingRef.current = window.setTimeout(
      async () => {
        if (stoppedRef.current || !githubClient.isAvailable()) return;

        try {
          const pollResult = await githubClient.devicePoll(deviceCode);
          if (!pollResult.success) {
            setIsDeviceFlowRunning(false);
            setDeviceFlowError(pollResult.error || t('generated.components.layout.hooks.usegithubdomain.device_flow_polling_failed_bbf5f761'));
            return;
          }

          const data = pollResult.data as DeviceFlowPollDto;
          if (data.status === 'pending') {
            schedulePoll(deviceCode, data.interval || intervalSeconds);
            return;
          }

          if (data.status === 'error') {
            setIsDeviceFlowRunning(false);
            setDeviceFlowError(data.errorDescription || data.error || t('generated.components.layout.hooks.usegithubdomain.device_flow_failed_0da9c84a'));
            return;
          }

          setIsDeviceFlowRunning(false);
          setDeviceFlow(null);
          setDeviceFlowError(null);
          setIsAuthenticated(true);
          setGithubUser(data.username || null);
          resetRepositoryPages();
        } catch (error: any) {
          setIsDeviceFlowRunning(false);
          setDeviceFlowError(error?.message || t('generated.components.layout.hooks.usegithubdomain.device_flow_polling_failed_bbf5f761'));
        }
      },
      Math.max(2, intervalSeconds) * 1000,
    );
  };

  const handleStartDeviceFlowLogin = async () => {
    if (!githubClient.isAvailable() || !appClient.isAvailable()) return;

    clearDevicePolling();
    setDeviceFlowError(null);
    setAuthError(null);
    setWebFlowError(null);

    const startResult = await githubClient.deviceStart();
    if (!startResult.success) {
      setDeviceFlowError(startResult.error || t('generated.components.layout.hooks.usegithubdomain.could_not_start_device_flow_4b39f59a'));
      return;
    }

    const flow = startResult.data;
    setDeviceFlow(flow);
    setIsDeviceFlowRunning(true);

    await appClient.openExternalUrl(flow.verificationUri);
    schedulePoll(flow.deviceCode, flow.interval);
  };

  const handleStartWebFlowLogin = async () => {
    if (!githubClient.isAvailable()) return;

    clearDevicePolling();
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
    setDeviceFlowError(null);
    setAuthError(null);
    setWebFlowError(null);
    setIsWebFlowRunning(true);

    try {
      const loginResult = await githubClient.webLogin();
      if (!loginResult.success) {
        setWebFlowError(loginResult.error || t('generated.components.layout.hooks.usegithubdomain.github_one_click_login_failed_b976a360'));
        return;
      }

      setIsAuthenticated(true);
      setGithubUser(loginResult.data.username || null);
      setTokenInput('');
      resetRepositoryPages();
    } catch (error: any) {
      setWebFlowError(error?.message || t('generated.components.layout.hooks.usegithubdomain.github_one_click_login_failed_b976a360'));
    } finally {
      setIsWebFlowRunning(false);
    }
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
    setIsWebFlowRunning(false);
    setWebFlowError(null);

    try {
      if (githubClient.isAvailable()) {
        await githubClient.logout();
      }
    } catch (e) {
      console.error('GitHub logout failed:', e);
    } finally {
      setIsAuthenticated(false);
      setGithubUser(null);
      setTokenInput('');
      resetRepositoryPages({ clearRepos: true });
    }
  };

  return {
    isAuthenticated,
    setIsAuthenticated,
    githubUser,
    setGithubUser,
    githubRepos: repositoryPages.githubRepos,
    setGithubRepos: repositoryPages.setGithubRepos,
    githubReposHasMore: repositoryPages.githubReposHasMore,
    isLoadingRepos: repositoryPages.isLoadingRepos,
    isLoadingMoreRepos: repositoryPages.isLoadingMoreRepos,
    loadMoreRepos: repositoryPages.loadMoreRepos,
    refreshRepos: repositoryPages.refreshRepos,
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
    isWebFlowRunning,
    webFlowError,
    handleStartWebFlowLogin,
    handleLogout,

    isCloning: cloneWorkflow.isCloning,
    setIsCloning: cloneWorkflow.setIsCloning,
    closeCloneProgress: cloneWorkflow.closeCloneProgress,
    cloneLog: cloneWorkflow.cloneLog,
    cloneRepoName: cloneWorkflow.cloneRepoName,
    cloneFinished: cloneWorkflow.cloneFinished,
    cloneError: cloneWorkflow.cloneError,
    cloneRepository: cloneWorkflow.cloneRepository,
    handleClone: cloneWorkflow.handleClone,
  };
};
