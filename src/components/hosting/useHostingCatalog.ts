import { useEffect, useRef, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import type { HostedRepository, HostingPage, HostingProvider } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { migrateHostingPins, readHostingPins, writeHostingPins } from './hostingPinStore';
import { useLocalHostingRepositories } from './useLocalHostingRepositories';
import { useHostingTask } from './useHostingTask';

export function useHostingCatalog() {
  const { connections, connectionFilter, revision, setConnections } = useHostingState();
  const activeRepo = useGitStore((s) => s.activeRepo);
  const openRepos = useGitStore((s) => s.openRepos);
  const onSwitchRepo = useGitStore((s) => s.onSwitchRepo);
  const onOpenRepo = useGitStore((s) => s.onAddRepo);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const clones = useLocalHostingRepositories(openRepos, connections, revision);
  const task = useHostingTask(`${connectionFilter}/${revision}/${activeRepo ?? ''}`);
  const { run, setError } = task;
  const [pages, setPages] = useState<Record<string, HostingPage<HostedRepository>>>({});
  const [providerFilter, setProviderFilter] = useState<HostingProvider | ''>('');
  const [search, setSearch] = useState('');
  const [pins, setPins] = useState(readHostingPins);
  const lifecycle = useRef({ generation: 0 }).current;
  useEffect(() => {
    let active = true;
    void hostingClient
      .request('connections', undefined)
      .then((next) => {
        if (active) setConnections(next);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [revision, setConnections, setError]);
  useEffect(() => {
    const current = ++lifecycle.generation;
    const selected = connections.filter((c) => (c.authenticated || c.hasCredentials) && (!connectionFilter || c.id === connectionFilter));
    if (!selected.length) {
      setPages({});
      return;
    }
    void run(async () => {
      const results = await Promise.allSettled(selected.map((c) => hostingClient.request('repositories', { connectionId: c.id })));
      if (current !== lifecycle.generation) return;
      const next: Record<string, HostingPage<HostedRepository>> = {};
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[selected[index].id] = result.value;
        else errors.push(`${selected[index].label}: ${String(result.reason)}`);
      });
      setPages(next);
      setPins(
        migrateHostingPins(
          connections,
          Object.values(next).flatMap((page) => page.items),
        ),
      );
      if (errors.length) setError(errors.join('\n'));
    });
    return () => {
      lifecycle.generation++;
    };
  }, [connections, connectionFilter, revision, lifecycle, run, setError]);
  const repositories = Object.values(pages)
    .flatMap((page) => page.items)
    .filter((repo) => {
      const connection = connections.find((c) => c.id === repo.ref.connectionId);
      return (
        Boolean(connection && (connection.authenticated || connection.hasCredentials)) &&
        (!providerFilter || connection?.provider === providerFilter) &&
        `${repo.fullName} ${repo.description ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      );
    })
    .sort((a, b) => Number(pins.includes(hostedRepositoryKey(b))) - Number(pins.includes(hostedRepositoryKey(a))) || a.fullName.localeCompare(b.fullName));
  const togglePin = (repo: HostedRepository) => {
    const key = hostedRepositoryKey(repo);
    const next = pins.includes(key) ? pins.filter((p) => p !== key) : [...pins, key];
    setPins(next);
    writeHostingPins(next);
  };
  const activateLocal = (path: string) =>
    void task.run(
      () => onSwitchRepo(path),
      (opened) => {
        if (opened) setActiveTab('repo');
      },
    );
  const clone = (repo: HostedRepository, useSsh = false) =>
    void task.run(
      async () => {
        const parent = await appClient.selectProjectParentDirectory();
        if (!parent) return;
        return hostingClient.request('clone', { repository: repo.ref, targetDir: parent, targetName: repo.name, useSsh });
      },
      (result) => {
        if (result)
          void onOpenRepo(result.path)
            .then((opened) => {
              if (opened) setActiveTab('repo');
            })
            .catch((error: Error) => setError(error.message));
      },
    );
  const loadMore = (connectionId: string, cursor: string) =>
    void task.run(
      () => hostingClient.request('repositories', { connectionId, cursor }),
      (next) => setPages((current) => ({ ...current, [connectionId]: { ...next, items: [...(current[connectionId]?.items ?? []), ...next.items] } })),
    );
  return {
    repositories,
    pages,
    connections,
    clones,
    task,
    pins,
    togglePin,
    activateLocal,
    clone,
    loadMore,
    providerFilter,
    setProviderFilter,
    search,
    setSearch,
  };
}
