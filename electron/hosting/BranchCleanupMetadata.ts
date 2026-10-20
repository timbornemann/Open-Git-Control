import type { BranchCleanupHostingMetadata } from '../../src/shared/ipc/branchCleanup';
import type { HostedRepositoryRef, HostingConnection } from '../../src/types/hostingDtos';
import type { CredentialGetter } from './HostingAdapter';
import { HostingHttpTransport } from './providers/HostingHttpTransport';
import { readCleanupPages, cleanupObject as obj, cleanupString as str, type CleanupRow } from './BranchCleanupPages';
import { CLEANUP_OID } from '../git/branchCleanupModel';
import { cleanupPatternMatches } from '../git/BranchCleanupPreferences';
import { readCleanupRequests } from './BranchCleanupRequests';

const enc = encodeURIComponent;
const bool = (value: unknown) => (typeof value === 'boolean' ? value : null);

function routeFor(connection: HostingConnection, repository: HostedRepositoryRef) {
  const parts = repository.fullPath.split('/').map(enc);
  switch (connection.provider) {
    case 'github':
    case 'forgejo':
      return `repos/${parts.join('/')}`;
    case 'gitlab':
      return `projects/${enc(repository.repositoryId || repository.fullPath)}`;
    case 'bitbucket-cloud':
      return `repositories/${parts.join('/')}`;
    case 'bitbucket-data-center':
      return `projects/${parts[0]}/repos/${parts[1]}`;
  }
}

async function readProtection(
  connection: HostingConnection,
  http: HostingHttpTransport,
  credentials: CredentialGetter,
  route: string,
  rawBranches: CleanupRow[],
  signal?: AbortSignal,
): Promise<BranchCleanupHostingMetadata['branches']> {
  const provider = connection.provider;
  if (provider === 'github' || provider === 'forgejo' || provider === 'gitlab')
    return rawBranches.map((row) => ({
      name: str(row.name),
      oid: str(obj(row.commit).sha ?? obj(row.commit).id),
      protected: bool(row.protected),
    }));
  let restrictions: CleanupRow[];
  if (provider === 'bitbucket-cloud') {
    restrictions = await readCleanupPages(http, `${route}/branch-restrictions`, provider, {}, signal);
    let model: CleanupRow | undefined;
    if (restrictions.some((rule) => rule.branch_match_kind === 'branching_model')) model = obj((await http.json(`${route}/branching-model`, { signal })).data);
    return rawBranches.map((row) => {
      const name = str(row.name);
      let protectedState: boolean | null = false;
      for (const rule of restrictions) {
        if (rule.branch_match_kind === 'glob' && typeof rule.pattern === 'string') {
          if (cleanupPatternMatches(name, rule.pattern)) protectedState = true;
        } else if (rule.branch_match_kind === 'branching_model' && model) {
          const type = str(rule.branch_type);
          if (['production', 'development'].includes(type)) {
            if (name === str(obj(model[type]).name)) protectedState = true;
          } else if (Array.isArray(model.branch_types)) {
            const match = model.branch_types.map(obj).find((entry) => entry.kind === type);
            if (!match || typeof match.prefix !== 'string') protectedState = null;
            else if (name.startsWith(match.prefix)) protectedState = true;
          } else protectedState = null;
        } else protectedState = null;
      }
      return { name, oid: str(obj(row.target).hash), protected: protectedState };
    });
  }
  const auxiliary = new HostingHttpTransport({
    baseUrl: `${connection.baseUrl.replace(/\/$/, '')}/rest/branch-permissions/latest`,
    getToken: async () => (await credentials()).accessToken,
  });
  const projectRoute = route.split('/repos/')[0];
  restrictions = [
    ...(await readCleanupPages(auxiliary, `${route}/restrictions`, provider, {}, signal)),
    ...(await readCleanupPages(auxiliary, `${projectRoute}/restrictions`, provider, {}, signal)),
  ];
  return rawBranches.map((row) => {
    const name = str(row.displayId);
    let protectedState: boolean | null = false;
    for (const rule of restrictions) {
      const matcher = obj(rule.matcher),
        type = str(obj(matcher.type).id),
        pattern = str(matcher.id);
      if (type === 'ANY_REF' || type === 'BRANCH' || type === 'PATTERN') {
        if (!pattern) protectedState = null;
        else if (
          cleanupPatternMatches(type === 'PATTERN' ? name : `refs/heads/${name}`, pattern.replace(/^refs\/heads\//, type === 'PATTERN' ? '' : 'refs/heads/'))
        )
          protectedState = true;
      } else protectedState = null;
    }
    return { name, oid: str(row.latestCommit), protected: protectedState };
  });
}

/** All providers use their native pagination and effective protection metadata. No writes occur here. */
export async function readHostingBranchCleanupMetadata(
  connection: HostingConnection,
  http: HostingHttpTransport,
  credentials: CredentialGetter,
  repository: HostedRepositoryRef,
  signal?: AbortSignal,
): Promise<BranchCleanupHostingMetadata> {
  const result: BranchCleanupHostingMetadata = { repository, defaultBranch: '', branches: [], openRequests: [], mergedRequests: [], complete: false };
  const provider = connection.provider;
  const route = routeFor(connection, repository);
  const pages = (suffix: string, query = {}, limit = 100) => readCleanupPages(http, `${route}/${suffix}`, provider, query, signal, limit);
  try {
    const rawRepo = obj((await http.json(route, { signal })).data);
    result.defaultBranch = str(rawRepo.default_branch ?? obj(rawRepo.mainbranch).name);
    if (provider === 'bitbucket-data-center') {
      const defaultBranch = obj((await http.json(`${route}/branches/default`, { signal })).data);
      result.defaultBranch = str(defaultBranch.displayId);
    }
    const branchPath = provider === 'gitlab' ? 'repository/branches' : provider === 'bitbucket-cloud' ? 'refs/branches' : 'branches';
    result.branches = await readProtection(connection, http, credentials, route, await pages(branchPath), signal);
    if (
      result.branches.some((branch) => !branch.name || !CLEANUP_OID.test(branch.oid) || branch.protected === null) ||
      new Set(result.branches.map((branch) => branch.name)).size !== result.branches.length
    )
      throw new Error('Branch protection inventory is incomplete.');
    const requestRepositories = [{ route, path: repository.fullPath, id: String(rawRepo.id ?? repository.repositoryId) }];
    const parent = obj(rawRepo.parent ?? rawRepo.forked_from_project ?? rawRepo.origin);
    const parentPath = str(parent.full_name ?? parent.path_with_namespace) || (parent.slug ? `${str(obj(parent.project).key)}/${str(parent.slug)}` : '');
    if (parentPath && parentPath !== repository.fullPath)
      requestRepositories.push({
        route: routeFor(connection, { ...repository, fullPath: parentPath, repositoryId: String(parent.id ?? '') }),
        path: parentPath,
        id: String(parent.id ?? ''),
      });
    await readCleanupRequests(http, provider, requestRepositories, String(rawRepo.id ?? repository.repositoryId), result, signal);
    result.complete = true;
  } catch (error) {
    signal?.throwIfAborted();
    result.problem = error instanceof Error ? error.message : String(error);
  }
  return result;
}
