import * as fs from 'fs';
import * as path from 'path';

const CONFIG_DIRECTORY = '.Open-Git-Control';
const CONFIG_FILE = 'run.json';
const DEFAULT_CHANGE_DEBOUNCE_MS = 150;

type WatchDirectory = (directory: string, options: fs.WatchOptions, listener: fs.WatchListener<string | Buffer>) => fs.FSWatcher;

const watchDirectory: WatchDirectory = (directory, options, listener) => fs.watch(directory, options, listener);

const fileName = (value: string | Buffer | null): string => (value ? path.basename(value.toString()) : '');

/**
 * Watches exactly one active repository. Watching the repository root lets us
 * discover a newly created configuration directory, while the nested watcher
 * catches subsequent run.json changes without polling the filesystem.
 */
export class RepositoryRunConfigWatcher {
  private rootWatcher: fs.FSWatcher | null = null;
  private configDirectoryWatcher: fs.FSWatcher | null = null;
  private changedTimer: NodeJS.Timeout | null = null;
  private repositoryPath: string | null = null;

  constructor(
    private readonly onChanged: (repositoryPath: string) => void,
    private readonly changeDebounceMs = DEFAULT_CHANGE_DEBOUNCE_MS,
    private readonly createWatcher: WatchDirectory = watchDirectory,
  ) {}

  setRepository(repositoryPath: string | null): void {
    if (repositoryPath === this.repositoryPath) return;
    this.stop();
    if (!repositoryPath) return;

    this.repositoryPath = repositoryPath;
    this.watchRepositoryRoot(repositoryPath);
    this.watchConfigDirectory(repositoryPath);
  }

  dispose(): void {
    this.stop();
  }

  private stop(): void {
    this.repositoryPath = null;
    if (this.changedTimer) clearTimeout(this.changedTimer);
    this.changedTimer = null;
    this.closeWatcher(this.rootWatcher);
    this.closeWatcher(this.configDirectoryWatcher);
    this.rootWatcher = null;
    this.configDirectoryWatcher = null;
  }

  private watchRepositoryRoot(repositoryPath: string): void {
    try {
      const watcher = this.createWatcher(repositoryPath, { persistent: false }, (_eventType, changedPath) => {
        if (this.repositoryPath !== repositoryPath) return;
        const changedName = fileName(changedPath);
        if (changedName && changedName !== CONFIG_DIRECTORY) return;
        this.watchConfigDirectory(repositoryPath);
        this.scheduleChanged(repositoryPath);
      });
      watcher.on('error', () => {
        if (this.rootWatcher === watcher) this.rootWatcher = null;
      });
      this.rootWatcher = watcher;
    } catch {
      // The repository may have been moved or be temporarily unavailable. A
      // later repository selection re-establishes the watcher.
    }
  }

  private watchConfigDirectory(repositoryPath: string): void {
    const configDirectory = path.join(repositoryPath, CONFIG_DIRECTORY);
    this.closeWatcher(this.configDirectoryWatcher);
    this.configDirectoryWatcher = null;
    try {
      const watcher = this.createWatcher(configDirectory, { persistent: false }, (_eventType, changedPath) => {
        if (this.repositoryPath !== repositoryPath) return;
        const changedName = fileName(changedPath);
        if (changedName && changedName !== CONFIG_FILE) return;
        this.scheduleChanged(repositoryPath);
      });
      watcher.on('error', () => {
        if (this.configDirectoryWatcher === watcher) this.configDirectoryWatcher = null;
      });
      this.configDirectoryWatcher = watcher;
    } catch {
      // The directory is expected to be absent until a configuration is first
      // created. The root watcher will attach this nested watcher on creation.
    }
  }

  private scheduleChanged(repositoryPath: string): void {
    if (this.changedTimer) clearTimeout(this.changedTimer);
    this.changedTimer = setTimeout(() => {
      this.changedTimer = null;
      if (this.repositoryPath === repositoryPath) this.onChanged(repositoryPath);
    }, this.changeDebounceMs);
    this.changedTimer.unref?.();
  }

  private closeWatcher(watcher: fs.FSWatcher | null): void {
    try {
      watcher?.close();
    } catch {
      // Closing a watcher that was already invalidated by the OS is harmless.
    }
  }
}
