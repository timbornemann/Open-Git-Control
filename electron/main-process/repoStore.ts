import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from './atomicFile';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import type { RepositoryMutation } from '../../src/shared/ipc/storageMaintenance';
import { assertManagedPath } from './storageSafety';

export interface StoredRepoEntry {
  path: string;
  lastOpened: number;
  pinned: boolean;
  createdAt: number;
}

export type RepoSortBy = 'lastOpenedDesc' | 'nameAsc' | 'nameDesc' | 'createdAtDesc' | 'createdAtAsc';

export interface StoredData {
  revision?: number;
  repos: StoredRepoEntry[];
  activeRepo: string | null;
  sortBy: RepoSortBy;
}

export const DEFAULT_REPO_SORT_BY: RepoSortBy = 'lastOpenedDesc';

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'repos.json');
}

function normalizeRepoSortBy(value: unknown): RepoSortBy {
  const candidate = typeof value === 'string' ? value : '';
  switch (candidate) {
    case 'lastOpenedDesc':
    case 'nameAsc':
    case 'nameDesc':
    case 'createdAtDesc':
    case 'createdAtAsc':
      return candidate;
    default:
      return DEFAULT_REPO_SORT_BY;
  }
}

function resolveRepoCreatedAt(repoPath: string, fallbackTimestamp: number): number {
  // Reading the registry must never synchronously probe a disconnected drive.
  void repoPath;
  if (Number.isFinite(fallbackTimestamp) && fallbackTimestamp > 0) {
    return Math.floor(fallbackTimestamp);
  }
  return Date.now();
}

export function normalizeStoredData(input: Partial<StoredData> | null | undefined): StoredData {
  const reposInput = Array.isArray(input?.repos) ? input.repos : [];
  const sortBy = normalizeRepoSortBy(input?.sortBy);
  const repos: StoredRepoEntry[] = [];
  const entriesByKey = new Map<string, StoredRepoEntry>();

  for (const repo of reposInput as any[]) {
    const pathValue = typeof repo?.path === 'string' ? repo.path.trim() : '';
    if (!pathValue) continue;
    const lastOpened = Number.isFinite(repo?.lastOpened) ? Number(repo.lastOpened) : Date.now();
    const pinned = typeof repo?.pinned === 'boolean' ? repo.pinned : false;
    const createdAt = Number.isFinite(repo?.createdAt) ? Math.floor(Number(repo.createdAt)) : resolveRepoCreatedAt(pathValue, lastOpened);
    const key = repositoryPathKey(pathValue);
    const existing = entriesByKey.get(key);
    if (existing) {
      existing.lastOpened = Math.max(existing.lastOpened, lastOpened);
      existing.createdAt = Math.min(existing.createdAt, createdAt);
      existing.pinned = existing.pinned || pinned;
      continue;
    }

    const entry = { path: pathValue, lastOpened, pinned, createdAt };
    entriesByKey.set(key, entry);
    repos.push(entry);
  }

  const requestedActiveRepo = typeof input?.activeRepo === 'string' && input.activeRepo.trim().length > 0 ? input.activeRepo.trim() : null;
  const activeRepo = requestedActiveRepo ? entriesByKey.get(repositoryPathKey(requestedActiveRepo))?.path || requestedActiveRepo : null;

  return { repos, activeRepo, sortBy, ...(Number.isSafeInteger(input?.revision) ? { revision: input!.revision } : {}) };
}

