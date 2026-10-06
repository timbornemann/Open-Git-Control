import { useEffect, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import type { HostedRepository, HostingProvider } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { migrateHostingPins, readHostingPins, writeHostingPins } from './hostingPinStore';
import { useLocalHostingRepositories } from './useLocalHostingRepositories';
import { useHostingTask } from './useHostingTask';
import { useHostingCatalogPages } from './useHostingCatalogPages';

export function useHostingCatalog() {
  const { connections, connectionFilter, revision, setConnections } = useHostingState();
  const activeRepo = useGitStore((s) => s.activeRepo);
  const openRepos = useGitStore((s) => s.openRepos);
  const onSwitchRepo = useGitStore((s) => s.onSwitchRepo);
  const onOpenRepo = useGitStore((s) => s.onAddRepo);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const task = useHostingTask(`${connectionFilter}/${revision}/${activeRepo ?? ''}`);
  const { setError } = task;
  const { pages, refreshing, error: catalogError, loadMore } = useHostingCatalogPages(connections, connectionFilter, revision);
  const [providerFilter, setProviderFilter] = useState<HostingProvider | ''>('');
  const [search, setSearch] = useState('');
  const [pins, setPins] = useState(readHostingPins);
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
    setPins(
      migrateHostingPins(
        connections,
        Object.values(pages).flatMap((page) => page.items),
      ),
    );
  }, [connections, pages]);
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
  const localCatalog = Object.values(pages).flatMap((page) => page.items);
  const clones = useLocalHostingRepositories(openRepos, connections, revision, localCatalog);
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
  return {
    activeRepo,
    repositories,
    pages,
    connections,
    clones,
    refreshing,
    task: { ...task, error: task.error ?? catalogError },
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
