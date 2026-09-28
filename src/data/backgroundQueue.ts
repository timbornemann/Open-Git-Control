import type { ReadPriority } from '@/shared/cache/resource';

const priorities: Record<ReadPriority, number> = { visible: 0, repository: 1, startup: 2, speculative: 3 };
type Job = { priority: ReadPriority; github: boolean; signal: AbortSignal; key?: string; run: () => void; reject: (reason: Error) => void };
export const abortError = () => new DOMException('The read was cancelled.', 'AbortError');

/** Visible reads bypass background capacity. A catalog releases its slot after
 * every page, allowing navigation to overtake a long paginated download. */
export class BackgroundQueue {
  private jobs: Job[] = [];
  private running = 0;
  private githubRunning = 0;
  private paused = false;
  private githubBlockedUntil = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  get size() {
    return this.jobs.length;
  }
  get active() {
    return this.running;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.drain();
  }
  promote(key: string) {
    for (const job of this.jobs) if (job.key === key) job.priority = 'visible';
    this.drain();
  }
  deferGithub(until: number) {
    this.githubBlockedUntil = Math.max(this.githubBlockedUntil, until);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.drain(), Math.max(0, this.githubBlockedUntil - Date.now()));
  }

  schedule<T>(operation: () => Promise<T>, priority: ReadPriority, github: boolean, signal: AbortSignal, key?: string): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        priority,
        github,
        signal,
        key,
        reject,
        run: () => {
          signal.removeEventListener('abort', cancel);
          const background = job.priority !== 'visible';
          if (background) this.running++;
          if (github) this.githubRunning++;
          void Promise.resolve()
            .then(operation)
            .then((value) => (signal.aborted ? reject(abortError()) : resolve(value)), reject)
            .finally(() => {
              if (background) this.running--;
              if (github) this.githubRunning--;
              this.drain();
            });
        },
      };
      const cancel = () => {
        this.jobs = this.jobs.filter((entry) => entry !== job);
        reject(abortError());
      };
      signal.addEventListener('abort', cancel, { once: true });
      this.jobs.push(job);
      this.drain();
    });
  }

  private drain() {
    this.jobs.sort((a, b) => priorities[a.priority] - priorities[b.priority]);
    for (const job of [...this.jobs]) {
      if (job.signal.aborted) {
        this.jobs.splice(this.jobs.indexOf(job), 1);
        continue;
      }
      if (job.github && (this.githubRunning >= 1 || Date.now() < this.githubBlockedUntil)) continue;
      if (job.priority !== 'visible' && (this.paused || this.running >= 2)) continue;
      this.jobs.splice(this.jobs.indexOf(job), 1);
      job.run();
    }
  }
}

export const backgroundQueue = new BackgroundQueue();
