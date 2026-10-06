import { useEffect, useMemo, useRef, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import type { HostedRepository, HostingConnection, HostingPage } from '@/types/hostingDtos';
import { hostedRepositoryKey } from './hostingState';
import { useHostingTask } from './useHostingTask';

type Page = HostingPage<HostedRepository>;
type Entry = { account: string; page: Page };
const accountKey = (connection: HostingConnection) =>
  JSON.stringify([connection.id, connection.provider, connection.baseUrl, connection.userId, connection.username]);
const mergeItems = (previous: HostedRepository[], next: HostedRepository[]) => [
  ...new Map([...previous, ...next].map((repo) => [hostedRepositoryKey(repo), repo])).values(),
];

export function useHostingCatalogPages(connections: HostingConnection[], connectionFilter: string, revision: number) {
  const scope = JSON.stringify([connections.map((c) => [accountKey(c), c.authenticated, c.hasCredentials]), connectionFilter, revision]);
  const task = useHostingTask(scope);
  const { run, setError } = task;
  const lifecycle = useRef({ generation: 0, onlineItems: new Map<string, HostedRepository[]>() }).current;
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      connections.flatMap((connection) => {
        const page = hostingClient.cachedRepositories(connection.id);
        return page ? [[connection.id, { account: accountKey(connection), page }]] : [];
      }),
    ),
  );
  const pages = useMemo(() => {
    const visible: Record<string, Page> = {};
    for (const connection of connections) {
      if ((!connection.authenticated && !connection.hasCredentials) || (connectionFilter && connection.id !== connectionFilter)) continue;
      const entry = entries[connection.id];
      const page = entry?.account === accountKey(connection) ? entry.page : hostingClient.cachedRepositories(connection.id);
      if (page) visible[connection.id] = page;
    }
    return visible;
  }, [entries, connections, connectionFilter]);

  useEffect(() => {
    const generation = ++lifecycle.generation;
    lifecycle.onlineItems.clear();
    const current = () => generation === lifecycle.generation;
    const selected = connections.filter((c) => (c.authenticated || c.hasCredentials) && (!connectionFilter || c.id === connectionFilter));
    const publish = (connection: HostingConnection, page: Page, keepPrevious = false) => {
      if (!current()) return;
      setEntries((old) => {
        const previous = old[connection.id]?.account === accountKey(connection) ? old[connection.id].page.items : [];
        return {
          ...old,
          [connection.id]: { account: accountKey(connection), page: { ...page, items: keepPrevious ? mergeItems(previous, page.items) : page.items } },
        };
      });
    };
    void run(async () => {
      const errors: string[] = [];
      await Promise.all(
        selected.map(async (connection) => {
          let onlineFinished = false;
          // The disk request never authenticates or makes a network request. A
          // late preview must not replace an already refreshed online page.
          const preview = hostingClient
            .request('cachedRepositories', { connectionId: connection.id })
            .then((page) => {
              if (!onlineFinished) publish(connection, page, true);
            })
            .catch(() => {});
          try {
            const page = await hostingClient.request('repositories', { connectionId: connection.id });
            onlineFinished = true;
            if (current()) lifecycle.onlineItems.set(connection.id, page.items);
            publish(connection, page, Boolean(page.nextCursor));
          } catch (error) {
            errors.push(`${connection.label}: ${String(error)}`);
            if (current()) setError(errors.join('\n'));
          }
          await preview;
        }),
      );
      if (current() && errors.length) setError(errors.join('\n'));
    });
    return () => {
      lifecycle.generation++;
    };
  }, [connections, connectionFilter, revision, lifecycle, run, setError]);

  const loadMore = (connectionId: string, cursor: string) => {
    const connection = connections.find((candidate) => candidate.id === connectionId);
    if (!connection) return;
    const generation = lifecycle.generation;
    void run(
      () => hostingClient.request('repositories', { connectionId, cursor }),
      (next) => {
        if (generation !== lifecycle.generation) return;
        const items = mergeItems(lifecycle.onlineItems.get(connectionId) ?? [], next.items);
        lifecycle.onlineItems.set(connectionId, items);
        setEntries((old) => ({
          ...old,
          [connectionId]: {
            account: accountKey(connection),
            page: { ...next, items: next.nextCursor ? mergeItems(old[connectionId]?.page.items ?? [], items) : items },
          },
        }));
      },
    );
  };
  return { pages, refreshing: task.busy, error: task.error, loadMore };
}
