import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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
  const seen = new Set<string>();
  const sortBy = normalizeRepoSortBy(input?.sortBy);

  const repos: StoredRepoEntry[] = reposInput
    .map((repo: any) => {
      const pathValue = typeof repo?.path === 'string' ? repo.path.trim() : '';
      if (!pathValue || seen.has(pathValue)) return null;
      seen.add(pathValue);
      const lastOpened = Number.isFinite(repo?.lastOpened) ? Number(repo.lastOpened) : Date.now();
      const pinned = typeof repo?.pinned === 'boolean' ? repo.pinned : false;
      const createdAt = Number.isFinite(repo?.createdAt)
        ? Math.floor(Number(repo.createdAt))
        : resolveRepoCreatedAt(pathValue, lastOpened);
      return { path: pathValue, lastOpened, pinned, createdAt };
    })
    .filter((repo: StoredRepoEntry | null): repo is StoredRepoEntry => repo !== null);

  const activeRepo = typeof input?.activeRepo === 'string' && input.activeRepo.trim().length > 0
    ? input.activeRepo
    : null;

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

export function writeStoreData(data: StoredData): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(normalizeStoredData(data), null, 2));
}
