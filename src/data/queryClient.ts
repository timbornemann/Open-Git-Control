import { QueryClient, hashKey, notifyManager } from '@tanstack/react-query';
import { MEMORY_CACHE_BYTES, type PreviewSnapshot, type ResourceKey, type ReadPriority } from '@/shared/cache/resource';
import { backgroundQueue } from './backgroundQueue';
import { historyChangedAt } from './historyRevision';

notifyManager.setScheduler(queueMicrotask);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      retry: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      networkMode: 'always',
      structuralSharing: true,
    },
  },
});

export const cacheDiagnostics = { hits: 0, misses: 0, reads: 0, durationMs: 0, evictions: 0, navigationMs: [] as number[] };
const touched = new Map<string, number>();
const sizes = new Map<string, number>();
const readers = new Map<string, { staleTime: number; refresh: () => Promise<unknown> }>();
let budgetScheduled = false;
export function enforceMemoryBudget(limit = MEMORY_CACHE_BYTES) {
  const entries = queryClient.getQueryCache().getAll();
  let total = entries.reduce((sum, query) => sum + (sizes.get(query.queryHash) ?? 0), 0);
  for (const query of entries.sort((a, b) => (touched.get(a.queryHash) ?? 0) - (touched.get(b.queryHash) ?? 0))) {
    if (total <= limit) break;
    if (query.getObserversCount() || query.state.fetchStatus !== 'idle') continue;
    total -= sizes.get(query.queryHash) ?? 0;
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
    cacheDiagnostics.evictions++;
  }
  return total;
}

queryClient.getQueryCache().subscribe((event) => {
  const id = event.query.queryHash;
  if (event.type === 'removed') {
    touched.delete(id);
    sizes.delete(id);
    readers.delete(id);
    return;
  }
  if (event.type === 'observerAdded') touched.set(id, Date.now());
  if (event.type !== 'updated' || event.action.type !== 'success') return;
  touched.set(id, Date.now());
  // Include keys and budget UTF-16 storage rather than only compressed/UTF-8
  // transfer size. Displayed resources are allowed to exceed the cache budget.
  try {
    sizes.set(id, JSON.stringify([event.query.queryKey, event.query.state.data]).length * 2);
  } catch {
    sizes.set(id, 0);
  }
  if (!budgetScheduled) {
    budgetScheduled = true;
    queueMicrotask(() => {
      budgetScheduled = false;
      enforceMemoryBudget();
    });
  }
});

export class ResourceReadError extends Error {
  constructor(public response: { success: false; error: string; retryAt?: number; status?: number }) {
    super(response.error);
  }
}
export function checked<T>(result: T): T {
  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    throw new ResourceReadError(result as unknown as ResourceReadError['response']);
  }
  return result;
}

export async function readResource<T>(
  key: ResourceKey,
  read: (signal: AbortSignal) => Promise<T>,
  options: {
    staleTime?: number;
    priority?: ReadPriority;
    force?: boolean;
    scheduled?: boolean;
    automaticRefresh?: boolean;
  } = {},
): Promise<T> {
  const state = queryClient.getQueryState<T>(key);
  touched.set(hashKey(key), Date.now());
  const staleTime = options.staleTime ?? 30_000;
  if (options.automaticRefresh === false) readers.delete(hashKey(key));
  else
    readers.set(hashKey(key), {
      staleTime,
      refresh: () => readResource(key, read, { ...options, force: options.force || queryClient.getQueryState(key)?.status === 'error', priority: 'visible' }),
    });
  if (!options.priority || options.priority === 'visible') backgroundQueue.promote(hashKey(key));
  if (!options.force && state?.data !== undefined && !state.isInvalidated && Date.now() - state.dataUpdatedAt < staleTime) cacheDiagnostics.hits++;
  else cacheDiagnostics.misses++;
  try {
    return await queryClient.fetchQuery({
      queryKey: key,
      staleTime: options.force ? 0 : staleTime,
      meta: { immutable: key[1] === 'git' && staleTime === Infinity },
      retry: (count, error) =>
        key[1] === 'github' &&
        count < 2 &&
        error.name !== 'AbortError' &&
        !/rate.?limit|not authenticated/i.test(error.message) &&
        !(error instanceof ResourceReadError && (error.response.status === 401 || error.response.status === 403 || error.response.status === 429)),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      queryFn: ({ signal }) => {
        const run = async () => {
          const started = performance.now();
          try {
            return checked(await read(signal));
          } catch (error) {
            if (error instanceof ResourceReadError && error.response.retryAt) backgroundQueue.deferGithub(error.response.retryAt);
            throw error;
          } finally {
            cacheDiagnostics.reads++;
            cacheDiagnostics.durationMs += performance.now() - started;
          }
        };
        return options.scheduled === false ? run() : backgroundQueue.schedule(run, options.priority ?? 'visible', key[1] === 'github', signal, hashKey(key));
      },
    });
  } catch (error) {
    if (error instanceof ResourceReadError) return error.response as T;
    throw error;
  }
}

export function refreshVisibleResources() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  for (const query of queryClient.getQueryCache().getAll()) {
    const reader = readers.get(query.queryHash);
    if (
      reader &&
      query.getObserversCount() > 0 &&
      (query.state.status === 'error' || query.state.isInvalidated || Date.now() - query.state.dataUpdatedAt >= reader.staleTime)
    ) {
      void reader.refresh().catch(() => {});
    }
  }
}

/** Cancelling first ensures a read started before a confirmed write cannot
 * restore the old value after that write. */
export function updateResource<T>(key: ResourceKey, updater: T | ((old: T | undefined) => T | undefined)) {
  void queryClient.cancelQueries({ queryKey: key, exact: true });
  queryClient.setQueryData<T>(key, updater);
}

export function hydratePreviews(snapshots: PreviewSnapshot[], startedAt: number) {
  for (const snapshot of snapshots) {
    if (snapshot.key[1] === 'git' && snapshot.savedAt <= historyChangedAt(String(snapshot.key[2]))) continue;
    const current = queryClient.getQueryState(snapshot.key);
    if (
      current &&
      (current.isInvalidated ||
        current.dataUpdatedAt >= snapshot.savedAt ||
        current.dataUpdatedAt >= startedAt ||
        (current.fetchStatus === 'fetching' && current.data !== undefined))
    )
      continue;
    queryClient.setQueryData(snapshot.key, snapshot.data, { updatedAt: snapshot.complete ? snapshot.savedAt : 1 });
  }
}
