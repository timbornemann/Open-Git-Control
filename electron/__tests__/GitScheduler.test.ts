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

  it('serializes writes across trailing-slash path aliases of the same repository', async () => {
    const scheduler = new GitScheduler();
    const blocker = deferred<void>();
    const order: string[] = [];
    const first = scheduler.schedule('C:/repo', 'write', 'add', async () => {
      order.push('first-start');
      await blocker.promise;
      order.push('first-end');
    });
    // Same repository via a trailing-separator alias -> must share the queue.
    const second = scheduler.schedule('C:/repo/', 'write', 'commit', async () => {
      order.push('second-start');
    });

    await Promise.resolve();
    expect(order).toEqual(['first-start']);

    blocker.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('rejects an aborted queued job immediately without waiting for the active job', async () => {
    const scheduler = new GitScheduler();
    const blocker = deferred<void>();
    const controller = new AbortController();
    const ran = vi.fn();

    const activeWrite = scheduler.schedule('C:/repo', 'write', 'add', async () => {
      await blocker.promise;
    });
    const queued = scheduler.schedule('C:/repo', 'write', 'commit', async () => ran(), { signal: controller.signal });

    // Abort while the first write is still blocking; the queued job must reject
    // now, not only after the active job eventually completes.
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(ran).not.toHaveBeenCalled();

    blocker.resolve();
    await activeWrite;
  });

  it('runs three background reads while reserving capacity for polling', async () => {
    const scheduler = new GitScheduler();
    const blockers = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];
    const started: string[] = [];
    const backgrounds = blockers.map((blocker, index) =>
      scheduler.schedule('C:/repo', 'background', `stats-${index}`, async () => {
        started.push(`background-${index}`);
        await blocker.promise;
      }),
    );

    await vi.waitFor(() => {
      expect(started).toHaveLength(3);
    });
    const polling = scheduler.schedule('C:/repo', 'polling', 'status', async () => {
      started.push('polling');
    });
    await expect(polling).resolves.toBeUndefined();
    expect(started).toContain('polling');
    expect(started).not.toContain('background-3');

    blockers[0].resolve();
    await vi.waitFor(() => {
      expect(started).toContain('background-3');
    });
    blockers.slice(1).forEach((blocker) => blocker.resolve());
    await Promise.all(backgrounds);
  });

  it('serializes ref-mutating network work with writes while allowing local reads', async () => {
    const scheduler = new GitScheduler();
    const networkGate = deferred<void>();
    const started: string[] = [];
    const fetch = scheduler.schedule('C:/repo', 'network', 'fetch', async () => {
      started.push('fetch');
      await networkGate.promise;
    });

    const commit = scheduler.schedule('C:/repo', 'write', 'commit', async () => {
      started.push('commit');
    });
    const log = scheduler.schedule('C:/repo', 'interactive', 'log', async () => {
      started.push('log');
    });

    await expect(log).resolves.toBeUndefined();
    expect(started).toEqual(['fetch', 'log']);
    networkGate.resolve();
    await Promise.all([fetch, commit]);
    expect(started).toEqual(['fetch', 'log', 'commit']);
  });

  it('does not start fetch or push while a local write is active', async () => {
    const scheduler = new GitScheduler();
    const writeGate = deferred<void>();
    const started: string[] = [];
    const write = scheduler.schedule('C:/repo', 'write', 'checkout', async () => {
      started.push('write');
      await writeGate.promise;
    });
    const push = scheduler.schedule('C:/repo', 'network', 'push', async () => {
      started.push('push');
    });

    await Promise.resolve();
    expect(started).toEqual(['write']);
    writeGate.resolve();
    await Promise.all([write, push]);
    expect(started).toEqual(['write', 'push']);
  });

  it('lets a pure remote read overlap a local write', async () => {
    const scheduler = new GitScheduler();
    const writeGate = deferred<void>();
    const started: string[] = [];
    const write = scheduler.schedule('C:/repo', 'write', 'commit', async () => {
      started.push('write');
      await writeGate.promise;
    });
    const remoteRead = scheduler.schedule('C:/repo', 'network-read', 'ls-remote', async () => {
      started.push('ls-remote');
    });

    await expect(remoteRead).resolves.toBeUndefined();
    expect(started).toEqual(['write', 'ls-remote']);
    writeGate.resolve();
    await write;
  });
});
