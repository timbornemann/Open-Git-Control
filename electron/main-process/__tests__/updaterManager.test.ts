import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { autoUpdaterMock, getAllWindowsMock, getVersionMock } = vi.hoisted(() => ({
  autoUpdaterMock: {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
  },
  getAllWindowsMock: vi.fn(),
  getVersionMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getVersion: getVersionMock },
  BrowserWindow: { getAllWindows: getAllWindowsMock },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock,
}));

import { UpdaterManager } from '../updaterManager';
import type { UpdaterStatusPayload } from '../updaterManager';

type UpdaterManagerInternals = {
  setUpdaterStatus: (patch: Partial<UpdaterStatusPayload>) => void;
};

const setStatus = (manager: UpdaterManager, patch: Partial<UpdaterStatusPayload>): void => {
  (manager as unknown as UpdaterManagerInternals).setUpdaterStatus(patch);
};

describe('UpdaterManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getVersionMock.mockReturnValue('1.0.0');
    getAllWindowsMock.mockReturnValue([]);
    autoUpdaterMock.checkForUpdates.mockReset();
    autoUpdaterMock.downloadUpdate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for an already-running download instead of turning it into a five-second error', async () => {
    const manager = new UpdaterManager(false);
    setStatus(manager, { state: 'downloading', error: null });

    const update = manager.runOneClickUpdate();
    await vi.advanceTimersByTimeAsync(5_100);

    expect(manager.getStatus()).toMatchObject({ state: 'downloading', error: null });
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();

    setStatus(manager, { state: 'downloaded', downloaded: true });
    await vi.advanceTimersByTimeAsync(150);
    await expect(update).resolves.toEqual({ success: true, action: 'downloaded' });
  });

  it('keeps a slow update check in checking state after the short UI wait expires', async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
    const manager = new UpdaterManager(false);

    const update = manager.runOneClickUpdate();
    await vi.advanceTimersByTimeAsync(5_100);

    await expect(update).resolves.toEqual({ success: true });
    expect(manager.getStatus()).toMatchObject({ state: 'checking', error: null });
  });
});
