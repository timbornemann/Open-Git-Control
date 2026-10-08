import { ipcMain } from 'electron';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { PreviewSnapshot } from '../../../src/shared/cache/resource';
import { readSettingsWithMigration } from '../settingsStore';
import { readStoreData } from '../repoStore';
import { readPreviewCache, savePreviewCache } from '../previewCache';
import { systemToolsService } from '../../system-tools/SystemToolsService';

const repoKey = (value: string) => {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

export function registerBootstrapHandlers() {
  ipcMain.handle(IpcChannel.AppBootstrap, async () => {
    const settings = readSettingsWithMigration();
    const repositories = readStoreData();
    const recent = new Set(
      repositories.repos
        .filter((repo) => !repositories.activeRepo || repoKey(repo.path) !== repoKey(repositories.activeRepo))
        .sort((a, b) => b.lastOpened - a.lastOpened)
        .slice(0, 2)
        .map((repo) => repoKey(repo.path)),
    );
    if (repositories.activeRepo) recent.add(repoKey(repositories.activeRepo));
    const registered = new Set(repositories.repos.map((repo) => repoKey(repo.path)));
    const snapshots = await readPreviewCache(
      (entry) =>
        entry.key[1] !== 'github' &&
        (entry.key[1] === 'planner' ||
          (entry.key[1] === 'git' && entry.key[3] === 'getRepositoryChangeSummary' ? registered.has(entry.key[2]) : recent.has(entry.key[2]))),
    );
    return { settings, repositories, snapshots, systemTools: systemToolsService.snapshot() };
  });
  ipcMain.handle(IpcChannel.AppSavePreviews, async (_event, entries: unknown) => {
    if (!Array.isArray(entries)) return;
    const repositories = new Set(readStoreData().repos.map((repo) => repoKey(repo.path)));
    await savePreviewCache(entries, (entry: PreviewSnapshot) => entry.key[1] !== 'github' && (entry.key[1] === 'planner' || repositories.has(entry.key[2])));
  });
}
