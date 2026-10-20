import { vi } from 'vitest';
import type { HostedRepositoryRef, HostingConnection, HostingProvider } from '../../../src/types/hostingDtos';
import { createHostingAdapter } from '../providers';

export const cleanupSha = 'a'.repeat(40);
export const cleanupSourceSha = 'b'.repeat(40);
export function cleanupMetadataFixture(provider: HostingProvider) {
  const connection: HostingConnection = {
    id: provider,
    provider,
    label: provider,
    baseUrl: 'https://forge.example',
    apiBaseUrl: 'https://forge.example/api',
    username: 'test',
    userId: '1',
    authenticated: true,
    hasCredentials: true,
  };
  const repository: HostedRepositoryRef = { connectionId: provider, repositoryId: '42', fullPath: 'team/repo' };
  const state = { rejectProtection: false, malformedBranches: false, malformedOpen: false, parent: false, loop: false, omitCount: false };
  const page = (values: unknown[], extra: Record<string, unknown> = {}) =>
    provider === 'bitbucket-cloud'
      ? { size: values.length, values, ...extra }
      : provider === 'bitbucket-data-center'
        ? { values, isLastPage: true, ...extra }
        : values;
  const nativeRequest = (merged: boolean, path = 'team/repo') => {
    if (provider === 'github' || provider === 'forgejo')
      return {
        number: 9,
        state: merged ? 'closed' : 'open',
        merged_at: merged ? '2025-01-01' : null,
        head: { ref: 'feature', sha: cleanupSourceSha, repo: { full_name: 'team/repo' } },
        base: { ref: 'main', repo: { full_name: path } },
        merge_commit_sha: cleanupSha,
      };
    if (provider === 'gitlab')
      return {
        iid: 9,
        state: merged ? 'merged' : 'opened',
        source_project_id: 42,
        source_branch: 'feature',
        target_project_id: 42,
        target_branch: 'main',
        sha: cleanupSourceSha,
        squash_commit_sha: cleanupSha,
      };
    if (provider === 'bitbucket-cloud')
      return {
        id: 9,
        state: merged ? 'MERGED' : 'OPEN',
        source: { branch: { name: 'feature' }, commit: { hash: cleanupSourceSha }, repository: { full_name: 'team/repo' } },
        destination: { branch: { name: 'main' }, repository: { full_name: path } },
        merge_commit: { hash: cleanupSha },
      };
    return {
      id: 9,
      state: merged ? 'MERGED' : 'OPEN',
      fromRef: { displayId: 'feature', latestCommit: cleanupSourceSha, repository: { project: { key: 'team' }, slug: 'repo' } },
      toRef: { displayId: 'main', repository: { project: { key: 'team' }, slug: 'repo' } },
      properties: { mergeCommit: { id: cleanupSha } },
    };
  };
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const route = url.pathname;
    let data: unknown;
    let status = 200;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider === 'forgejo' && !state.omitCount) headers['x-total-count'] = '1';
    if (route.endsWith('/branches/default')) data = { displayId: 'main' };
    else if (route.endsWith('/branch-restrictions')) {
      if (state.rejectProtection) {
        status = 403;
        data = { message: 'Forbidden' };
      } else data = page([{ kind: 'delete', branch_match_kind: 'glob', pattern: 'release/*' }]);
    } else if (route.endsWith('/restrictions')) {
      if (state.rejectProtection) {
        status = 403;
        data = { message: 'Forbidden' };
      } else data = page([{ type: 'no-deletes', matcher: { id: 'refs/heads/release/stable', type: { id: 'BRANCH' } } }]);
    } else if (route.endsWith('/branches')) {
      const branch =
        provider === 'bitbucket-cloud'
          ? { name: 'release/stable', target: { hash: cleanupSha } }
          : provider === 'bitbucket-data-center'
            ? { displayId: 'release/stable', latestCommit: cleanupSha }
            : { name: 'release/stable', commit: { sha: cleanupSha, id: cleanupSha }, ...(state.malformedBranches ? {} : { protected: true }) };
      data =
        state.malformedBranches && ['bitbucket-cloud', 'bitbucket-data-center'].includes(provider)
          ? { error: 'partial' }
          : page([branch], state.loop ? { next: url.href, isLastPage: false, nextPageStart: 0 } : {});
      if (state.loop && ['github', 'forgejo', 'gitlab'].includes(provider)) headers.link = `<${url.href}>; rel="next"`;
    } else if (/\/(pulls|pullrequests|pull-requests|merge_requests)$/.test(route)) {
      const merged = ['closed', 'MERGED', 'merged'].includes(url.searchParams.get('state') || '');
      data = page([state.malformedOpen && !merged ? { id: 9 } : nativeRequest(merged, route.includes('parent') ? 'parent/repo' : 'team/repo')]);
    } else data = { id: 42, default_branch: 'main', mainbranch: { name: 'main' }, ...(state.parent ? { parent: { full_name: 'parent/repo', id: 43 } } : {}) };
    return new Response(JSON.stringify(data), { status, headers });
  });
  vi.stubGlobal('fetch', fetch);
  const adapter = createHostingAdapter(connection, async () => ({ accessToken: 'test-token', authType: 'token' }));
  return { adapter, repository, state, fetch };
}
