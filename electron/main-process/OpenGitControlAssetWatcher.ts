import * as fs from 'fs';
import * as path from 'path';
import { OPEN_GIT_CONTROL_DIRECTORY } from './openGitControlDirectory';

const DEFAULT_CHANGE_DEBOUNCE_MS = 150;

export type WatchDirectory = (directory: string, options: fs.WatchOptions, listener: fs.WatchListener<string | Buffer>) => fs.FSWatcher;

const watchDirectory: WatchDirectory = (directory, options, listener) => fs.watch(directory, options, listener);

const fileName = (value: string | Buffer | null): string => (value ? path.basename(value.toString()) : '');

/**
 * Watches one file inside the `.Open-Git-Control` directory of exactly one
 * repository. Watching the repository root lets us discover a newly created
 * configuration directory, while the nested watcher catches subsequent changes
 * without polling the filesystem. Git operations such as pull, checkout or a
 * branch switch replace these files, so the nested watcher is what keeps the app
 * in sync with data that changed outside of it.
 */
export class OpenGitControlAssetWatcher {
  private rootWatcher: fs.FSWatcher | null = null;
  private assetDirectoryWatcher: fs.FSWatcher | null = null;
  private changedTimer: NodeJS.Timeout | null = null;
  private repositoryPath: string | null = null;

  constructor(
    private readonly watchedFileName: string,
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
    this.watchAssetDirectory(repositoryPath);
  }

  dispose(): void {
    this.stop();
  }

  private stop(): void {
    this.repositoryPath = null;
    if (this.changedTimer) clearTimeout(this.changedTimer);
    this.changedTimer = null;
    this.closeWatcher(this.rootWatcher);
    this.closeWatcher(this.assetDirectoryWatcher);
    this.rootWatcher = null;
    this.assetDirectoryWatcher = null;
  }

  private watchRepositoryRoot(repositoryPath: string): void {
    try {
      const watcher = this.createWatcher(repositoryPath, { persistent: false }, (_eventType, changedPath) => {
        if (this.repositoryPath !== repositoryPath) return;
        const changedName = fileName(changedPath);
        if (changedName && changedName !== OPEN_GIT_CONTROL_DIRECTORY) return;
        this.watchAssetDirectory(repositoryPath);
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

  private watchAssetDirectory(repositoryPath: string): void {
    const assetDirectory = path.join(repositoryPath, OPEN_GIT_CONTROL_DIRECTORY);
    this.closeWatcher(this.assetDirectoryWatcher);
    this.assetDirectoryWatcher = null;
    try {
      const watcher = this.createWatcher(assetDirectory, { persistent: false }, (_eventType, changedPath) => {
        if (this.repositoryPath !== repositoryPath) return;
        const changedName = fileName(changedPath);
        if (changedName && changedName !== this.watchedFileName) return;
        this.scheduleChanged(repositoryPath);
      });
      watcher.on('error', () => {
        if (this.assetDirectoryWatcher === watcher) this.assetDirectoryWatcher = null;
      });
      this.assetDirectoryWatcher = watcher;
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
