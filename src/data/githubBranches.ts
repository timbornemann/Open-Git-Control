import { hashKey } from '@tanstack/react-query';
import { getLegacyGithubApi, requireLegacyGithubApi } from '@/legacy/github/electronApi';
import type { ReadPriority, ResourceKey } from '@/shared/cache/resource';
import { backgroundQueue } from './backgroundQueue';
import { cancellableRead } from './ipcRead';
import { checked } from './queryClient';

export const supportsBranchPages = () => typeof getLegacyGithubApi()?.githubGetBranchesPage === 'function';

export async function readGithubBranches(key: ResourceKey, owner: string, repo: string, signal: AbortSignal, priority: ReadPriority) {
  const api = requireLegacyGithubApi();
  const branches: string[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = checked(
      await backgroundQueue.schedule(
        () => cancellableRead(signal, priority, (readRequest) => api.githubGetBranchesPage(owner, repo, page, readRequest)),
        priority,
        true,
        signal,
        hashKey(key),
      ),
    );
    if (!result.success) return result;
    branches.push(...result.data);
    if (result.data.length < 100) return { success: true as const, data: branches };
  }
  throw new Error('Too many branches to list completely.');
}
