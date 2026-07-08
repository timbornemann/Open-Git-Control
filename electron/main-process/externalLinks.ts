import { ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:']);
const MAX_EXTERNAL_URL_LENGTH = 4096;

export function isAllowedExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EXTERNAL_URL_LENGTH) return false;

  try {
    const parsed = new URL(trimmed);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function openExternalUrl(value: unknown): Promise<{ success: boolean; error?: string }> {
  if (!isAllowedExternalUrl(value)) {
    return { success: false, error: 'External URL is not allowed.' };
  }

  try {
    await shell.openExternal(value.trim());
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function registerExternalLinkHandlers(): void {
  ipcMain.handle(IpcChannel.ExternalOpen, async (_event: unknown, url: unknown) => openExternalUrl(url));
}

export function installExternalWindowHandler(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler((details) => {
    void openExternalUrl(details.url);
    return { action: 'deny' };
  });
}
