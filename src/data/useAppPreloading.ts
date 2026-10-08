import { useEffect, useLayoutEffect, useRef } from 'react';
import { preloadRepository } from './preloading';
import { preload, resourceKey } from './clientCache';
import { gitClient } from '@/services/gitClient';
import { plannerClient } from '@/services/plannerClient';
import { cacheDiagnostics, queryClient } from './queryClient';
import { viewModules } from './viewModules';
import { useGitAvailable } from '@/app/state/systemToolsStore';

export function useAppPreloading(activeRepo: string | null, openRepos: string[], tab: string, showSecondaryHistory: boolean) {
  const gitReady = useGitAvailable();
  const navigation = useRef({ tab, started: performance.now() });
  if (navigation.current.tab !== tab) navigation.current = { tab, started: performance.now() };
  useLayoutEffect(() => {
    const prepared =
      tab in viewModules &&
      viewModules[tab as keyof typeof viewModules].isReady() &&
      (tab === 'hosting'
        ? queryClient
            .getQueryCache()
            .getAll()
            .some((entry) => entry.queryKey[0] === 'hosting')
        : tab === 'planner'
          ? queryClient.getQueryData(resourceKey('planner', 'getData')) !== undefined
          : true);
    const frame = requestAnimationFrame(() => {
      if (!prepared) return;
      cacheDiagnostics.navigationMs.push(performance.now() - navigation.current.started);
      if (cacheDiagnostics.navigationMs.length > 100) cacheDiagnostics.navigationMs.shift();
    });
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  useEffect(() => {
    if (tab in viewModules) void viewModules[tab as keyof typeof viewModules].preload().catch(() => {});
    if (tab === 'planner') void plannerClient.getData().catch(() => {});
  }, [tab]);
  useEffect(() => {
    if (gitReady && activeRepo) preloadRepository(activeRepo, showSecondaryHistory);
  }, [gitReady, activeRepo, showSecondaryHistory]);
  useEffect(() => {
    if (gitReady) for (const repo of openRepos) void preload(() => gitClient.getRepoOriginUrl(repo), 'startup');
  }, [gitReady, openRepos]);
}
