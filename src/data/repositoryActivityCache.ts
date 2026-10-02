import type { RepositoryChangeSummaryDto } from '@/types/gitDtos';
import type { IpcResult } from '@/types/ipc';
import type { ResourceKey } from '@/shared/cache/resource';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { parseGitStatusDetailed } from '@/utils/gitParsing';
import { queryClient, updateResource } from './queryClient';

export const REPOSITORY_ACTIVITY_METHOD = 'getRepositoryChangeSummary';
export type RepositoryActivityResult = IpcResult<RepositoryChangeSummaryDto>;
export const repositoryActivityKey = (repoPath: string): ResourceKey => ['resource', 'git', normalizeRepoPathKey(repoPath), REPOSITORY_ACTIVITY_METHOD];

export function publishRepositoryActivity(repoPath: string, changeCount: number, checkedAt = Date.now()) {
  const key = repositoryActivityKey(repoPath);
  const previous = queryClient.getQueryData<RepositoryActivityResult>(key);
  if (previous?.success && previous.data.checkedAt > checkedAt) return;
  updateResource<RepositoryActivityResult>(key, { success: true, data: { repoPath, changeCount, checkedAt } });
}

export function countStatusFiles(statusRaw: string): number {
  const status = parseGitStatusDetailed(statusRaw);
  return new Set([...status.staged, ...status.unstaged, ...status.untracked].map((file) => file.path)).size;
}

export function markRepositoryActivityError(repoPath: string, message: string) {
  const query = queryClient.getQueryCache().build(queryClient, { queryKey: repositoryActivityKey(repoPath) });
  query.setState({ status: 'error', error: new Error(message), errorUpdatedAt: Date.now() });
}
