import type { BranchCleanupHostingMetadata } from '../../src/shared/ipc/branchCleanup';
import type { HostingProvider } from '../../src/types/hostingDtos';
import type { HostingHttpTransport } from './providers/HostingHttpTransport';
import { readCleanupPages, cleanupObject as obj, cleanupString as str, type CleanupRow } from './BranchCleanupPages';
import { CLEANUP_OID } from '../git/branchCleanupModel';

export type CleanupRequestScope = { route: string; path: string; id: string };
function requestRow(provider: HostingProvider, row: CleanupRow, repository: string) {
  if (provider === 'github' || provider === 'forgejo') {
    const head = obj(row.head),
      base = obj(row.base);
    return {
      number: String(row.number ?? ''),
      sourceRepository: str(obj(head.repo).full_name),
      sourceBranch: str(head.ref),
      targetRepository: str(obj(base.repo).full_name) || repository,
      targetBranch: str(base.ref),
      headSha: str(head.sha),
      mergeSha: str(row.merge_commit_sha),
      merged: Boolean(row.merged_at || row.merged === true),
    };
  }
  if (provider === 'gitlab')
    return {
      number: String(row.iid ?? ''),
      sourceRepository: String(row.source_project_id ?? ''),
      sourceBranch: str(row.source_branch),
      targetRepository: String(row.target_project_id ?? ''),
      targetBranch: str(row.target_branch),
      headSha: str(row.sha ?? obj(row.diff_refs).head_sha),
      mergeSha: str(row.squash_commit_sha || row.merge_commit_sha),
      merged: row.state === 'merged',
    };
  if (provider === 'bitbucket-cloud') {
    const source = obj(row.source),
      destination = obj(row.destination);
    return {
      number: String(row.id ?? ''),
      sourceRepository: str(obj(source.repository).full_name),
      sourceBranch: str(obj(source.branch).name),
      targetRepository: str(obj(destination.repository).full_name) || repository,
      targetBranch: str(obj(destination.branch).name),
      headSha: str(obj(source.commit).hash),
      mergeSha: str(obj(row.merge_commit).hash),
      merged: row.state === 'MERGED',
    };
  }
  const source = obj(row.fromRef),
    target = obj(row.toRef);
  const fullPath = (value: unknown) => {
    const repo = obj(value);
    return `${str(obj(repo.project).key)}/${str(repo.slug)}`;
  };
  const merge = obj(obj(row.properties).mergeCommit);
  return {
    number: String(row.id ?? ''),
    sourceRepository: fullPath(source.repository),
    sourceBranch: str(source.displayId),
    targetRepository: fullPath(target.repository),
    targetBranch: str(target.displayId),
    headSha: str(source.latestCommit),
    mergeSha: str(merge.id ?? obj(row.properties).mergeCommit),
    merged: row.state === 'MERGED',
  };
}

function queries(provider: HostingProvider) {
  const path =
    provider === 'gitlab'
      ? 'merge_requests'
      : provider === 'bitbucket-cloud'
        ? 'pullrequests'
        : provider === 'bitbucket-data-center'
          ? 'pull-requests'
          : 'pulls';
  const open =
    provider === 'gitlab' ? { state: 'opened', scope: 'all' } : { state: ['bitbucket-cloud', 'bitbucket-data-center'].includes(provider) ? 'OPEN' : 'open' };
  const merged =
    provider === 'gitlab'
      ? { state: 'merged', scope: 'all', order_by: 'updated_at', sort: 'desc' }
      : provider === 'bitbucket-cloud'
        ? { state: 'MERGED', sort: '-updated_on' }
        : provider === 'bitbucket-data-center'
          ? { state: 'MERGED', order: 'NEWEST' }
          : { state: 'closed', sort: 'updated', direction: 'desc' };
  return { path, open, merged };
}

export async function readCleanupRequests(
  http: HostingHttpTransport,
  provider: HostingProvider,
  scopes: CleanupRequestScope[],
  sourceId: string,
  result: BranchCleanupHostingMetadata,
  signal?: AbortSignal,
) {
  const query = queries(provider);
  for (const scope of scopes) {
    const normalize = (row: CleanupRow) => {
      const request = requestRow(provider, row, scope.path);
      if (provider === 'gitlab') {
        if (request.sourceRepository === sourceId) request.sourceRepository = result.repository.fullPath;
        if (request.targetRepository === scope.id) request.targetRepository = scope.path;
      }
      return request;
    };
    const rows = await readCleanupPages(http, `${scope.route}/${query.path}`, provider, query.open, signal);
    const seenRequests = new Set<string>();
    for (const row of rows) {
      const request = normalize(row);
      if (!request.number || !request.sourceBranch || !request.targetBranch || !request.sourceRepository || !request.targetRepository)
        throw new Error('Open change-request inventory is incomplete.');
      if (seenRequests.has(request.number)) throw new Error('Open change-request inventory changed while listing.');
      seenRequests.add(request.number);
      result.openRequests.push(request);
    }
    try {
      const merged = await readCleanupPages(http, `${scope.route}/${query.path}`, provider, query.merged, signal, 10);
      for (const row of merged) {
        const request = normalize(row);
        if (
          request.merged &&
          request.sourceRepository.toLowerCase() === result.repository.fullPath.toLowerCase() &&
          CLEANUP_OID.test(request.headSha) &&
          CLEANUP_OID.test(request.mergeSha)
        )
          result.mergedRequests.push(request);
      }
    } catch {
      signal?.throwIfAborted(); /* Missing merge proof never authorizes deletion. Graph ancestry can still prove a merge. */
    }
  }
}
