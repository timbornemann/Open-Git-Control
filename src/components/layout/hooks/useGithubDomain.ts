import { useEffect, useRef, useState } from 'react';
import type { DeviceFlowPollDto, DeviceFlowStartDto } from '@/types/githubDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { appClient } from '@/services/appClient';
import { githubClient } from '@/services/githubClient';
import { useGithubCloneWorkflow } from './github/useGithubCloneWorkflow';
import { useGithubRepositoryPages } from './github/useGithubRepositoryPages';
import { confirmWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';

type Params = {
  onRepoCloned: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: 'localRepos' | 'repo' | 'github' | 'settings') => void;
  language: AppLanguage;
  githubOauthClientId: string;
  githubHost: string;
  onError?: (message: string) => void;
};

type AuthRunKind = 'bootstrap' | 'token' | 'device' | 'web' | 'logout';
type AuthRun = { id: number; kind: AuthRunKind };

export const useGithubDomain = ({ onRepoCloned, setActiveTab, language, githubOauthClientId, githubHost, onError }: Params) => {
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
  const activeAuthRunRef = useRef<AuthRun | null>(null);
  const nextAuthRunIdRef = useRef(0);
  const oauthStatusRequestRef = useRef(0);

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

  const beginAuthRun = (kind: AuthRunKind, replaceBootstrap = false): AuthRun | null => {
    const activeRun = activeAuthRunRef.current;
    if (activeRun && !(replaceBootstrap && activeRun.kind === 'bootstrap')) return null;
    const run = { id: ++nextAuthRunIdRef.current, kind };
    activeAuthRunRef.current = run;
    return run;
  };

  const isCurrentAuthRun = (run: AuthRun) => !stoppedRef.current && activeAuthRunRef.current?.id === run.id && activeAuthRunRef.current.kind === run.kind;

  const finishAuthRun = (run: AuthRun) => {
    if (activeAuthRunRef.current?.id === run.id) activeAuthRunRef.current = null;
  };

  const invalidateAuthRuns = () => {
    nextAuthRunIdRef.current += 1;
    activeAuthRunRef.current = null;
    clearDevicePolling();
  };

  useEffect(() => {
    const normalizedHost = (githubHost || '').trim().toLowerCase() || 'github.com';
    if (initializedHostRef.current === normalizedHost) return;
    initializedHostRef.current = normalizedHost;

    // Authentication and repository data are host-scoped. Clear the previous
    // host synchronously, before its saved-token bootstrap can race the new one.
    nextAuthRunIdRef.current += 1;
    activeAuthRunRef.current = null;
    if (pollingRef.current !== null) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setIsAuthenticated(false);
    setGithubUser(null);
    setAuthError(null);
    setIsAuthenticating(false);
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
    setDeviceFlowError(null);
    setIsWebFlowRunning(false);
    setWebFlowError(null);
    resetRepositoryPages({ clearRepos: true });

    const loginWithSavedToken = async () => {
      if (!githubClient.isAvailable()) return;
      const run = beginAuthRun('bootstrap', true);
      if (!run) return;

      try {
        const status = await githubClient.getSavedAuthStatus();
        if (!isCurrentAuthRun(run)) return;
        setOauthConfigured(status.oauthConfigured);

        if (!status.hasSavedToken) {
          setIsAuthenticated(status.authenticated);
          setGithubUser(status.username);
          return;
        }

        const loginResult = await githubClient.loginWithSavedToken();
        if (!isCurrentAuthRun(run)) return;
        if (loginResult.success && loginResult.authenticated) {
          setIsAuthenticated(true);
          setGithubUser(loginResult.username);
          resetRepositoryPages();
          if (loginResult.tokenPersisted === false) {
            setAuthError(
              loginResult.error || t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad'),
            );
          }
        } else {
          setIsAuthenticated(loginResult.authenticated);
          setGithubUser(loginResult.username);
          if (loginResult.authenticated) resetRepositoryPages();
          if (loginResult.error) setAuthError(loginResult.error);
        }
      } catch (error: unknown) {
        if (!isCurrentAuthRun(run)) return;
        setIsAuthenticated(false);
        setGithubUser(null);
        setAuthError(error instanceof Error ? error.message : t('generated.components.layout.hooks.usegithubdomain.authentication_error_a366cc27'));
      } finally {
        if (isCurrentAuthRun(run)) setIsAuthenticating(false);
        finishAuthRun(run);
      }
    };

    void loginWithSavedToken();
  }, [githubHost, resetRepositoryPages, t]);

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
      clearDevicePolling();
    };
  }, []);

  useEffect(() => {
    const requestId = ++oauthStatusRequestRef.current;
    const fromSettings = (githubOauthClientId || '').trim().length > 0;
    if (fromSettings) {
      setOauthConfigured(true);
      return;
    }

    const refreshOauthStatus = async () => {
      if (!githubClient.isAvailable()) {
        if (requestId === oauthStatusRequestRef.current) setOauthConfigured(false);
        return;
      }

      try {
        const status = await githubClient.getSavedAuthStatus();
        if (requestId === oauthStatusRequestRef.current) setOauthConfigured(status.oauthConfigured);
      } catch {
        if (requestId === oauthStatusRequestRef.current) setOauthConfigured(false);
      }
    };

    void refreshOauthStatus();
  }, [githubOauthClientId, githubHost]);

  const handleTokenLogin = async () => {
    if (!githubClient.isAvailable()) return;
    const token = tokenInput.trim();
    if (!token) return;
    const run = beginAuthRun('token', true);
    if (!run) {
      setAuthError('Eine Anmeldung laeuft bereits.');
      return;
    }

    clearDevicePolling();
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
    setDeviceFlowError(null);
    setWebFlowError(null);

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const authResult = await githubClient.auth(token, githubHost);
      if (!isCurrentAuthRun(run)) return;
      if (authResult.success) {
        setIsAuthenticated(true);
        setTokenInput('');
        const status = await githubClient.checkAuthStatus();
        if (!isCurrentAuthRun(run)) return;
        setGithubUser(status.username);
        resetRepositoryPages();
        if (authResult.tokenPersisted === false) {
          setAuthError(
            authResult.error || t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad'),
          );
        }
      } else {
        setAuthError(authResult.error || t('generated.components.layout.hooks.usegithubdomain.invalid_token_please_check_permissions_73c7b36b'));
      }
    } catch (error: unknown) {
      if (!isCurrentAuthRun(run)) return;
      setAuthError(error instanceof Error ? error.message : t('generated.components.layout.hooks.usegithubdomain.authentication_error_a366cc27'));
    } finally {
      if (isCurrentAuthRun(run)) setIsAuthenticating(false);
      finishAuthRun(run);
    }
  };

  const schedulePoll = (deviceCode: string, intervalSeconds: number, run: AuthRun) => {
    clearDevicePolling();
    pollingRef.current = window.setTimeout(
      async () => {
        if (!isCurrentAuthRun(run) || !githubClient.isAvailable()) return;

        try {
          const pollResult = await githubClient.devicePoll(deviceCode);
          if (!isCurrentAuthRun(run)) return;
          if (!pollResult.success) {
            setIsDeviceFlowRunning(false);
            setDeviceFlowError(pollResult.error || t('generated.components.layout.hooks.usegithubdomain.device_flow_polling_failed_bbf5f761'));
            finishAuthRun(run);
            return;
          }

          const data = pollResult.data as DeviceFlowPollDto;
          if (data.status === 'pending') {
            schedulePoll(deviceCode, data.interval || intervalSeconds, run);
            return;
          }

          if (data.status === 'error') {
            setIsDeviceFlowRunning(false);
            setDeviceFlowError(data.errorDescription || data.error || t('generated.components.layout.hooks.usegithubdomain.device_flow_failed_0da9c84a'));
            finishAuthRun(run);
            return;
          }

          setIsDeviceFlowRunning(false);
          setDeviceFlow(null);
          setDeviceFlowError(null);
          setIsAuthenticated(true);
          setGithubUser(data.username || null);
          resetRepositoryPages();
          if (data.tokenPersisted === false || pollResult.error) {
            setAuthError(
              pollResult.error || t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad'),
            );
          }
          finishAuthRun(run);
        } catch (error: any) {
          if (!isCurrentAuthRun(run)) return;
          setIsDeviceFlowRunning(false);
          setDeviceFlowError(error?.message || t('generated.components.layout.hooks.usegithubdomain.device_flow_polling_failed_bbf5f761'));
          finishAuthRun(run);
        }
      },
      Math.max(2, intervalSeconds) * 1000,
    );
  };

  const handleStartDeviceFlowLogin = async () => {
    if (!githubClient.isAvailable() || !appClient.isAvailable()) return;
    let run = beginAuthRun('device', true);
    if (!run) {
      const activeRun = activeAuthRunRef.current;
      if (activeRun?.kind === 'device') {
        if (githubClient.isAvailable()) {
          void githubClient.cancelAuth().catch((error) => console.error('GitHub authentication cancellation failed:', error));
        }
        invalidateAuthRuns();
        setIsDeviceFlowRunning(false);
        setDeviceFlow(null);
        run = beginAuthRun('device', true);
        if (!run) return;
      } else {
        setDeviceFlowError('Ein Anmeldefluss laeuft bereits.');
        return;
      }
    }

    clearDevicePolling();
    setIsAuthenticating(false);
    setIsDeviceFlowRunning(true);
    setDeviceFlowError(null);
    setAuthError(null);
    setWebFlowError(null);

    try {
      const startResult = await githubClient.deviceStart();
      if (!isCurrentAuthRun(run)) return;
      if (!startResult.success) {
        setIsDeviceFlowRunning(false);
        setDeviceFlowError(startResult.error || t('generated.components.layout.hooks.usegithubdomain.could_not_start_device_flow_4b39f59a'));
        return;
      }

      const flow = startResult.data;
      setDeviceFlow(flow);

      await appClient.openExternalUrl(flow.verificationUri);
      if (!isCurrentAuthRun(run)) return;
      schedulePoll(flow.deviceCode, flow.interval, run);
    } catch (error: any) {
      if (isCurrentAuthRun(run)) {
        setIsDeviceFlowRunning(false);
        setDeviceFlowError(error?.message || t('generated.components.layout.hooks.usegithubdomain.could_not_start_device_flow_4b39f59a'));
      }
    } finally {
      // A successfully started device flow owns the run until polling completes.
      if (isCurrentAuthRun(run) && pollingRef.current === null) {
        setIsDeviceFlowRunning(false);
        finishAuthRun(run);
      }
    }
  };

  const handleStartWebFlowLogin = async () => {
    if (!githubClient.isAvailable()) return;
    const run = beginAuthRun('web', true);
    if (!run) {
      setWebFlowError('Ein Anmeldefluss laeuft bereits.');
      return;
    }

    clearDevicePolling();
    setIsAuthenticating(false);
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
    setDeviceFlowError(null);
    setAuthError(null);
    setWebFlowError(null);
    setIsWebFlowRunning(true);

    try {
      const loginResult = await githubClient.webLogin();
      if (!isCurrentAuthRun(run)) return;
      if (!loginResult.success) {
        const message = loginResult.error || t('generated.components.layout.hooks.usegithubdomain.github_one_click_login_failed_b976a360');
        setWebFlowError(message);
        if (message !== 'GitHub-Anmeldung wurde abgebrochen.') onError?.(message);
        return;
      }

      setIsAuthenticated(true);
      setGithubUser(loginResult.data.username || null);
      setTokenInput('');
      resetRepositoryPages();
      if (loginResult.data.tokenPersisted === false || loginResult.error) {
        setAuthError(
          loginResult.error || t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad'),
        );
      }
    } catch (error: any) {
      if (!isCurrentAuthRun(run)) return;
      const message = error?.message || t('generated.components.layout.hooks.usegithubdomain.github_one_click_login_failed_b976a360');
      setWebFlowError(message);
      onError?.(message);
    } finally {
      if (isCurrentAuthRun(run)) setIsWebFlowRunning(false);
      finishAuthRun(run);
    }
  };

  const handleCancelAuthentication = () => {
    const activeRun = activeAuthRunRef.current;
    if (!activeRun || activeRun.kind === 'logout') return;
    if (githubClient.isAvailable()) {
      void githubClient.cancelAuth().catch((error) => console.error('GitHub authentication cancellation failed:', error));
    }
    invalidateAuthRuns();
    setIsAuthenticating(false);
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
    setIsWebFlowRunning(false);
  };

  const handleCancelDeviceFlow = () => {
    if (activeAuthRunRef.current?.kind !== 'device') return;
    handleCancelAuthentication();
  };

  const handleLogout = async () => {
    if (!(await confirmWorkingDirectoryNavigation({ kind: 'view', label: 'GitHub login' }))) return;
    invalidateAuthRuns();
    const run = beginAuthRun('logout');
    if (!run) return;
    clearDevicePolling();
    setIsAuthenticating(true);
    setIsDeviceFlowRunning(false);
    setDeviceFlow(null);
    setIsWebFlowRunning(false);
    setWebFlowError(null);

    try {
      if (githubClient.isAvailable()) {
        const result = await githubClient.logout();
        if (!isCurrentAuthRun(run)) return;
        if (!result.success) {
          if (result.sessionCleared) {
            setIsAuthenticated(false);
            setGithubUser(null);
            setTokenInput('');
            resetRepositoryPages({ clearRepos: true });
          }
          setAuthError(result.error);
          return;
        }
      }
      if (!isCurrentAuthRun(run)) return;
      setIsAuthenticated(false);
      setGithubUser(null);
      setTokenInput('');
      resetRepositoryPages({ clearRepos: true });
    } catch (e) {
      console.error('GitHub logout failed:', e);
      if (isCurrentAuthRun(run)) setAuthError(e instanceof Error ? e.message : 'GitHub logout failed.');
    } finally {
      if (isCurrentAuthRun(run)) {
        setIsAuthenticating(false);
        finishAuthRun(run);
      }
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
    handleCancelAuthentication,
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
