import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from './atomicFile';
import { repositoryPathKey } from './activeRepositoryAuthorization';

export interface StoredRepoEntry {
  path: string;
  lastOpened: number;
  pinned: boolean;
  createdAt: number;
}

export type RepoSortBy = 'lastOpenedDesc' | 'nameAsc' | 'nameDesc' | 'createdAtDesc' | 'createdAtAsc';

export interface StoredData {
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
  try {
    const stats = fs.statSync(repoPath);
    if (Number.isFinite(stats.birthtimeMs) && stats.birthtimeMs > 0) {
      return Math.floor(stats.birthtimeMs);
    }
  } catch {
    // keep fallback when stats are unavailable
  }

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

  return { repos, activeRepo, sortBy };
}

export function readStoreData(): StoredData {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    return normalizeStoredData(parsed);
  } catch {
    return { repos: [], activeRepo: null, sortBy: DEFAULT_REPO_SORT_BY };
  }
}

const storeListeners = new Set<() => void>();

/** Notifies when the set of known repositories changed, for example after adding or removing one. */
export function onRepoStoreChanged(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

export function writeStoreData(data: StoredData): void {
  writeTextFileAtomically(getStorePath(), JSON.stringify(normalizeStoredData(data), null, 2));
  for (const listener of storeListeners) {
    try {
      listener();
    } catch {
      // A listener failure must not turn an already persisted write into an error.
    }
  }
}
