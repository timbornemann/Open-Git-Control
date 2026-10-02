import { ipcMain } from 'electron';
import type { GitHubService } from '../../GitHubService';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { PreviewSnapshot } from '../../../src/shared/cache/resource';
import { readSettingsWithMigration } from '../settingsStore';
import { readStoreData } from '../repoStore';
import { readSavedGithubTokenWithHost } from '../secureStore';
import { readGithubCatalogCache } from '../githubCatalogCache';
import { readPreviewCache, savePreviewCache } from '../previewCache';

const repoKey = (value: string) => {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

export function registerBootstrapHandlers(github: GitHubService) {
  const githubAccount = () => {
    const host = github.normalizeHost(readSettingsWithMigration().githubHost);
    const saved = readSavedGithubTokenWithHost();
    if (!(github.isAuthenticated() && github.getHost() === host) && !(saved && (saved.host || 'github.com') === host)) return null;
    return readGithubCatalogCache(host, github.isAuthenticated() ? github.getUsername() : null);
  };
  ipcMain.handle(IpcChannel.AppBootstrap, async () => {
    const settings = readSettingsWithMigration();
    const repositories = readStoreData();
    const githubCatalog = githubAccount();
    const recent = new Set(
      repositories.repos
        .filter((repo) => !repositories.activeRepo || repoKey(repo.path) !== repoKey(repositories.activeRepo))
        .sort((a, b) => b.lastOpened - a.lastOpened)
        .slice(0, 2)
        .map((repo) => repoKey(repo.path)),
    );
    if (repositories.activeRepo) recent.add(repoKey(repositories.activeRepo));
    const registered = new Set(repositories.repos.map((repo) => repoKey(repo.path)));
    const githubScope = githubCatalog ? `${githubCatalog.host}/${githubCatalog.username}`.toLowerCase() : null;
    const snapshots = await readPreviewCache((entry) =>
      entry.key[1] === 'github'
        ? entry.key[2] === githubScope
        : entry.key[1] === 'planner' ||
          (entry.key[1] === 'git' && entry.key[3] === 'getRepositoryChangeSummary' ? registered.has(entry.key[2]) : recent.has(entry.key[2])),
    );
    const currentAccount = githubAccount();
    const currentScope = currentAccount ? `${currentAccount.host}/${currentAccount.username}`.toLowerCase() : null;
    return {
      settings,
      repositories,
      snapshots: snapshots.filter((entry) => entry.key[1] !== 'github' || entry.key[2] === currentScope),
      githubCatalog: currentScope === githubScope ? githubCatalog : null,
    };
  });
  ipcMain.handle(IpcChannel.AppSavePreviews, async (_event, entries: unknown) => {
    if (!Array.isArray(entries)) return;
    const repositories = new Set(readStoreData().repos.map((repo) => repoKey(repo.path)));
    const scope = github.isAuthenticated() ? `${github.getHost()}/${github.getUsername()}`.toLowerCase() : null;
    await savePreviewCache(entries, (entry: PreviewSnapshot) =>
      entry.key[1] === 'github' ? entry.key[2] === scope : entry.key[1] === 'planner' || repositories.has(entry.key[2]),
    );
  });
}
