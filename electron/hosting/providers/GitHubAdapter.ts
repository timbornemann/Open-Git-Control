import type {
  HostedRepository,
  HostedRepositoryRef,
  HostingArtifact,
  HostingCapabilities,
  HostingChangeRequest,
  HostingConnection,
  HostingFeature,
  HostingJob,
  HostingRelease,
  HostingRun,
} from '../../../src/types/hostingDtos';
import type { CredentialGetter } from '../HostingAdapter';
import { HostingHttpError, HostingHttpTransport } from './HostingHttpTransport';
import {
  BaseHostingAdapter,
  caps,
  checkState,
  encode,
  linkCursor,
  number,
  object,
  pageNumber,
  rows,
  safeCloneUrl,
  string,
  unsupported,
  zipLogs,
} from './providerUtils';
import type { Input, Output, Row } from './providerUtils';

/** GitHub and Forgejo expose related resource shapes, but distinct capabilities. */
export class GitHubAdapter extends BaseHostingAdapter {
  protected readonly forgejo: boolean;
  private serverVersion: string;

  constructor(connection: HostingConnection, credentials: CredentialGetter, transport?: HostingHttpTransport) {
    const base = new URL(connection.baseUrl);
    const uploadBase = base.hostname === 'github.com' ? 'https://uploads.github.com' : `${base.origin}${base.pathname.replace(/\/$/, '')}/api/uploads`;
    super(
      connection,
      credentials,
      transport ??
        new HostingHttpTransport({
          baseUrl: connection.apiBaseUrl,
          getToken: async () => (await credentials()).accessToken,
          trustedUploadBaseUrl: connection.provider === 'github' ? uploadBase : undefined,
        }),
    );
    this.forgejo = connection.provider === 'forgejo';
    this.serverVersion = connection.serverVersion ?? '';
  }

  async authenticate() {
    const user = await this.json('user');
    if (this.forgejo) this.serverVersion = string((await this.json('version')).version);
    return { id: string(user.id), username: string(user.login), ...(this.serverVersion ? { serverVersion: this.serverVersion } : {}) };
  }

  async capabilities(repository?: HostedRepositoryRef): Promise<HostingCapabilities> {
    if (this.forgejo && !this.serverVersion) this.serverVersion = string((await this.json('version')).version);
    const major = number(this.serverVersion.match(/(?:^|v)(\d+)/)?.[1]);
    const result = caps({
      defaultBranchOnlyFork: !this.forgejo,
      mergeMethods: ['merge', 'squash', 'rebase'],
      ciLabel: this.forgejo ? 'Forgejo Actions' : 'GitHub Actions',
      runs: !this.forgejo || major >= 12,
      jobs: !this.forgejo || major >= 16,
      steps: !this.forgejo,
      logs: !this.forgejo || major >= 16,
      runLogs: !this.forgejo || major >= 16,
      artifacts: !this.forgejo || major >= 16,
      cancelRun: !this.forgejo || major >= 16,
      retryRun: !this.forgejo,
      dispatch: true,
      releases: 'native',
      releaseAssets: true,
      draftRelease: true,
      prerelease: true,
      ...(this.forgejo
        ? {
            reason:
              major < 16
                ? 'Forgejo 16 adds jobs, logs, artifacts and cancellation. Retry requires the Forgejo website.'
                : 'Forgejo does not expose a public workflow retry endpoint.',
          }
        : {}),
    });
    if (repository) {
      const data = await this.json(this.path(repository));
      result.mergeMethods = [
        ['merge', 'allow_merge_commits'],
        ['squash', 'allow_squash_merge'],
        ['rebase', this.forgejo ? 'allow_rebase' : 'allow_rebase_merge'],
      ]
        .filter(([, key]) => data[key] !== false)
        .map(([method]) => method);
      if ((this.forgejo && data.has_actions === false) || (!this.forgejo && data.disabled === true)) {
        Object.assign(result, {
          runs: false,
          jobs: false,
          steps: false,
          logs: false,
          runLogs: false,
          artifacts: false,
          cancelRun: false,
          retryRun: false,
          dispatch: false,
          reason: 'Actions are disabled for this repository.',
        });
        for (const feature of ['runs', 'jobs', 'steps', 'logs', 'artifacts', 'cancelRun', 'retryRun', 'dispatch'] as const)
          if (result.availability?.[feature] === 'available') result.availability[feature] = 'disabled';
      }
      if (object(data.permissions).push === false) {
        result.mergeMethods = [];
        result.dispatch = false;
        result.cancelRun = false;
        result.retryRun = false;
        for (const feature of ['dispatch', 'cancelRun', 'retryRun'] as const)
          if (result.availability?.[feature] === 'available') result.availability[feature] = 'permission';
      }
    }
    return result;
  }

