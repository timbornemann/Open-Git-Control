import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleMock, openExternalMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  openExternalMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openExternal: openExternalMock },
}));

import { installExternalWindowHandler, isAllowedExternalUrl, openExternalUrl, registerExternalLinkHandlers } from '../externalLinks';

describe('external link handling', () => {
  beforeEach(() => {
    handleMock.mockClear();
    openExternalMock.mockReset().mockResolvedValue(undefined);
  });

  it('allows https URLs and rejects unsafe protocols', () => {
    expect(isAllowedExternalUrl('https://github.com/openai')).toBe(true);
    expect(isAllowedExternalUrl('http://github.com/openai')).toBe(false);
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('')).toBe(false);
  });

  it('opens only allowed external URLs via shell.openExternal', async () => {
    await expect(openExternalUrl('https://github.com/openai')).resolves.toEqual({ success: true });
    await expect(openExternalUrl('file:///tmp/secret')).resolves.toMatchObject({ success: false });

    expect(openExternalMock).toHaveBeenCalledTimes(1);
    expect(openExternalMock).toHaveBeenCalledWith('https://github.com/openai');
  });

  it('registers the external IPC handler', () => {
    registerExternalLinkHandlers();

    expect(handleMock).toHaveBeenCalledWith('external:open', expect.any(Function));
  });

  it('denies renderer-created windows and delegates allowed URLs externally', async () => {
    let handler: any = null;
    const windowMock = {
      webContents: {
        setWindowOpenHandler: vi.fn((nextHandler) => {
          handler = nextHandler;
        }),
      },
    };

    installExternalWindowHandler(windowMock as any);
    expect(windowMock.webContents.setWindowOpenHandler).toHaveBeenCalledOnce();

    expect(handler?.({ url: 'https://github.com/openai' })).toEqual({ action: 'deny' });
    await Promise.resolve();

    expect(handler?.({ url: 'file:///tmp/secret' })).toEqual({ action: 'deny' });
    await Promise.resolve();

    expect(openExternalMock).toHaveBeenCalledTimes(1);
    expect(openExternalMock).toHaveBeenCalledWith('https://github.com/openai');
  });
});
