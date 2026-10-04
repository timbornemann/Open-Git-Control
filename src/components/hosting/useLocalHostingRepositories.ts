import { useEffect, useState } from 'react';
import { hostingClient, transferClient } from '@/services/hostingClient';
import type { HostedRepositoryRef, HostingConnection } from '@/types/hostingDtos';

export const localRepositoryKey = (ref: HostedRepositoryRef) => `${ref.connectionId}:${ref.repositoryId}:${ref.fullPath}`;
export function useLocalHostingRepositories(openRepos: string[], connections: HostingConnection[], revision: number) {
  const [clones, setClones] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let active = true;
    void (async () => {
      const found: Record<string, string[]> = {};
      let nextIndex = 0;
      const next = async () => {
        while (nextIndex < openRepos.length) {
          const repoPath = openRepos[nextIndex++];
          try {
            const [snapshot, preferences] = await Promise.all([
              transferClient.request('getRemotes', { repoPath }),
              transferClient.request('getPreferences', { repoPath }),
            ]);
            const add = (ref: HostedRepositoryRef) => {
              const key = localRepositoryKey(ref);
              found[key] = [...new Set([...(found[key] ?? []), repoPath])];
            };
            for (const remote of snapshot.remotes)
              for (const url of [...new Set([...remote.fetchUrls, ...remote.pushUrls])]) {
                const binding = preferences.bindings?.find((b) => b.remoteName === remote.name && b.url === url)?.repository;
                if (binding) {
                  add(binding);
                  continue;
                }
                const results = await Promise.allSettled(
                  connections.filter((c) => c.authenticated).map((c) => hostingClient.request('resolveRepository', { connectionId: c.id, url })),
                );
                for (const result of results) if (result.status === 'fulfilled' && result.value) add(result.value.ref);
              }
          } catch {
            /* Unavailable local paths stay in the local repository area. */
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, openRepos.length) }, next));
      if (active) setClones(found);
    })();
    return () => {
      active = false;
    };
  }, [openRepos, connections, revision]);
  return clones;
}