  protected path(repository: HostedRepositoryRef): string {
    this.assertRepository(repository);
    const parts = repository.fullPath.split('/');
    if (parts.length !== 2) throw new HostingHttpError(0, 'invalid_repository', 'Expected owner/repository.');
    return `repos/${parts.map(encode).join('/')}`;
  }
  protected mapRepository(data: Row): HostedRepository {
    const fullPath = string(data.full_name);
    const parent = object(data.parent);
    return {
      ref: this.ref(data.id, fullPath),
      name: string(data.name),
      fullName: fullPath,
      private: Boolean(data.private),
      cloneUrl: safeCloneUrl(data.clone_url),
      sshUrl: safeCloneUrl(data.ssh_url, true),
      htmlUrl: string(data.html_url),
      description: data.description == null ? null : string(data.description),
      defaultBranch: string(data.default_branch, 'main'),
      fork: Boolean(data.fork),
      parent: parent.full_name ? this.ref(parent.id, string(parent.full_name)) : null,
      updatedAt: string(data.updated_at),
    };
  }
  async resolveRepository(url: string) {
    const path = this.remotePath(url);
    return this.resolvePath(path && path.split('/').length === 2 ? path : null);
  }
  async repositories(input: Input<'repositories'>) {
    const page = await this.paged('user/repos', (data) => this.mapRepository(data), input.cursor, { sort: 'updated', direction: 'desc' });
    return {
      ...page,
      items: input.search
        ? page.items.filter((repo) => `${repo.fullName} ${repo.description ?? ''}`.toLowerCase().includes(input.search!.toLowerCase()))
        : page.items,
    };
  }
  async repository(input: Input<'repository'>) {
    return this.mapRepository(await this.json(this.path(input.repository)));
  }
  async createRepository(input: Input<'createRepository'>) {
    const username = this.connection.username ?? string((await this.json('user')).login);
    const namespace = input.namespace?.trim();
    const route = namespace && namespace !== username ? `orgs/${encode(namespace)}/repos` : 'user/repos';
    const repository = this.mapRepository(
      await this.json(route, 'POST', {
        name: input.name,
        description: input.description,
        private: input.private,
        auto_init: Boolean(input.initializeReadme || input.readmeContent),
      }),
    );
    if (input.readmeContent !== undefined) {
      const readme = await this.json(`${this.path(repository.ref)}/contents/README.md`);
      await this.json(`${this.path(repository.ref)}/contents/README.md`, 'PUT', {
        content: Buffer.from(input.readmeContent).toString('base64'),
        message: 'Initialize README',
        sha: readme.sha,
        branch: repository.defaultBranch,
      });
    }
    return repository;
  }
  async fork(input: Input<'fork'>) {
    if (this.forgejo && input.defaultBranchOnly) unsupported('Default-branch-only forks');
    return this.mapRepository(
      await this.json(`${this.path(input.repository)}/forks`, 'POST', {
        name: input.name,
        ...(input.namespace ? { organization: input.namespace } : {}),
        ...(!this.forgejo ? { default_branch_only: input.defaultBranchOnly } : {}),
      }),
    );
  }
  async branches(input: Input<'branches'>) {
    return this.paged(`${this.path(input.repository)}/branches`, (row) => string(row.name), input.cursor);
  }
  async tags(input: Input<'tags'>) {
    return this.paged(`${this.path(input.repository)}/tags`, (row) => string(row.name), input.cursor);
  }
  private async paged<T>(path: string, map: (row: Row) => T, cursor?: string, query: Record<string, string | number | boolean | undefined> = {}) {
    if (!this.forgejo) return this.arrayPage(path, map, cursor, query);
    const page = pageNumber(cursor);
    const response = await this.http.json(path, { query: { limit: 50, page, ...query } });
    const items = rows(response.data);
    const total = response.headers.get('x-total-count');
    return {
      items: items.map(map),
      nextCursor: total !== null ? (page * 50 < number(total) ? String(page + 1) : null) : items.length === 50 ? String(page + 1) : null,
    };
  }
  private mapChangeRequest(data: Row, target: HostedRepositoryRef): HostingChangeRequest {
    const head = object(data.head);
    const base = object(data.base);
    const source = object(head.repo);
    const merged = Boolean(data.merged || data.merged_at);
    return {
      id: string(data.number),
      number: string(data.number),
      title: string(data.title),
      body: string(data.body),
      state: merged ? 'merged' : data.state === 'open' ? 'open' : 'closed',
      author: string(object(data.user).login),
      source: source.full_name ? this.ref(source.id, string(source.full_name)) : target,
      sourceBranch: string(head.ref),
      headSha: string(head.sha),
      target,
      targetBranch: string(base.ref),
      draft: Boolean(data.draft),
      htmlUrl: string(data.html_url),
      createdAt: string(data.created_at),
      updatedAt: string(data.updated_at),
    };
  }
  async changeRequests(input: Input<'changeRequests'>) {
    return this.paged(`${this.path(input.repository)}/pulls`, (row) => this.mapChangeRequest(row, input.repository), input.cursor, {
      state: input.state ?? 'open',
      sort: 'updated',
      direction: 'desc',
    });
  }
  async createChangeRequest(input: Input<'createChangeRequest'>) {
    this.assertRepository(input.source);
    const head = input.source.fullPath === input.repository.fullPath ? input.sourceBranch : `${input.source.fullPath.split('/')[0]}:${input.sourceBranch}`;
    return this.mapChangeRequest(
      await this.json(`${this.path(input.repository)}/pulls`, 'POST', { title: input.title, body: input.body, head, base: input.targetBranch }),
      input.repository,
    );
  }
  async merge(input: Input<'merge'>): Promise<Output<'merge'>> {
    if (!input.expectedHeadSha) throw new HostingHttpError(0, 'head_required', 'A checked source commit is required to merge.');
    if (!(await this.capabilities(input.repository)).mergeMethods.includes(input.method)) unsupported('Selected merge method');
    const data = await this.json(
      `${this.path(input.repository)}/pulls/${encode(input.id)}/merge`,
      this.forgejo ? 'POST' : 'PUT',
      this.forgejo ? { Do: input.method, head_commit_id: input.expectedHeadSha } : { merge_method: input.method, sha: input.expectedHeadSha },
    );
    return { merged: this.forgejo ? true : Boolean(data.merged), message: string(data.message, 'Merged'), sha: string(data.sha) || undefined };
  }
  private mapRun(data: Row): HostingRun {
    const status = string(data.status);
    const conclusion = this.forgejo
      ? ['success', 'failure', 'cancelled', 'skipped'].includes(status)
        ? status
        : null
      : data.conclusion == null
        ? null
        : string(data.conclusion);
    return {
      id: string(data.id),
      number: string(this.forgejo ? data.index_in_repo : data.run_number),
      name: string(this.forgejo ? data.title : (data.display_title ?? data.name), 'Workflow'),
      workflowId: string(data.workflow_id),
      workflowName: string(data.name ?? data.workflow_id),
      status: conclusion ? 'completed' : status === 'running' ? 'in_progress' : status,
      conclusion,
      branch: string(this.forgejo ? data.prettyref : data.head_branch).replace(/^refs\/heads\//, ''),
      headSha: string(this.forgejo ? data.commit_sha : data.head_sha),
      event: string(data.event),
      htmlUrl: string(data.html_url),
      createdAt: string(this.forgejo ? data.created : data.created_at),
      updatedAt: string(this.forgejo ? data.updated : data.updated_at),
    };
  }
  private async requireFeature(feature: HostingFeature, repository: HostedRepositoryRef): Promise<void> {
    const capabilities = await this.capabilities(repository);
    if (capabilities[feature]) return;
    const availability = capabilities.availability?.[feature];
    if (availability === 'permission') throw new HostingHttpError(403, 'permission', 'This account cannot perform the operation.');
    if (availability === 'disabled') throw new HostingHttpError(409, 'feature_disabled', 'This feature is disabled for this repository.');
    unsupported(feature);
  }
  async runs(input: Input<'runs'>) {
    await this.requireFeature('runs', input.repository);
    const page = this.forgejo ? pageNumber(input.cursor) : undefined;
    const response = await this.http.json(input.cursor && !this.forgejo ? input.cursor : `${this.path(input.repository)}/actions/runs`, {
      query: {
        ...(this.forgejo ? { page, limit: 50, ref: input.branch ? `refs/heads/${input.branch}` : undefined } : { per_page: 50, branch: input.branch }),
        head_sha: input.headSha,
      },
    });
    const data = object(response.data);
    const entries = rows(data.workflow_runs);
    return {
      items: entries.map((row) => this.mapRun(row)),
      nextCursor: this.forgejo ? (page! * 50 < number(data.total_count) ? String(page! + 1) : null) : linkCursor(response.headers),
    };
  }
  async jobs(input: Input<'jobs'>) {
    await this.requireFeature('jobs', input.repository);
    const response = await this.http.json(
      input.cursor && !this.forgejo ? input.cursor : `${this.path(input.repository)}/actions/runs/${encode(input.runId)}/jobs`,
      { query: this.forgejo ? { limit: 50, page: pageNumber(input.cursor) } : { per_page: 50 } },
    );
    const data = object(response.data);
    const entries = this.forgejo ? rows(response.data) : rows(data.jobs);
    const items: HostingJob[] = entries.map((row) => ({
      id: string(row.id),
      name: string(row.name),
      status: string(row.status),
      conclusion:
        row.conclusion == null
          ? this.forgejo && ['success', 'failure', 'cancelled', 'skipped'].includes(string(row.status))
            ? string(row.status)
            : null
          : string(row.conclusion),
      htmlUrl: string(row.html_url),
      steps: rows(row.steps).map((step) => ({
        id: string(step.number),
        name: string(step.name),
        status: string(step.status),
        conclusion: step.conclusion == null ? null : string(step.conclusion),
      })),
    }));
    return { items, nextCursor: this.forgejo ? (entries.length === 50 ? String(pageNumber(input.cursor) + 1) : null) : linkCursor(response.headers) };
  }
  async status(input: Input<'status'>): Promise<Output<'status'>> {
    const route = `${this.path(input.repository)}/commits/${encode(input.ref)}`;
    const response = await this.http.json(`${route}/status`, { query: { per_page: 100 } });
    const statuses = object(response.data);
    const checks = rows(statuses.statuses).map((row) => ({
      id: string(row.id),
      name: string(row.context),
      status: string(row.state),
      htmlUrl: row.target_url == null ? null : string(row.target_url),
      description: string(row.description),
    }));
    let statusCursor = linkCursor(response.headers);
    for (let page = 0; statusCursor && page < 100; page += 1) {
      const next = await this.http.json(statusCursor);
      checks.push(
        ...rows(object(next.data).statuses).map((row) => ({
          id: string(row.id),
          name: string(row.context),
          status: string(row.state),
          htmlUrl: row.target_url == null ? null : string(row.target_url),
          description: string(row.description),
        })),
      );
      statusCursor = linkCursor(next.headers);
    }
    if (statusCursor) throw new HostingHttpError(0, 'pagination_limit', 'Too many status checks to verify completely.');
    if (!this.forgejo) {
      let cursor: string | undefined;
      do {
        const response = await this.http.json(cursor ?? `${route}/check-runs`, { query: cursor ? undefined : { per_page: 100 } });
        checks.push(
          ...rows(object(response.data).check_runs).map((row) => ({
            id: string(row.id),
            name: string(row.name),
            status: string(row.conclusion ?? row.status),
            htmlUrl: string(row.details_url ?? row.html_url) || null,
            description: string(object(row.output).summary),
          })),
        );
        cursor = linkCursor(response.headers) ?? undefined;
      } while (cursor);
    }
    return { sha: string(statuses.sha, input.ref), state: checkState(checks, string(statuses.state, 'unknown')), checks };
  }
  async logs(input: Input<'logs'>) {
    await this.requireFeature('logs', input.repository);
    const path = `${this.path(input.repository)}/actions/${input.jobId ? `jobs/${encode(input.jobId)}` : `runs/${encode(input.runId)}`}/logs`;
    if (input.jobId) return this.http.textLog(path);
    return zipLogs(await this.http.download(path, {}, 32 * 1024 * 1024));
  }
  async artifacts(input: Input<'artifacts'>) {
    await this.requireFeature('artifacts', input.repository);
    const response = await this.http.json(
      input.cursor && !this.forgejo ? input.cursor : `${this.path(input.repository)}/actions/runs/${encode(input.runId)}/artifacts`,
      { query: this.forgejo ? { limit: 50, page: pageNumber(input.cursor) } : { per_page: 50 } },
    );
    const entries = this.forgejo ? rows(response.data) : rows(object(response.data).artifacts);
    const items: HostingArtifact[] = entries.map((row) => ({
      id: string(row.id),
      name: string(row.name),
      size: number(row.size_in_bytes),
      expiresAt: row.expires_at == null ? null : string(row.expires_at),
      downloadable: !row.expired,
    }));
    return { items, nextCursor: this.forgejo ? (entries.length === 50 ? String(pageNumber(input.cursor) + 1) : null) : linkCursor(response.headers) };
  }
  async downloadArtifact(input: Input<'downloadArtifact'>) {
    await this.requireFeature('artifacts', input.repository);
    const metadata = await this.json(`${this.path(input.repository)}/actions/artifacts/${encode(input.artifactId)}`);
    const runId = string(this.forgejo ? metadata.run_id : object(metadata.workflow_run).id);
    if (runId !== input.runId) throw new HostingHttpError(0, 'invalid_artifact', 'Artifact does not belong to the selected run.');
    if (metadata.expired) throw new HostingHttpError(410, 'artifact_expired', 'Artifact has expired.');
    return this.http.download(`${this.path(input.repository)}/actions/artifacts/${encode(input.artifactId)}/zip`);
  }
  async dispatch(input: Input<'dispatch'>): Promise<true> {
    await this.requireFeature('dispatch', input.repository);
    if (!input.workflow || !input.ref) throw new HostingHttpError(0, 'workflow_required', 'Workflow and reference are required.');
    await this.json(`${this.path(input.repository)}/actions/workflows/${encode(input.workflow)}/dispatches`, 'POST', { ref: input.ref, inputs: input.inputs });
    return true;
  }
  async cancelRun(input: Input<'cancelRun'>): Promise<true> {
    await this.requireFeature('cancelRun', input.repository);
    await this.json(`${this.path(input.repository)}/actions/runs/${encode(input.runId)}/cancel`, 'POST');
    return true;
  }
  async retryRun(input: Input<'retryRun'>): Promise<true> {
    await this.requireFeature('retryRun', input.repository);
    await this.json(`${this.path(input.repository)}/actions/runs/${encode(input.runId)}/rerun-failed-jobs`, 'POST');
    return true;
  }
  private mapRelease(row: Row): HostingRelease {
    return {
      id: string(row.id),
      tagName: string(row.tag_name),
      name: string(row.name ?? row.tag_name),
      body: string(row.body),
      publishedAt: string(row.published_at) || undefined,
      htmlUrl: string(row.html_url),
      draft: Boolean(row.draft),
      prerelease: Boolean(row.prerelease),
    };
  }
  async releases(input: Input<'releases'>) {
    return this.paged(`${this.path(input.repository)}/releases`, (row) => this.mapRelease(row), input.cursor);
  }
  async releaseAssets(input: Input<'releaseAssets'>) {
    if (!input.releaseId) throw new HostingHttpError(400, 'release_required', 'Select a release to list its assets.');
    return this.paged(
      `${this.path(input.repository)}/releases/${encode(input.releaseId)}/assets`,
      (row) => ({
        id: string(row.id),
        name: string(row.name),
        htmlUrl: string(row.browser_download_url),
      }),
      input.cursor,
    );
  }
  async createRelease(input: Input<'createRelease'>) {
    return this.mapRelease(
      await this.json(`${this.path(input.repository)}/releases`, 'POST', {
        tag_name: input.tagName,
        name: input.name,
        body: input.body,
        target_commitish: input.target,
        draft: Boolean(input.draft),
        prerelease: Boolean(input.prerelease),
      }),
    );
  }
  async uploadAsset(input: Input<'uploadAsset'>, data: Uint8Array) {
    const name = input.name ?? input.filePath.split(/[\\/]/).pop() ?? 'asset';
    let response: Response;
    if (this.forgejo) {
      const body = new FormData();
      body.append('attachment', new Blob([new Uint8Array(data)]), name);
      response = await this.http.request(`${this.path(input.repository)}/releases/${encode(input.releaseId)}/assets`, {
        method: 'POST',
        rawBody: body,
        query: { name },
      });
    } else
      response = await this.http.upload(`${this.path(input.repository)}/releases/${encode(input.releaseId)}/assets`, {
        method: 'POST',
        query: { name },
        rawBody: new Uint8Array(data),
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    const asset = object(await response.json());
    return { id: string(asset.id), name: string(asset.name, name), htmlUrl: string(asset.browser_download_url) };
  }
}

export class ForgejoAdapter extends GitHubAdapter {}