export function readStoreData(): StoredData {
  try {
    assertManagedPath(app.getPath('userData'), getStorePath());
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    if (
      !parsed ||
      ('version' in parsed && parsed.version !== 1) ||
      !Array.isArray(parsed.repos) ||
      parsed.repos.some((repo) => !repo || typeof repo.path !== 'string' || !path.isAbsolute(repo.path))
    )
      throw new Error('Invalid repository registry.');
    return normalizeStoredData(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Repository registry could not be read. Existing data was preserved.', { cause: error });
    return { repos: [], activeRepo: null, sortBy: DEFAULT_REPO_SORT_BY };
  }
}

const storeListeners = new Set<() => void>();
const beforeListeners = new Set<(before: StoredData, after: StoredData) => void>();
export function onRepoStoreWillChange(listener: (before: StoredData, after: StoredData) => void): () => void {
  beforeListeners.add(listener);
  return () => beforeListeners.delete(listener);
}
export function notifyRepoStoreWillChange(before: StoredData, after: StoredData): void {
  for (const listener of beforeListeners) listener(before, after);
}

/** Notifies when the set of known repositories changed, for example after adding or removing one. */
export function onRepoStoreChanged(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

export function notifyRepoStoreChanged(): void {
  for (const listener of storeListeners) {
    try {
      listener();
    } catch {
      // A listener failure must not turn an already persisted write into an error.
    }
  }
}

export function writeStoreData(data: StoredData): void {
  const before = readStoreData();
  const after = { ...normalizeStoredData(data), revision: (before.revision || 0) + 1 };
  notifyRepoStoreWillChange(before, after);
  writeTextFileAtomically(getStorePath(), JSON.stringify(after, null, 2));
  notifyRepoStoreChanged();
}

/** Small main-process operations cannot reintroduce entries from a stale renderer snapshot. */
export function mutateRepositoryStore(operation: RepositoryMutation): StoredData {
  if (!operation || typeof operation !== 'object') throw new Error('Invalid repository operation.');
  const data = readStoreData();
  const requested = 'path' in operation ? operation.path : null;
  if (requested !== null && (typeof requested !== 'string' || !path.isAbsolute(requested))) throw new Error('An absolute repository path is required.');
  const entry = data.repos.find((repo) => requested !== null && repositoryPathKey(repo.path) === repositoryPathKey(requested));
  switch (operation.kind) {
    case 'add':
      if (!entry) data.repos.push({ path: operation.path, lastOpened: Date.now(), pinned: false, createdAt: Date.now() });
      break;
    case 'remove':
      data.repos = data.repos.filter((repo) => repo !== entry);
      if (entry && data.activeRepo && repositoryPathKey(data.activeRepo) === repositoryPathKey(entry.path)) data.activeRepo = null;
      break;
    case 'metadata':
      if (!entry) throw new Error('The repository is no longer registered.');
      if (operation.pinned !== undefined) {
        if (typeof operation.pinned !== 'boolean') throw new Error('Invalid pin value.');
        entry.pinned = operation.pinned;
      }
      if (operation.lastOpened !== undefined) {
        if (!Number.isFinite(operation.lastOpened)) throw new Error('Invalid repository timestamp.');
        entry.lastOpened = operation.lastOpened;
      }
      break;
    case 'activate':
      if (operation.path !== null && !entry) throw new Error('The repository is no longer registered.');
      data.activeRepo = entry?.path || null;
      break;
    case 'sort':
      if (normalizeRepoSortBy(operation.sortBy) !== operation.sortBy) throw new Error('Invalid sort order.');
      data.sortBy = operation.sortBy;
      break;
    case 'canonicalize': {
      if (typeof operation.canonicalPath !== 'string' || !path.isAbsolute(operation.canonicalPath)) throw new Error('An absolute canonical path is required.');
      if (!entry && data.repos.some((repo) => repositoryPathKey(repo.path) === repositoryPathKey(operation.canonicalPath))) return data;
      if (!entry) throw new Error('The repository is no longer registered.');
      if (repositoryPathKey(fs.realpathSync.native(entry.path)) !== repositoryPathKey(fs.realpathSync.native(operation.canonicalPath)))
        throw new Error('Repository aliases must refer to the same directory.');
      const wasActive = data.activeRepo && repositoryPathKey(data.activeRepo) === repositoryPathKey(entry.path);
      entry.path = operation.canonicalPath;
      if (wasActive) data.activeRepo = entry.path;
      break;
    }
    default:
      throw new Error('Unsupported repository operation.');
  }
  writeStoreData(data);
  return readStoreData();
}
