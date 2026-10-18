import { getElectronApi } from '@/services/electronApi';
import { hydratePreviews, queryClient, refreshVisibleResources } from './queryClient';
import { resourceKey } from './clientCache';
import { backgroundQueue } from './backgroundQueue';
import { prepareRestoredGraphs } from './preloading';
import { receiveSystemTools, useSystemTools } from '@/app/state/systemToolsStore';
import { isSystemToolAvailable } from '@/services/systemToolsAvailability';
import { createPreviewPersistence } from './previewPersistence';

let started = false;
let bootstrapPromise: Promise<void> | undefined;
export function startDataRuntime() {
  if (started) return bootstrapPromise;
  started = true;
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

  const { flush } = createPreviewPersistence(queryClient.getQueryCache(), api?.savePreviews, startedAt);
  const visibility = () => {
    if (document.visibilityState === 'hidden') {
      backgroundQueue.setPaused(true);
      flush();
    } else {
      // Schedule visible reads before releasing queued background work.
      refreshVisibleResources();
      backgroundQueue.setPaused(false);
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
