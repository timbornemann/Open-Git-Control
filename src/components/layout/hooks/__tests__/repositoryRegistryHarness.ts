import { vi } from 'vitest';
import { appClient } from '@/services/appClient';
import type { StoredRepoData } from '@/types/appDtos';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export function installRepositoryRegistryHarness() {
  let persisted: StoredRepoData | undefined;
  vi.spyOn(appClient, 'onStoredReposChanged').mockReturnValue(() => {});
  vi.spyOn(appClient, 'mutateStoredRepos').mockImplementation(async (operation) => {
    if (!persisted) {
      const reads = vi.mocked(appClient.getStoredRepos).mock.results;
      const lastRead = reads[reads.length - 1]?.value;
      const loaded = await Promise.race([lastRead || Promise.resolve(undefined), Promise.resolve(undefined)]);
      persisted = structuredClone(loaded || { repos: [], activeRepo: null, sortBy: 'lastOpenedDesc' });
    }
    const requested = 'path' in operation ? operation.path : null;
    const entry = persisted!.repos.find((repo) => requested && normalizeRepoPathKey(repo.path) === normalizeRepoPathKey(requested));
    if (operation.kind === 'add' && !entry) persisted!.repos.push({ path: operation.path, lastOpened: Date.now(), createdAt: Date.now(), pinned: false });
    if (operation.kind === 'remove') persisted!.repos = persisted!.repos.filter((repo) => repo !== entry);
    if (operation.kind === 'metadata' && entry)
      Object.assign(entry, {
        ...(operation.pinned === undefined ? {} : { pinned: operation.pinned }),
        ...(operation.lastOpened === undefined ? {} : { lastOpened: operation.lastOpened }),
      });
    if (operation.kind === 'activate') persisted!.activeRepo = operation.path;
    if (operation.kind === 'sort') persisted!.sortBy = operation.sortBy;
    if (operation.kind === 'canonicalize' && entry) entry.path = operation.canonicalPath;
    const unique = new Map<string, StoredRepoData['repos'][number]>();
    for (const repo of persisted!.repos) {
      const key = normalizeRepoPathKey(repo.path),
        prior = unique.get(key);
      unique.set(
        key,
        prior
          ? {
              ...repo,
              lastOpened: Math.max(prior.lastOpened, repo.lastOpened),
              pinned: prior.pinned || repo.pinned,
              createdAt: Math.min(prior.createdAt, repo.createdAt),
            }
          : repo,
      );
    }
    persisted!.repos = [...unique.values()];
    persisted!.revision = (persisted!.revision || 0) + 1;
    return { success: true, data: structuredClone(persisted!) };
  });
}
