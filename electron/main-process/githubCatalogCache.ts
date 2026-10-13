import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GithubCatalogSnapshotDto, GitHubRepositoryDto } from '../../src/types/githubDtos';
import { isSecureStorageAvailable } from './secureStore';
import { assertManagedPath } from './storageSafety';
import { recordCacheUse } from './managedStorage';
import { canPersistAuxiliary, serializeAuxiliaryWrite } from './auxiliaryDiskBudget';
import { writeTextFileAtomicallyAsync } from './atomicFile';
import { mayReplaceCacheAsync } from './cacheReplacement';
import { cacheFileIdentityAsync } from './cacheFileIdentity';
import { readBoundedTextFile } from './boundedTextFile';

type StoredSnapshot = Omit<GithubCatalogSnapshotDto, 'repos'> & {
  publicRepos: GitHubRepositoryDto[];
  encryptedPrivateRepos?: string;
};

let sessionSnapshot: GithubCatalogSnapshotDto | null = null;
let revision = 0;
const cachePath = (): string => path.join(app.getPath('userData'), 'github-catalog.json');
const sameAccount = (host: string, username: string, snapshot: { host: string; username: string }): boolean =>
  snapshot.host.toLowerCase() === host.toLowerCase() && snapshot.username.toLowerCase() === username.toLowerCase();

export async function clearGithubCatalogCache(): Promise<void> {
  revision++;
  sessionSnapshot = null;
  try {
    const root = app.getPath('userData');
    const file = cachePath();
    await serializeAuxiliaryWrite(root, async () => {
      const identity = await cacheFileIdentityAsync(file);
      if (
        !(await mayReplaceCacheAsync(root, file, (value) =>
          Boolean(value && typeof value === 'object' && !('version' in value) && Array.isArray((value as StoredSnapshot).publicRepos)),
        ))
      )
        return;
      if ((await cacheFileIdentityAsync(file)) === identity) await fs.promises.rm(file, { force: true });
    });
  } catch {
    // A stale cache is rejected by account binding even if its file cannot be removed.
  }
}

export function readGithubCatalogCache(host: string, username?: string | null): GithubCatalogSnapshotDto | null {
  if (sessionSnapshot) {
    if (sessionSnapshot.host.toLowerCase() !== host.toLowerCase() || (username && !sameAccount(host, username, sessionSnapshot))) {
      void clearGithubCatalogCache();
      return null;
    }
    recordCacheUse(cachePath());
    return sessionSnapshot;
  }
  try {
    assertManagedPath(app.getPath('userData'), cachePath());
    const stored = JSON.parse(readBoundedTextFile(cachePath(), 16 * 1024 ** 2, 'GitHub catalogue')) as StoredSnapshot;
    if ('version' in stored) return null;
    if (stored.host.toLowerCase() !== host.toLowerCase() || (username && !sameAccount(host, username, stored))) {
      void clearGithubCatalogCache();
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

export async function saveGithubCatalogCache(host: string, username: string, repos: GitHubRepositoryDto[]): Promise<GithubCatalogSnapshotDto> {
  const savedAt = new Date().toISOString();
  const unique = [...new Map(repos.filter((repo) => Number.isFinite(repo.id)).map((repo) => [repo.id, repo])).values()];
  const snapshot = { host, username, savedAt, repos: unique };
  sessionSnapshot = snapshot;
  const currentRevision = ++revision;
  const current = () => revision === currentRevision && sessionSnapshot === snapshot;
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
  const root = app.getPath('userData');
  const file = cachePath();
  await serializeAuxiliaryWrite(root, async () => {
    if (!current()) return;
    const identity = await cacheFileIdentityAsync(file);
    if (
      (await mayReplaceCacheAsync(root, file, (value) =>
        Boolean(
          value &&
          typeof value === 'object' &&
          !('version' in value) &&
          Array.isArray((value as StoredSnapshot).publicRepos) &&
          typeof (value as StoredSnapshot).host === 'string' &&
          typeof (value as StoredSnapshot).username === 'string' &&
          typeof (value as StoredSnapshot).savedAt === 'string',
        ),
      )) &&
      (await canPersistAuxiliary(root, file, Buffer.byteLength(raw))) &&
      current()
    )
      await writeTextFileAtomicallyAsync(file, raw, root, async () => current() && (await cacheFileIdentityAsync(file)) === identity);
  });
  recordCacheUse(file);
  return snapshot;
}
