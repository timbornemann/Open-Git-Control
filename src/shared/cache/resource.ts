import type { AppSettingsDto, StoredRepoData } from '../../types/appDtos';
import type { GithubCatalogSnapshotDto } from '../../types/githubDtos';

export type ResourceDomain = 'git' | 'github' | 'planner' | 'app' | 'runs';
export type ResourceKey = readonly ['resource', ResourceDomain, string, string, ...unknown[]];
export type ReadPriority = 'visible' | 'repository' | 'startup' | 'speculative';
export type ReadRequest = { requestId: string; priority: ReadPriority };

export interface PreviewSnapshot {
  version: 1;
  key: ResourceKey;
  savedAt: number;
  sourceRevision: string;
  complete: boolean;
  data: unknown;
}

export interface AppBootstrapDto {
  settings: AppSettingsDto;
  repositories: StoredRepoData;
  snapshots: PreviewSnapshot[];
  githubCatalog: GithubCatalogSnapshotDto | null;
}

export const MEMORY_CACHE_BYTES = 64 * 1024 * 1024;
export const DISK_CACHE_BYTES = 128 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

// An explicit allowlist: file contents, editor buffers, credentials and logs are
// never accepted by the persistent preview store.
const persistentOperations: Partial<Record<ResourceDomain, readonly string[]>> = {
  git: ['getCommitLogPage', 'getWorkingTreeSnapshot', 'listWorkingDirectory', 'getRepoOriginUrl', 'command'],
  github: ['catalog', 'getRepository', 'getBranches', 'getPullRequests', 'getWorkflowRunsPage', 'getReleaseContext'],
  planner: ['getData'],
  runs: ['getConfig'],
};

export function isPersistentResource(key: readonly unknown[]): key is ResourceKey {
  if (key[0] !== 'resource' || typeof key[1] !== 'string' || typeof key[2] !== 'string' || typeof key[3] !== 'string') return false;
  if (!persistentOperations[key[1] as ResourceDomain]?.includes(key[3])) return false;
  if (key[3] === 'command') return ['branch', 'tag', 'remote', 'submoduleStatus'].includes(String(key[4]));
  if (key[3] === 'getCommitLogPage') {
    const params = key[4] as { offset?: number; limit?: number } | undefined;
    return (params?.offset ?? 0) === 0 && (params?.limit ?? 100) <= 100;
  }
  if (key[3] === 'listWorkingDirectory') return !key[5];
  if (key[3] === 'getWorkflowRunsPage') return ((key[4] as { page?: number })?.page ?? 1) === 1;
  return true;
}

export function isPreviewSnapshot(value: unknown): value is PreviewSnapshot {
  if (!value || typeof value !== 'object') return false;
  const entry = value as PreviewSnapshot;
  return (
    entry.version === 1 &&
    Array.isArray(entry.key) &&
    isPersistentResource(entry.key) &&
    Number.isFinite(entry.savedAt) &&
    entry.savedAt > 0 &&
    entry.savedAt <= Date.now() + 60_000 &&
    typeof entry.sourceRevision === 'string' &&
    entry.sourceRevision.length <= 256 &&
    typeof entry.complete === 'boolean' &&
    entry.data !== undefined
  );
}
