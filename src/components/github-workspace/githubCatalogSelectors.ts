import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { toRepoIdentity } from '@/components/layout/sidebar/useGithubRepoOriginMap';

export type GithubCatalogFilters = {
  search: string;
  location: 'all' | 'local' | 'remote';
  visibility: 'all' | 'public' | 'private';
  sort: 'updated' | 'name';
  locale: string;
};

export function selectGithubCatalogRepos(
  repos: GitHubRepositoryDto[],
  localRepos: Map<string, string[]>,
  pinnedIds: Set<number>,
  filters: GithubCatalogFilters,
): GitHubRepositoryDto[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return repos
    .filter((repo) => {
      const local = Boolean(localRepos.get(toRepoIdentity(repo.htmlUrl) || '')?.length);
      if (filters.location === 'local' && !local) return false;
      if (filters.location === 'remote' && local) return false;
      if (filters.visibility === 'public' && repo.private) return false;
      if (filters.visibility === 'private' && !repo.private) return false;
      return !query || `${repo.fullName} ${repo.description || ''}`.toLocaleLowerCase().includes(query);
    })
    .sort((a, b) => {
      const pinDifference = Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id));
      if (pinDifference) return pinDifference;
      return filters.sort === 'name'
        ? a.fullName.localeCompare(b.fullName, filters.locale)
        : Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '') || a.fullName.localeCompare(b.fullName, filters.locale);
    });
}
