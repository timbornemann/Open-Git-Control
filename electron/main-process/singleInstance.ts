import type { App, BrowserWindow } from 'electron';

type BrowserWindowProvider = {
  getAllWindows: () => BrowserWindow[];
};

/** Focuses the primary window, restoring a minimized or hidden window first. */
export const focusExistingWindow = (windowProvider: BrowserWindowProvider): boolean => {
  const window = windowProvider.getAllWindows().find((candidate) => !candidate.isDestroyed());
  if (!window) return false;

  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
  return true;
};

/**
 * Acquires Electron's process-wide lock and sends subsequent launches to the
 * already-running instance. The caller can recreate a window when the app is
 * alive but currently has none (for example on macOS).
 */
export const acquireSingleInstanceLock = (application: App, windowProvider: BrowserWindowProvider, onNoWindow?: () => void): boolean => {
  if (!application.requestSingleInstanceLock()) {
    application.quit();
    return false;
  }

  application.on('second-instance', () => {
    if (!focusExistingWindow(windowProvider)) {
      onNoWindow?.();
    }
  });
  return true;
};
