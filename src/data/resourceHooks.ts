import { useQuery, skipToken, hashKey } from '@tanstack/react-query';
import type { ResourceKey, ResourceDomain } from '@/shared/cache/resource';
import { queryClient } from './queryClient';
import { useCallback, useRef, type SetStateAction } from 'react';
import type { IpcResult } from '@/types/ipc';
import { resourceKey } from './clientCache';

/** Observe without installing a second refresh loop. The owning adapter or
 * existing domain lifecycle is responsible for scheduling the read. */
export function useCachedResult<T>(key: ResourceKey) {
  return useQuery<T>({ queryKey: key, queryFn: skipToken, enabled: false }, queryClient);
}

/** Drop-in data state for existing workflows; selection/edit buffers stay in
 * component state. Setters publish confirmed results to all consumers. */
export function useResourceState<T>(domain: ResourceDomain, method: string, args: unknown[], fallback: T) {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const key = resourceKey(domain, method, args);
  const keyHash = hashKey(key);
  const query = useCachedResult<IpcResult<T>>(key);
  const data = query.data?.success ? query.data.data : fallback;
  const setData = useCallback(
    (value: SetStateAction<T>) => {
      const queryKey = JSON.parse(keyHash) as ResourceKey;
      queryClient.setQueryData<IpcResult<T>>(queryKey, (old) => ({
        success: true,
        data: typeof value === 'function' ? (value as (old: T) => T)(old?.success ? old.data : fallbackRef.current) : value,
      }));
    },
    [keyHash],
  );
  return [data, setData, query.data !== undefined] as const;
}
