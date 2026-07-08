import { useCallback, useEffect, useState } from 'react';
import { githubClient } from '../services/githubClient';

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

  useEffect(() => {
    const loginWithSavedToken = async () => {
      if (!githubClient.isAvailable()) return;

      setIsAuthenticating(true);
      try {
        const status = await githubClient.getSavedAuthStatus();
        if (!status.hasSavedToken) {
          setIsAuthenticated(status.authenticated);
          setGithubUser(status.username);
          onAuthChanged?.(status.authenticated);
          return;
        }

        const loginResult = await githubClient.loginWithSavedToken();
        if (loginResult.success && loginResult.authenticated) {
          setIsAuthenticated(true);
          setGithubUser(loginResult.username);
          onAuthChanged?.(true);
          const reposResult = await githubClient.getRepositories();
          if (reposResult.success) setGithubRepos(reposResult.data.repos || []);
        } else {
          setIsAuthenticated(false);
          setGithubUser(null);
          onAuthChanged?.(false);
        }
      } catch {
        setIsAuthenticated(false);
        setGithubUser(null);
        onAuthChanged?.(false);
      } finally {
        setIsAuthenticating(false);
      }
    };

    loginWithSavedToken();
  }, [onAuthChanged]);

  const handleTokenLogin = useCallback(async () => {
    if (!githubClient.isAvailable()) return;
    const token = tokenInput.trim();
    if (!token) return;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const success = await githubClient.auth(token);
      if (!success) {
        setAuthError('Token ungültig. Bitte prüfe die Berechtigungen.');
        return;
      }

      setIsAuthenticated(true);
      onAuthChanged?.(true);
      setTokenInput('');
      const status = await githubClient.checkAuthStatus();
      setGithubUser(status.username);
      const result = await githubClient.getRepositories();
      if (result.success) setGithubRepos(result.data.repos || []);
    } catch {
      setAuthError('Fehler bei der Authentifizierung.');
    } finally {
      setIsAuthenticating(false);
    }
  }, [onAuthChanged, tokenInput]);

  const handleLogout = useCallback(async () => {
    try {
      if (githubClient.isAvailable()) {
        await githubClient.logout();
      }
    } catch (error) {
      console.error('GitHub logout failed:', error);
    } finally {
      setIsAuthenticated(false);
      onAuthChanged?.(false);
      setGithubUser(null);
      setGithubRepos([]);
      setTokenInput('');
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

