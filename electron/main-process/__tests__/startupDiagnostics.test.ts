import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { application, listeners } = vi.hoisted(() => {
  const listeners = new Map<string, (...args: any[]) => void>();
  return {
    listeners,
    application: {
      getPath: vi.fn(),
      getVersion: () => '3.0.5',
      getGPUFeatureStatus: () => ({ gpu_compositing: 'enabled' }),
      on: (event: string, listener: (...args: any[]) => void) => listeners.set(event, listener),
    },
  };
});
vi.mock('electron', () => ({ app: application }));
import { flushStartupDiagnostics, initializeStartupDiagnostics, watchStartupWindow } from '../startupDiagnostics';

let root: string;
let stop: (() => void) | undefined;
afterEach(async () => {
  stop?.();
  await flushStartupDiagnostics();
  if (root) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-startup-events-test-'))
      throw new Error('Unsafe diagnostic fixture.');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('native startup diagnostics', () => {
  it('distinguishes rendering failures, preload failures, an unresponsive window and healthy loaded styles', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-startup-events-test-'));
    application.getPath.mockReturnValue(root);
    stop = initializeStartupDiagnostics();
    const contents = Object.assign(new EventEmitter(), {
      executeJavaScript: vi.fn().mockResolvedValue({ mounted: true, stylesheets: 5, background: 'rgb(15, 18, 20)' }),
    });
    const window = Object.assign(new EventEmitter(), { webContents: contents });
    watchStartupWindow(window as unknown as BrowserWindow);
    listeners.get('child-process-gone')?.({}, { type: 'GPU', reason: 'crashed', exitCode: 4 });
    listeners.get('gpu-info-update')?.();
    window.emit('unresponsive');
    contents.emit('preload-error', {}, '/preload.js', new Error('Preload unavailable'));
    contents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///index.html', true);
    contents.emit('render-process-gone', {}, { reason: 'oom', exitCode: 137 });
    contents.emit('console-message', { level: 'error', message: 'https://alice:password123@example.invalid', lineNumber: 1 });
    contents.emit('did-finish-load');
    await vi.waitFor(() => expect(contents.executeJavaScript).toHaveBeenCalledOnce());
    await flushStartupDiagnostics();
    const text = fs.readFileSync(path.join(root, 'startup.log'), 'utf8');
    expect(text).not.toContain('password123');
    const entries = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(entries).toContainEqual(expect.objectContaining({ event: 'child-process-gone', type: 'GPU', reason: 'crashed' }));
    expect(entries).toContainEqual(expect.objectContaining({ event: 'document-failed', code: -6 }));
    expect(entries).toContainEqual(expect.objectContaining({ event: 'renderer-health', mounted: true, stylesheets: 5 }));
    expect(entries.map((entry) => entry.event)).toEqual(expect.arrayContaining(['window-unresponsive', 'preload-error', 'renderer-gone', 'renderer-error']));
  });

  it('distinguishes window transitions and later document reloads from ordinary in-page updates', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-startup-events-test-'));
    application.getPath.mockReturnValue(root);
    stop = initializeStartupDiagnostics();
    const contents = Object.assign(new EventEmitter(), {
      executeJavaScript: vi.fn().mockResolvedValue({ mounted: true, stylesheets: 5, background: 'rgb(15, 18, 20)' }),
    });
    const window = Object.assign(new EventEmitter(), { webContents: contents });
    watchStartupWindow(window as unknown as BrowserWindow);
    for (const event of ['show', 'minimize', 'restore', 'hide']) window.emit(event);
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    contents.emit('did-finish-load');
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    contents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    contents.emit('did-finish-load');
    await vi.waitFor(() => expect(contents.executeJavaScript).toHaveBeenCalledTimes(2));
    await flushStartupDiagnostics();
    const events = fs
      .readFileSync(path.join(root, 'startup.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).event);
    expect(events.filter((event) => event === 'document-navigation')).toHaveLength(2);
    expect(events.filter((event) => event === 'document-loaded')).toHaveLength(2);
    expect(events).toEqual(expect.arrayContaining(['window-show', 'window-hide', 'window-minimize', 'window-restore']));
  });
});
