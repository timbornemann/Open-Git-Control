import { EventEmitter } from 'events';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryRunConfigWatcher } from './RepositoryRunConfigWatcher';

type FakeWatcher = EventEmitter & { close: ReturnType<typeof vi.fn> };

const createFakeWatcher = (): FakeWatcher => Object.assign(new EventEmitter(), { close: vi.fn() });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RepositoryRunConfigWatcher', () => {
  it('watches only the active repository and coalesces run.json changes', () => {
    vi.useFakeTimers();
    const watchers = new Map<string, { watcher: FakeWatcher; notify: (eventType: string, fileName: string | null) => void }>();
    const createWatcher = ((watchedPath: string, _options: unknown, notify: (eventType: string, fileName: string | Buffer | null) => void) => {
      const watcher = createFakeWatcher();
      watchers.set(watchedPath, { watcher, notify });
      return watcher;
    }) as any;
    const onChanged = vi.fn();
    const repositoryPath = 'C:/repository';
    const configDirectory = path.join(repositoryPath, '.Open-Git-Control');
    const watcher = new RepositoryRunConfigWatcher(onChanged, 100, createWatcher);

    watcher.setRepository(repositoryPath);
    expect(watchers).toHaveProperty('size', 2);
    expect(watchers.get(repositoryPath)).toBeDefined();
    expect(watchers.get(configDirectory)).toBeDefined();

    watchers.get(configDirectory)?.notify('change', 'README.md');
    vi.advanceTimersByTime(100);
    expect(onChanged).not.toHaveBeenCalled();

    watchers.get(configDirectory)?.notify('change', 'run.json');
    watchers.get(configDirectory)?.notify('rename', 'run.json');
    vi.advanceTimersByTime(99);
    expect(onChanged).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith(repositoryPath);

    watcher.setRepository('C:/other-repository');
    expect(watchers.get(repositoryPath)?.watcher.close).toHaveBeenCalledTimes(1);
    expect(watchers.get(configDirectory)?.watcher.close).toHaveBeenCalledTimes(1);
    watcher.dispose();
  });

  it('starts watching run.json when the configuration directory is created later', () => {
    vi.useFakeTimers();
    const watchers = new Map<string, { watcher: FakeWatcher; notify: (eventType: string, fileName: string | null) => void }>();
    const repositoryPath = 'C:/repository';
    const configDirectory = path.join(repositoryPath, '.Open-Git-Control');
    let configDirectoryExists = false;
    const createWatcher = ((watchedPath: string, _options: unknown, notify: (eventType: string, fileName: string | Buffer | null) => void) => {
      if (watchedPath === configDirectory && !configDirectoryExists) throw new Error('Directory does not exist yet.');
      const watcher = createFakeWatcher();
      watchers.set(watchedPath, { watcher, notify });
      return watcher;
    }) as any;
    const onChanged = vi.fn();
    const watcher = new RepositoryRunConfigWatcher(onChanged, 100, createWatcher);

    watcher.setRepository(repositoryPath);
    expect(watchers.get(configDirectory)).toBeUndefined();

    configDirectoryExists = true;
    watchers.get(repositoryPath)?.notify('rename', '.Open-Git-Control');
    expect(watchers.get(configDirectory)).toBeDefined();
    watchers.get(configDirectory)?.notify('rename', 'run.json');
    vi.advanceTimersByTime(100);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith(repositoryPath);
    watcher.dispose();
  });
});
