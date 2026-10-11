import { app, session } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { assertManagedPath, readStorageJson } from './storageSafety';

export const HTTP_CACHE_WORKER_FLAG = '--ogc-storage-http-worker';
export const isHttpCacheWorker = process.argv.includes(HTTP_CACHE_WORKER_FLAG);

// Runs in a short-lived Electron process so Windows releases all backend handles
// before the parent restores the cache directory. No app window or login profile is opened.
if (isHttpCacheWorker) {
  try {
    const index = process.argv.indexOf(HTTP_CACHE_WORKER_FLAG);
    const profile = process.argv[index + 1],
      nonce = process.argv[index + 2];
    if (!profile || !path.isAbsolute(profile) || path.basename(profile) !== 'browser-cache-maintenance') throw new Error('Invalid maintenance profile.');
    const root = path.dirname(profile);
    const owner = readStorageJson(root, path.join(profile, 'owner.json')) as {
      version: number;
      application: string;
      purpose: string;
      nonce: string;
      pid: number;
    };
    if (
      owner.version !== 1 ||
      owner.application !== 'Open-Git-Control' ||
      owner.purpose !== 'http-cache-maintenance' ||
      owner.nonce !== nonce ||
      !/^[a-f0-9-]{36}$/.test(nonce || '') ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0
    )
      throw new Error('Invalid maintenance ownership.');
    process.kill(owner.pid, 0);
    const pending = [profile];
    while (pending.length) {
      const directory = pending.pop()!;
      assertManagedPath(root, directory);
      if (!fs.existsSync(directory)) continue;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        assertManagedPath(root, file);
        if (entry.isDirectory()) pending.push(file);
      }
    }
    app.setPath('userData', profile);
    app.setPath('sessionData', profile);
    app.disableHardwareAcceleration();
    app.commandLine.removeSwitch('disable-http-cache');
    void app.whenReady().then(async () => {
      try {
        await session.defaultSession.clearCache();
        app.exit(0);
      } catch (error) {
        console.error(String(error));
        app.exit(1);
      }
    });
  } catch (error) {
    console.error(String(error));
    app.exit(1);
  }
}
