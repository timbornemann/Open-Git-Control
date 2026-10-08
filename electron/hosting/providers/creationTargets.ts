import type { HostingConnection, HostedRepositoryRef, HostingRepositoryCreation } from '../../../src/types/hostingDtos';
import type { HostingCreationTarget } from '../../../src/types/repositoryPublication';
import type { HostingOperations } from '../../../src/shared/ipc/contracts/hosting';
import { HostingHttpError, type HostingHttpTransport } from './HostingHttpTransport';
import { hasControlCharacters } from '../hostingUrls';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const text = (v: unknown): string => (v == null ? '' : String(v));
const enc = encodeURIComponent;
const validIdentifier = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 1000 || hasControlCharacters(value) || value.split('/').some((p) => !p || p === '.' || p === '..'))
    throw new HostingHttpError(0, 'invalid_target', 'Choose a valid repository creation target.');
  return value;
};
const target = (
  id: unknown,
  namespace: string,
  label: string,
  kind: HostingCreationTarget['kind'],
  extra: Partial<HostingCreationTarget> = {},
): HostingCreationTarget => ({ id: text(id), namespace, label, kind, visibility: ['private', 'public'], ...extra });
const nextLink = (headers: Headers) =>
  (headers.get('link') || '')
    .split(',')
    .find((p) => /rel="next"/.test(p))
    ?.match(/<([^>]+)>/)?.[1] || null;

/** Each provider owns namespace syntax, paging and required project information. */
export async function listCreationTargets(
  connection: HostingConnection,
  http: HostingHttpTransport,
  input: HostingOperations['creationTargets']['input'],
): Promise<HostingOperations['creationTargets']['output']> {
  const provider = connection.provider;
  let items: HostingCreationTarget[] = [];
  let nextCursor: string | null = null;
  if (provider === 'github' || provider === 'forgejo') {
    const response = await http.json(input.cursor || 'user/orgs', { query: input.cursor ? undefined : { per_page: 50, limit: 50 } });
    items = rows(response.data).map((v) => target(v.login, text(v.login), text(v.full_name || v.name || v.login), 'organization'));
    nextCursor = nextLink(response.headers);
    if (provider === 'forgejo' && !nextCursor && items.length === 50) {
      const current = input.cursor ? new URL(http.url(input.cursor)).searchParams.get('page') || '1' : '1';
      nextCursor = http.url('user/orgs', { limit: 50, page: Number(current) + 1 }).href;
    }
    if (!input.cursor && connection.username) items.unshift(target(connection.username, connection.username, connection.username, 'personal'));
  } else if (provider === 'gitlab') {
    const response = await http.json(input.cursor || 'namespaces', { query: input.cursor ? undefined : { per_page: 50, search: input.search } });
    items = rows(response.data).map((v) => target(v.id, text(v.full_path), text(v.full_path), v.kind === 'user' ? 'personal' : 'group'));
    const next = response.headers.get('x-next-page');
    nextCursor = next ? http.url('namespaces', { per_page: 50, page: next, search: input.search }).href : nextLink(response.headers);
  } else if (provider === 'bitbucket-cloud') {
    const parent = input.parent && validIdentifier(input.parent);
    const response = await http.json(input.cursor || (parent ? `workspaces/${enc(parent)}/projects` : 'user/permissions/workspaces'), {
      query: input.cursor ? undefined : { pagelen: 50 },
    });
    const data = row(response.data);
    items = rows(data.values)
      .filter((v) => parent || v.permission === 'owner' || v.permission === 'member' || v.permission === 'admin')
      .map((v) => {
        if (parent) return target(v.key, parent, `${text(v.name)} (${text(v.key)})`, 'project', { projectKey: text(v.key), parent });
        const workspace = row(v.workspace);
        return target(workspace.slug, text(workspace.slug), text(workspace.name || workspace.slug), 'workspace');
      });
    nextCursor = text(data.next) || null;
  } else {
    const response = await http.json(input.cursor || 'projects', { query: input.cursor ? undefined : { limit: 50 } });
    const data = row(response.data);
    items = rows(data.values).map((v) => target(v.key, text(v.key), `${text(v.name)} (${text(v.key)})`, 'project', { projectKey: text(v.key) }));
    nextCursor = data.isLastPage === false ? http.url('projects', { limit: 50, start: text(data.nextPageStart) }).href : null;
  }
  return { items, nextCursor, requiresProject: provider === 'bitbucket-cloud', allowsManual: true };
}

