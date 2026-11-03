import { BrowserWindow, WebContentsView, ipcMain, session, type WebContents } from 'electron';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TUTORIAL_CHANNELS, type TutorialLaunchContext } from '../../src/shared/tutorial/types';
import { resolveTutorialRequest } from '../../src/shared/tutorial/catalog';
import { buildContentSecurityPolicy } from './security';
import { registerTutorialContents } from './tutorialAuthorization';
import { readSettings } from './settingsStore';
import type { TutorialProgressStore } from './tutorialProgress';

type RunningTutorial = { view: WebContentsView; context: TutorialLaunchContext; close: (failed?: boolean) => void; ready: () => void };
const running = new Map<number, RunningTutorial>();

export function registerTutorialHandlers(store: TutorialProgressStore, isDev: boolean, mainProcessDir: string): void {
  ipcMain.handle(TUTORIAL_CHANNELS.progress, () => store.snapshot());
  ipcMain.handle(TUTORIAL_CHANNELS.acknowledge, () => store.acknowledge());
  ipcMain.handle(TUTORIAL_CHANNELS.start, (event, input: unknown) => {
    const request = resolveTutorialRequest(input);
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent) return { success: false, error: 'Application window is unavailable.' };
    const existing = running.get(parent.id);
    if (existing) {
      existing.view.webContents.focus();
      return { success: true };
    }
    try {
      const preferences = readSettings();
      const context: TutorialLaunchContext = { request, language: preferences.language, theme: preferences.theme, progress: store.snapshot() };
      const partition = session.fromPartition(`tutorial-${randomUUID()}`, { cache: false });
      partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      partition.setPermissionCheckHandler(() => false);
      // Only bundled application assets may be loaded. In development Vite's
      // assets/HMR are allowed, never a hosting, AI or local planning endpoint.
      partition.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const allowed = ['file:', 'data:', 'blob:'].includes(url.protocol) || (isDev && ['http://localhost:5173', 'ws://localhost:5173'].includes(url.origin));
        callback({ cancel: !allowed });
      });
      partition.webRequest.onHeadersReceived((details, callback) =>
        callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [buildContentSecurityPolicy(isDev)] } }),
      );
      const view = new WebContentsView({
        webPreferences: {
          session: partition,
          preload: path.join(mainProcessDir, 'tutorial-preload.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          devTools: isDev,
          webviewTag: false,
        },
      });
      view.setBackgroundColor('#0f1214');
      const unregister = registerTutorialContents(view.webContents.id);
      const resize = () => {
        const [width, height] = parent.getContentSize();
        view.setBounds({ x: 0, y: 0, width, height });
      };
      let closed = false;
      const loadTimeout = setTimeout(() => close(true), 30_000);
      const close = (failed = false) => {
        if (closed) return;
        closed = true;
        clearTimeout(loadTimeout);
        running.delete(parent.id);
        parent.off('resize', resize);
        parent.off('closed', close);
        unregister();
        if (!parent.isDestroyed()) {
          parent.contentView.removeChildView(view);
          parent.webContents.send('tutorial:closed', failed);
          parent.webContents.focus();
        }
        if (!view.webContents.isDestroyed()) view.webContents.close();
        void partition.clearStorageData().catch(() => undefined);
        void partition.closeAllConnections().catch(() => undefined);
      };
      running.set(parent.id, { view, context, close, ready: () => clearTimeout(loadTimeout) });
      view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      view.webContents.on('will-navigate', (navigation) => navigation.preventDefault());
      view.webContents.once('render-process-gone', () => close(true));
      view.webContents.once('destroyed', () => close(true));
      view.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
        if (mainFrame && code !== -3) close(true);
      });
      parent.once('closed', close);
      parent.on('resize', resize);
      parent.contentView.addChildView(view);
      resize();
      view.webContents.focus();
      const loaded = isDev
        ? view.webContents.loadURL('http://localhost:5173/tutorial.html')
        : view.webContents.loadFile(path.join(mainProcessDir, '../../dist/tutorial.html'));
      void loaded.catch(() => close(true));
      return { success: true };
    } catch (error) {
      running.get(parent.id)?.close();
      return { success: false, error: String(error) };
    }
  });
  const find = (contents: WebContents) => {
    const entry = [...running.values()].find((value) => value.view.webContents.id === contents.id);
    if (!entry) throw new Error('Tutorial session is no longer active.');
    return entry;
  };
  ipcMain.handle(TUTORIAL_CHANNELS.context, (event) => find(event.sender).context);
  ipcMain.handle(TUTORIAL_CHANNELS.ready, (event) => {
    find(event.sender).ready();
  });
  ipcMain.handle(TUTORIAL_CHANNELS.complete, (event, id: unknown) => {
    find(event.sender);
    if (typeof id !== 'string') throw new Error('Invalid chapter.');
    return store.complete(id);
  });
  ipcMain.handle(TUTORIAL_CHANNELS.close, (event, failed: unknown) => {
    const active = find(event.sender);
    // Let invoke's reply reach the renderer before destroying its WebContents.
    setTimeout(() => active.close(failed === true), 50);
  });
}
