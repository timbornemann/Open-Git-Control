import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepositoryRef, HostingConnection, HostingProvider } from '../../../../src/types/hostingDtos';
import { createHostingAdapter } from '../index';

const connection = (provider: HostingProvider): HostingConnection => ({
  id: provider,
  provider,
  label: provider,
  baseUrl: provider === 'bitbucket-cloud' ? 'https://bitbucket.org' : 'https://forge.example/team',
  apiBaseUrl:
    provider === 'bitbucket-cloud'
      ? 'https://api.bitbucket.org/2.0'
      : provider === 'gitlab'
        ? 'https://forge.example/team/api/v4'
        : 'https://forge.example/team/rest/api/1.0',
  username: 'alice',
  userId: '7',
  authenticated: true,
  hasCredentials: true,
});
const ref = (provider: HostingProvider): HostedRepositoryRef => ({ connectionId: provider, repositoryId: '42', fullPath: 'PRJ/demo' });
const credentials = async () => ({ accessToken: 'secret', authType: 'token' as const });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('server-selected merge strategies', () => {
  it.each([
    ['always', ['squash'], 'squash', 'merge'],
    ['never', ['merge'], 'merge', 'squash'],
    ['default_on', ['merge', 'squash'], 'squash', null],
    ['default_off', ['merge', 'squash'], 'merge', null],
  ] as const)('honors GitLab squash_option=%s in capabilities and fresh merge validation', async (squashOption, methods, allowed, rejected) => {
    const fetcher = vi.fn(async (url: URL, _request: RequestInit) =>
      json(url.pathname.endsWith('/merge') ? { state: 'merged' } : { squash_option: squashOption }),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('gitlab'), credentials);
    expect((await adapter.capabilities(ref('gitlab'))).mergeMethods).toEqual(methods);
    if (rejected) {
      await expect(adapter.merge({ repository: ref('gitlab'), id: '1', method: rejected, expectedHeadSha: 'checked' })).rejects.toMatchObject({
        code: 'unsupported',
      });
      expect(fetcher.mock.calls.some(([url]) => url.pathname.endsWith('/merge'))).toBe(false);
    }
    await adapter.merge({ repository: ref('gitlab'), id: '1', method: allowed, expectedHeadSha: 'checked' });
    const request = fetcher.mock.calls.at(-1)!;
    expect(request[0].pathname).toBe('/team/api/v4/projects/42/merge_requests/1/merge');
    expect(JSON.parse(request[1].body as string)).toMatchObject({ sha: 'checked', squash: allowed === 'squash' });
  });

  it('rejects a GitLab method if project policy changed after the capability response', async () => {
    let squashOption = 'default_off';
    const fetcher = vi.fn(async () => json({ squash_option: squashOption }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('gitlab'), credentials);
    expect((await adapter.capabilities(ref('gitlab'))).mergeMethods).toEqual(['merge', 'squash']);
    squashOption = 'always';
    await expect(adapter.merge({ repository: ref('gitlab'), id: '1', method: 'merge', expectedHeadSha: 'checked' })).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('offers only enabled Data Center repository strategies and rechecks before submitting a merge', async () => {
    let enabled = true;
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/settings/pull-requests'))
        return json({
          mergeConfig: {
            defaultStrategy: { id: 'squash', enabled: false },
            strategies: [
              { id: 'no-ff', enabled },
              { id: 'squash', enabled: false },
              { id: 'ff-only', enabled: true },
              { id: 'plugin-strategy', enabled: true },
              { id: 'missing-enabled' },
            ],
          },
        });
      return json({ version: 5, fromRef: { latestCommit: 'checked' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-data-center'), credentials);
    expect((await adapter.capabilities(ref('bitbucket-data-center'))).mergeMethods).toEqual(['merge', 'ff-only', 'plugin-strategy']);
    enabled = false;
    await expect(
      adapter.merge({ repository: ref('bitbucket-data-center'), id: '1', method: 'merge', expectedHeadSha: 'checked', version: 5 }),
    ).rejects.toMatchObject({ code: 'unsupported' });
    expect(fetcher.mock.calls.some(([url]) => url.pathname.endsWith('/merge'))).toBe(false);
  });

  it.each(['ff-only', 'squash-ff-only', 'rebase-ff-only', 'plugin-strategy'])('submits the enabled native Data Center strategy %s', async (strategy) => {
    const fetcher = vi.fn(async (url: URL, _request: RequestInit) =>
      json(
        url.pathname.endsWith('/settings/pull-requests')
          ? { mergeConfig: { strategies: [{ id: strategy, enabled: true }] } }
          : url.pathname.endsWith('/merge')
            ? { state: 'MERGED' }
            : { version: 5, fromRef: { latestCommit: 'checked' } },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-data-center'), credentials);
    expect(await adapter.merge({ repository: ref('bitbucket-data-center'), id: '1', method: strategy, expectedHeadSha: 'checked', version: 5 })).toMatchObject({
      merged: true,
    });
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string)).toEqual({ strategyId: strategy });
  });

  it('does not invent Data Center methods when the settings API is unavailable', async () => {
    const fetcher = vi.fn(async (url: URL) => (url.pathname.endsWith('/settings/pull-requests') ? new Response(null, { status: 404 }) : json({})));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-data-center'), credentials);
    expect((await adapter.capabilities(ref('bitbucket-data-center'))).mergeMethods).toEqual([]);
  });

  it('reads Cloud strategies from the selected target branch and falls back to the repository default branch', async () => {
    const fetcher = vi.fn(async (url: URL) =>
      json(
        url.pathname.includes('/refs/branches/')
          ? { merge_strategies: ['fast_forward', 'squash_fast_forward', 'rebase_fast_forward', 'rebase_merge'] }
          : { mainbranch: { name: 'main' } },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-cloud'), credentials);
    expect((await adapter.capabilities(ref('bitbucket-cloud'), 'release/v1')).mergeMethods).toEqual([
      'fast_forward',
      'squash_fast_forward',
      'rebase_fast_forward',
      'rebase_merge',
    ]);
    expect(fetcher.mock.calls[0][0].pathname).toBe('/2.0/repositories/PRJ/demo/refs/branches/release%2Fv1');
    await adapter.capabilities(ref('bitbucket-cloud'));
    expect(fetcher.mock.calls.at(-1)![0].pathname).toBe('/2.0/repositories/PRJ/demo/refs/branches/main');
  });

  it('rejects Cloud methods disallowed by the fresh PR destination even when the source allows them', async () => {
    const fetcher = vi.fn(async () =>
      json({
        source: { commit: { hash: 'checked' }, branch: { merge_strategies: ['merge_commit', 'squash'] } },
        destination: { branch: { name: 'protected', merge_strategies: ['fast_forward'] } },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-cloud'), credentials);
    await expect(adapter.merge({ repository: ref('bitbucket-cloud'), id: '1', method: 'squash', expectedHeadSha: 'checked' })).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each(['fast_forward', 'squash_fast_forward', 'rebase_fast_forward', 'rebase_merge'])(
    'submits the enabled native Cloud target branch strategy %s',
    async (strategy) => {
      const fetcher = vi.fn(async (url: URL, _request: RequestInit) =>
        json(
          url.pathname.endsWith('/merge')
            ? { state: 'MERGED' }
            : { source: { commit: { hash: 'checked' } }, destination: { branch: { name: 'main', merge_strategies: [strategy] } } },
        ),
      );
      vi.stubGlobal('fetch', fetcher);
      const adapter = createHostingAdapter(connection('bitbucket-cloud'), credentials);
      expect(await adapter.merge({ repository: ref('bitbucket-cloud'), id: '1', method: strategy, expectedHeadSha: 'checked' })).toMatchObject({
        merged: true,
      });
      expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string)).toEqual({ merge_strategy: strategy, close_source_branch: false });
    },
  );

  it('fetches the Cloud target branch rules if the PR response omits its merge strategy fields', async () => {
    const fetcher = vi.fn(async (url: URL, _request: RequestInit) =>
      json(
        url.pathname.includes('/refs/branches/')
          ? { merge_strategies: ['merge_commit'] }
          : url.pathname.endsWith('/merge')
            ? { state: 'MERGED' }
            : { source: { commit: { hash: 'checked' } }, destination: { branch: { name: 'main' } } },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-cloud'), credentials);
    await adapter.merge({ repository: ref('bitbucket-cloud'), id: '1', method: 'merge', expectedHeadSha: 'checked' });
    expect(fetcher.mock.calls[1][0].pathname).toBe('/2.0/repositories/PRJ/demo/refs/branches/main');
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string).merge_strategy).toBe('merge_commit');
  });
});
