import type { CreateReleaseParams, GithubApiErrorLike, GitHubOctokitProvider, GitHubReleaseDto, RepositoryReleaseApi, RepositoryTagApi } from './types';

export class GitHubReleaseService {
  constructor(private readonly getOctokit: GitHubOctokitProvider) {}

  async listRepositoryTags(owner: string, repo: string, perPage: number = 200): Promise<string[]> {
    const octokit = this.getOctokit();
    const safePerPage = Number.isFinite(perPage) ? Math.max(1, Math.min(Math.floor(perPage), 300)) : 200;

    const tags: string[] = [];
    let page = 1;

    while (tags.length < safePerPage) {
      const remaining = safePerPage - tags.length;
      const { data } = await octokit.rest.repos.listTags({
        owner,
        repo,
        per_page: Math.min(100, remaining),
        page,
      });

      const pageTags = ((data || []) as RepositoryTagApi[]).map((tag) => String(tag?.name || '').trim()).filter(Boolean);

      tags.push(...pageTags);
      if (!data || data.length < 100) break;
      page += 1;
    }

    return [...new Set(tags)];
  }

  async getLatestReleaseTag(owner: string, repo: string): Promise<string | null> {
    const octokit = this.getOctokit();
    const { data } = await octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 30,
      page: 1,
    });

    const first = ((data || []) as RepositoryReleaseApi[]).find((release) => Boolean(String(release?.tag_name || '').trim()));
    if (!first) return null;
    const tag = String(first.tag_name || '').trim();
    return tag || null;
  }

  async createRelease(params: CreateReleaseParams): Promise<GitHubReleaseDto> {
    const octokit = this.getOctokit();
    const owner = (params.owner || '').trim();
    const repo = (params.repo || '').trim();
    const tagName = (params.tagName || '').trim();
    const releaseName = (params.releaseName || '').trim();
    const targetCommitish = (params.targetCommitish || '').trim();

    if (!owner || !repo) {
      throw new Error('Owner und Repository sind erforderlich.');
    }

    if (!tagName) {
      throw new Error('Tag-Name ist erforderlich.');
    }

    if (!releaseName) {
      throw new Error('Release-Name ist erforderlich.');
    }

    try {
      const { data } = await octokit.rest.repos.createRelease({
        owner,
        repo,
        tag_name: tagName,
        name: releaseName,
        body: params.body || '',
        draft: Boolean(params.draft),
        prerelease: Boolean(params.prerelease),
        ...(targetCommitish ? { target_commitish: targetCommitish } : {}),
      });

      return {
        id: data.id,
        tagName: data.tag_name,
        name: data.name || releaseName,
        htmlUrl: data.html_url,
        draft: Boolean(data.draft),
        prerelease: Boolean(data.prerelease),
        publishedAt: data.published_at || null,
      };
    } catch (error: unknown) {
      const apiError = error as GithubApiErrorLike;
      const status = Number(apiError?.status);
      const apiMessage = typeof apiError?.response?.data?.message === 'string' ? apiError.response.data.message : '';
      const fallbackMessage = typeof apiError?.message === 'string' ? apiError.message : '';
      const normalizedMessage = `${fallbackMessage} ${apiMessage}`.toLowerCase();

      if (status === 422 && normalizedMessage.includes('already_exists')) {
        throw new Error('Tag existiert bereits. Bitte anderen Tag waehlen oder bestehenden Tag verwenden.');
      }

      if (status === 422 && normalizedMessage.includes('target_commitish')) {
        throw new Error('Ungueltiger targetCommitish. Bitte Branch-Name oder Commit-SHA pruefen.');
      }

      if (status === 403 || status === 404) {
        throw new Error('Keine Berechtigung fuer dieses Repository. Bitte Token-Rechte pruefen.');
      }

      throw new Error(apiMessage || fallbackMessage || 'Release konnte nicht erstellt werden.');
    }
  }
}
