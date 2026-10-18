import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitLfsStatusCache } from '../GitLfsStatusCache';
import { updateToolRuntime } from '../../system-tools/toolRuntime';

afterEach(() => vi.useRealTimers());
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe('LFS availability and worktree preview lifetime', () => {
  it('shares the availability check, serializes the same repository and does not block another repository', async () => {
    const cache = new GitLfsStatusCache(),
      gate = deferred();
    const probe = vi.fn(async () => {}),
      second = vi.fn(async () => {});
    const first = cache.read('/repo', probe, async () => gate.promise);
    const queued = cache.read('/repo', probe, second);
    await cache.read('/other', probe, async () => {});
    expect(second).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(2);
    gate.resolve();
    await Promise.all([first, queued]);
    expect(second).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('expires successful and failed probes and immediately rechecks a changed tool runtime', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cache = new GitLfsStatusCache(),
      probe = vi.fn(async () => {});
    const read = () => cache.read('/repo', probe, async (_cache, availability) => availability);
    expect(await read()).toEqual({ available: true });
    await read();
    expect(probe).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 30000);
    await read();
    expect(probe).toHaveBeenCalledTimes(2);
    updateToolRuntime({ id: 'git-lfs', required: false, state: 'available', version: 'different-version', downloadUrl: '', instructionsUrl: '' });
    await read();
    expect(probe).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.now() + 30000);
    probe.mockRejectedValueOnce(new Error('missing'));
    expect(await read()).toMatchObject({ available: false });
    await read();
    expect(probe).toHaveBeenCalledTimes(4);
    vi.setSystemTime(Date.now() + 5000);
    expect(await read()).toEqual({ available: true });
    expect(probe).toHaveBeenCalledTimes(5);
  });

  it('does not turn cancelled probes into a cached missing-program result, and recovers after read failure', async () => {
    const cache = new GitLfsStatusCache();
    const probe = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      .mockResolvedValue(undefined);
    const inspect = vi.fn(async () => 'ok');
    await expect(cache.read('/repo', probe, inspect)).rejects.toMatchObject({ name: 'AbortError' });
    expect(inspect).not.toHaveBeenCalled();
    await expect(
      cache.read('/repo', probe, async () => {
        throw new Error('read failed');
      }),
    ).rejects.toThrow('read failed');
    await expect(cache.read('/repo', probe, inspect)).resolves.toBe('ok');
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('isolates working trees and evicts old repository caches', async () => {
    const cache = new GitLfsStatusCache(),
      probe = async () => {};
    const initial = await cache.read('/one', probe, async (entry) => {
      entry.set('test', 'one');
      return entry;
    });
    const other = await cache.read('/two', probe, async (entry) => entry);
    expect(other.get('test')).toBeUndefined();
    expect(await cache.read('/one', probe, async (entry) => entry)).toBe(initial);
    for (const name of ['three', 'four', 'five', 'six']) await cache.read(`/${name}`, probe, async () => {});
    const reopened = await cache.read('/one', probe, async (entry) => entry);
    expect(reopened).not.toBe(initial);
    expect(reopened.get('test')).toBeUndefined();
  });
});
