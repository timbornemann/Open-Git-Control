import * as fs from 'node:fs';
import * as path from 'node:path';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { assertManagedPath } from './storageSafety';
import { inventoryStorage } from './storageCatalogue';

/** Chromium has no code-cache quota API. Check disk pressure after writes, without touching usage. */
export class BrowserCachePressureMonitor {
  private watcher: fs.FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private lastTrigger = 0;
  constructor(
    private readonly root: string,
    private readonly schedule: () => void,
    private readonly enabled: () => boolean,
  ) {
    try {
      assertManagedPath(root, root);
      this.watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (!filename || !/^(Cache|Code Cache|development-code-cache|GPUCache|Dawn[^/\\]*|browser-cache-maintenance)[/\\]/.test(String(filename))) return;
        this.changed();
      });
      this.watcher.on('error', () => {
        this.watcher?.close();
        this.watcher = null;
      });
    } catch {
      /* The six-hour inventory remains the fallback on unsupported filesystems. */
    }
  }
  changed(): void {
    if (this.stopped || this.timer) return;
    try {
      if (!this.enabled()) return;
    } catch {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.check().catch(() => {
        /* The regular pass reports unreadable paths. */
      });
    }, 5000);
    this.timer.unref();
  }
  private async check(): Promise<void> {
    if (this.stopped || Date.now() - this.lastTrigger < 10 * 60_000) return;
    const sizes = { http: 0, code: 0, auxiliary: 0 };
    for (const directory of [
      'Cache',
      'Code Cache',
      'development-code-cache',
      'GPUCache',
      'DawnCache',
      'DawnGraphiteCache',
      'DawnWebGPUCache',
      'browser-cache-maintenance/Cache',
    ]) {
      const category = /Code Cache|development-code-cache/.test(directory)
        ? 'code'
        : /Cache$/.test(directory) && !/GPU|Dawn/.test(directory)
          ? 'http'
          : 'auxiliary';
      assertManagedPath(this.root, path.join(this.root, directory));
      const files = await inventoryStorage(path.join(this.root, directory), []);
      sizes[category] += files.reduce((sum, file) => sum + file.bytes, 0);
    }
    if (!this.stopped && this.enabled() && Object.entries(sizes).some(([category, size]) => size > STORAGE_BUDGETS[category as keyof typeof sizes])) {
      this.lastTrigger = Date.now();
      this.schedule();
    }
  }
  dispose(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.watcher?.close();
  }
}
