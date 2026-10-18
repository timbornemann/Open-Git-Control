export type WorkingTreeRefreshInputs = { detailed: boolean; large: boolean; recursiveWatch: boolean };

/** Events provide freshness; bounded checks still cover missing filesystem notifications. */
export function workingTreeRefreshDelay({ detailed, large, recursiveWatch }: WorkingTreeRefreshInputs, unchanged: number): number {
  const base = detailed ? (large ? 15_000 : 5_000) : 30_000;
  const maximum = detailed ? (recursiveWatch ? 60_000 : large ? 30_000 : 15_000) : 120_000;
  return Math.min(maximum, base * 2 ** Math.min(unchanged, 4));
}

export class WorkingTreeRefreshSchedule {
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private running = false;
  private pending = false;
  private unchanged = 0;
  private lastVersion: string | undefined;
  private lastStarted = -Infinity;
  constructor(
    private readonly read: () => Promise<void>,
    private readonly version: () => string | undefined,
    private readonly inputs: () => WorkingTreeRefreshInputs,
    private readonly visible: () => boolean,
  ) {}

  start() {
    void this.run();
  }
  changed() {
    this.unchanged = 0;
    this.request(200);
  }
  resumed() {
    this.unchanged = 0;
    this.request(0);
  }
  hidden() {
    clearTimeout(this.timer);
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }
  private request(delay: number) {
    if (this.disposed || !this.visible()) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    clearTimeout(this.timer);
    const minimum = this.inputs().large ? 1500 : 500;
    this.timer = setTimeout(() => void this.run(), Math.max(delay, this.lastStarted + minimum - Date.now()));
  }
  private async run() {
    if (this.disposed || this.running || !this.visible()) return;
    this.running = true;
    this.pending = false;
    this.lastStarted = Date.now();
    try {
      await this.read();
      const next = this.version();
      this.unchanged = next !== undefined && next === this.lastVersion ? this.unchanged + 1 : 0;
      this.lastVersion = next;
    } catch {
      this.unchanged = 0;
    } finally {
      this.running = false;
      if (!this.disposed && this.visible()) {
        if (this.pending) this.request(200);
        else this.timer = setTimeout(() => void this.run(), workingTreeRefreshDelay(this.inputs(), this.unchanged));
      }
    }
  }
}
