import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserCachePressureMonitor } from '../BrowserCachePressureMonitor';
import { STORAGE_BUDGETS } from '../../../src/shared/ipc/storageMaintenance';

describe('browser cache pressure after writes', () => {
  let root: string, monitor: BrowserCachePressureMonitor;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-cache-pressure-test-'));
    vi.useFakeTimers({ now: Date.UTC(2026, 1, 1) });
  });
  afterEach(() => {
    monitor?.dispose();
    vi.useRealTimers();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-cache-pressure-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
  });
  const sparseFile = (directory: string, bytes: number) => {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    const fd = fs.openSync(path.join(root, directory, 'cache-data'), 'w');
    fs.ftruncateSync(fd, bytes);
    fs.closeSync(fd);
  };
  it('combines both code caches and coalesces pressure notifications', async () => {
    sparseFile('Code Cache', STORAGE_BUDGETS.code / 2);
    sparseFile('development-code-cache', STORAGE_BUDGETS.code / 2 + 1);
    const schedule = vi.fn();
    monitor = new BrowserCachePressureMonitor(root, schedule, () => true);
    monitor.changed();
    monitor.changed();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    monitor.changed();
    await vi.advanceTimersByTimeAsync(5000);
    expect(schedule).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    monitor.changed();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(schedule).toHaveBeenCalledTimes(2));
  });
  it('protects redirected directories and honors disabling automatic care', async () => {
    const external = path.join(root, 'preserved');
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, 'sentinel'), 'preserved');
    fs.symlinkSync(external, path.join(root, 'Code Cache'), process.platform === 'win32' ? 'junction' : 'dir');
    let enabled = false;
    const schedule = vi.fn();
    monitor = new BrowserCachePressureMonitor(root, schedule, () => enabled);
    monitor.changed();
    await vi.advanceTimersByTimeAsync(5000);
    enabled = true;
    monitor.changed();
    await vi.advanceTimersByTimeAsync(5000);
    expect(schedule).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(external, 'sentinel'), 'utf8')).toBe('preserved');
  });
});
