import type { HostedRepository, HostedRepositoryRef, HostingChangeRequest, HostingConnection, HostingJob, HostingRun } from '../../../src/types/hostingDtos';
import type { CredentialGetter } from '../HostingAdapter';
import { HostingHttpError, HostingHttpTransport } from './HostingHttpTransport';
import { BaseHostingAdapter, caps, encode, object, rows, safeCloneUrl, string, unsupported } from './providerUtils';
import type { Input, Output, Row } from './providerUtils';

export class BitbucketCloudAdapter extends BaseHostingAdapter {
  constructor(connection: HostingConnection, credentials: CredentialGetter, transport?: HostingHttpTransport) {
    super(
      connection,
      credentials,
      transport ??
        new HostingHttpTransport({
          baseUrl: connection.apiBaseUrl,
          authorizationScheme: 'raw',
          getToken: async () => {
            const value = await credentials();
            if (!value.accessToken) return '';
            return value.authType === 'token' && value.email
              ? `Basic ${Buffer.from(`${value.email}:${value.accessToken}`).toString('base64')}`
              : `Bearer ${value.accessToken}`;
          },
        }),
    );
  }
  async authenticate() {
    const user = await this.json('user');
    return { id: string(user.uuid ?? user.account_id), username: string(user.username ?? user.nickname ?? user.display_name) };
  }
  async capabilities(repository?: HostedRepositoryRef, targetBranch?: string) {
    const result = caps({
      ciLabel: 'Bitbucket Pipelines',
      runs: true,
      jobs: true,
      logs: true,
      cancelRun: true,
      dispatch: true,
      releases: 'downloads',
      releaseAssets: true,
      reason:
        'Tags and repository Downloads are separate resources. Pipeline artifacts and retry are available on the Bitbucket website. Merge cannot atomically enforce the checked source commit.',
    });
    if (repository) {
      const branch = targetBranch || string(object((await this.json(this.path(repository))).mainbranch).name);
      if (!branch) result.mergeMethods = [];
      else {
        const value = await this.json(`${this.path(repository)}/refs/branches/${encode(branch)}`);
        result.mergeMethods = this.mergeStrategies(value).map((strategy) => this.mergeMethod(strategy));
      }
    }
    return result;
  }
  private mergeMethod(strategy: string): string {
    return strategy === 'merge_commit' ? 'merge' : strategy;
  }
  private mergeStrategies(branch: Row): string[] {
    return Array.isArray(branch.merge_strategies)
      ? [...new Set(branch.merge_strategies.filter((value): value is string => typeof value === 'string' && Boolean(value)))]
      : [];
  }
  private path(repository: HostedRepositoryRef): string {
    this.assertRepository(repository);
    const parts = repository.fullPath.split('/');
    if (parts.length !== 2) throw new HostingHttpError(0, 'invalid_repository', 'Expected workspace/repository.');
    return `repositories/${parts.map(encode).join('/')}`;
  }
  private link(row: Row, kind: string): string {
    return string(object(object(row.links)[kind]).href);
  }
  private mapRepository(row: Row): HostedRepository {
    const fullPath = string(row.full_name);
    const clone = rows(object(row.links).clone);
    const parent = object(row.parent);
    return {
      ref: this.ref(row.uuid, fullPath),
      name: string(row.name),
      fullName: fullPath,
      private: Boolean(row.is_private),
      cloneUrl: safeCloneUrl(clone.find((link) => link.name === 'https')?.href),
      sshUrl: safeCloneUrl(clone.find((link) => link.name === 'ssh')?.href, true),
      htmlUrl: this.link(row, 'html'),
      description: row.description == null ? null : string(row.description),
      defaultBranch: string(object(row.mainbranch).name, 'main'),
      fork: Boolean(row.parent),
      parent: parent.full_name ? this.ref(parent.uuid, string(parent.full_name)) : null,
      updatedAt: string(row.updated_on),
    };
  }
  private async page<T>(path: string, map: (row: Row) => T, cursor?: string, query: Record<string, string | number | boolean | undefined> = {}) {
    const data = object((await this.http.json(cursor ?? path, { query: cursor ? undefined : { pagelen: 50, ...query } })).data);
    return { items: rows(data.values).map(map), nextCursor: string(data.next) || null };
  }
  async resolveRepository(url: string) {
    const path = this.remotePath(url);
    return this.resolvePath(path && path.split('/').length === 2 ? path : null);
  }
  async repositories(input: Input<'repositories'>) {
    type CatalogCursor = { workspaces: string[]; index: number; workspacePage: string | null; repositoryPage: string | null };
    let state: CatalogCursor;
    if (input.cursor) {
      try {
        const value = object(JSON.parse(input.cursor));
        if (
          !Array.isArray(value.workspaces) ||
          value.workspaces.length > 100 ||
          value.workspaces.some((item) => typeof item !== 'string' || !item) ||
          !Number.isInteger(value.index) ||
          Number(value.index) < 0 ||
          Number(value.index) > value.workspaces.length ||
          (value.workspacePage !== null && typeof value.workspacePage !== 'string') ||
          (value.repositoryPage !== null && typeof value.repositoryPage !== 'string')
        )
          throw new Error('Invalid cursor');
        state = value as unknown as CatalogCursor;
      } catch {
        throw new HostingHttpError(0, 'invalid_cursor', 'Invalid Bitbucket catalog cursor.');
      }
    } else {
      const workspaces = await this.page('user/workspaces', (row) => string(object(row.workspace).slug ?? row.slug));
      state = { workspaces: workspaces.items.filter(Boolean), index: 0, workspacePage: workspaces.nextCursor, repositoryPage: null };
    }
    for (let pages = 0; pages < 100; pages += 1) {
      if (state.index >= state.workspaces.length) {
        if (!state.workspacePage) return { items: [], nextCursor: null };
        const workspaces = await this.page('user/workspaces', (row) => string(object(row.workspace).slug ?? row.slug), state.workspacePage);
        state = { workspaces: workspaces.items.filter(Boolean), index: 0, workspacePage: workspaces.nextCursor, repositoryPage: null };
        continue;
      }
      const result = await this.page(
        `repositories/${encode(state.workspaces[state.index])}`,
        (row) => this.mapRepository(row),
        state.repositoryPage ?? undefined,
        { q: input.search ? `name~${JSON.stringify(input.search)}` : undefined, sort: '-updated_on' },
      );
      if (result.nextCursor) state.repositoryPage = result.nextCursor;
      else {
        state.index += 1;
        state.repositoryPage = null;
      }
      if (state.index >= state.workspaces.length && state.workspacePage) {
        const workspaces = await this.page('user/workspaces', (row) => string(object(row.workspace).slug ?? row.slug), state.workspacePage);
        state = { workspaces: workspaces.items.filter(Boolean), index: 0, workspacePage: workspaces.nextCursor, repositoryPage: null };
      }
      const more = state.index < state.workspaces.length || Boolean(state.workspacePage);
      if (result.items.length || !more) return { items: result.items, nextCursor: more ? JSON.stringify(state) : null };
    }
    throw new HostingHttpError(0, 'pagination_limit', 'Too many empty workspace pages.');
  }
  async repository(input: Input<'repository'>) {
    return this.mapRepository(await this.json(this.path(input.repository)));
  }
  async createRepository(input: Input<'createRepository'>) {
    if (!input.namespace) throw new HostingHttpError(0, 'workspace_required', 'A Bitbucket workspace is required.');
    if (!input.projectKey) throw new HostingHttpError(0, 'project_required', 'Select a Bitbucket project explicitly.');
    const slug = input.name.toLowerCase().replace(/\s+/g, '-');
    const repository = this.mapRepository(
      await this.json(`repositories/${encode(input.namespace)}/${encode(slug)}`, 'POST', {
        name: input.name,
        description: input.description,
        is_private: input.private,
        scm: 'git',
        project: { key: input.projectKey },
      }),
    );
    if (input.initializeReadme || input.readmeContent !== undefined) {
      const body = new FormData();
      body.append('/README.md', new Blob([input.readmeContent ?? `# ${input.name}\n`]), 'README.md');
      body.append('message', 'Initialize README');
      body.append('branch', repository.defaultBranch);
      const response = await this.http.request(`${this.path(repository.ref)}/src`, { method: 'POST', rawBody: body });
      if (response.status >= 300 && response.status < 400)
        throw new HostingHttpError(response.status, 'unexpected_redirect', 'Repository initialization redirected unexpectedly.');
      await response.body?.cancel();
    }
    return repository;
  }
  async fork(input: Input<'fork'>) {
    if (input.defaultBranchOnly) unsupported('Default-branch-only forks');
    return this.mapRepository(
      await this.json(`${this.path(input.repository)}/forks`, 'POST', {
        name: input.name,
        ...(input.namespace ? { workspace: { slug: input.namespace } } : {}),
      }),
    );
  }
  async branches(input: Input<'branches'>) {
    return this.page(`${this.path(input.repository)}/refs/branches`, (row) => string(row.name), input.cursor);
  }
  async tags(input: Input<'tags'>) {
    return this.page(`${this.path(input.repository)}/refs/tags`, (row) => string(row.name), input.cursor);
  }
  private mapChangeRequest(row: Row, target: HostedRepositoryRef): HostingChangeRequest {
    const source = object(row.source);
    const destination = object(row.destination);
    const sourceRepo = object(source.repository);
    return {
      id: string(row.id),
      number: string(row.id),
      title: string(row.title),
      body: string(row.description),
      state: row.state === 'MERGED' ? 'merged' : row.state === 'OPEN' ? 'open' : 'closed',
      author: string(object(row.author).nickname ?? object(row.author).display_name),
      source: sourceRepo.full_name ? this.ref(sourceRepo.uuid, string(sourceRepo.full_name)) : target,
      sourceBranch: string(object(source.branch).name),
      headSha: string(object(source.commit).hash),
      target,
      targetBranch: string(object(destination.branch).name),
      draft: Boolean(row.draft),
      htmlUrl: this.link(row, 'html'),
      createdAt: string(row.created_on),
      updatedAt: string(row.updated_on),
    };
  }
  async changeRequests(input: Input<'changeRequests'>) {
    return this.page(`${this.path(input.repository)}/pullrequests`, (row) => this.mapChangeRequest(row, input.repository), input.cursor, {
      q: input.state === 'all' ? undefined : input.state === 'closed' ? 'state != "OPEN"' : 'state = "OPEN"',
      sort: '-updated_on',
    });
  }
  async createChangeRequest(input: Input<'createChangeRequest'>) {
    this.assertRepository(input.source);
    return this.mapChangeRequest(
      await this.json(`${this.path(input.repository)}/pullrequests`, 'POST', {
        title: input.title,
        description: input.body,
        source: { branch: { name: input.sourceBranch }, repository: { full_name: input.source.fullPath } },
        destination: { branch: { name: input.targetBranch } },
        close_source_branch: false,
      }),
      input.repository,
    );
  }
  async merge(input: Input<'merge'>): Promise<Output<'merge'>> {
    if (!input.expectedHeadSha) throw new HostingHttpError(0, 'head_required', 'A checked source commit is required to merge.');
    const route = `${this.path(input.repository)}/pullrequests/${encode(input.id)}`;
    const current = await this.json(route);
    if (string(object(object(current.source).commit).hash) !== input.expectedHeadSha)
      throw new HostingHttpError(409, 'head_changed', 'The source commit changed. Refresh the pull request before merging.');
    const target = object(object(current.destination).branch);
    const strategies = this.mergeStrategies(
      Array.isArray(target.merge_strategies) || !string(target.name)
        ? target
        : await this.json(`${this.path(input.repository)}/refs/branches/${encode(string(target.name))}`),
    );
    const strategy = strategies.find((id) => this.mergeMethod(id) === input.method || id === input.method);
    if (!strategy) unsupported('Selected Bitbucket Cloud target branch merge method');
    const result = await this.json(`${route}/merge`, 'POST', {
      merge_strategy: strategy,
      close_source_branch: false,
    });
    return {
      merged: result.state === 'MERGED',
      message: result.state === 'MERGED' ? 'Merged' : 'Bitbucket did not merge the pull request.',
      sha: string(object(result.merge_commit).hash) || undefined,
    };
  }
  private mapRun(row: Row, repository: HostedRepositoryRef): HostingRun {
    const state = object(row.state);
    const result = object(state.result);
    const target = object(row.target);
    const name = string(result.name).toLowerCase();
    return {
      id: string(row.uuid),
      number: string(row.build_number),
      name: string(object(target.selector).pattern, `Pipeline ${string(row.build_number)}`),
      status: state.name === 'COMPLETED' ? 'completed' : state.name === 'IN_PROGRESS' ? 'in_progress' : string(state.name).toLowerCase(),
      conclusion: name
        ? (({ successful: 'success', failed: 'failure', stopped: 'cancelled', expired: 'timed_out' } as Record<string, string>)[name] ?? name)
        : null,
      branch: string(target.ref_name),
      headSha: string(object(target.commit).hash),
      event: string(object(row.trigger).name),
      htmlUrl: this.link(row, 'html') || `${this.connection.baseUrl.replace(/\/$/, '')}/${repository.fullPath}/pipelines/results/${string(row.build_number)}`,
      createdAt: string(row.created_on),
      updatedAt: string(row.completed_on ?? row.created_on),
    };
  }
  async runs(input: Input<'runs'>) {
    const filters = [
      input.branch ? `target.ref_name=${JSON.stringify(input.branch)}` : '',
      input.headSha ? `target.commit.hash=${JSON.stringify(input.headSha)}` : '',
    ].filter(Boolean);
    return this.page(`${this.path(input.repository)}/pipelines`, (row) => this.mapRun(row, input.repository), input.cursor, {
      sort: '-created_on',
      q: filters.length ? filters.join(' AND ') : undefined,
    });
  }
  async jobs(input: Input<'jobs'>) {
    return this.page(
      `${this.path(input.repository)}/pipelines/${encode(input.runId)}/steps`,
      (row): HostingJob => {
        const state = object(row.state);
        const name = string(object(state.result).name).toLowerCase();
        return {
          id: string(row.uuid),
          name: string(row.name),
          status: state.name === 'COMPLETED' ? 'completed' : state.name === 'IN_PROGRESS' ? 'in_progress' : string(state.name).toLowerCase(),
          conclusion: name ? (name === 'successful' ? 'success' : name === 'failed' ? 'failure' : name === 'stopped' ? 'cancelled' : name) : null,
          htmlUrl: this.link(row, 'html'),
          steps: [],
        };
      },
      input.cursor,
    );
  }
  async status(input: Input<'status'>): Promise<Output<'status'>> {
    const checks: Output<'status'>['checks'] = [];
    let cursor: string | undefined;
    do {
      const page = await this.page(
        `${this.path(input.repository)}/commit/${encode(input.ref)}/statuses`,
        (row) => ({
          id: string(row.uuid ?? row.key),
          name: string(row.name ?? row.key),
          status: string(row.state),
          htmlUrl: string(row.url) || null,
          description: string(row.description),
        }),
        cursor,
      );
      checks.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return {
      sha: input.ref,
      state: checks.some((row) => ['FAILED', 'STOPPED'].includes(row.status))
        ? 'failure'
        : checks.some((row) => row.status === 'INPROGRESS')
          ? 'pending'
          : checks.length && checks.every((row) => row.status === 'SUCCESSFUL')
            ? 'success'
            : 'unknown',
      checks,
    };
  }
  async logs(input: Input<'logs'>) {
    if (!input.jobId) throw new HostingHttpError(0, 'job_required', 'Select a pipeline step to view its log.');
    return this.http.textLog(`${this.path(input.repository)}/pipelines/${encode(input.runId)}/steps/${encode(input.jobId)}/log`);
  }
  async dispatch(input: Input<'dispatch'>): Promise<true> {
    const target: Row = { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: input.ref };
    if (input.workflow && input.workflow !== 'default') target.selector = { type: 'custom', pattern: input.workflow };
    await this.json(`${this.path(input.repository)}/pipelines`, 'POST', {
      target,
      variables: Object.entries(input.inputs ?? {}).map(([key, value]) => ({ key, value, secured: false })),
    });
    return true;
  }
  async cancelRun(input: Input<'cancelRun'>): Promise<true> {
    await this.json(`${this.path(input.repository)}/pipelines/${encode(input.runId)}/stopPipeline`, 'POST');
    return true;
  }
  async releases(input: Input<'releases'>) {
    return this.page(
      `${this.path(input.repository)}/refs/tags`,
      (row) => ({
        id: string(row.name),
        tagName: string(row.name),
        name: string(row.name),
        body: string(row.message),
        htmlUrl: this.link(row, 'html'),
        draft: false,
        prerelease: false,
      }),
      input.cursor,
    );
  }
  async createRelease(input: Input<'createRelease'>) {
    if (input.draft || input.prerelease) unsupported('Bitbucket release flags');
    const tag = await this.json(`${this.path(input.repository)}/refs/tags`, 'POST', {
      name: input.tagName,
      message: input.body,
      target: { hash: input.target },
    });
    return {
      id: string(tag.name),
      tagName: string(tag.name),
      name: string(tag.name),
      body: string(tag.message),
      htmlUrl: this.link(tag, 'html'),
      draft: false,
      prerelease: false,
    };
  }
  private downloadUrl(repository: HostedRepositoryRef, name: string): string {
    return `${this.connection.baseUrl.replace(/\/$/, '')}/${repository.fullPath.split('/').map(encode).join('/')}/downloads/${encode(name)}`;
  }
  async releaseAssets(input: Input<'releaseAssets'>) {
    return this.page(
      `${this.path(input.repository)}/downloads`,
      (row) => ({
        id: string(row.name),
        name: string(row.name),
        htmlUrl: this.downloadUrl(input.repository, string(row.name)),
      }),
      input.cursor,
    );
  }
  async uploadAsset(input: Input<'uploadAsset'>, data: Uint8Array) {
    const rawName = input.name ?? input.filePath.split(/[\\/]/).pop() ?? 'asset';
    const name = `${input.releaseId.replace(/[\\/]/g, '_')}-${rawName}`;
    const route = `${this.path(input.repository)}/downloads`;
    let cursor: string | undefined;
    do {
      const existing = await this.page(route, (row) => string(row.name), cursor);
      if (existing.items.includes(name)) throw new HostingHttpError(409, 'asset_exists', 'A repository download with this name already exists.');
      cursor = existing.nextCursor ?? undefined;
    } while (cursor);
    const body = new FormData();
    body.append('files', new Blob([new Uint8Array(data)]), name);
    const uploaded = (await this.http.json(route, { method: 'POST', rawBody: body })).data;
    const item = rows(uploaded)[0] ?? rows(object(uploaded).values)[0] ?? object(uploaded);
    return { id: string(item.name, name), name, htmlUrl: this.downloadUrl(input.repository, name) };
  }
}
