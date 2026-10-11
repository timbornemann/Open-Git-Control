import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { appClient } from '@/services/appClient';
import { updateResource } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import type { RepositoryMutation } from '@/shared/ipc/storageMaintenance';
import type { StoredRepoData } from '@/types/appDtos';

/** Queue precise intentions; never persist a renderer's complete repository snapshot. */
export function useRepositoryRegistry(onSnapshot: (data: StoredRepoData) => void, onError: (message: string) => void) {
  const revision = useRef(-1),
    queue = useRef(Promise.resolve()),
    pending = useRef(0);
  const latest = useRef<StoredRepoData | null>(null),
    mounted = useRef(false);
  const callbacks = useRef({ onSnapshot, onError });
  useLayoutEffect(() => {
    callbacks.current = { onSnapshot, onError };
  }, [onSnapshot, onError]);
  const receive = useCallback((data: StoredRepoData) => {
    if ((data.revision || 0) < revision.current) return;
    revision.current = data.revision || 0;
    latest.current = data;
    updateResource(resourceKey('app', 'getStoredRepos'), data);
    if (!pending.current && mounted.current) callbacks.current.onSnapshot(data);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = appClient.isAvailable() ? appClient.onStoredReposChanged(receive) : undefined;
    return () => {
      mounted.current = false;
      unsubscribe?.();
    };
  }, [receive]);
  const observe = useCallback((data: StoredRepoData) => {
    if ((data.revision || 0) < revision.current) return false;
    revision.current = data.revision || 0;
    return true;
  }, []);
  const mutate = useCallback(
    (operation: RepositoryMutation) => {
      if (!appClient.isAvailable()) return;
      pending.current++;
      queue.current = queue.current
        .then(async () => {
          const result = await appClient.mutateStoredRepos(operation);
          if (!result.success) throw new Error(result.error);
          receive(result.data);
        })
        .catch((error) => {
          if (mounted.current) callbacks.current.onError(String(error instanceof Error ? error.message : error));
        })
        .finally(() => {
          pending.current--;
          if (!pending.current && latest.current && mounted.current) callbacks.current.onSnapshot(latest.current);
        });
    },
    [receive],
  );
  return { observe, mutate };
}
