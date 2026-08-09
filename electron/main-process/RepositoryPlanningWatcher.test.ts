import { EventEmitter } from 'events';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryPlanningWatcher } from './RepositoryPlanningWatcher';

type FakeWatcher = EventEmitter & { close: ReturnType<typeof vi.fn> };

const createFakeWatcher = (): FakeWatcher => Object.assign(new EventEmitter(), { close: vi.fn() });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RepositoryPlanningWatcher', () => {
  const setup = () => {
    const watchers = new Map<string, { watcher: FakeWatcher; notify: (eventType: string, fileName: string | null) => void }>();
    const createWatcher = ((watchedPath: string, _options: unknown, notify: (eventType: string, fileName: string | Buffer | null) => void) => {
      const watcher = createFakeWatcher();
      watchers.set(watchedPath, { watcher, notify });
      return watcher;
    }) as never;
    return { watchers, createWatcher };
  };

  it('reports planning.json changes for every known repository', () => {
    vi.useFakeTimers();
    const { watchers, createWatcher } = setup();
    const onChanged = vi.fn();
    const firstRepository = path.resolve('/repositories/first');
    const secondRepository = path.resolve('/repositories/second');
    const watcher = new RepositoryPlanningWatcher(onChanged, 100, createWatcher);

    watcher.setRepositories([firstRepository, secondRepository]);

    watchers.get(path.join(secondRepository, '.Open-Git-Control'))?.notify('change', 'run.json');
    vi.advanceTimersByTime(100);
    expect(onChanged).not.toHaveBeenCalled();

    watchers.get(path.join(secondRepository, '.Open-Git-Control'))?.notify('rename', 'planning.json');
    vi.advanceTimersByTime(100);
    expect(onChanged).toHaveBeenCalledWith(secondRepository);

    watchers.get(path.join(firstRepository, '.Open-Git-Control'))?.notify('change', 'planning.json');
    vi.advanceTimersByTime(100);
    expect(onChanged).toHaveBeenCalledWith(firstRepository);
    watcher.dispose();
  });

  it('stops watching repositories that are no longer known', () => {
    vi.useFakeTimers();
    const { watchers, createWatcher } = setup();
    const removedRepository = path.resolve('/repositories/removed');
    const keptRepository = path.resolve('/repositories/kept');
    const watcher = new RepositoryPlanningWatcher(vi.fn(), 100, createWatcher);

    watcher.setRepositories([removedRepository, keptRepository]);
    const keptWatcher = watchers.get(keptRepository)?.watcher;
    watcher.setRepositories([keptRepository]);

    expect(watchers.get(removedRepository)?.watcher.close).toHaveBeenCalledTimes(1);
    expect(keptWatcher?.close).not.toHaveBeenCalled();
    watcher.dispose();
    expect(keptWatcher?.close).toHaveBeenCalledTimes(1);
  });
});