export async function verifyCreationTarget(
  connection: HostingConnection,
  http: HostingHttpTransport,
  input: HostingRepositoryCreation,
): Promise<HostingCreationTarget> {
  const namespace = validIdentifier(input.namespace || connection.username);
  if (connection.provider === 'github' || connection.provider === 'forgejo') {
    if (namespace.toLowerCase() === connection.username?.toLowerCase()) {
      const v = row((await http.json('user')).data);
      if (text(v.login).toLowerCase() !== namespace.toLowerCase()) throw new HostingHttpError(0, 'account_changed', 'The authenticated account changed.');
      return target(v.login, text(v.login), text(v.login), 'personal');
    }
    const v = row((await http.json(`orgs/${enc(namespace)}`)).data);
    const result = target(v.login, text(v.login), text(v.name || v.login), 'organization');
    // Creation is still subject to server policy; do not claim that membership grants administration.
    if (connection.provider === 'github' && (v.members_can_create_private_repositories === false || v.members_can_create_public_repositories === false)) {
      const membership = row((await http.json(`user/memberships/orgs/${enc(namespace)}`)).data);
      if (membership.role !== 'admin') result.visibility = result.visibility.filter((value) => v[`members_can_create_${value}_repositories`] !== false);
    }
    if (!result.visibility.includes(input.private ? 'private' : 'public'))
      throw new HostingHttpError(403, 'permission_denied', 'The organization does not allow this repository visibility for your account.');
    return result;
  }
  if (connection.provider === 'gitlab') {
    let v: Row;
    if (/^\d+$/.test(namespace)) v = row((await http.json(`namespaces/${enc(namespace)}`)).data);
    else {
      let cursor: string | undefined;
      let found: HostingCreationTarget | undefined;
      for (let page = 0; page < 100; page++) {
        const result = await listCreationTargets(connection, http, { connectionId: connection.id, search: namespace.split('/').at(-1), cursor });
        found = result.items.find((item) => item.namespace === namespace);
        if (found || !result.nextCursor) break;
        cursor = result.nextCursor;
      }
      if (!found) throw new HostingHttpError(404, 'not_found', 'The namespace is not accessible to this account.');
      v = row((await http.json(`namespaces/${enc(found.id)}`)).data);
    }
    const fullPath = validIdentifier(text(v.full_path));
    return target(v.id, fullPath, fullPath, v.kind === 'user' ? 'personal' : 'group');
  }
  if (connection.provider === 'bitbucket-cloud') {
    if (!input.projectKey) throw new HostingHttpError(0, 'project_required', 'Select a Bitbucket project explicitly.');
    const workspace = row((await http.json(`workspaces/${enc(namespace)}`)).data);
    const project = row((await http.json(`workspaces/${enc(namespace)}/projects/${enc(validIdentifier(input.projectKey))}`)).data);
    return target(project.key, text(workspace.slug), text(project.name || project.key), 'project', {
      projectKey: text(project.key),
      parent: text(workspace.slug),
    });
  }
  const project = row((await http.json(`projects/${enc(namespace)}`)).data);
  return target(project.key, text(project.key), text(project.name || project.key), 'project', { projectKey: text(project.key) });
}

export async function updateDefaultBranch(
  connection: HostingConnection,
  http: HostingHttpTransport,
  repository: HostedRepositoryRef,
  branch: string,
): Promise<void> {
  const path = repository.fullPath.split('/').map(enc).join('/');
  let confirmed = '';
  if (connection.provider === 'github' || connection.provider === 'forgejo') {
    await http.json(`repos/${path}`, { method: 'PATCH', body: { default_branch: branch } });
    confirmed = text(row((await http.json(`repos/${path}`)).data).default_branch);
  } else if (connection.provider === 'gitlab') {
    await http.json(`projects/${enc(repository.repositoryId)}`, { method: 'PUT', body: { default_branch: branch } });
    confirmed = text(row((await http.json(`projects/${enc(repository.repositoryId)}`)).data).default_branch);
  } else if (connection.provider === 'bitbucket-cloud') {
    await http.json(`repositories/${path}`, { method: 'PUT', body: { mainbranch: { name: branch } } });
    confirmed = text(row(row((await http.json(`repositories/${path}`)).data).mainbranch).name);
  } else {
    const [project, slug] = repository.fullPath.split('/');
    await http.json(`projects/${enc(project)}/repos/${enc(slug)}/branches/default`, { method: 'PUT', body: { id: `refs/heads/${branch}` } });
    const response = row((await http.json(`projects/${enc(project)}/repos/${enc(slug)}/branches/default`)).data);
    confirmed = text(response.displayId || text(response.id).replace(/^refs\/heads\//, ''));
  }
  if (confirmed !== branch) throw new HostingHttpError(0, 'setup_pending', 'The provider did not confirm the new default branch. Retry repository setup.');
}
