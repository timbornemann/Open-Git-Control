import { describe, expect, it, vi } from 'vitest';
import { GitScheduler } from '../GitScheduler';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('GitScheduler', () => {
  it('coalesces overlapping polling requests', async () => {
    const scheduler = new GitScheduler();
    const result = deferred<string>();
    const run = vi.fn(() => result.promise);

    const first = scheduler.schedule('C:/repo', 'polling', 'status', run, { coalesceKey: 'status' });
    const second = scheduler.schedule('C:/repo', 'polling', 'status', run, { coalesceKey: 'status' });

    expect(first).toBe(second);
    expect(run).toHaveBeenCalledTimes(1);
    result.resolve('ok');
    await expect(first).resolves.toBe('ok');
  });

  it('aborts background work before starting an interactive request', async () => {
    const scheduler = new GitScheduler();
    const started: string[] = [];
    const background = scheduler.schedule('C:/repo', 'background', 'stats', async (signal) => {
      started.push('background');
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
      return 'never';
    });

    const interactive = scheduler.schedule('C:/repo', 'interactive', 'diff', async () => {
      started.push('interactive');
      return 'diff';
    });

    await expect(background).rejects.toMatchObject({ name: 'AbortError' });
    await expect(interactive).resolves.toBe('diff');
    expect(started).toEqual(['background', 'interactive']);
    expect(scheduler.getDiagnostics().some((entry) => entry.kind === 'background' && entry.aborted)).toBe(true);
  });

  it('runs queued writes before queued reads', async () => {
    const scheduler = new GitScheduler();
    const blocker = deferred<void>();
    const order: string[] = [];
    const activeWrite = scheduler.schedule('C:/repo', 'write', 'add', async () => {
      order.push('active-write');
      await blocker.promise;
    });
    const polling = scheduler.schedule('C:/repo', 'polling', 'status', async () => {
      order.push('polling');
    });
    const write = scheduler.schedule('C:/repo', 'write', 'commit', async () => {
      order.push('write');
    });

    blocker.resolve();
    await Promise.all([activeWrite, polling, write]);
    expect(order.indexOf('write')).toBeLessThan(order.indexOf('polling'));
  });
});
