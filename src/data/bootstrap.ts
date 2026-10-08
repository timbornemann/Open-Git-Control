import { preloadViewModules } from './viewModules';
import { getElectronApi } from '@/services/electronApi';
import { isPersistentResource, MAX_SNAPSHOT_BYTES, type PreviewSnapshot } from '@/shared/cache/resource';
import { hydratePreviews, queryClient, refreshVisibleResources } from './queryClient';
import { resourceKey } from './clientCache';
import { backgroundQueue } from './backgroundQueue';
import { prepareRestoredGraphs } from './preloading';
import { receiveSystemTools, useSystemTools } from '@/app/state/systemToolsStore';
import { isSystemToolAvailable } from '@/services/systemToolsAvailability';

let started = false;
let bootstrapPromise: Promise<void> | undefined;
export function startDataRuntime() {
  if (started) return bootstrapPromise;
  started = true;
  void preloadViewModules();
  const api = getElectronApi()?.app;
  const startedAt = Date.now();
  bootstrapPromise = api
    ?.getBootstrap?.()
    .then((result) => {
      if (result.systemTools && !useSystemTools.getState().status) receiveSystemTools(result.systemTools);
      for (const [name, value] of [
        ['getSettings', result.settings],
        ['getStoredRepos', result.repositories],
      ] as const) {
        const key = resourceKey('app', name);
        if (!queryClient.getQueryState(key)?.dataUpdatedAt) queryClient.setQueryData(key, value);
      }
      hydratePreviews(
        result.snapshots.filter((entry) => entry.key[1] !== 'github'),
        startedAt,
      );
      if (isSystemToolAvailable('git')) void prepareRestoredGraphs(result.snapshots).catch(() => {});
    })
    .catch(() => {
      /* Existing client reads remain available on a cold or damaged cache. */
    });

  const pending = new Map<string, PreviewSnapshot>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending.size) return;
    const batch = [...pending.values()];
    pending.clear();
    void api?.savePreviews?.(batch).catch(() => {});
  };
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || !isPersistentResource(event.query.queryKey)) return;
    const state = event.query.state;
    if (state.dataUpdatedAt <= startedAt || state.data === undefined) return;
    const raw = JSON.stringify(state.data);
    if (new TextEncoder().encode(raw).byteLength > MAX_SNAPSHOT_BYTES) return;
    const payload = state.data as { data?: { snapshotId?: string; head?: string } };
    pending.set(event.query.queryHash, {
      version: 1,
      key: event.query.queryKey,
      savedAt: state.dataUpdatedAt,
      sourceRevision: payload?.data?.snapshotId || payload?.data?.head || String(state.dataUpdatedAt),
      complete: true,
      data: state.data,
    });
    if (!timer) timer = setTimeout(flush, 300);
  });
  const visibility = () => {
    if (document.visibilityState === 'hidden') {
      backgroundQueue.setPaused(true);
      flush();
    } else {
      // Schedule visible reads before releasing queued background work.
      refreshVisibleResources();
      backgroundQueue.setPaused(false);
      void preloadViewModules();
    }
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', () => {
    if (document.visibilityState === 'visible') refreshVisibleResources();
  });
  window.addEventListener('pagehide', flush);
  visibility();
  return bootstrapPromise;
}
