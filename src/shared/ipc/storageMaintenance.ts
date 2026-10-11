import type { StoredRepoEntryDto, StoredRepoData, RepoSortByDto } from '../../types/appDtos';
import type { IpcResult } from '../../types/ipc';
import type { RepositoryUiPreferences } from './repositoryUiPreferences';

export const STORAGE_BUDGETS = {
  previews: 128 * 1024 ** 2,
  analytics: 512 * 1024 ** 2,
  statistics: 25 * 1024 ** 2,
  http: 128 * 1024 ** 2,
  code: 128 * 1024 ** 2,
  auxiliary: 64 * 1024 ** 2,
} as const;
export type StorageCategory = keyof typeof STORAGE_BUDGETS | 'metadata' | 'temporary' | 'protected' | 'unknown' | 'updates' | 'recovery';
export type RepositoryHealth = 'available' | 'missing' | 'unreachable' | 'invalid' | 'git-unavailable';
export type RepositoryMutation =
  | { kind: 'add'; path: string }
  | { kind: 'remove'; path: string }
  | { kind: 'metadata'; path: string; pinned?: boolean; lastOpened?: number }
  | { kind: 'activate'; path: string | null }
  | { kind: 'sort'; sortBy: RepoSortByDto }
  | { kind: 'canonicalize'; path: string; canonicalPath: string };
export interface StorageGroup {
  category: StorageCategory;
  bytes: number;
  files: number;
  reclaimableBytes: number;
  budget: number | null;
}
export interface StorageIssue {
  category: StorageCategory;
  path: string;
  reason: string;
}
export interface RemovedRepository {
  entry: StoredRepoEntryDto;
  removedAt: number;
  expiresAt: number;
}
export interface MaintenanceReport {
  startedAt: number;
  finishedAt: number;
  removedBytes: number;
  removedFiles: number;
  removedRepositories: string[];
  removed?: StorageIssue[];
  deferred: StorageIssue[];
  errors: string[];
}
export interface StorageOverview {
  checkedAt: number;
  blockedReason?: string;
  groups: StorageGroup[];
  issues: StorageIssue[];
  repositories: Array<{ path: string; health: RepositoryHealth; missingSince: number | null; checkedDays: number }>;
  removedRepositories: RemovedRepository[];
  reports: MaintenanceReport[];
}
export interface MaintenanceRequest {
  mode: 'eligible' | 'all-caches';
  categories?: StorageCategory[];
}
export interface CompletedRecoveryBackup {
  repoPath: string;
  id: string;
  createdAt: number;
  reference: string;
  objectId: string;
}
export interface ElectronStorageAPI {
  getRepositoryUiPreferences: (legacy?: Record<string, RepositoryUiPreferences>) => Promise<IpcResult<Record<string, RepositoryUiPreferences>>>;
  updateRepositoryUiPreferences: (request: { repoPath: string; patch: RepositoryUiPreferences }) => Promise<IpcResult<Record<string, RepositoryUiPreferences>>>;
  inspectStorage: () => Promise<IpcResult<StorageOverview>>;
  runStorageMaintenance: (request: MaintenanceRequest) => Promise<IpcResult<StorageOverview>>;
  restoreRemovedRepository: (path: string) => Promise<IpcResult<StoredRepoData>>;
  onStorageMaintenance: (callback: (overview: StorageOverview) => void) => () => void;
  getCompletedRecoveryBackups: () => Promise<IpcResult<CompletedRecoveryBackup[]>>;
  removeCompletedRecoveryBackups: (request: { repoPath: string; ids: string[] }) => Promise<IpcResult<number>>;
}
