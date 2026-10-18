import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  active: false,
  native: { autoInstallOnAppQuit: true, checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn() },
}));
vi.mock('electron', () => ({ app: { getVersion: () => '3.0.5' }, BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('electron-updater', () => ({ autoUpdater: state.native }));
vi.mock('../recoveryInstallation', () => ({ isRecoveryActive: () => state.active }));
import { UpdaterManager, type UpdaterStatusPayload } from '../updaterManager';
const downloaded = (manager: UpdaterManager) =>
  (manager as unknown as { setUpdaterStatus(patch: Partial<UpdaterStatusPayload>): void }).setUpdaterStatus({
    state: 'downloaded',
    downloaded: true,
    availableVersion: '3.0.6',
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.active = false;
  state.native.autoInstallOnAppQuit = true;
});
afterEach(() => vi.useRealTimers());
describe('updater manager during independent recovery', () => {
  it('blocks manual checks, downloads and both install entry points while recovery owns the installation', async () => {
    const manager = new UpdaterManager(false);
    downloaded(manager);
    state.active = true;
    await expect(manager.checkForAppUpdates()).resolves.toMatchObject({ success: false });
    await expect(manager.downloadAvailableUpdate()).resolves.toMatchObject({ success: false });
    expect(manager.installDownloadedUpdate()).toMatchObject({ success: false });
    await expect(manager.runOneClickUpdate()).resolves.toMatchObject({ success: false });
    expect(state.native.checkForUpdates).not.toHaveBeenCalled();
    expect(state.native.downloadUpdate).not.toHaveBeenCalled();
    expect(state.native.quitAndInstall).not.toHaveBeenCalled();
    expect(state.native.autoInstallOnAppQuit).toBe(false);
    manager.dispose();
  });
  it('rechecks recovery immediately before a queued installer is actually launched', async () => {
    const manager = new UpdaterManager(false);
    downloaded(manager);
    expect(manager.installDownloadedUpdate()).toEqual({ success: true });
    state.active = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(state.native.quitAndInstall).not.toHaveBeenCalled();
    expect(manager.getStatus().recoveryActive).toBe(true);
    manager.dispose();
  });
});
