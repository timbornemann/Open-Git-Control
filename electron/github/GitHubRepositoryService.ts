import type { GithubRepositoryApi, GitHubOctokitProvider, GitHubRepositoryDto } from './types';

const mapRepository = (repo: GithubRepositoryApi): GitHubRepositoryDto => ({
  id: repo.id,
  name: repo.name,
  fullName: repo.full_name,
  private: repo.private,
  cloneUrl: repo.clone_url,
  htmlUrl: repo.html_url,
  description: repo.description,
  updatedAt: repo.updated_at,
});

export class GitHubRepositoryService {
  constructor(private readonly getOctokit: GitHubOctokitProvider) {}

  async getMyRepositories(page: number = 1, perPage: number = 50, search: string = '') {
    const octokit = this.getOctokit();
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safePerPage = Number.isFinite(perPage) ? Math.max(10, Math.min(Math.floor(perPage), 100)) : 50;
    const normalizedSearch = (search || '').trim().toLowerCase();

    const matchesSearch = (repo: GitHubRepositoryDto) => {
      if (!normalizedSearch) return true;
      const haystack = `${repo.name} ${repo.fullName} ${repo.description || ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    };

    if (!normalizedSearch) {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: safePerPage,
        page: safePage,
      });

      return {
        repos: (data as GithubRepositoryApi[]).map(mapRepository),
        nextPage: data.length === safePerPage ? safePage + 1 : null,
        hasMore: data.length === safePerPage,
        totalCount: null,
      };
    }

    const requiredMatches = safePage * safePerPage;
    const matchedRepos: GitHubRepositoryDto[] = [];
    let sourcePage = 1;
    let sourceHasMore = false;

    while (matchedRepos.length <= requiredMatches) {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
        page: sourcePage,
      });

      const mapped = (data as GithubRepositoryApi[]).map(mapRepository);
      matchedRepos.push(...mapped.filter(matchesSearch));

      if (data.length < 100) {
        sourceHasMore = false;
        break;
      }

      sourceHasMore = true;
      sourcePage += 1;
    }

    const startIndex = (safePage - 1) * safePerPage;
    const repos = matchedRepos.slice(startIndex, startIndex + safePerPage);
    const hasMore = matchedRepos.length > startIndex + safePerPage || sourceHasMore;
    return {
      repos,
      nextPage: hasMore ? safePage + 1 : null,
      hasMore,
      totalCount: null,
    };
  }

  async createRepository(name: string, description: string, isPrivate: boolean) {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      description,
      private: isPrivate,
      auto_init: false,
    });

    return mapRepository(data as GithubRepositoryApi);
  }

  async forkRepository(
    owner: string,
    repo: string,
    options: {
      name?: string;
      defaultBranchOnly?: boolean;
    } = {},
  ) {
    const octokit = this.getOctokit();
    const normalizedOwner = String(owner || '').trim();
    const normalizedRepo = String(repo || '').trim();
    const normalizedName = String(options.name || '').trim();

    if (!normalizedOwner || !normalizedRepo) {
      throw new Error('Owner and repository are required.');
    }

    const { data } = await octokit.rest.repos.createFork({
      owner: normalizedOwner,
      repo: normalizedRepo,
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(typeof options.defaultBranchOnly === 'boolean' ? { default_branch_only: options.defaultBranchOnly } : {}),
    });

    return mapRepository(data as GithubRepositoryApi);
  }
}
