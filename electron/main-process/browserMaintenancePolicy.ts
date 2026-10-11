import { STORAGE_BUDGETS, type MaintenanceRequest, type MaintenanceReport } from '../../src/shared/ipc/storageMaintenance';
import type { MaintenanceState } from './maintenanceState';
import type { StorageFile } from './storageCatalogue';
import type { MaintenanceDeps } from './StorageMaintenanceDependencies';
import { selectedCategory } from './storageCachePolicy';
import { DAY } from './maintenanceState';

export const isBrowserCacheFile = (file: StorageFile) =>
  file.category === 'http' ||
  file.category === 'code' ||
  (file.category === 'auxiliary' && /^(GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache)\//.test(file.relative));

export async function maintainBrowserCaches(
  deps: MaintenanceDeps,
  state: MaintenanceState,
  request: MaintenanceRequest,
  now: number,
  files: StorageFile[],
  report: MaintenanceReport,
): Promise<void> {
  if (!deps.clearBrowser) return;
  const clear = ['http', 'code', 'auxiliary'].filter(
    (category) =>
      selectedCategory(request, category) &&
      (request.mode === 'all-caches' ||
        now - (state.browserClearedAt[category] ?? now) >= 30 * DAY ||
        files.filter((file) => file.category === category).reduce((sum, file) => sum + file.bytes, 0) >
          STORAGE_BUDGETS[category as 'http' | 'code' | 'auxiliary']),
  );
  if (!clear.length) return;
  if (deps.isBrowserBusy?.()) {
    for (const category of clear) report.deferred.push({ category: category as 'http' | 'code' | 'auxiliary', path: '', reason: 'in-use' });
    return;
  }
  try {
    await deps.clearBrowser(clear);
    for (const category of clear) state.browserClearedAt[category] = now;
  } catch (error) {
    report.errors.push(String(error));
  }
}
