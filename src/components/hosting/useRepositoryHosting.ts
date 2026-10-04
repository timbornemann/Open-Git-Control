import { useEffect, useState } from 'react';
import { hostingClient, transferClient } from '@/services/hostingClient';
import type { HostedRepository, RepositoryEndpoint } from '@/types/hostingDtos';
import { useHostingState } from './hostingState';

/** Remote identity is adapter-owned; ambiguous accounts require an explicit selection. */
export function useRepositoryHosting(repoPath: string | null) {
  const { connections, revision } = useHostingState();
  const [endpoints, setEndpoints] = useState<RepositoryEndpoint[]>([]);
  const [repository, setRepository] = useState<HostedRepository | null>(null);
  const [remoteName, setRemoteName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setRepository(null);
    setRemoteName('');
    setEndpoints([]);
    setError(null);
    if (!repoPath) return;
    setLoading(true);
    void (async () => {
      const [snapshot, prefs] = await Promise.all([transferClient.request('getRemotes', { repoPath }), transferClient.request('getPreferences', { repoPath })]);
      const found: RepositoryEndpoint[] = [];
      for (const remote of snapshot.remotes) {
        for (const url of [...new Set([...remote.fetchUrls, ...remote.pushUrls])]) {
          const binding = prefs.bindings?.find((b) => b.remoteName === remote.name && b.url === url);
          if (binding?.repository) {
            found.push(binding);
            continue;
          }
          const results = await Promise.allSettled(
            connections
              .filter((c) => c.authenticated)
              .map(async (connection) => {
                const resolved = await hostingClient.request('resolveRepository', { connectionId: connection.id, url });
                return resolved ? { remoteName: remote.name, url, repository: resolved.ref } : null;
              }),
          );
          for (const result of results) if (result.status === 'fulfilled' && result.value) found.push(result.value);
        }
      }
      if (!active) return;
      setEndpoints(found);
      const preferred = found.find(
        (e) =>
          e.remoteName === prefs.hostingRemote &&
          e.repository?.connectionId === prefs.hostingRepository?.connectionId &&
          e.repository?.repositoryId === prefs.hostingRepository?.repositoryId &&
          e.repository?.fullPath === prefs.hostingRepository?.fullPath,
      );
      const distinct = found.filter(
        (e, index) =>
          found.findIndex(
            (other) =>
              other.remoteName === e.remoteName &&
              other.repository?.connectionId === e.repository?.connectionId &&
              other.repository?.repositoryId === e.repository?.repositoryId &&
              other.repository?.fullPath === e.repository?.fullPath,
          ) === index,
      );
      const selected = preferred ?? (distinct.length === 1 ? distinct[0] : null);
      if (selected?.repository) {
        const resolved = await hostingClient.request('repository', { repository: selected.repository });
        if (active) {
          setRepository(resolved);
          setRemoteName(selected.remoteName);
        }
      }
    })()
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repoPath, connections, revision]);
  const choose = async (endpoint: RepositoryEndpoint) => {
    if (!repoPath || !endpoint.repository) return;
    const capturedPath = repoPath;
    const prefs = await transferClient.request('getPreferences', { repoPath: capturedPath });
    await transferClient.request('setPreferences', {
      repoPath: capturedPath,
      preferences: {
        ...prefs,
        hostingRemote: endpoint.remoteName,
        hostingRepository: endpoint.repository,
        bindings: [...(prefs.bindings ?? []).filter((b) => b.remoteName !== endpoint.remoteName || b.url !== endpoint.url), endpoint],
      },
    });
    useHostingState.getState().refresh();
  };
  return { endpoints, repository, remoteName, loading, error, choose };
}
