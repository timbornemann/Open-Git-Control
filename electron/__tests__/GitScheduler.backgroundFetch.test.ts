import { describe, expect, it, vi } from 'vitest';
import { GitScheduler, type GitJobKind } from '../GitScheduler';
import { BackgroundFetchPreemptedError } from '../git/BackgroundFetchPreemptedError';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('automatic fetch scheduling', () => {
  it.each(['add', 'commit'])('preempts an automatic fetch for %s but waits for process cleanup before the write', async (command) => {
    const scheduler = new GitScheduler();
    const cleanup = deferred();
    const started: string[] = [];
    let fetchSignal!: AbortSignal;
    const fetch = scheduler.schedule('C:/repo', 'background-fetch', 'fetch', async (signal) => {
      fetchSignal = signal;
      started.push('fetch');
      await cleanup.promise;
      started.push('fetch stopped');
      // Even a successful exit racing with abort must not publish sync success.
      return 'fetched';
    });
    const failure = expect(fetch).rejects.toBeInstanceOf(BackgroundFetchPreemptedError);
    const write = scheduler.schedule('C:/repo/', 'write', command, async () => {
      started.push(command);
    });
    expect(fetchSignal.aborted).toBe(true);
    await Promise.resolve();
    expect(started).toEqual(['fetch']);
    cleanup.resolve();
    await Promise.all([failure, write]);
    expect(started).toEqual(['fetch', 'fetch stopped', command]);
    expect(scheduler.getDiagnostics()[0]).toMatchObject({ kind: 'background-fetch', aborted: true });
    await expect(scheduler.schedule('C:/repo', 'background-fetch', 'retry fetch', async () => 'ok')).resolves.toBe('ok');
  });

  it.each(['network', 'network-read'] satisfies GitJobKind[])('yields the network lane to a foreground %s request', async (kind) => {
    const scheduler = new GitScheduler();
    const fetch = scheduler.schedule(
      'C:/repo',
      'background-fetch',
      'fetch',
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const failure = expect(fetch).rejects.toBeInstanceOf(BackgroundFetchPreemptedError);
    const foreground = scheduler.schedule('C:/repo', kind, 'manual remote operation', async () => 'ok');
    await failure;
    await expect(foreground).resolves.toBe('ok');
  });

  it('discards queued automatic fetches for foreground work without running them', async () => {
    const scheduler = new GitScheduler();
    const gate = deferred();
    const active = scheduler.schedule('C:/repo', 'write', 'add', () => gate.promise);
    const runFetch = vi.fn(async () => 'fetch');
    const fetch = scheduler.schedule('C:/repo', 'background-fetch', 'fetch', runFetch);
    const failure = expect(fetch).rejects.toBeInstanceOf(BackgroundFetchPreemptedError);
    const commit = scheduler.schedule('C:/repo', 'write', 'commit', async () => 'commit');
    await failure;
    expect(runFetch).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([active, commit]);
    expect(runFetch).not.toHaveBeenCalled();
  });

  it('does not interrupt automatic fetches for local reads or activity in another repository', async () => {
    const scheduler = new GitScheduler();
    const gate = deferred();
    let fetchSignal!: AbortSignal;
    const fetch = scheduler.schedule('C:/repo', 'background-fetch', 'fetch', async (signal) => {
      fetchSignal = signal;
      await gate.promise;
    });
    await Promise.all([
      scheduler.schedule('C:/repo', 'interactive', 'log', async () => 'log'),
      scheduler.schedule('C:/repo', 'polling', 'status', async () => 'status'),
      scheduler.schedule('C:/other', 'write', 'commit', async () => 'commit'),
    ]);
    expect(fetchSignal.aborted).toBe(false);
    gate.resolve();
    await fetch;
  });

  it.each(['fetch', 'push'])('never preempts a manual %s for a local write', async (command) => {
    const scheduler = new GitScheduler();
    const gate = deferred();
    let fetchSignal!: AbortSignal;
    const network = scheduler.schedule('C:/repo', 'network', command, async (signal) => {
      fetchSignal = signal;
      await gate.promise;
    });
    const runWrite = vi.fn(async () => 'commit');
    const write = scheduler.schedule('C:/repo', 'write', 'commit', runWrite);
    expect(fetchSignal.aborted).toBe(false);
    expect(runWrite).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([network, write]);
    expect(runWrite).toHaveBeenCalledOnce();
  });

  it('keeps caller cancellation distinct from foreground preemption', async () => {
    const scheduler = new GitScheduler();
    const controller = new AbortController();
    const fetch = scheduler.schedule(
      'C:/repo',
      'background-fetch',
      'fetch',
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      { signal: controller.signal },
    );
    const result = fetch.catch((error: Error) => error);
    controller.abort();
    const error = await result;
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(error).not.toBeInstanceOf(BackgroundFetchPreemptedError);
  });
});
