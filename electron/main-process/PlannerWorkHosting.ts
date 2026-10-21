import type { HostingService } from '../hosting/HostingService';
import type { PlannerBranchReference, PlannerRepositoryReference } from '../../src/types/projectPlanner';
import type { PlannerWorkChangeRequest } from '../../src/types/plannerWork';
import type { HostedRepository, HostingChangeRequest } from '../../src/types/hostingDtos';
import type { WorkGit } from './plannerWorkInspection';
import { workDigest } from './PlannerWorkStore';
import { WORK_OID } from './plannerWorkInspection';

export type PlannerHostingResult = {
  source?: PlannerRepositoryReference;
  repository?: HostedRepository;
  requests: PlannerWorkChangeRequest[];
  checkedAt: number;
};
export interface PlannerHostingReader {
  version(): string;
  read(repo: string, branch: PlannerBranchReference, signal: AbortSignal): Promise<PlannerHostingResult>;
}
export class PlannerWorkHosting implements PlannerHostingReader {
  private readonly pending = new Map<string, { expires: number; work: Promise<PlannerHostingResult> }>();
  constructor(
    private readonly git: WorkGit,
    private readonly hosting: HostingService,
  ) {}
  version() {
    return workDigest(
      this.hosting
        .listConnections()
        .map((connection) => [
          connection.id,
          connection.provider,
          connection.baseUrl,
          connection.authenticated,
          connection.username,
          this.hosting.generation(connection.id),
        ]),
    );
  }
  async read(repo: string, branch: PlannerBranchReference, signal: AbortSignal): Promise<PlannerHostingResult> {
    const configuration = await this.git.run(repo, ['config', '--null', '--get-regexp', '^remote\..*\.url$']).catch(() => '');
    const version = this.version();
    const key = workDigest([configuration, version, branch.repository]);
    let pending = this.pending.get(key);
    if (!pending || pending.expires < Date.now()) {
      const work = this.load(configuration, branch);
      // Pending reads coalesce too; start the cooldown after completion, including errors.
      const entry = { expires: Infinity, work };
      const settled = () => {
        entry.expires = Date.now() + 60_000;
      };
      void work.then(settled, settled);
      pending = entry;
      this.pending.set(key, pending);
      if (this.pending.size > 128) this.pending.delete(this.pending.keys().next().value!);
    }
    signal.throwIfAborted();
    const result = await pending.work;
    signal.throwIfAborted();
    if (version !== this.version()) throw new Error('The hosting session changed during refresh.');
    if (result.source) this.pending.set(workDigest([configuration, version, result.source]), pending);
    return {
      ...result,
      requests: result.requests
        .filter((request) => request.sourceBranch === branch.name || branch.previousNames?.includes(request.sourceBranch))
        .map((request) => ({ ...request, workflowId: branch.id })),
    };
  }
  private async load(configuration: string, branch: PlannerBranchReference): Promise<PlannerHostingResult> {
    const urls = [
      ...new Set(
        configuration
          .split('\0')
          .filter(Boolean)
          .map((row) => row.slice(row.indexOf('\n') + 1)),
      ),
    ];
    const sources: HostedRepository[] = [];
    for (const connection of this.hosting.listConnections().filter((entry) => entry.hasCredentials)) {
      for (const url of urls) {
        let remote: URL;
        try {
          remote = new URL(url.includes('://') ? url : url.replace(/^(?:[^@]+@)?([^:]+):(.+)$/, 'https://$1/$2'));
        } catch {
          continue;
        }
        const server = new URL(connection.baseUrl);
        if (remote.hostname !== server.hostname || (['http:', 'https:'].includes(remote.protocol) && remote.origin !== server.origin)) continue;
        if (branch.repository && (connection.provider !== branch.repository.provider || connection.baseUrl.replace(/\/+$/, '') !== branch.repository.server))
          continue;
        const repository = await this.hosting.request('resolveRepository', { connectionId: connection.id, url });
        if (
          !repository ||
          (branch.repository && (repository.ref.repositoryId !== branch.repository.repositoryId || repository.ref.fullPath !== branch.repository.fullPath))
        )
          continue;
        if (
          !sources.some(
            (entry) => entry.ref.repositoryId === repository.ref.repositoryId && this.hosting.connection(entry.ref.connectionId).baseUrl === connection.baseUrl,
          )
        )
          sources.push(repository);
      }
    }
    if (sources.length !== 1)
      throw new Error(
        sources.length
          ? 'Multiple hosting sources match. Select a unique hosting binding for this repository.'
          : 'No authenticated hosting source matches this repository. Cached references remain available.',
      );
    const source = sources[0];
    const connection = this.hosting.connection(source.ref.connectionId);
    const portable: PlannerRepositoryReference = {
      provider: connection.provider,
      server: connection.baseUrl.replace(/\/+$/, ''),
      repositoryId: source.ref.repositoryId,
      fullPath: source.ref.fullPath,
    };
    const requests: PlannerWorkChangeRequest[] = [];
    for (const target of [source.ref, ...(source.parent ? [source.parent] : [])]) {
      let cursor: string | undefined;
      const cursors = new Set<string>();
      for (let page = 0; ; page++) {
        if (page >= 100 || (cursor && cursors.has(cursor))) throw new Error('Incomplete change-request inventory.');
        if (cursor) cursors.add(cursor);
        const result = await this.hosting.request('changeRequests', { repository: target, state: 'all', cursor });
        if (result.stale) throw new Error('Change-request inventory is stale.');
        for (const request of result.items) {
          if (request.source.repositoryId !== source.ref.repositoryId || request.source.fullPath !== source.ref.fullPath) continue;
          this.addRequest(requests, request, portable, target.repositoryId, target.fullPath, branch.id);
        }
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
    }
    return { source: portable, repository: source, requests, checkedAt: Date.now() };
  }
  private addRequest(
    results: PlannerWorkChangeRequest[],
    request: HostingChangeRequest,
    source: PlannerRepositoryReference,
    repositoryId: string,
    fullPath: string,
    workflowId: string,
  ) {
    if (!request.id || !WORK_OID.test(request.headSha)) throw new Error('Change-request source revision is incomplete.');
    const url = new URL(request.htmlUrl);
    if (url.origin !== new URL(source.server).origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Invalid change-request link.');
    const candidate = {
      ...source,
      repositoryId,
      fullPath,
      workflowId,
      id: request.id,
      number: request.number,
      url: url.href,
      state: request.state,
      headSha: request.headSha,
      sourceBranch: request.sourceBranch,
      targetBranch: request.targetBranch,
      title: request.title.slice(0, 240),
      createdAt: Date.parse(request.createdAt) || 0,
    };
    if (!results.some((entry) => entry.repositoryId === candidate.repositoryId && entry.id === candidate.id)) results.push(candidate);
  }
}
