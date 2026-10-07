import type { HostedRepository, HostedRepositoryRef, HostingCapabilities, HostingChangeRequest, HostingJob, HostingRun } from '../../../src/types/hostingDtos';
import { HostingHttpError } from './HostingHttpTransport';
import { BaseHostingAdapter, caps, encode, linkCursor, number, object, rows, safeCloneUrl, string, unsupported } from './providerUtils';
import type { Input, Output, Row } from './providerUtils';

export class GitLabAdapter extends BaseHostingAdapter {
  private readonly projectPaths = new Map<string, string>();
  async authenticate() {
    const user = await this.json('user');
    let version = this.connection.serverVersion;
    try {
      version = string((await this.json('version')).version) || version;
    } catch (error) {
      if (!(error instanceof HostingHttpError) || ![403, 404].includes(error.status)) throw error;
    }
    return { id: string(user.id), username: string(user.username), ...(version ? { serverVersion: version } : {}) };
  }
  async capabilities(repository?: HostedRepositoryRef): Promise<HostingCapabilities> {
    const result = caps({
      changeRequestLabel: 'Merge Requests',
      ciLabel: 'GitLab CI/CD',
      runs: true,
      jobs: true,
      logs: true,
      artifacts: true,
      cancelRun: true,
      retryRun: true,
      dispatch: true,
      releases: 'native',
      releaseAssets: true,
      reason: 'Merge follows the project merge strategy; retry repeats failed or cancelled jobs. GitLab has no native draft or prerelease flags.',
    });
    if (repository) {
      const project = await this.json(this.path(repository));
      result.mergeMethods = this.mergeMethods(project);
      if (project.builds_access_level === 'disabled' || project.jobs_enabled === false) {
        Object.assign(result, {
          runs: false,
          jobs: false,
          logs: false,
          artifacts: false,
          cancelRun: false,
          retryRun: false,
          dispatch: false,
          reason: 'CI/CD is disabled for this project.',
        });
        for (const feature of ['runs', 'jobs', 'logs', 'artifacts', 'cancelRun', 'retryRun', 'dispatch'] as const)
          if (result.availability?.[feature] === 'available') result.availability[feature] = 'disabled';
      }
      if (project.forking_access_level === 'disabled') {
        result.fork = false;
        if (result.availability) result.availability.fork = 'disabled';
      }
      if (project.merge_requests_access_level === 'disabled') {
        result.changeRequests = false;
        result.mergeMethods = [];
        if (result.availability) result.availability.changeRequests = 'disabled';
      }
    }
    return result;
  }
  private mergeMethods(project: Row): string[] {
    if (project.merge_requests_access_level === 'disabled' || project.merge_requests_enabled === false || project.archived === true) return [];
    if (project.squash_option === 'always') return ['squash'];
    if (project.squash_option === 'never') return ['merge'];
    return ['merge', 'squash'];
  }
  private path(repository: HostedRepositoryRef): string {
    this.assertRepository(repository);
    return `projects/${encode(repository.repositoryId || repository.fullPath)}`;
  }
  private mapRepository(row: Row): HostedRepository {
    const fullPath = string(row.path_with_namespace);
    this.projectPaths.set(string(row.id), fullPath);
    const parent = object(row.forked_from_project);
    return {
      ref: this.ref(row.id, fullPath),
      name: string(row.name),
      fullName: fullPath,
      private: row.visibility !== 'public',
      cloneUrl: safeCloneUrl(row.http_url_to_repo),
      sshUrl: safeCloneUrl(row.ssh_url_to_repo, true),
      htmlUrl: string(row.web_url),
      description: row.description == null ? null : string(row.description),
      defaultBranch: string(row.default_branch, 'main'),
      fork: Boolean(row.forked_from_project),
      parent: parent.id ? this.ref(parent.id, string(parent.path_with_namespace)) : null,
      updatedAt: string(row.last_activity_at),
    };
  }
  async resolveRepository(url: string) {
    return this.resolvePath(this.remotePath(url));
  }
  async repositories(input: Input<'repositories'>) {
    return this.arrayPage('projects', (row) => this.mapRepository(row), input.cursor, {
      membership: true,
      order_by: 'last_activity_at',
      sort: 'desc',
      search: input.search,
    });
  }
  async repository(input: Input<'repository'>) {
    return this.mapRepository(await this.json(this.path(input.repository)));
  }
  private async namespaceId(namespace: string): Promise<number> {
    if (/^\d+$/.test(namespace)) return Number(namespace);
    let cursor: string | null = null;
    do {
      const response = await this.http.json(cursor ?? 'namespaces', { query: cursor ? undefined : { search: namespace, per_page: 100 } });
      const match = rows(response.data).find((row) => row.full_path === namespace);
      if (match) return number(match.id);
      cursor = linkCursor(response.headers);
    } while (cursor);
    throw new HostingHttpError(404, 'namespace_not_found', 'GitLab namespace was not found.');
  }
  async createRepository(input: Input<'createRepository'>) {
    const namespaceId = input.namespace ? await this.namespaceId(input.namespace) : undefined;
    const result = this.mapRepository(
      await this.json('projects', 'POST', {
        name: input.name,
        namespace_id: namespaceId,
        description: input.description,
        visibility: input.private ? 'private' : 'public',
        initialize_with_readme: Boolean(input.initializeReadme || input.readmeContent),
      }),
    );
    if (input.readmeContent !== undefined)
      await this.json(`${this.path(result.ref)}/repository/files/README.md`, 'PUT', {
        branch: result.defaultBranch,
        content: input.readmeContent,
        commit_message: 'Initialize README',
      });
    return result;
  }
  async fork(input: Input<'fork'>) {
    if (input.defaultBranchOnly) unsupported('Default-branch-only forks');
    return this.mapRepository(
      await this.json(`${this.path(input.repository)}/fork`, 'POST', {
        namespace_id: input.namespace ? await this.namespaceId(input.namespace) : undefined,
        name: input.name,
        path: input.name,
      }),
    );
  }
  async branches(input: Input<'branches'>) {
    return this.arrayPage(`${this.path(input.repository)}/repository/branches`, (row) => string(row.name), input.cursor);
  }
  async tags(input: Input<'tags'>) {
    return this.arrayPage(`${this.path(input.repository)}/repository/tags`, (row) => string(row.name), input.cursor);
  }
  private async sourceReference(id: unknown, target: HostedRepositoryRef): Promise<HostedRepositoryRef> {
    const sourceId = string(id);
    if (!sourceId || sourceId === target.repositoryId) return target;
    let path = this.projectPaths.get(sourceId);
    if (!path) {
      try {
        path = string((await this.json(`projects/${encode(sourceId)}`)).path_with_namespace);
        this.projectPaths.set(sourceId, path);
      } catch (error) {
        if (!(error instanceof HostingHttpError) || error.status !== 404) throw error;
        path = `deleted-source/${sourceId}`;
      }
    }
    return this.ref(sourceId, path);
  }
  private async mapChangeRequest(row: Row, target: HostedRepositoryRef): Promise<HostingChangeRequest> {
    return {
      id: string(row.iid),
      number: string(row.iid),
      title: string(row.title),
      body: string(row.description),
      state: row.state === 'merged' ? 'merged' : row.state === 'opened' ? 'open' : 'closed',
      author: string(object(row.author).username),
      source: await this.sourceReference(row.source_project_id, target),
      sourceBranch: string(row.source_branch),
      headSha: string(row.sha ?? object(row.diff_refs).head_sha),
      target,
      targetBranch: string(row.target_branch),
      draft: Boolean(row.draft || row.work_in_progress),
      htmlUrl: string(row.web_url),
      createdAt: string(row.created_at),
      updatedAt: string(row.updated_at),
    };
  }
  async changeRequests(input: Input<'changeRequests'>) {
    const response = await this.http.json(input.cursor ?? `${this.path(input.repository)}/merge_requests`, {
      query: input.cursor
        ? undefined
        : { per_page: 50, state: input.state === 'all' || input.state === 'closed' ? 'all' : 'opened', order_by: 'updated_at', sort: 'desc' },
    });
    return {
      items: await Promise.all(
        rows(response.data)
          .filter((row) => input.state !== 'closed' || row.state !== 'opened')
          .map((row) => this.mapChangeRequest(row, input.repository)),
      ),
      nextCursor: linkCursor(response.headers),
    };
  }
  async createChangeRequest(input: Input<'createChangeRequest'>) {
    this.assertRepository(input.source);
    const target = input.repository.repositoryId || (await this.repository({ repository: input.repository })).ref.repositoryId;
    const data = await this.json(`${this.path(input.source)}/merge_requests`, 'POST', {
      source_branch: input.sourceBranch,
      target_branch: input.targetBranch,
      target_project_id: number(target),
      title: input.title,
      description: input.body,
    });
    return this.mapChangeRequest(data, input.repository);
  }
  async merge(input: Input<'merge'>): Promise<Output<'merge'>> {
    if (!input.expectedHeadSha) throw new HostingHttpError(0, 'head_required', 'A checked source commit is required to merge.');
    if (!['merge', 'squash'].includes(input.method)) unsupported('Selected GitLab merge method');
    if (!this.mergeMethods(await this.json(this.path(input.repository))).includes(input.method)) unsupported('Selected GitLab project merge method');
    const data = await this.json(`${this.path(input.repository)}/merge_requests/${encode(input.id)}/merge`, 'PUT', {
      sha: input.expectedHeadSha,
      squash: input.method === 'squash',
      should_remove_source_branch: false,
    });
    const merged = data.state === 'merged';
    return {
      merged,
      message: merged ? 'Merged' : 'GitLab did not merge the merge request.',
      sha: string(data.merge_commit_sha ?? data.squash_commit_sha) || undefined,
    };
  }
  private mapRun(row: Row): HostingRun {
    const status = string(row.status);
    const done = ['success', 'failed', 'canceled', 'skipped'].includes(status);
    return {
      id: string(row.id),
      number: string(row.iid ?? row.id),
      name: string(row.name, `Pipeline ${string(row.id)}`),
      status: done ? 'completed' : status === 'running' ? 'in_progress' : status,
      conclusion: done ? (status === 'failed' ? 'failure' : status === 'canceled' ? 'cancelled' : status) : null,
      branch: string(row.ref),
      headSha: string(row.sha),
      event: string(row.source),
      htmlUrl: string(row.web_url),
      createdAt: string(row.created_at),
      updatedAt: string(row.updated_at),
    };
  }
  async runs(input: Input<'runs'>) {
    return this.arrayPage(`${this.path(input.repository)}/pipelines`, (row) => this.mapRun(row), input.cursor, {
      ref: input.branch,
      sha: input.headSha,
      order_by: 'id',
      sort: 'desc',
    });
  }
  private mapJob(row: Row): HostingJob {
    const status = string(row.status);
    return {
      id: string(row.id),
      name: string(row.name),
      status: ['success', 'failed', 'canceled', 'skipped'].includes(status) ? 'completed' : status,
      conclusion: status === 'failed' ? 'failure' : status === 'canceled' ? 'cancelled' : ['success', 'skipped'].includes(status) ? status : null,
      htmlUrl: string(row.web_url),
      steps: [],
    };
  }
  async jobs(input: Input<'jobs'>) {
    return this.arrayPage(`${this.path(input.repository)}/pipelines/${encode(input.runId)}/jobs`, (row) => this.mapJob(row), input.cursor);
  }
  async status(input: Input<'status'>): Promise<Output<'status'>> {
    const checks: Output<'status'>['checks'] = [];
    let cursor: string | undefined;
    do {
      const response = await this.http.json(cursor ?? `${this.path(input.repository)}/repository/commits/${encode(input.ref)}/statuses`, {
        query: cursor ? undefined : { per_page: 100 },
      });
      checks.push(
        ...rows(response.data).map((row) => ({
          id: string(row.id),
          name: string(row.name),
          status: string(row.status),
          htmlUrl: row.target_url == null ? null : string(row.target_url),
          description: string(row.description),
        })),
      );
      cursor = linkCursor(response.headers) ?? undefined;
    } while (cursor);
    const state = checks.some((row) => ['failed', 'canceled'].includes(row.status))
      ? 'failure'
      : checks.some((row) => ['pending', 'running', 'created'].includes(row.status))
        ? 'pending'
        : checks.length && checks.every((row) => ['success', 'skipped'].includes(row.status))
          ? 'success'
          : 'unknown';
    return { sha: input.ref, state, checks };
  }
  async logs(input: Input<'logs'>) {
    if (!input.jobId) throw new HostingHttpError(0, 'job_required', 'Select a GitLab job to view its log.');
    await this.checkedJob(input.repository, input.runId, input.jobId);
    return this.http.textLog(`${this.path(input.repository)}/jobs/${encode(input.jobId)}/trace`);
  }
  private async checkedJob(repository: HostedRepositoryRef, runId: string, jobId: string): Promise<Row> {
    const job = await this.json(`${this.path(repository)}/jobs/${encode(jobId)}`);
    if (string(object(job.pipeline).id) !== runId) throw new HostingHttpError(0, 'invalid_job', 'Job does not belong to the selected pipeline.');
    return job;
  }
  async artifacts(input: Input<'artifacts'>) {
    const response = await this.http.json(input.cursor ?? `${this.path(input.repository)}/pipelines/${encode(input.runId)}/jobs`, {
      query: input.cursor ? undefined : { per_page: 50 },
    });
    return {
      items: rows(response.data)
        .filter((row) => object(row.artifacts_file).filename)
        .map((row) => ({
          id: string(row.id),
          name: `${string(row.name)}: ${string(object(row.artifacts_file).filename)}`,
          size: number(object(row.artifacts_file).size),
          expiresAt: row.artifacts_expire_at == null ? null : string(row.artifacts_expire_at),
          htmlUrl: string(row.web_url),
          downloadable: !row.artifacts_expire_at || new Date(string(row.artifacts_expire_at)).getTime() > Date.now(),
        })),
      nextCursor: linkCursor(response.headers),
    };
  }
  async downloadArtifact(input: Input<'downloadArtifact'>) {
    await this.checkedJob(input.repository, input.runId, input.artifactId);
    return this.http.download(`${this.path(input.repository)}/jobs/${encode(input.artifactId)}/artifacts`);
  }
  async dispatch(input: Input<'dispatch'>): Promise<true> {
    if (input.workflow.startsWith('job:')) {
      const jobId = input.workflow.slice(4);
      if (!/^\d+$/.test(jobId)) throw new HostingHttpError(0, 'invalid_job', 'Invalid manual job identifier.');
      const job = await this.json(`${this.path(input.repository)}/jobs/${encode(jobId)}`);
      if (job.status !== 'manual' || string(job.ref) !== input.ref)
        throw new HostingHttpError(409, 'job_changed', 'The selected manual job or reference changed.');
      await this.json(`${this.path(input.repository)}/jobs/${encode(jobId)}/play`, 'POST', {
        job_variables_attributes: Object.entries(input.inputs ?? {}).map(([key, value]) => ({ key, value })),
      });
    } else
      await this.json(`${this.path(input.repository)}/pipeline`, 'POST', {
        ref: input.ref,
        variables: Object.entries(input.inputs ?? {}).map(([key, value]) => ({ key, value, variable_type: 'env_var' })),
      });
    return true;
  }
  async cancelRun(input: Input<'cancelRun'>): Promise<true> {
    await this.json(`${this.path(input.repository)}/pipelines/${encode(input.runId)}/cancel`, 'POST');
    return true;
  }
  async retryRun(input: Input<'retryRun'>): Promise<true> {
    await this.json(`${this.path(input.repository)}/pipelines/${encode(input.runId)}/retry`, 'POST');
    return true;
  }
  private mapRelease(row: Row, repository: HostedRepositoryRef) {
    return {
      id: string(row.tag_name),
      tagName: string(row.tag_name),
      name: string(row.name ?? row.tag_name),
      body: string(row.description),
      publishedAt: string(row.released_at) || undefined,
      htmlUrl: `${this.connection.baseUrl.replace(/\/$/, '')}/${repository.fullPath.split('/').map(encode).join('/')}/-/releases/${encode(string(row.tag_name))}`,
      draft: false,
      prerelease: false,
    };
  }
  async releases(input: Input<'releases'>) {
    return this.arrayPage(`${this.path(input.repository)}/releases`, (row) => this.mapRelease(row, input.repository), input.cursor);
  }
  async releaseAssets(input: Input<'releaseAssets'>) {
    if (!input.releaseId) throw new HostingHttpError(400, 'release_required', 'Select a release to list its assets.');
    return this.arrayPage(
      `${this.path(input.repository)}/releases/${encode(input.releaseId)}/assets/links`,
      (row) => ({
        id: string(row.id),
        name: string(row.name),
        htmlUrl: string(row.direct_asset_url) || string(row.url),
      }),
      input.cursor,
    );
  }
  async createRelease(input: Input<'createRelease'>) {
    if (input.draft || input.prerelease) unsupported('GitLab draft/prerelease flags');
    return this.mapRelease(
      await this.json(`${this.path(input.repository)}/releases`, 'POST', {
        tag_name: input.tagName,
        name: input.name,
        description: input.body,
        ref: input.target,
      }),
      input.repository,
    );
  }
  async uploadAsset(input: Input<'uploadAsset'>, data: Uint8Array) {
    const name = input.name ?? input.filePath.split(/[\\/]/).pop() ?? 'asset';
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(data)]), name);
    const uploaded = object((await this.http.json(`${this.path(input.repository)}/uploads`, { method: 'POST', rawBody: body })).data);
    const repository = await this.repository({ repository: input.repository });
    const url = string(uploaded.full_path)
      ? new URL(string(uploaded.full_path), this.connection.baseUrl).href
      : `${repository.htmlUrl.replace(/\/$/, '')}/${string(uploaded.url).replace(/^\//, '')}`;
    const asset = await this.json(`${this.path(input.repository)}/releases/${encode(input.releaseId)}/assets/links`, 'POST', { name, url });
    return { id: string(asset.id), name: string(asset.name, name), htmlUrl: string(asset.direct_asset_url ?? asset.url, url) };
  }
}
