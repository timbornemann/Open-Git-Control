import type { StorageOverview } from '../../src/shared/ipc/storageMaintenance';

/** Coalesce triggers; busy passes are retried without accumulating jobs. */
export class MaintenanceScheduler {
  private timer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout;
  private running = false;
  private pending = false;
  private stopped = false;
  constructor(
    private readonly deps: {
      enabled: () => boolean;
      busy: () => boolean;
      run: () => Promise<StorageOverview>;
      publish: (value: StorageOverview) => void;
      error: (error: unknown) => void;
    },
  ) {
    this.schedule(30_000);
    this.interval = setInterval(() => this.schedule(0), 6 * 60 * 60_000);
    this.interval.unref();
  }
  schedule(delay = 2000): void {
    if (this.stopped || this.timer) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.perform();
    }, delay);
    this.timer.unref();
  }
  private async perform() {
    if (this.stopped) return;
    try {
      if (!this.deps.enabled()) return;
      if (this.deps.busy()) {
        this.schedule(30_000);
        return;
      }
      this.running = true;
      this.deps.publish(await this.deps.run());
    } catch (error) {
      if (!this.stopped) this.deps.error(error);
    } finally {
      this.running = false;
      if (this.pending && !this.stopped) {
        this.pending = false;
        this.schedule();
      }
    }
  }
  dispose() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    clearInterval(this.interval);
  }
}
