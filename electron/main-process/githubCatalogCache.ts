import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GithubCatalogSnapshotDto, GitHubRepositoryDto } from '../../src/types/githubDtos';
import { isSecureStorageAvailable } from './secureStore';

type StoredSnapshot = Omit<GithubCatalogSnapshotDto, 'repos'> & {
  publicRepos: GitHubRepositoryDto[];
  encryptedPrivateRepos?: string;
};

let sessionSnapshot: GithubCatalogSnapshotDto | null = null;
const cachePath = (): string => path.join(app.getPath('userData'), 'github-catalog.json');
const sameAccount = (host: string, username: string, snapshot: { host: string; username: string }): boolean =>
  snapshot.host.toLowerCase() === host.toLowerCase() && snapshot.username.toLowerCase() === username.toLowerCase();

export function clearGithubCatalogCache(): void {
  sessionSnapshot = null;
  try {
    fs.rmSync(cachePath(), { force: true });
  } catch {
    // A stale cache is rejected by account binding even if its file cannot be removed.
  }
}

export function readGithubCatalogCache(host: string, username?: string | null): GithubCatalogSnapshotDto | null {
  if (sessionSnapshot) {
    if (sessionSnapshot.host.toLowerCase() !== host.toLowerCase() || (username && !sameAccount(host, username, sessionSnapshot))) {
      clearGithubCatalogCache();
      return null;
    }
    return sessionSnapshot;
  }
  try {
    const stored = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as StoredSnapshot;
    if (stored.host.toLowerCase() !== host.toLowerCase() || (username && !sameAccount(host, username, stored))) {
      clearGithubCatalogCache();
      return null;
    }
    const privateRepos =
      stored.encryptedPrivateRepos && isSecureStorageAvailable()
        ? (JSON.parse(safeStorage.decryptString(Buffer.from(stored.encryptedPrivateRepos, 'base64'))) as GitHubRepositoryDto[])
        : [];
    sessionSnapshot = {
      host: stored.host,
      username: stored.username,
      savedAt: stored.savedAt,
      repos: [...stored.publicRepos, ...privateRepos],
    };
    return sessionSnapshot;
  } catch {
    return null;
  }
}

export function saveGithubCatalogCache(host: string, username: string, repos: GitHubRepositoryDto[]): GithubCatalogSnapshotDto {
  const savedAt = new Date().toISOString();
  const unique = [...new Map(repos.filter((repo) => Number.isFinite(repo.id)).map((repo) => [repo.id, repo])).values()];
  sessionSnapshot = { host, username, savedAt, repos: unique };
  const publicRepos = unique.filter((repo) => !repo.private);
  const privateRepos = unique.filter((repo) => repo.private);
  const encryptedPrivateRepos =
    privateRepos.length > 0 && isSecureStorageAvailable() ? safeStorage.encryptString(JSON.stringify(privateRepos)).toString('base64') : undefined;
  const stored: StoredSnapshot = { host, username, savedAt, publicRepos, encryptedPrivateRepos };
  fs.writeFileSync(cachePath(), JSON.stringify(stored), { mode: 0o600 });
  return sessionSnapshot;
}
