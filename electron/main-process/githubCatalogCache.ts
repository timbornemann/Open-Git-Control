import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GithubCatalogSnapshotDto, GitHubRepositoryDto } from '../../src/types/githubDtos';
import { isSecureStorageAvailable } from './secureStore';
import { assertManagedPath } from './storageSafety';
import { recordCacheUse } from './managedStorage';
import { canPersistAuxiliary } from './auxiliaryDiskBudget';
import { writeTextFileAtomically } from './atomicFile';
import { mayReplaceCache } from './cacheReplacement';

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
    if (
      !mayReplaceCache(app.getPath('userData'), cachePath(), (value) =>
        Boolean(value && typeof value === 'object' && !('version' in value) && Array.isArray((value as StoredSnapshot).publicRepos)),
      )
    )
      return;
    assertManagedPath(app.getPath('userData'), cachePath());
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
    recordCacheUse(cachePath());
    return sessionSnapshot;
  }
  try {
    assertManagedPath(app.getPath('userData'), cachePath());
    const stored = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as StoredSnapshot;
    if ('version' in stored) return null;
    if (stored.host.toLowerCase() !== host.toLowerCase() || (username && !sameAccount(host, username, stored))) {
      clearGithubCatalogCache();
      return null;
    }
    const canDecryptPrivateRepos = Boolean(stored.encryptedPrivateRepos && isSecureStorageAvailable());
    const privateRepos =
      canDecryptPrivateRepos && stored.encryptedPrivateRepos
        ? (JSON.parse(safeStorage.decryptString(Buffer.from(stored.encryptedPrivateRepos, 'base64'))) as GitHubRepositoryDto[])
        : [];
    sessionSnapshot = {
      host: stored.host,
      username: stored.username,
      savedAt: stored.savedAt,
      repos: [...stored.publicRepos, ...privateRepos],
      refreshRequired: stored.refreshRequired || Boolean(stored.encryptedPrivateRepos && !canDecryptPrivateRepos),
    };
    recordCacheUse(cachePath());
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
  const stored: StoredSnapshot = {
    host,
    username,
    savedAt,
    publicRepos,
    encryptedPrivateRepos,
    refreshRequired: privateRepos.length > 0 && !encryptedPrivateRepos,
  };
  const raw = JSON.stringify(stored);
  if (
    mayReplaceCache(app.getPath('userData'), cachePath(), (value) =>
      Boolean(
        value &&
        typeof value === 'object' &&
        !('version' in value) &&
        Array.isArray((value as StoredSnapshot).publicRepos) &&
        typeof (value as StoredSnapshot).host === 'string' &&
        typeof (value as StoredSnapshot).username === 'string' &&
        typeof (value as StoredSnapshot).savedAt === 'string',
      ),
    ) &&
    canPersistAuxiliary(app.getPath('userData'), cachePath(), Buffer.byteLength(raw))
  )
    writeTextFileAtomically(cachePath(), raw);
  recordCacheUse(cachePath());
  return sessionSnapshot;
}
