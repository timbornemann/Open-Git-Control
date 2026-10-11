import { app, BrowserWindow, session, type Session } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { assertManagedPath } from './storageSafety';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { clearInactiveHttpCache } from './inactiveHttpCache';

export function configureBrowserCacheSwitches(isDevelopment: boolean): void {
  // Chromium reads these switches at startup. Keep shared userData, settings and logins intact.
  if (isDevelopment) app.commandLine.appendSwitch('disable-http-cache');
  else app.commandLine.appendSwitch('disk-cache-size', String(STORAGE_BUDGETS.http));
  app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('userData'), 'Cache'));
}
export function configureCodeCache(isDevelopment: boolean, target: Session = session.defaultSession): void {
  const directory = path.join(app.getPath('userData'), isDevelopment ? 'development-code-cache' : 'Code Cache');
  assertManagedPath(app.getPath('userData'), directory);
  target.setCodeCachePath(directory);
}
function guardCacheTree(directory: string): void {
  const root = app.getPath('userData');
  assertManagedPath(root, directory);
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assertManagedPath(root, file);
    if (entry.isDirectory()) guardCacheTree(file);
  }
}
export async function clearBrowserCaches(categories: string[], isDevelopment: boolean, target: Session = session.defaultSession): Promise<void> {
  if (categories.includes('http')) {
    guardCacheTree(path.join(app.getPath('userData'), 'Cache'));
    await target.clearCache();
    if (isDevelopment) {
      await clearInactiveHttpCache();
    }
  }
  if (categories.includes('code')) {
    guardCacheTree(path.join(app.getPath('userData'), 'Code Cache'));
    guardCacheTree(path.join(app.getPath('userData'), 'development-code-cache'));
    await target.clearCodeCaches({ urls: [] });
    // Chromium opens an existing disk code-cache backend only in a persistent context.
    // This dedicated partition has no app logins and never navigates to network content.
    guardCacheTree(path.join(app.getPath('userData'), 'Partitions', 'ogc-inactive-code-maintenance'));
    const inactive = session.fromPartition('persist:ogc-inactive-code-maintenance', { cache: true });
    inactive.setCodeCachePath(path.join(app.getPath('userData'), isDevelopment ? 'Code Cache' : 'development-code-cache'));
    const initialize = new BrowserWindow({ show: false, webPreferences: { session: inactive, sandbox: true, contextIsolation: true } });
    try {
      await initialize.loadURL('about:blank');
      await inactive.clearCodeCaches({ urls: [] });
    } finally {
      initialize.destroy();
    }
  }
  if (categories.includes('auxiliary')) {
    for (const directory of ['GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache']) guardCacheTree(path.join(app.getPath('userData'), directory));
    await target.clearStorageData({ storages: ['shadercache'] });
  }
}
