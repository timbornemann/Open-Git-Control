import { useCallback, useEffect, useRef, useState } from 'react';
import { githubClient } from '@/services/githubClient';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { GITHUB_CATALOG_REFRESH_EVENT } from '@/components/layout/sidebar/containers/GithubSidebarContainer';

export function useGithubCatalog(isAuthenticated: boolean, username: string | null) {
  const [repos, setRepos] = useState<GitHubRepositoryDto[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [account, setAccount] = useState<{ host: string; username: string } | null>(null);
  const generation = useRef(0);

  const loadSnapshot = useCallback(async () => {
    if (!githubClient.isAvailable()) return;
    const request = generation.current;
    try {
      const result = await githubClient.getCatalogSnapshot();
      if (request !== generation.current) return;
      if (result.success) {
        setRepos(result.data?.repos || []);
        setSavedAt(result.data?.savedAt || null);
        setAccount(result.data ? { host: result.data.host, username: result.data.username } : null);
        setOffline(true);
      }
    } catch {
      // The online request below still has a chance to succeed.
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !githubClient.isAvailable()) return;
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    setLoadedCount(0);
    const collected: GitHubRepositoryDto[] = [];
    try {
      for (let page = 1; page <= 1000; page += 1) {
        const response = await githubClient.getRepositories({ page, perPage: 100 });
        if (request !== generation.current) return;
        if (!response.success) throw new Error(response.error || 'Repositories konnten nicht geladen werden.');
        collected.push(...response.data.repos);
        setLoadedCount(collected.length);
        if (!response.data.hasMore || !response.data.nextPage) break;
        if (page === 1000) throw new Error('Der Repo-Katalog ist zu groß, um vollständig geladen zu werden.');
      }
      if (request !== generation.current) return;
      const unique = [...new Map(collected.map((repo) => [repo.id, repo])).values()];
      setRepos(unique);
      setOffline(false);
      const host = unique[0] ? new URL(unique[0].htmlUrl).host : 'github.com';
      setAccount({ host, username: username || '' });
      const snapshot = await githubClient.saveCatalogSnapshot(unique);
      if (request === generation.current) setSavedAt(snapshot.success ? snapshot.data.savedAt : new Date().toISOString());
    } catch (caught) {
      if (request !== generation.current) return;
      setError(caught instanceof Error ? caught.message : 'Repositories konnten nicht geladen werden.');
      setOffline(true);
      await loadSnapshot();
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [isAuthenticated, loadSnapshot, username]);

  useEffect(() => {
    setRepos([]);
    setAccount(null);
    setSavedAt(null);
    setLoadedCount(0);
    setError(null);
    setOffline(true);
    if (isAuthenticated) {
      void refresh();
    } else {
      generation.current += 1;
      setLoading(false);
      setOffline(true);
      void loadSnapshot();
    }
    return () => {
      generation.current += 1;
    };
  }, [isAuthenticated, loadSnapshot, refresh]);

  useEffect(() => {
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener(GITHUB_CATALOG_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GITHUB_CATALOG_REFRESH_EVENT, onRefresh);
  }, [refresh]);

  return { repos, savedAt, loading, offline, error, loadedCount, account, refresh, setRepos };
}
