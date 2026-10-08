import { ipcMain, type WebContents } from 'electron';
import type { GitService } from '../../GitService';
import { requireActiveRepositoryPath } from '../activeRepositoryAuthorization';
import { OpenGitControlAssetWatcher } from '../OpenGitControlAssetWatcher';
import { repositorySecretScanAllowlistService, secretScanAllowlistMigration } from '../repositorySecretScanAllowlist';
import { IpcChannel } from '../../../src/types/ipcContract';
import { SECRET_SCAN_ALLOWLIST_FILE } from '../../../src/types/repositorySecretScanAllowlist';
import type { RepoJobRegistry } from '../repoJobRegistry';

export function registerRepositorySecretScanAllowlistHandlers({
  gitService,
  repoJobRegistry,
  readSettingsWithMigration,
}: {
  gitService: GitService;
  repoJobRegistry: RepoJobRegistry;
  readSettingsWithMigration: () => unknown;
}): void {
  const watchers = new Map<number, OpenGitControlAssetWatcher>();
  const requireRepo = (value: unknown) => requireActiveRepositoryPath(value, gitService.getRepoPath(), 'secret-scan allowlist');
  const getWatcher = (sender: WebContents) => {
    const existing = watchers.get(sender.id);
    if (existing) return existing;
    const watcher = new OpenGitControlAssetWatcher(SECRET_SCAN_ALLOWLIST_FILE, (repoPath) => {
      if (!sender.isDestroyed()) sender.send(IpcChannel.RepositorySecretScanAllowlistChanged, repoPath);
    });
    watchers.set(sender.id, watcher);
    sender.once('destroyed', () => {
      watcher.dispose();
      watchers.delete(sender.id);
    });
    return watcher;
  };

  for (const operation of [
    IpcChannel.RepositorySecretScanAllowlistGet,
    IpcChannel.RepositorySecretScanAllowlistSave,
    IpcChannel.RepositorySecretScanAllowlistAddPaths,
  ]) {
    ipcMain.handle(operation, async (event, value: unknown) => {
      const request = value && typeof value === 'object' ? (value as Record<string, unknown>) : { repoPath: value };
      let job: ReturnType<RepoJobRegistry['begin']> | undefined;
      try {
        const repoPath = requireRepo(request.repoPath);
        job = repoJobRegistry.begin(repoPath);
        readSettingsWithMigration();
        const current = await repositorySecretScanAllowlistService.prepare(repoPath, operation !== IpcChannel.RepositorySecretScanAllowlistAddPaths);
        job.ensureActive();
        requireRepo(repoPath);
        const data =
          operation === IpcChannel.RepositorySecretScanAllowlistSave
            ? repositorySecretScanAllowlistService.save(repoPath, request.text, request.expectedVersion)
            : operation === IpcChannel.RepositorySecretScanAllowlistAddPaths
              ? repositorySecretScanAllowlistService.addPaths(repoPath, request.paths, request.expectedVersion)
              : current;
        const migration = secretScanAllowlistMigration.consumeReport(repoPath);
        if (operation !== IpcChannel.RepositorySecretScanAllowlistGet && !event.sender.isDestroyed())
          event.sender.send(IpcChannel.RepositorySecretScanAllowlistChanged, repoPath);
        return { success: true, data: { ...data, ...(migration ? { migration } : {}) } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Could not access repository secret-scan allowlist.' };
      } finally {
        job?.complete();
      }
    });
  }
  ipcMain.handle(IpcChannel.RepositorySecretScanAllowlistWatch, (event, value: unknown) => {
    try {
      getWatcher(event.sender).setRepository(value === null ? null : requireRepo(value));
      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not watch repository secret-scan allowlist.' };
    }
  });
}
