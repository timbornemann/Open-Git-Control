import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { isRecoveryActive } from './recoveryInstallation';

export const RECOVERY_UPDATE_BUSY = 'The independent recovery updater is active for this installation. Finish or cancel it before updating here.';
export class UpdaterRecoveryGuard {
  private timer: NodeJS.Timeout | undefined;
  private previous = false;
  private quitting = false;
  private readonly finalQuit = () => {
    if (isRecoveryActive()) autoUpdater.autoInstallOnAppQuit = false;
  };
  private readonly beforeQuit = () => {
    this.quitting = true;
    this.finalQuit();
  };
  constructor(private readonly onChange: (blocked: boolean) => void) {}
  start(): void {
    if (this.timer) return;
    this.refresh();
    app.on?.('before-quit', this.beforeQuit);
    // Run before electron-updater's quit handler, including after async app cleanup.
    app.prependOnceListener?.('quit', this.finalQuit);
    this.timer = setInterval(() => this.refresh(), 2000);
    this.timer.unref();
  }
  refresh(): boolean {
    const active = isRecoveryActive();
    if (active) autoUpdater.autoInstallOnAppQuit = false;
    if (active !== this.previous) {
      this.previous = active;
      this.onChange(active);
    }
    return active;
  }
  dispose(): void {
    clearInterval(this.timer);
    this.finalQuit();
    app.removeListener?.('before-quit', this.beforeQuit);
    if (!this.quitting) app.removeListener?.('quit', this.finalQuit);
  }
}
