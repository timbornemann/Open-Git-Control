import { app, type BrowserWindow } from 'electron';
import { StartupJournal } from './StartupJournal';

let journal: StartupJournal | undefined;
export const recordStartup = (event: string, details: Parameters<StartupJournal['record']>[1] = {}) => journal?.record(event, details);
export async function flushStartupDiagnostics(): Promise<void> {
  if (!journal) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    journal.flush(),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 1000);
      timer.unref();
    }),
  ]);
  clearTimeout(timer);
}

export function initializeStartupDiagnostics(): () => void {
  journal = new StartupJournal(app.getPath('userData'));
  recordStartup('main-start', {
    version: app.getVersion(),
    electron: process.versions.electron || '',
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
  });
  app.on('child-process-gone', (_event, details) => {
    recordStartup('child-process-gone', { type: details.type, reason: details.reason, exitCode: details.exitCode });
  });
  app.on('gpu-info-update', () => recordStartup('graphics-status', { ...app.getGPUFeatureStatus() }));
  const exception = (error: Error) => recordStartup('main-exception', { message: error.message, stack: error.stack || '' });
  process.on('uncaughtExceptionMonitor', exception);
  let lastTick = Date.now();
  const timer = setInterval(() => {
    const lagMs = Date.now() - lastTick - 2000;
    lastTick = Date.now();
    if (lagMs > 2000) recordStartup('main-loop-delay', { lagMs });
  }, 2000);
  timer.unref();
  return () => {
    clearInterval(timer);
    process.removeListener('uncaughtExceptionMonitor', exception);
  };
}

export function watchStartupWindow(window: BrowserWindow): void {
  recordStartup('main-window-created');
  window.on('unresponsive', () => recordStartup('window-unresponsive'));
  window.on('responsive', () => recordStartup('window-responsive'));
  window.webContents.on('render-process-gone', (_event, details) => recordStartup('renderer-gone', { reason: details.reason, exitCode: details.exitCode }));
  window.webContents.on('preload-error', (_event, _preload, error) => recordStartup('preload-error', { message: error.message }));
  window.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame) recordStartup('document-failed', { code, description });
  });
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') recordStartup('renderer-error', { message: event.message, line: event.lineNumber });
  });
  window.webContents.once('did-finish-load', () => {
    recordStartup('document-loaded');
    const timer = setTimeout(() => recordStartup('renderer-health-timeout'), 5000);
    timer.unref();
    void window.webContents
      .executeJavaScript(
        `({ mounted: Boolean(document.getElementById('root')?.childElementCount), stylesheets: document.styleSheets.length, background: getComputedStyle(document.body).backgroundColor })`,
      )
      .then((state: { mounted: boolean; stylesheets: number; background: string }) => recordStartup('renderer-health', state))
      .catch(() => recordStartup('renderer-health-failed'))
      .finally(() => clearTimeout(timer));
  });
}
