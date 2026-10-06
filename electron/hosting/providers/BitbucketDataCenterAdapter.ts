import type { HostedRepository, HostedRepositoryRef, HostingCapabilities, HostingChangeRequest } from '../../../src/types/hostingDtos';
import { HostingHttpError, HostingHttpTransport } from './HostingHttpTransport';
import { BaseHostingAdapter, caps, encode, number, object, rows, safeCloneUrl, string, unsupported } from './providerUtils';
import type { Input, Output, Row } from './providerUtils';

export class BitbucketDataCenterAdapter extends BaseHostingAdapter {
  private auxiliary(basePath: string): HostingHttpTransport {
    const base = this.connection.baseUrl.replace(/\/$/, '');
    return new HostingHttpTransport({ baseUrl: `${base}/${basePath}`, getToken: async () => (await this.credentials()).accessToken });
  }
  async authenticate() {
    const response = await this.http.json('application-properties');
    const properties = object(response.data);
    let username = response.headers.get('x-ausername');
    if (!username || username === 'anonymous') {
      try {
        username = (await this.auxiliary('plugins/servlet/applinks').text('whoami')).trim();
      } catch (error) {
        if (!(error instanceof HostingHttpError) || error.status !== 404) throw error;
        username = null;
      }
    }
    if (!username || username === 'anonymous')
      throw new HostingHttpError(401, 'identity_unavailable', 'Bitbucket did not return the authenticated user identity.');
    const user = await this.json(`users/${encode(username)}`);
    return { id: string(user.id), username: string(user.name, username), serverVersion: string(properties.version) || this.connection.serverVersion };
  }
  async capabilities(repository?: HostedRepositoryRef): Promise<HostingCapabilities> {
    const result = caps({
      ciLabel: 'External CI build status',
      mergeMethods: [],
      reason:
        'Bitbucket Data Center exposes build statuses. Jobs, logs, artifacts and CI actions require a connector for the linked CI system. Releases are Git tags. Merge cannot atomically enforce the checked source commit.',
    });
    if (repository) {
      const repo = await this.json(this.path(repository));
      if (repo.forkable === false) result.fork = false;
      result.mergeMethods = (await this.mergeStrategies(repository)).map((strategy) => this.mergeMethod(strategy));
    }
    return result;
  }
  private mergeMethod(strategy: string): string {
    return strategy === 'no-ff' ? 'merge' : strategy;
  }
  private async mergeStrategies(repository: HostedRepositoryRef): Promise<string[]> {
    try {
      const settings = await this.json(`${this.path(repository)}/settings/pull-requests`);
      return [
        ...new Set(
          rows(object(settings.mergeConfig).strategies)
            .filter((strategy) => strategy.enabled === true)
            .map((strategy) => string(strategy.id))
            .filter(Boolean),
        ),
      ];
    } catch (error) {
      if (error instanceof HostingHttpError && [403, 404].includes(error.status)) return [];
      throw error;
    }
  }
  private path(repository: HostedRepositoryRef): string {
    this.assertRepository(repository);
    const [project, repo, ...extra] = repository.fullPath.split('/');
    if (!project || !repo || extra.length) throw new HostingHttpError(0, 'invalid_repository', 'Expected project/repository.');
    return `projects/${encode(project)}/repos/${encode(repo)}`;
  }
  private fullPath(row: Row): string {
    return `${string(object(row.project).key)}/${string(row.slug)}`;
  }
  private html(row: Row): string {
    return string(rows(object(row.links).self)[0]?.href);
  }
  private mapRepository(row: Row): HostedRepository {
    const fullPath = this.fullPath(row);
    const clone = rows(object(row.links).clone);
    const origin = object(row.origin);
    return {
      ref: this.ref(row.id, fullPath),
      name: string(row.name),
      fullName: fullPath,
      private: !row.public,
      cloneUrl: safeCloneUrl(clone.find((link) => link.name === 'http' || link.name === 'https')?.href),
      sshUrl: safeCloneUrl(clone.find((link) => link.name === 'ssh')?.href, true),
      htmlUrl: this.html(row),
      description: row.description == null ? null : string(row.description),
      defaultBranch: typeof row.defaultBranch === 'string' ? row.defaultBranch : string(object(row.defaultBranch).displayId, 'main'),
      fork: Boolean(row.origin),
      parent: origin.id ? this.ref(origin.id, this.fullPath(origin)) : null,
    };
  }
  private async page<T>(
    path: string,
    map: (row: Row) => T,
    cursor?: string,
    query: Record<string, string | number | boolean | undefined> = {},
    transport = this.http,
  ) {
    if (cursor && !/^\d+$/.test(cursor)) throw new HostingHttpError(0, 'invalid_cursor', 'Invalid Bitbucket page cursor.');
    const data = object((await transport.json(path, { query: { start: cursor ?? '0', limit: 50, ...query } })).data);
    const next = data.isLastPage === false ? string(data.nextPageStart) : null;
    if (next !== null && (!/^\d+$/.test(next) || Number(next) <= Number(cursor ?? 0)))
      throw new HostingHttpError(0, 'invalid_response', 'Bitbucket returned an invalid next-page position.');
    return { items: rows(data.values).map(map), nextCursor: next };
  }
  protected remotePath(url: string): string | null {
    let path = super.remotePath(url);
    if (path?.startsWith('scm/')) path = path.slice(4);
    const browser = path?.match(/^projects\/([^/]+)\/repos\/([^/]+)(?:\/.*)?$/i);
    if (browser) path = `${browser[1]}/${browser[2]}`;
    return path && path.split('/').length === 2 ? path : null;
  }
  async resolveRepository(url: string) {
    return this.resolvePath(this.remotePath(url));
  }
  async repositories(input: Input<'repositories'>) {
    return this.page('repos', (row) => this.mapRepository(row), input.cursor, { name: input.search });
  }
  async repository(input: Input<'repository'>) {
    const repository = this.mapRepository(await this.json(this.path(input.repository)));
    try {
      const branch = await this.json(`${this.path(repository.ref)}/branches/default`);
      repository.defaultBranch = string(branch.displayId, repository.defaultBranch);
    } catch (error) {
      if (!(error instanceof HostingHttpError) || error.status !== 404) throw error;
    }
    return repository;
  }
  async createRepository(input: Input<'createRepository'>) {
    if (!input.namespace) throw new HostingHttpError(0, 'project_required', 'An existing Bitbucket project key is required.');
    if (input.initializeReadme || input.readmeContent !== undefined) unsupported('Initializing an empty Data Center repository with README through REST');
    return this.mapRepository(
      await this.json(`projects/${encode(input.namespace)}/repos`, 'POST', {
        name: input.name,
        description: input.description,
        public: !input.private,
        scmId: 'git',
        forkable: true,
      }),
    );
  }
  async fork(input: Input<'fork'>) {
    if (input.defaultBranchOnly) unsupported('Default-branch-only forks');
    return this.mapRepository(
      await this.json(this.path(input.repository), 'POST', { name: input.name, ...(input.namespace ? { project: { key: input.namespace } } : {}) }),
    );
  }
  async branches(input: Input<'branches'>) {
    return this.page(`${this.path(input.repository)}/branches`, (row) => string(row.displayId), input.cursor);
  }
  async tags(input: Input<'tags'>) {
    return this.page(`${this.path(input.repository)}/tags`, (row) => string(row.displayId), input.cursor);
  }
  private mapChangeRequest(row: Row, target: HostedRepositoryRef): HostingChangeRequest {
    const from = object(row.fromRef);
    const to = object(row.toRef);
    const source = object(from.repository);
    return {
      id: string(row.id),
      number: string(row.id),
      title: string(row.title),
      body: string(row.description),
      state: row.state === 'MERGED' ? 'merged' : row.state === 'OPEN' ? 'open' : 'closed',
      author: string(object(object(row.author).user).name),
      source: source.id ? this.ref(source.id, this.fullPath(source)) : target,
      sourceBranch: string(from.displayId),
      headSha: string(from.latestCommit),
      target,
      targetBranch: string(to.displayId),
      draft: Boolean(row.draft),
      htmlUrl: this.html(row),
      createdAt: row.createdDate ? new Date(number(row.createdDate)).toISOString() : '',
      updatedAt: row.updatedDate ? new Date(number(row.updatedDate)).toISOString() : '',
      version: number(row.version),
    };
  }
  async changeRequests(input: Input<'changeRequests'>) {
    const result = await this.page(`${this.path(input.repository)}/pull-requests`, (row) => this.mapChangeRequest(row, input.repository), input.cursor, {
      state: input.state === 'all' || input.state === 'closed' ? 'ALL' : 'OPEN',
      order: 'NEWEST',
    });
    return { ...result, items: input.state === 'closed' ? result.items.filter((row) => row.state !== 'open') : result.items };
  }
  async createChangeRequest(input: Input<'createChangeRequest'>) {
    this.assertRepository(input.source);
    const [sourceProject, sourceSlug] = input.source.fullPath.split('/');
    const [targetProject, targetSlug] = input.repository.fullPath.split('/');
    return this.mapChangeRequest(
      await this.json(`${this.path(input.repository)}/pull-requests`, 'POST', {
        title: input.title,
        description: input.body,
        fromRef: { id: `refs/heads/${input.sourceBranch}`, repository: { slug: sourceSlug, project: { key: sourceProject } } },
        toRef: { id: `refs/heads/${input.targetBranch}`, repository: { slug: targetSlug, project: { key: targetProject } } },
      }),
      input.repository,
    );
  }
  async merge(input: Input<'merge'>): Promise<Output<'merge'>> {
    if (!input.expectedHeadSha) throw new HostingHttpError(0, 'head_required', 'A checked source commit is required to merge.');
    const route = `${this.path(input.repository)}/pull-requests/${encode(input.id)}`;
    const current = await this.json(route);
    if (string(object(current.fromRef).latestCommit) !== input.expectedHeadSha || (input.version !== undefined && number(current.version) !== input.version))
      throw new HostingHttpError(409, 'head_changed', 'The pull request changed. Refresh before merging.');
    const strategy = (await this.mergeStrategies(input.repository)).find((id) => this.mergeMethod(id) === input.method || id === input.method);
    if (!strategy) unsupported('Selected Data Center repository merge method');
    const result = object(
      (await this.http.json(`${route}/merge`, { method: 'POST', query: { version: number(current.version) }, body: { strategyId: strategy } })).data,
    );
    return {
      merged: result.state === 'MERGED',
      message: result.state === 'MERGED' ? 'Merged' : 'Bitbucket did not merge the pull request.',
      sha: string(object(result.properties).mergeCommit) || undefined,
    };
  }
  async status(input: Input<'status'>): Promise<Output<'status'>> {
    this.assertRepository(input.repository);
    const commits = await this.page(`${this.path(input.repository)}/commits`, (row) => string(row.id), undefined, { until: input.ref, limit: 1 });
    const sha = commits.items[0];
    if (!sha) throw new HostingHttpError(404, 'commit_not_found', 'Commit was not found.');
    const transport = this.auxiliary('rest/build-status/1.0');
    const checks: Output<'status'>['checks'] = [];
    let cursor: string | undefined;
    do {
      const result = await this.page(
        `commits/${encode(sha)}`,
        (row) => ({
          id: string(row.key),
          name: string(row.name ?? row.key),
          status: string(row.state),
          htmlUrl: string(row.url) || null,
          description: string(row.description),
        }),
        cursor,
        {},
        transport,
      );
      checks.push(...result.items);
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    return {
      sha,
      state: checks.some((row) => ['FAILED', 'CANCELLED'].includes(row.status))
        ? 'failure'
        : checks.some((row) => row.status === 'INPROGRESS')
          ? 'pending'
          : checks.length && checks.every((row) => row.status === 'SUCCESSFUL')
            ? 'success'
            : 'unknown',
      checks,
    };
  }
  async releases(input: Input<'releases'>) {
    return this.page(
      `${this.path(input.repository)}/tags`,
      (row) => ({
        id: string(row.displayId),
        tagName: string(row.displayId),
        name: string(row.displayId),
        htmlUrl: `${this.connection.baseUrl.replace(/\/$/, '')}/projects/${encode(input.repository.fullPath.split('/')[0])}/repos/${encode(input.repository.fullPath.split('/')[1])}/browse?at=${encode(string(row.id))}`,
        draft: false,
        prerelease: false,
      }),
      input.cursor,
    );
  }
  async createRelease(input: Input<'createRelease'>) {
    if (input.draft || input.prerelease) unsupported('Data Center release flags');
    const tag = await this.json(`${this.path(input.repository)}/tags`, 'POST', { name: input.tagName, startPoint: input.target, message: input.body });
    return {
      id: string(tag.displayId, input.tagName),
      tagName: string(tag.displayId, input.tagName),
      name: string(tag.displayId, input.tagName),
      body: input.body,
      htmlUrl: `${this.connection.baseUrl.replace(/\/$/, '')}/projects/${encode(input.repository.fullPath.split('/')[0])}/repos/${encode(input.repository.fullPath.split('/')[1])}/browse?at=${encode(string(tag.id, `refs/tags/${input.tagName}`))}`,
      draft: false,
      prerelease: false,
    };
  }
}
