import type { GithubRepositoryApi, GitHubOctokitProvider, GitHubRepositoryDto } from './types';
import { buildOpenGitControlReadme } from '../../src/shared/licenseTemplates';

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

  async createRepositoryWithReadme(name: string, description: string, isPrivate: boolean) {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    });
    const repository = mapRepository(data as GithubRepositoryApi);
    const owner = repository.fullName.split('/')[0];
    try {
      const current = await octokit.rest.repos.getContent({ owner, repo: repository.name, path: 'README.md' });
      if (Array.isArray(current.data) || current.data.type !== 'file' || !current.data.sha) {
        throw new Error('GitHub did not return the initial README file.');
      }
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo: repository.name,
        path: 'README.md',
        message: 'Add Open Git Control README template',
        content: Buffer.from(buildOpenGitControlReadme(repository.name), 'utf8').toString('base64'),
        sha: current.data.sha,
      });
      return { repository, brandedReadme: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { repository, brandedReadme: false, warning: `Repository created with GitHub README. Open Git Control template could not be applied: ${reason}` };
    }
  }

  async getBranches(owner: string, repo: string): Promise<string[]> {
    const octokit = this.getOctokit();
    const branches: string[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const { data } = await octokit.rest.repos.listBranches({ owner, repo, per_page: 100, page });
      branches.push(...(data as Array<{ name: string }>).map((branch) => branch.name));
      if (data.length < 100) return branches;
    }
    throw new Error('Too many branches to list completely.');
  }

  async getRepository(owner: string, repo: string) {
    const octokit = this.getOctokit();
    const normalizedOwner = String(owner || '').trim();
    const normalizedRepo = String(repo || '').trim();

    if (!normalizedOwner || !normalizedRepo) {
      throw new Error('Owner and repository are required.');
    }

    const { data } = await octokit.rest.repos.get({
      owner: normalizedOwner,
      repo: normalizedRepo,
    });

    const parent = data.parent
      ? {
          owner: String(data.parent.owner?.login || '').trim(),
          repo: String(data.parent.name || '').trim(),
        }
      : null;

    return {
      owner: String(data.owner?.login || normalizedOwner).trim(),
      repo: String(data.name || normalizedRepo).trim(),
      fork: Boolean(data.fork),
      parent: parent?.owner && parent?.repo ? parent : null,
      defaultBranch: String(data.default_branch || 'main').trim() || 'main',
    };
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
