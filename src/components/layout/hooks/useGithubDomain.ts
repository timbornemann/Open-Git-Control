import { useEffect, useRef, useState, useCallback } from 'react';
import type { DeviceFlowPollDto, DeviceFlowStartDto, GitHubRepositoryDto } from '@/types/githubDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';

type Params = {
  onRepoCloned: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: 'localRepos' | 'repo' | 'github' | 'settings') => void;
  language: AppLanguage;
  githubOauthClientId: string;
  githubHost: string;
};

const deriveRepoNameFromCloneSource = (cloneSource: string): string => {
  const normalizedSource = String(cloneSource || '').trim();
  if (!normalizedSource) return 'repository';

  const withoutProtocol = normalizedSource.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const normalizedPath = withoutProtocol
    .replace(/^git@[^:]+:/i, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const lastSegment = normalizedPath.split('/').pop() || 'repository';
  return lastSegment || 'repository';
};

export const useGithubDomain = ({ onRepoCloned, setActiveTab, language, githubOauthClientId, githubHost }: Params) => {
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
  const [isWebFlowRunning, setIsWebFlowRunning] = useState(false);
  const [webFlowError, setWebFlowError] = useState<string | null>(null);

  const pollingRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const initializedHostRef = useRef<string | null>(null);
  const hasLoadedReposOnceRef = useRef(false);
  const currentRepoSearchRef = useRef('');

  const [isCloning, setIsCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [cloneRepoName, setCloneRepoName] = useState<string | null>(null);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [nextRepoPage, setNextRepoPage] = useState<number | null>(1);
  const [githubReposHasMore, setGithubReposHasMore] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingMoreRepos, setIsLoadingMoreRepos] = useState(false);

  const { t } = useLanguageTranslations(language);

  const clearDevicePolling = () => {
    if (pollingRef.current !== null) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const fetchReposPage = useCallback(
    async (mode: 'reset' | 'append', page: number, search: string) => {
      if (!githubClient.isAvailable() || !isAuthenticated) return;

      const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

      if (mode === 'reset') {
        setIsLoadingRepos(true);
      } else {
        setIsLoadingMoreRepos(true);
      }

      try {
        const result = await githubClient.getRepositories({
          page: safePage,
          perPage: 50,
          search,
        });

        if (!result.success) {
          throw new Error(result.error || t('generated.components.layout.hooks.usegithubdomain.could_not_load_repositories_cec34760'));
        }

        const payload = result.data;
        const repos = payload?.repos || [];
        setNextRepoPage(payload?.nextPage || null);
        setGithubReposHasMore(Boolean(payload?.hasMore && payload?.nextPage));

        if (mode === 'reset') {
          setGithubRepos(repos);
        } else {
          setGithubRepos((prev) => {
            const map = new Map<number, GitHubRepositoryDto>();
            for (const repo of prev) map.set(repo.id, repo);
            for (const repo of repos) map.set(repo.id, repo);
            return [...map.values()];
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (mode === 'reset') {
          setIsLoadingRepos(false);
        } else {
          setIsLoadingMoreRepos(false);
        }
      }
    },
    [isAuthenticated, t],
  );

  const refreshRepos = useCallback(
    async (searchOverride?: string) => {
      const search = typeof searchOverride === 'string' ? searchOverride : currentRepoSearchRef.current;
      currentRepoSearchRef.current = search;
      setNextRepoPage(1);
      await fetchReposPage('reset', 1, search);
    },
    [fetchReposPage],
  );

  const loadMoreRepos = useCallback(async () => {
    if (isLoadingMoreRepos || !githubReposHasMore || !nextRepoPage) return;
    await fetchReposPage('append', nextRepoPage, currentRepoSearchRef.current);
  }, [fetchReposPage, githubReposHasMore, isLoadingMoreRepos, nextRepoPage]);

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
          setNextRepoPage(1);
          setGithubReposHasMore(false);
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
  }, [githubHost]);

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

  useEffect(() => {
    if (!isAuthenticated) {
      hasLoadedReposOnceRef.current = false;
      currentRepoSearchRef.current = '';
      return;
    }

    if (hasLoadedReposOnceRef.current) return;

    hasLoadedReposOnceRef.current = true;
    void refreshRepos('');
  }, [isAuthenticated, refreshRepos]);

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
        setNextRepoPage(1);
        setGithubReposHasMore(false);
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
          setNextRepoPage(1);
          setGithubReposHasMore(false);
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
      setNextRepoPage(1);
      setGithubReposHasMore(false);
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
      setGithubRepos([]);
      setTokenInput('');
      setNextRepoPage(1);
      setGithubReposHasMore(false);
      setIsLoadingRepos(false);
      setIsLoadingMoreRepos(false);
      hasLoadedReposOnceRef.current = false;
      currentRepoSearchRef.current = '';
    }
  };

  const cloneRepository = useCallback(
    async (
      cloneUrl: string,
      options: {
        repoName?: string;
        targetDir?: string | null;
        targetName?: string;
        switchToRepoTab?: boolean;
      } = {},
    ): Promise<boolean> => {
      if (!gitClient.isAvailable() || !appClient.isAvailable()) return false;
      const normalizedCloneUrl = String(cloneUrl || '').trim();
      if (!normalizedCloneUrl) {
        setCloneError(t('generated.components.layout.hooks.usegithubdomain.clone_url_is_required_f633ac79'));
        return false;
      }
      const targetDir = options.targetDir ?? (await appClient.selectDirectory());
      if (!targetDir) return false;

      setIsCloning(true);
      setCloneLog([]);
      setCloneRepoName(options.repoName || options.targetName || deriveRepoNameFromCloneSource(normalizedCloneUrl));
      setCloneFinished(false);
      setCloneError(null);

      const cleanup = gitClient.onCloneProgress((line: string) => {
        setCloneLog((prev) => [...prev, line]);
      });

      try {
        const result = await gitClient.gitClone(normalizedCloneUrl, targetDir, options.targetName);
        if (result.success) {
          setCloneFinished(true);
          setCloneLog((prev) => [
            ...prev,
            `SUCCESS: ${t('generated.components.layout.hooks.usegithubdomain.repository_cloned_successfully_to_667ce18e')}: ${result.repoPath}`,
          ]);
          await onRepoCloned(result.repoPath);
          if (options.switchToRepoTab !== false) {
            setActiveTab('repo');
          }
          return true;
        } else {
          const errorMessage = result.error || t('generated.components.layout.hooks.usegithubdomain.unknown_error_2e5d0f05');
          setCloneError(errorMessage);
          setCloneLog((prev) => [...prev, `ERROR: ${errorMessage}`]);
          return false;
        }
      } catch (e: any) {
        setCloneError(e.message);
        setCloneLog((prev) => [...prev, `ERROR: ${e.message}`]);
        return false;
      } finally {
        cleanup();
        setIsCloning(false);
      }
    },
    [onRepoCloned, setActiveTab, t],
  );

  const handleClone = useCallback(
    async (cloneUrl: string, repoName: string) => {
      await cloneRepository(cloneUrl, { repoName });
    },
    [cloneRepository],
  );

  const closeCloneProgress = useCallback(() => {
    setIsCloning(false);
    setCloneFinished(false);
    setCloneError(null);
    setCloneLog([]);
    setCloneRepoName(null);
  }, []);

  return {
    isAuthenticated,
    setIsAuthenticated,
    githubUser,
    setGithubUser,
    githubRepos,
    setGithubRepos,
    githubReposHasMore,
    isLoadingRepos,
    isLoadingMoreRepos,
    loadMoreRepos,
    refreshRepos,
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

    isCloning,
    setIsCloning,
    closeCloneProgress,
    cloneLog,
    cloneRepoName,
    cloneFinished,
    cloneError,
    cloneRepository,
    handleClone,
  };
};
