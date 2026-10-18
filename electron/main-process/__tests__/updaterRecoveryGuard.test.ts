import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const state = vi.hoisted(() => ({ active: false, autoUpdater: { autoInstallOnAppQuit: true } }));
const lifecycle = new EventEmitter();
vi.mock('electron', () => ({
  get app() {
    return lifecycle;
  },
}));
vi.mock('electron-updater', () => ({ autoUpdater: state.autoUpdater }));
vi.mock('../recoveryInstallation', () => ({ isRecoveryActive: () => state.active }));
import { UpdaterRecoveryGuard } from '../updaterRecoveryGuard';
beforeEach(() => {
  vi.useFakeTimers();
  state.active = false;
  state.autoUpdater.autoInstallOnAppQuit = true;
  lifecycle.removeAllListeners();
});
afterEach(() => {
  vi.useRealTimers();
  lifecycle.removeAllListeners();
});
describe('normal updater exclusion during recovery', () => {
  it('disables install-on-quit as soon as recovery starts and reports state changes without repeated notifications', () => {
    const change = vi.fn();
    const guard = new UpdaterRecoveryGuard(change);
    guard.start();
    state.active = true;
    vi.advanceTimersByTime(2000);
    expect(state.autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(change).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(4000);
    expect(change).toHaveBeenCalledTimes(1);
    state.active = false;
    guard.refresh();
    expect(change).toHaveBeenLastCalledWith(false);
    guard.dispose();
  });
  it('still checks immediately before electron-updater quit handlers after async shutdown cleanup', () => {
    const guard = new UpdaterRecoveryGuard(vi.fn());
    guard.start();
    const installer = vi.fn();
    lifecycle.on('quit', () => {
      if (state.autoUpdater.autoInstallOnAppQuit) installer();
    });
    lifecycle.emit('before-quit');
    guard.dispose();
    state.active = true;
    lifecycle.emit('quit');
    expect(installer).not.toHaveBeenCalled();
  });
});
