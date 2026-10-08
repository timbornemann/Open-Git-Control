import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostingConnection, HostingProvider } from '../../../../src/types/hostingDtos';
import { createHostingAdapter } from '../index';

const connection = (provider: HostingProvider): HostingConnection => ({
  id: provider,
  provider,
  label: provider,
  baseUrl: 'https://forge.invalid/team',
  apiBaseUrl: 'https://forge.invalid/team/api/',
  username: 'alice',
  userId: '7',
  authenticated: true,
  hasCredentials: true,
});
const json = (value: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', ...headers } });
const adapter = (provider: HostingProvider) => createHostingAdapter(connection(provider), async () => ({ accessToken: 'secret', authType: 'token' }));
afterEach(() => vi.unstubAllGlobals());

describe('provider creation targets', () => {
  it.each(['github', 'forgejo'] as const)('%s lists personal and paginated organization destinations', async (provider) => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json([{ login: 'team', full_name: 'Team' }], { Link: '<https://forge.invalid/team/api/user/orgs?page=2>; rel="next"' }))
      .mockResolvedValueOnce(json([{ login: 'next', full_name: 'Next' }]));
    vi.stubGlobal('fetch', request);
    const service = adapter(provider),
      first = await service.creationTargets({ connectionId: provider });
    expect(first.items.map((v) => [v.namespace, v.kind])).toEqual([
      ['alice', 'personal'],
      ['team', 'organization'],
    ]);
    expect((await service.creationTargets({ connectionId: provider, cursor: first.nextCursor! })).items.map((v) => v.namespace)).toEqual(['next']);
  });
  it.each(['github', 'forgejo'] as const)('%s verifies a personal account before creation', async (provider) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ id: 7, login: 'alice' })));
    expect(await adapter(provider).verifyCreationTarget({ connectionId: provider, namespace: 'alice', name: 'demo', private: true })).toMatchObject({
      namespace: 'alice',
      kind: 'personal',
    });
  });
  it('respects GitHub organization visibility policy for a non-owner', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ login: 'team', members_can_create_private_repositories: false }))
        .mockResolvedValueOnce(json({ role: 'member' })),
    );
    await expect(adapter('github').verifyCreationTarget({ connectionId: 'github', namespace: 'team', name: 'demo', private: true })).rejects.toMatchObject({
      status: 403,
      code: 'permission_denied',
    });
  });
  it('preserves GitLab subgroup identities and pages and verifies an explicitly entered namespace', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json([{ id: 72, full_path: 'team/subgroup', kind: 'group' }], { 'x-next-page': '2' }))
      .mockResolvedValueOnce(json([{ id: 73, full_path: 'team/nested/group', kind: 'group' }]))
      .mockResolvedValueOnce(json({ id: 73, full_path: 'team/nested/group', kind: 'group' }));
    vi.stubGlobal('fetch', request);
    const service = adapter('gitlab'),
      first = await service.creationTargets({ connectionId: 'gitlab' });
    expect(first.items[0]).toMatchObject({ id: '72', namespace: 'team/subgroup', kind: 'group' });
    expect(first.nextCursor).toContain('page=2');
    expect(await service.verifyCreationTarget({ connectionId: 'gitlab', namespace: 'team/nested/group', name: 'demo', private: true })).toMatchObject({
      id: '73',
      namespace: 'team/nested/group',
    });
  });
  it('requires a Bitbucket Cloud project and sends the selected project explicitly', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          values: [
            { workspace: { slug: 'team', name: 'Team' }, permission: 'owner' },
            { workspace: { slug: 'read-only' }, permission: 'collaborator' },
          ],
          next: 'https://forge.invalid/team/api/user/permissions/workspaces?page=2',
        }),
      )
      .mockResolvedValueOnce(json({ values: [{ key: 'APP', name: 'Applications' }], next: 'https://forge.invalid/team/api/workspaces/team/projects?page=2' }))
      .mockResolvedValueOnce(
        json({
          uuid: '{42}',
          full_name: 'team/demo',
          name: 'demo',
          is_private: true,
          links: { clone: [{ name: 'https', href: 'https://forge.invalid/team/demo.git' }] },
        }),
      );
    vi.stubGlobal('fetch', request);
    const service = adapter('bitbucket-cloud');
    expect((await service.creationTargets({ connectionId: 'bitbucket-cloud' })).items.map((v) => v.namespace)).toEqual(['team']);
    expect((await service.creationTargets({ connectionId: 'bitbucket-cloud', parent: 'team' })).items[0]).toMatchObject({
      namespace: 'team',
      projectKey: 'APP',
    });
    await expect(service.createRepository({ connectionId: 'bitbucket-cloud', namespace: 'team', name: 'demo', private: true })).rejects.toMatchObject({
      code: 'project_required',
    });
    await service.createRepository({ connectionId: 'bitbucket-cloud', namespace: 'team', projectKey: 'APP', name: 'demo', private: true });
    expect(JSON.parse(request.mock.calls[2][1].body)).toMatchObject({ project: { key: 'APP' }, is_private: true });
  });
  it('verifies both Bitbucket Cloud workspace and project', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({ slug: 'team' }))
      .mockResolvedValueOnce(json({ key: 'APP', name: 'Applications' }));
    vi.stubGlobal('fetch', request);
    expect(
      await adapter('bitbucket-cloud').verifyCreationTarget({
        connectionId: 'bitbucket-cloud',
        namespace: 'team',
        projectKey: 'APP',
        name: 'demo',
        private: true,
      }),
    ).toMatchObject({ namespace: 'team', projectKey: 'APP' });
    expect(String(request.mock.calls[1][0])).toContain('/workspaces/team/projects/APP');
  });
  it('lists and verifies existing Data Center projects with a scoped page cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ values: [{ key: 'PRJ', name: 'Project' }], isLastPage: false, nextPageStart: 50 }))
        .mockResolvedValueOnce(json({ key: 'PRJ', name: 'Project' })),
    );
    const service = adapter('bitbucket-data-center'),
      page = await service.creationTargets({ connectionId: 'bitbucket-data-center' });
    expect(page.nextCursor).toContain('start=50');
    expect(page.items[0]).toMatchObject({ namespace: 'PRJ', projectKey: 'PRJ' });
    expect(await service.verifyCreationTarget({ connectionId: 'bitbucket-data-center', namespace: 'PRJ', name: 'demo', private: true })).toMatchObject({
      kind: 'project',
      namespace: 'PRJ',
    });
  });
  it.each([403, 503])('does not disguise HTTP %i as an empty list', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(adapter('gitlab').creationTargets({ connectionId: 'gitlab' })).rejects.toMatchObject({ status });
  });
  it('rejects cross-host paging before sending credentials', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(adapter('github').creationTargets({ connectionId: 'github', cursor: 'https://attacker.invalid/capture' })).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'] as const)(
    '%s sets and strictly verifies the published default branch',
    async (provider) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json({ default_branch: 'release', mainbranch: { name: 'release' }, displayId: 'release' }));
      vi.stubGlobal('fetch', request);
      await adapter(provider).setDefaultBranch({ connectionId: provider, repositoryId: '42', fullPath: 'PRJ/demo' }, 'release');
      expect(request.mock.calls[0][1].method).toBe(provider === 'github' || provider === 'forgejo' ? 'PATCH' : 'PUT');
      expect(request.mock.calls[1][1].method).toBe('GET');
    },
  );
  it('leaves setup pending when the server did not confirm a default branch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => json({})),
    );
    await expect(adapter('github').setDefaultBranch({ connectionId: 'github', repositoryId: '42', fullPath: 'alice/demo' }, 'main')).rejects.toMatchObject({
      code: 'setup_pending',
    });
  });
});
