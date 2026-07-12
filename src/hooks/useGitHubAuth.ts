import { useCallback, useEffect, useRef, useState } from 'react';
import { githubClient } from '@/services/githubClient';

type Params = {
  onAuthChanged?: (authenticated: boolean) => void;
};

type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  cloneUrl: string;
  htmlUrl: string;
};

export const useGitHubAuth = ({ onAuthChanged }: Params = {}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authGenerationRef = useRef(0);
  const activeAuthOperationRef = useRef<number | null>(null);

  useEffect(() => {
    const loginWithSavedToken = async () => {
      if (!githubClient.isAvailable()) return;
      const operationId = ++authGenerationRef.current;
      activeAuthOperationRef.current = operationId;
      const isCurrentOperation = () => authGenerationRef.current === operationId && activeAuthOperationRef.current === operationId;

      setIsAuthenticating(true);
      try {
        const status = await githubClient.getSavedAuthStatus();
        if (!isCurrentOperation()) return;
        if (!status.hasSavedToken) {
          setIsAuthenticated(status.authenticated);
          setGithubUser(status.username);
          onAuthChanged?.(status.authenticated);
          return;
        }

        const loginResult = await githubClient.loginWithSavedToken();
        if (!isCurrentOperation()) return;
        if (loginResult.success && loginResult.authenticated) {
          setIsAuthenticated(true);
          setGithubUser(loginResult.username);
          onAuthChanged?.(true);
          const reposResult = await githubClient.getRepositories();
          if (isCurrentOperation() && reposResult.success) setGithubRepos(reposResult.data.repos || []);
        } else {
          setIsAuthenticated(false);
          setGithubUser(null);
          onAuthChanged?.(false);
        }
      } catch {
        if (!isCurrentOperation()) return;
        setIsAuthenticated(false);
        setGithubUser(null);
        onAuthChanged?.(false);
      } finally {
        if (isCurrentOperation()) {
          activeAuthOperationRef.current = null;
          setIsAuthenticating(false);
        }
      }
    };

    void loginWithSavedToken();
    return () => {
      authGenerationRef.current += 1;
      activeAuthOperationRef.current = null;
    };
  }, [onAuthChanged]);

  const handleTokenLogin = useCallback(async () => {
    if (!githubClient.isAvailable()) return;
    const token = tokenInput.trim();
    if (!token) return;
    if (activeAuthOperationRef.current !== null) return;
    const operationId = ++authGenerationRef.current;
    activeAuthOperationRef.current = operationId;
    const isCurrentOperation = () => authGenerationRef.current === operationId && activeAuthOperationRef.current === operationId;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const success = await githubClient.auth(token);
      if (!isCurrentOperation()) return;
      if (!success.success) {
        setAuthError('Token ungültig. Bitte prüfe die Berechtigungen.');
        return;
      }

      setIsAuthenticated(true);
      onAuthChanged?.(true);
      setTokenInput('');
      if (success.tokenPersisted === false) {
        setAuthError(success.error || 'OS encryption is not available; the token was not persisted.');
      }
      const status = await githubClient.checkAuthStatus();
      if (!isCurrentOperation()) return;
      setGithubUser(status.username);
      const result = await githubClient.getRepositories();
      if (isCurrentOperation() && result.success) setGithubRepos(result.data.repos || []);
    } catch {
      if (!isCurrentOperation()) return;
      setAuthError('Fehler bei der Authentifizierung.');
    } finally {
      if (isCurrentOperation()) {
        activeAuthOperationRef.current = null;
        setIsAuthenticating(false);
      }
    }
  }, [onAuthChanged, tokenInput]);

  const handleLogout = useCallback(async () => {
    const operationId = ++authGenerationRef.current;
    activeAuthOperationRef.current = operationId;
    const isCurrentOperation = () => authGenerationRef.current === operationId && activeAuthOperationRef.current === operationId;
    setIsAuthenticating(true);
    try {
      if (githubClient.isAvailable()) {
        const result = await githubClient.logout();
        if (!isCurrentOperation()) return;
        if (!result.success) {
          if (result.sessionCleared) {
            setIsAuthenticated(false);
            onAuthChanged?.(false);
            setGithubUser(null);
            setGithubRepos([]);
            setTokenInput('');
          }
          setAuthError(result.error);
          return;
        }
      }
      if (!isCurrentOperation()) return;
      setIsAuthenticated(false);
      onAuthChanged?.(false);
      setGithubUser(null);
      setGithubRepos([]);
      setTokenInput('');
    } catch (error) {
      console.error('GitHub logout failed:', error);
      if (isCurrentOperation()) setAuthError(error instanceof Error ? error.message : 'GitHub logout failed.');
    } finally {
      if (isCurrentOperation()) {
        activeAuthOperationRef.current = null;
        setIsAuthenticating(false);
      }
    }
  }, [onAuthChanged]);

  return {
    isAuthenticated,
    githubUser,
    githubRepos,
    tokenInput,
    setTokenInput,
    isAuthenticating,
    authError,
    handleTokenLogin,
    handleLogout,
  };
};
