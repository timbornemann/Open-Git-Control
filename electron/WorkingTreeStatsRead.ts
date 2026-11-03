import type { WorkingTreeStats } from './WorkingTreeService';

/** Each reader may detach independently. Expensive shared work stops when its last reader leaves. */
export class SharedWorkingTreeRead<T> {
  private readers = 0;
  private settled = false;
  constructor(
    readonly promise: Promise<T>,
    readonly controller: AbortController,
  ) {
    void promise.then(
      () => {
        this.settled = true;
      },
      () => {
        this.settled = true;
      },
    );
  }
  observe(signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    this.readers++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return false;
        done = true;
        signal?.removeEventListener('abort', aborted);
        if (--this.readers === 0 && !this.settled) this.controller.abort();
        return true;
      };
      const aborted = () => {
        if (finish()) reject(signal!.reason);
      };
      signal?.addEventListener('abort', aborted, { once: true });
      void this.promise.then(
        (value) => {
          if (finish()) resolve(value);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
      if (signal?.aborted) aborted();
    });
  }
}

export class WorkingTreeStatsRead extends SharedWorkingTreeRead<WorkingTreeStats> {}
