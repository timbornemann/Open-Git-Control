import { useEffect, useState } from 'react';
import { hostingClient, transferClient } from '@/services/hostingClient';
import { useCachedRepoOrigins } from '@/hooks/useRepoOrigins';
import type { HostedRepository, HostedRepositoryRef, HostingConnection } from '@/types/hostingDtos';

export const localRepositoryKey = (ref: HostedRepositoryRef) => `${ref.connectionId}:${ref.repositoryId}:${ref.fullPath}`;
type PathRefs = { refs: HostedRepositoryRef[]; urls: string[] };
type LocalRefs = { scope: string; paths: Record<string, PathRefs> };

export function useLocalHostingRepositories(openRepos: string[], connections: HostingConnection[], revision: number, catalog: HostedRepository[] = []) {
  const origins = useCachedRepoOrigins(openRepos);
  const scope = JSON.stringify([
    openRepos,
    connections.map((c) => [c.id, c.provider, c.baseUrl, c.userId, c.username, c.authenticated, c.hasCredentials]),
    catalog.map((repo) => [localRepositoryKey(repo.ref), repo.cloneUrl, repo.sshUrl]).sort(),
    revision,
  ]);
  const [resolved, setResolved] = useState<LocalRefs>({ scope: '', paths: {} });
  useEffect(() => {
    let active = true;
    const paths: Record<string, PathRefs> = {};
    const accounts = connections.filter((c) => c.authenticated || c.hasCredentials);
    const publish = (path: string, refs: HostedRepositoryRef[]) => {
      if (!active) return;
      paths[path] = { refs: [...new Map(refs.map((ref) => [localRepositoryKey(ref), ref])).values()], urls: paths[path]?.urls ?? [] };
      setResolved({ scope, paths: { ...paths } });
    };
    let nextIndex = 0;
    const next = async () => {
      while (active && nextIndex < openRepos.length) {
        const repoPath = openRepos[nextIndex++];
        try {
          const [snapshot, preferences] = await Promise.all([
            transferClient.request('getRemotes', { repoPath }),
            transferClient.request('getPreferences', { repoPath }),
          ]);
          if (!active) return;
          paths[repoPath] = { refs: [], urls: [...new Set(snapshot.remotes.flatMap((remote) => [...remote.fetchUrls, ...remote.pushUrls]))] };
          const refs: HostedRepositoryRef[] = [];
          const unresolved: Array<{ connectionId: string; url: string }> = [];
          const urls = new Map<string, { connectionId: string; url: string }>();
          for (const remote of snapshot.remotes) {
            for (const url of new Set([...remote.fetchUrls, ...remote.pushUrls])) {
              const binding = preferences.bindings?.find((b) => b.remoteName === remote.name && b.url === url)?.repository;
              if (binding && accounts.some((c) => c.id === binding.connectionId)) refs.push(binding);
              else for (const account of accounts) urls.set(JSON.stringify([account.id, url]), { connectionId: account.id, url });
            }
          }
          await Promise.all(
            [...urls.values()].map(async (input) => {
              const cached = await hostingClient.request('resolveRepository', { ...input, cachedOnly: true }).catch(() => null);
              if (cached) refs.push(cached.ref);
              else if (accounts.find((c) => c.id === input.connectionId)?.authenticated) unresolved.push(input);
            }),
          );
          publish(repoPath, refs);
          // Online discovery never holds back other local paths or logos.
          for (const input of unresolved) {
            void hostingClient
              .request('resolveRepository', input)
              .then((repository) => {
                if (repository) publish(repoPath, [...(paths[repoPath]?.refs ?? []), repository.ref]);
              })
              .catch(() => {});
          }
        } catch {
          publish(repoPath, []);
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, openRepos.length) }, next));
    return () => {
      active = false;
    };
  }, [openRepos, connections, revision, scope]);
  const clones: Record<string, string[]> = {};
  for (const path of openRepos) {
    const verified = resolved.scope === scope ? resolved.paths[path] : undefined;
    // Bootstrap restores origins from disk. Exact provider-returned clone URLs
    // can seed the view until adapter-owned live remote checks complete.
    const urls = verified?.urls ?? (origins[path] ? [origins[path]!] : []);
    const refs = [
      ...(verified?.refs ?? []),
      ...catalog.filter((repo) => urls.some((url) => [repo.cloneUrl, repo.sshUrl].includes(url))).map((repo) => repo.ref),
    ];
    for (const ref of refs) {
      if (!connections.some((c) => c.id === ref.connectionId && (c.authenticated || c.hasCredentials))) continue;
      const key = localRepositoryKey(ref);
      clones[key] = [...new Set([...(clones[key] ?? []), path])];
    }
  }
  return clones;
}
