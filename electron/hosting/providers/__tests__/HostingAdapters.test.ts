import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepositoryRef, HostingConnection, HostingProvider } from '../../../../src/types/hostingDtos';
import { createHostingAdapter, HostingHttpTransport } from '../index';
import { safeCloneUrl, zipLogs } from '../providerUtils';

const connection = (provider: HostingProvider, id: string = provider, version?: string): HostingConnection => ({
  id,
  provider,
  label: id,
  baseUrl: provider === 'bitbucket-cloud' ? 'https://bitbucket.org' : 'https://forge.example/team',
  apiBaseUrl:
    provider === 'bitbucket-cloud'
      ? 'https://api.bitbucket.org/2.0'
      : provider === 'gitlab'
        ? 'https://forge.example/team/api/v4'
        : provider === 'bitbucket-data-center'
          ? 'https://forge.example/team/rest/api/1.0'
          : 'https://forge.example/team/api/v1',
  username: 'alice',
  userId: '7',
  authenticated: true,
  hasCredentials: true,
  serverVersion: version,
});
const ref = (provider: HostingProvider, fullPath = 'alice/demo', id = '42'): HostedRepositoryRef => ({ connectionId: provider, repositoryId: id, fullPath });
const credentials = async () => ({ accessToken: 'secret', authType: 'token' as const });
const json = (value: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', ...headers } });
afterEach(() => vi.unstubAllGlobals());

describe('connection-local provider contracts', () => {
  it('removes API-supplied HTTP usernames and never forwards passwords or URL tokens to repository DTOs', () => {
    expect(safeCloneUrl('https://alice@bitbucket.org/team/demo.git')).toBe('https://bitbucket.org/team/demo.git');
    expect(safeCloneUrl('git@bitbucket.org:team/demo.git', true)).toBe('git@bitbucket.org:team/demo.git');
    expect(() => safeCloneUrl('https://alice:secret@bitbucket.org/team/demo.git')).toThrow('credentials');
    expect(() => safeCloneUrl('https://bitbucket.org/team/demo.git?token=secret')).toThrow('credentials');
  });
  it('isolates credentials for accounts using the same server', async () => {
    const received: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, input) => {
        received.push(new Headers(input.headers).get('Authorization')!);
        return json({ id: 7, login: 'alice' });
      }),
    );
    const left = createHostingAdapter(connection('github', 'left'), async () => ({ accessToken: 'left-token', authType: 'oauth' }));
    const right = createHostingAdapter(connection('github', 'right'), async () => ({ accessToken: 'right-token', authType: 'oauth' }));
    await Promise.all([left.authenticate(), right.authenticate()]);
    expect(received).toEqual(['Bearer left-token', 'Bearer right-token']);
  });

  it('rejects a pagination URL before leaking a credential to another API', async () => {
    const getToken = vi.fn(async () => 'secret');
    const fetcher = vi.fn();
    const transport = new HostingHttpTransport({ baseUrl: 'https://gitlab.example/api/v4', getToken, fetch: fetcher });
    await expect(transport.json('https://attacker.example/collect')).rejects.toMatchObject({ code: 'invalid_cursor' });
    await expect(transport.json('https://gitlab.example/admin/collect')).rejects.toMatchObject({ code: 'invalid_cursor' });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('downloads signed artifacts without forwarding the token to storage', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://bucket.s3.amazonaws.com/archive?signature=abc' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    const transport = new HostingHttpTransport({ baseUrl: 'https://gitlab.example/api/v4', getToken: async () => 'secret', fetch: fetcher });
    expect(await transport.download('projects/1/jobs/2/artifacts')).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer secret');
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('Authorization')).toBeNull();
  });

  it('rejects an arbitrary artifact redirect and a large declared response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://attacker.example/archive' } }))
      .mockResolvedValueOnce(new Response('small', { headers: { 'Content-Length': '100' } }));
    const transport = new HostingHttpTransport({ baseUrl: 'https://gitlab.example/api/v4', getToken: async () => 'secret', fetch: fetcher });
    await expect(transport.download('artifact')).rejects.toMatchObject({ code: 'untrusted_download_host' });
    await expect(transport.download('artifact', {}, 10)).rejects.toMatchObject({ code: 'response_too_large' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns a bounded truncated log instead of buffering a large trace', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('abcdefghijk'));
      },
      cancel,
    });
    const transport = new HostingHttpTransport({
      baseUrl: 'https://git.example/api',
      getToken: async () => 'secret',
      fetch: vi.fn().mockResolvedValue(new Response(stream)),
    });
    expect(await transport.textLog('trace', {}, 5)).toEqual({ text: 'abcde', truncated: true, nextCursor: null });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not expose provider error bodies containing credentials', async () => {
    const transport = new HostingHttpTransport({
      baseUrl: 'https://git.example/api',
      getToken: async () => 'secret',
      fetch: vi.fn().mockResolvedValue(new Response('token=secret', { status: 403 })),
    });
    await expect(transport.json('repository')).rejects.toMatchObject({ code: 'permission_denied', message: 'Hosting API returned HTTP 403.' });
  });

  it('gates Forgejo 15 CI details and keeps global run ID separate from display number', async () => {
    const fetcher = vi.fn(async (url: URL) =>
      url.pathname.endsWith('/actions/runs')
        ? json({
            total_count: 1,
            workflow_runs: [
              {
                id: 991,
                index_in_repo: 3,
                title: 'Test',
                status: 'success',
                prettyref: 'main',
                commit_sha: 'abc',
                created: '2026-10-01',
                updated: '2026-10-02',
              },
            ],
          })
        : json({ has_actions: true }),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('forgejo', 'forgejo', '15.0.9'), credentials);
    expect(await adapter.capabilities()).toMatchObject({ runs: true, jobs: false, logs: false, retryRun: false, dispatch: true });
    await expect(adapter.jobs({ repository: ref('forgejo'), runId: '991' })).rejects.toMatchObject({ code: 'unsupported' });
    expect((await adapter.runs({ repository: ref('forgejo') })).items[0]).toMatchObject({ id: '991', number: '3', status: 'completed', conclusion: 'success' });
    expect(fetcher.mock.calls.some(([url]) => url.pathname.includes('/jobs'))).toBe(false);
  });

  it('uses Forgejo 16 array job/artifact responses and never fakes retry with dispatch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) =>
        url.pathname.endsWith('/jobs')
          ? json([{ id: 55, name: 'Build', status: 'success' }])
          : url.pathname.endsWith('/artifacts')
            ? json([{ id: 8, name: 'Binary', expired: true, size_in_bytes: 50 }])
            : json({ has_actions: true }),
      ),
    );
    const adapter = createHostingAdapter(connection('forgejo', 'forgejo', '16.0.5'), credentials);
    expect((await adapter.jobs({ repository: ref('forgejo'), runId: '991' })).items[0]).toMatchObject({ id: '55', name: 'Build' });
    expect((await adapter.artifacts({ repository: ref('forgejo'), runId: '991' })).items[0]).toMatchObject({ id: '8', downloadable: false });
    await expect(adapter.retryRun({ repository: ref('forgejo'), runId: '991' })).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('preserves nested GitLab namespaces and link pagination', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      json(
        [
          {
            id: 42,
            name: 'Demo',
            path_with_namespace: 'group/subgroup/demo',
            http_url_to_repo: 'https://forge.example/team/group/subgroup/demo.git',
            default_branch: 'main',
          },
        ],
        { Link: '<https://forge.example/team/api/v4/projects?membership=true&page=2>; rel="next"' },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('gitlab'), credentials);
    const page = await adapter.repositories({ connectionId: 'gitlab' });
    expect(page.items[0].ref).toEqual(ref('gitlab', 'group/subgroup/demo'));
    expect(page.nextCursor).toContain('page=2');
    fetcher.mockResolvedValueOnce(json({ id: 42, name: 'Demo', path_with_namespace: 'group/subgroup/demo' }));
    await adapter.resolveRepository('https://forge.example/team/group/subgroup/demo.git');
    expect(fetcher.mock.calls[1][0].pathname).toBe('/team/api/v4/projects/group%2Fsubgroup%2Fdemo');
  });

  it('does not map GitLab upcoming releases to drafts or offer unsupported merge rebase', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('gitlab'), credentials);
    expect(await adapter.capabilities()).toMatchObject({ draftRelease: false, prerelease: false, mergeMethods: ['merge', 'squash'] });
    await expect(
      adapter.createRelease({
        repository: ref('gitlab'),
        repoPath: '/repo',
        remoteName: 'origin',
        tagName: 'v1',
        name: 'V1',
        body: '',
        target: 'main',
        draft: true,
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
    await expect(adapter.merge({ repository: ref('gitlab'), id: '1', method: 'rebase', expectedHeadSha: 'abc' })).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('verifies GitLab log/artifact job belongs to the selected pipeline', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ id: 9, pipeline: { id: 123 } }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('gitlab'), credentials);
    await expect(adapter.downloadArtifact({ repository: ref('gitlab'), runId: '456', artifactId: '9' })).rejects.toMatchObject({ code: 'invalid_job' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses Cloud API token email Basic auth and rejects native pipeline artifact/retry operations', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ uuid: '{user}', nickname: 'alice' }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-cloud'), async () => ({ accessToken: 'secret', authType: 'token', email: 'alice@example.com' }));
    await adapter.authenticate();
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe(`Basic ${Buffer.from('alice@example.com:secret').toString('base64')}`);
    expect(await adapter.capabilities()).toMatchObject({ artifacts: false, retryRun: false, releases: 'downloads' });
    await expect(adapter.artifacts({ repository: ref('bitbucket-cloud'), runId: '{run}' })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(adapter.retryRun({ repository: ref('bitbucket-cloud'), runId: '{run}' })).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('uses current Cloud workspace APIs and carries repository pages across workspaces', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/user/workspaces')) return json({ values: [{ workspace: { slug: 'first' } }, { workspace: { slug: 'second' } }] });
      const workspace = url.pathname.split('/').pop();
      return json({
        values: [
          {
            uuid: `{${workspace}}`,
            name: 'Demo',
            full_name: `${workspace}/demo`,
            links: { clone: [{ name: 'https', href: `https://bitbucket.org/${workspace}/demo.git` }] },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-cloud'), credentials);
    const first = await adapter.repositories({ connectionId: 'bitbucket-cloud' });
    expect(first.items[0].cloneUrl).toBe('https://bitbucket.org/first/demo.git');
    const second = await adapter.repositories({ connectionId: 'bitbucket-cloud', cursor: first.nextCursor! });
    expect(second.items[0].fullName).toBe('second/demo');
    expect(second.nextCursor).toBeNull();
    expect(fetcher.mock.calls.map(([url]) => url.pathname)).toEqual(['/2.0/user/workspaces', '/2.0/repositories/first', '/2.0/repositories/second']);
  });

  it('starts a checked GitLab manual job through play rather than creating another pipeline', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 9, ref: 'main', status: 'manual' }))
      .mockResolvedValueOnce(json({ id: 9, status: 'pending' }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('gitlab'), credentials);
    await adapter.dispatch({ repository: ref('gitlab'), workflow: 'job:9', ref: 'main', inputs: { DEPLOY: 'yes' } });
    expect(fetcher.mock.calls[1][0].pathname).toBe('/team/api/v4/projects/42/jobs/9/play');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ job_variables_attributes: [{ key: 'DEPLOY', value: 'yes' }] });
  });

  it('maps Cloud pipeline step state and does not silently overwrite a download', async () => {
    const fetcher = vi.fn(async (url: URL) =>
      url.pathname.endsWith('/steps')
        ? json({ values: [{ uuid: '{step}', name: 'Compile', state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } }] })
        : json({ values: [{ name: 'v1-file.zip' }] }),
    );
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-cloud'), credentials);
    expect((await adapter.jobs({ repository: ref('bitbucket-cloud'), runId: '{run}' })).items[0]).toMatchObject({
      id: '{step}',
      status: 'completed',
      conclusion: 'success',
    });
    await expect(
      adapter.uploadAsset({ repository: ref('bitbucket-cloud'), repoPath: '/repo', releaseId: 'v1', filePath: '/tmp/file.zip' }, new Uint8Array([1])),
    ).rejects.toMatchObject({ code: 'asset_exists' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses DC nextPageStart rather than guessing an offset and retains context path', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          values: [
            {
              id: 42,
              name: 'Demo',
              slug: 'demo',
              project: { key: 'PRJ' },
              links: { clone: [{ name: 'http', href: 'https://forge.example/team/scm/prj/demo.git' }] },
            },
          ],
          isLastPage: false,
          nextPageStart: 137,
        }),
      )
      .mockResolvedValueOnce(json({ values: [], isLastPage: true }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-data-center'), credentials);
    const page = await adapter.repositories({ connectionId: 'bitbucket-data-center' });
    expect(page.nextCursor).toBe('137');
    expect(page.items[0].ref.fullPath).toBe('PRJ/demo');
    await adapter.repositories({ connectionId: 'bitbucket-data-center', cursor: page.nextCursor! });
    expect(fetcher.mock.calls[1][0].href).toContain('/team/rest/api/1.0/repos?start=137');
    expect(await adapter.capabilities()).toMatchObject({ runs: false, jobs: false, releases: 'tags', releaseAssets: false });
  });

  it('refuses a stale DC PR before submitting a merge and guards unsupported README before mutation', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ version: 5, fromRef: { latestCommit: 'new' } }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-data-center'), credentials);
    await expect(
      adapter.merge({ repository: ref('bitbucket-data-center', 'PRJ/demo'), id: '1', method: 'merge', expectedHeadSha: 'old', version: 5 }),
    ).rejects.toMatchObject({ code: 'head_changed' });
    await expect(
      adapter.createRepository({ connectionId: 'bitbucket-data-center', namespace: 'PRJ', name: 'demo', private: true, initializeReadme: true }),
    ).rejects.toMatchObject({ code: 'unsupported' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not accept a manually supplied DC username as proof of the token identity', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ version: '9.6' }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-data-center'), async () => ({ accessToken: 'secret', authType: 'token', username: 'admin' }));
    await expect(adapter.authenticate()).rejects.toMatchObject({ code: 'identity_unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/users/admin'))).toBe(true);
  });

  it('lists Bitbucket Downloads independently from tags and follows the provider cursor', async () => {
    const next = 'https://api.bitbucket.org/2.0/repositories/work/demo/downloads?page=2';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ values: [{ name: 'old-release.zip' }], next }))
      .mockResolvedValueOnce(json({ values: [{ name: 'notes.md' }] }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('bitbucket-cloud'), credentials);
    const first = await adapter.releaseAssets({ repository: ref('bitbucket-cloud', 'work/demo') });
    expect(first).toEqual({
      items: [{ id: 'old-release.zip', name: 'old-release.zip', htmlUrl: 'https://bitbucket.org/work/demo/downloads/old-release.zip' }],
      nextCursor: next,
    });
    const second = await adapter.releaseAssets({ repository: ref('bitbucket-cloud', 'work/demo'), releaseId: 'unrelated-tag', cursor: next });
    expect(second.items[0].name).toBe('notes.md');
    expect(fetcher.mock.calls[1][0].href).toBe(next);
  });

  it('rejects a repository reference assigned to another connection', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const adapter = createHostingAdapter(connection('github'), credentials);
    await expect(adapter.repository({ repository: ref('forgejo') })).rejects.toMatchObject({ code: 'invalid_repository' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects malformed ZIP logs without extracting files', () => {
    expect(() => zipLogs(new Uint8Array([1, 2, 3]))).toThrow('Invalid CI log archive');
  });
});
