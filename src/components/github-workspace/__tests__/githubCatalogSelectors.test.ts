import { describe, expect, it } from 'vitest';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { selectGithubCatalogRepos } from '../githubCatalogSelectors';

const repo = (id: number, name: string, privateRepo = false): GitHubRepositoryDto => ({
  id, name, fullName: `alice/${name}`, private: privateRepo,
  cloneUrl: `https://github.com/alice/${name}.git`, htmlUrl: `https://github.com/alice/${name}`,
  description: id === 140 ? 'Needle in later page' : null,
  updatedAt: new Date(2026, 0, id).toISOString(),
});

describe('GitHub catalog selection', () => {
  it('searches all loaded pages and combines visibility and local filters', () => {
    const repos = Array.from({ length: 150 }, (_, index) => repo(index + 1, `repo-${index + 1}`, index + 1 === 140));
    const local = new Map([['github.com/alice/repo-140', ['C:/clone-a', 'C:/clone-b']]]);
    const filters = { search: 'needle', location: 'local' as const, visibility: 'private' as const, sort: 'updated' as const, locale: 'en' };

    expect(selectGithubCatalogRepos(repos, local, new Set(), filters).map((item) => item.id)).toEqual([140]);
    expect(selectGithubCatalogRepos(repos, local, new Set(), { ...filters, location: 'remote' })).toEqual([]);
  });

  it('keeps pins in the same grid before the chosen sort order', () => {
    const repos = [repo(1, 'beta'), repo(2, 'alpha'), repo(3, 'gamma')];
    const filters = { search: '', location: 'all' as const, visibility: 'all' as const, sort: 'name' as const, locale: 'en' };

    expect(selectGithubCatalogRepos(repos, new Map(), new Set([3]), filters).map((item) => item.name)).toEqual(['gamma', 'alpha', 'beta']);
  });
});
