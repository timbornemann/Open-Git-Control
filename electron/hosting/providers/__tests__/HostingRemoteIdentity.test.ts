import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostingAdapter } from '../index';
import type { HostedRepository, HostingConnection } from '../../../../src/types/hostingDtos';

afterEach(() => vi.unstubAllGlobals());
const connection: HostingConnection = {
  id: 'private-server',
  provider: 'forgejo',
  label: 'Private server',
  baseUrl: 'https://forge.example:8443/platform',
  apiBaseUrl: 'https://forge.example:8443/platform/api/v1',
  username: 'user',
  userId: '1',
  authenticated: true,
  hasCredentials: true,
};
const adapter = () => createHostingAdapter(connection, async () => ({ accessToken: 'token', authType: 'token' }));
describe('host, port and transport identities', () => {
  it.each([
    ['github', 'https://code.example/platform', 'https://code.example/platform/Team/Repo.git', 'team/repo'],
    ['forgejo', 'https://code.example:8443/platform', 'ssh://git@code.example:2222/team/repo.git', 'team/repo'],
    ['gitlab', 'https://code.example/platform', 'git@code.example:group/sub/repo.git', 'group/sub/repo'],
    ['bitbucket-cloud', 'https://code.example', 'https://code.example/workspace/repo.git', 'workspace/repo'],
    ['bitbucket-data-center', 'https://code.example/platform', 'https://code.example/platform/scm/prj/repo.git', 'PRJ/repo'],
    ['bitbucket-data-center', 'https://code.example/platform', 'https://code.example/platform/projects/PRJ/repos/repo/browse', 'PRJ/repo'],
  ] as const)('resolves a cached %s repository with provider-owned URL rules and no credentials or network', (provider, baseUrl, url, fullPath) => {
    const fetcher = vi.fn();
    const credentials = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const account = { ...connection, provider, baseUrl, apiBaseUrl: `${baseUrl}/api` };
    const repository: HostedRepository = {
      ref: { connectionId: account.id, repositoryId: '12', fullPath },
      name: 'repo',
      fullName: fullPath,
      cloneUrl: url,
      htmlUrl: url,
      description: 'Cached description',
      private: true,
      fork: false,
      defaultBranch: 'main',
    };
    const adapter = createHostingAdapter(account, credentials);
    expect(adapter.resolveCachedRepository(url, [repository])).toEqual(repository);
    expect(adapter.resolveCachedRepository(url, [{ ...repository, ref: { ...repository.ref, connectionId: 'other-account' } }])).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(credentials).not.toHaveBeenCalled();
  });

  it.each([
    'https://forge.example/platform/team/repo.git',
    'https://forge.example:9443/platform/team/repo.git',
    'http://forge.example:8443/platform/team/repo.git',
    'https://forge.example:8443/another/team/repo.git',
    'file://forge.example/platform/team/repo',
    'https://user:secret@forge.example:8443/platform/team/repo.git',
    'https://forge.example:8443/platform/team/repo.git?token=secret',
    'git@ssh-alias:team/repo.git',
  ])('does not claim an unbound URL %s', async (url) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(adapter().resolveRepository(url)).resolves.toBeNull();
    expect(
      adapter().resolveCachedRepository(url, [{ ref: { connectionId: connection.id, repositoryId: '12', fullPath: 'team/repo' } } as HostedRepository]),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['https://forge.example:8443/platform/team/repo.git', 'ssh://git@forge.example:2222/team/repo.git', 'git@forge.example:team/repo.git'])(
    'resolves the configured server without confusing HTTPS and SSH ports: %s',
    async (url) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 12, name: 'repo', full_name: 'team/repo', clone_url: 'https://forge.example:8443/platform/team/repo.git' })),
        );
      vi.stubGlobal('fetch', fetcher);
      await expect(adapter().resolveRepository(url)).resolves.toMatchObject({
        ref: { connectionId: 'private-server', repositoryId: '12', fullPath: 'team/repo' },
      });
      expect(String(fetcher.mock.calls[0][0])).toBe('https://forge.example:8443/platform/api/v1/repos/team/repo');
    },
  );
});
