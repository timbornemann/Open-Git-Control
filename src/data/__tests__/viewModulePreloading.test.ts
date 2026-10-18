// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleViewModulePreloads } from '../viewModulePreloading';
import { preloadViewModule, viewModules } from '../viewModules';

type Name = keyof typeof viewModules;
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('active view first module loading', () => {
  let dispose: (() => void) | undefined;
  let nextId: number;
  let frames: Map<number, FrameRequestCallback>;
  let idles: Map<number, IdleRequestCallback>;
  let pending: Map<Name, ReturnType<typeof deferred>>;
  let loaded: Set<Name>;
  let started: Name[];
  let visibility: DocumentVisibilityState;

  const settle = async () => {
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  };
  const finish = async (name: Name) => {
    loaded.add(name);
    pending.get(name)!.resolve();
    await settle();
  };
  const paint = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(performance.now());
  };
  const idlePeriod = async (budget = 50) => {
    paint();
    await vi.advanceTimersByTimeAsync(1000);
    const callbacks = [...idles.values()];
    idles.clear();
    for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => budget });
    await settle();
  };
  const setVisible = (value: boolean) => {
    visibility = value ? 'visible' : 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    nextId = 0;
    frames = new Map();
    idles = new Map();
    pending = new Map();
    loaded = new Set();
    started = [];
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        idles.set(++nextId, callback);
        return nextId;
      }),
    );
    vi.stubGlobal(
      'cancelIdleCallback',
      vi.fn((id: number) => {
        idles.delete(id);
      }),
    );
    for (const name of Object.keys(viewModules) as Name[]) {
      vi.spyOn(viewModules[name], 'isReady').mockImplementation(() => loaded.has(name));
      vi.spyOn(viewModules[name], 'preload').mockImplementation(() => {
        if (!pending.has(name)) {
          started.push(name);
          pending.set(name, deferred());
        }
        return pending.get(name)!.promise;
      });
    }
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['repo', 'hosting', 'analytics', 'planner', 'settings', 'github'] as const)(
    'loads only the active %s view before it is available and painted',
    async (active) => {
      dispose = scheduleViewModulePreloads(active);
      const name = active === 'github' ? 'hosting' : active;
      expect(started).toEqual([name]);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(started).toEqual([name]);
      expect(frames.size).toBe(0);
      await finish(name);
      expect(frames.size).toBe(1);
      paint();
      await vi.advanceTimersByTimeAsync(999);
      expect(idles.size).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(idles.size).toBe(1);
      expect(started).toEqual([name]);
    },
  );

  it('loads at most one additional module per idle period and waits for its import', async () => {
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting']);
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting']);
    await finish('hosting');
    expect(started).toEqual(['repo', 'hosting']);
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting', 'planner']);
  });

  it('gives a new active view immediate priority and cancels queued imports from the previous navigation', async () => {
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    await idlePeriod();
    dispose();
    dispose = scheduleViewModulePreloads('settings');
    expect(started).toEqual(['repo', 'hosting', 'settings']);
    await finish('hosting');
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting', 'settings']);
    await finish('settings');
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting', 'settings', 'planner']);
  });

  it.each(['frame', 'timer', 'idle'] as const)('cancels the queued %s when hidden and resumes only in a new idle period', async (stage) => {
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    if (stage !== 'frame') paint();
    if (stage === 'idle') await vi.advanceTimersByTimeAsync(1000);
    setVisible(false);
    await idlePeriod();
    expect(started).toEqual(['repo']);
    expect(frames.size).toBe(0);
    expect(idles.size).toBe(0);
    setVisible(true);
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting']);
  });

  it('does not start a background import on a hidden startup or after an in-flight import finishes while hidden', async () => {
    setVisible(false);
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    await idlePeriod();
    expect(started).toEqual(['repo']);
    setVisible(true);
    await idlePeriod();
    setVisible(false);
    await finish('hosting');
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting']);
    setVisible(true);
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting', 'planner']);
  });

  it('defers low-budget idle callbacks instead of forcing an import on a busy renderer', async () => {
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    await idlePeriod(0);
    expect(started).toEqual(['repo']);
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting']);
  });

  it('keeps a paint and delay between imports when the idle API is unavailable', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    expect(started).toEqual(['repo']);
    paint();
    await vi.advanceTimersByTimeAsync(999);
    expect(started).toEqual(['repo']);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toEqual(['repo', 'hosting']);
    await finish('hosting');
    expect(started).toEqual(['repo', 'hosting']);
  });

  it('skips modules that were already loaded by navigation intent', async () => {
    await Promise.all([preloadViewModule('hosting'), finish('hosting')]);
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    await idlePeriod();
    expect(started).toEqual(['hosting', 'repo', 'planner']);
    expect(viewModules.hosting.preload).toHaveBeenCalledOnce();
  });

  it('continues after a speculative import fails without retrying it in a tight loop', async () => {
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    await idlePeriod();
    pending.get('hosting')!.reject(new Error('Import unavailable'));
    await settle();
    await idlePeriod();
    expect(started).toEqual(['repo', 'hosting', 'planner']);
  });

  it('allows an eager local view to paint before any speculative module loads', async () => {
    dispose = scheduleViewModulePreloads('localRepos');
    await settle();
    expect(started).toEqual([]);
    await idlePeriod();
    expect(started).toEqual(['repo']);
  });

  it('starts no more imports once every idle candidate is ready', async () => {
    dispose = scheduleViewModulePreloads('repo');
    await finish('repo');
    for (const name of ['hosting', 'planner', 'settings', 'analytics', 'file', 'editor', 'timeline'] as const) {
      await idlePeriod();
      expect(started[started.length - 1]).toBe(name);
      await finish(name);
    }
    expect(frames.size).toBe(0);
    expect(idles.size).toBe(0);
    expect(viewModules.release.preload).not.toHaveBeenCalled();
  });

  it('cannot resume after disposal even when the active import resolves or visibility changes', async () => {
    dispose = scheduleViewModulePreloads('repo');
    dispose();
    await finish('repo');
    setVisible(false);
    setVisible(true);
    await idlePeriod();
    expect(started).toEqual(['repo']);
    expect(frames.size).toBe(0);
  });
});
