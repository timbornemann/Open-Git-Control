import { repositoryPathKey } from './activeRepositoryAuthorization';
import { OpenGitControlAssetWatcher, type WatchDirectory } from './OpenGitControlAssetWatcher';
import { REPOSITORY_PLANNING_FILE } from './repositoryPlanningFile';

/**
 * Planning data is shown for every known repository at once, so every known
 * repository is watched. Without this, planning data that arrived through a pull
 * or a branch switch stayed invisible until the app was restarted.
 */
export class RepositoryPlanningWatcher {
  private readonly watchers = new Map<string, OpenGitControlAssetWatcher>();

  constructor(
    private readonly onChanged: (repositoryPath: string) => void,
    private readonly changeDebounceMs?: number,
    private readonly createWatcher?: WatchDirectory,
  ) {}

  setRepositories(repositoryPaths: readonly string[]): void {
    const requested = new Map<string, string>();
    for (const repositoryPath of repositoryPaths) {
      const path = String(repositoryPath || '').trim();
      if (path) requested.set(repositoryPathKey(path), path);
    }

    for (const [key, watcher] of [...this.watchers]) {
      if (requested.has(key)) continue;
      watcher.dispose();
      this.watchers.delete(key);
    }

    for (const [key, repositoryPath] of requested) {
      if (this.watchers.has(key)) continue;
      const watcher = new OpenGitControlAssetWatcher(REPOSITORY_PLANNING_FILE, this.onChanged, this.changeDebounceMs, this.createWatcher);
      watcher.setRepository(repositoryPath);
      this.watchers.set(key, watcher);
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
  }
}
