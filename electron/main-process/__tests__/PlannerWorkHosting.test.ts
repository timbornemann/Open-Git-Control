import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => vi.restoreAllMocks());
import { PlannerWorkHosting } from '../PlannerWorkHosting';
import type { HostingService } from '../../hosting/HostingService';
import type { HostedRepository, HostingChangeRequest, HostingProvider } from '../../../src/types/hostingDtos';
import type { PlannerBranchReference } from '../../../src/types/projectPlanner';

const oid = 'a'.repeat(40);
function fixture(provider: HostingProvider = 'github', fork = false) {
  const connection = { id: 'local-account', provider, baseUrl: 'https://code.invalid', hasCredentials: true, authenticated: true, username: 'test' };
  const source: HostedRepository = {
    ref: { connectionId: connection.id, repositoryId: 'source-id', fullPath: 'user/repo' },
    defaultBranch: 'main',
    htmlUrl: 'https://code.invalid/user/repo',
  } as HostedRepository;
  if (fork) source.parent = { ...source.ref, repositoryId: 'parent-id', fullPath: 'team/repo' };
  const change = (id: string): HostingChangeRequest =>
    ({
      id,
      number: id,
      title: 'Same title',
      body: '',
      source: source.ref,
      target: source.parent || source.ref,
      sourceBranch: 'task/work',
      targetBranch: 'main',
      headSha: oid,
      state: 'open',
      htmlUrl: `https://code.invalid/team/repo/pull/${id}`,
      createdAt: new Date().toISOString(),
    }) as HostingChangeRequest;
  const pages = [{ items: [change('1')], nextCursor: null as string | null, stale: false }];
  const api = {
    listConnections: () => [connection],
    generation: () => 1,
    connection: () => connection,
    request: vi.fn(async (operation: string, input: { repository?: { repositoryId: string }; cursor?: string }) =>
      operation === 'resolveRepository'
        ? source
        : fork && input.repository?.repositoryId === 'source-id'
          ? { items: [], nextCursor: null }
          : pages[input.cursor ? Number(input.cursor) : 0],
    ),
  };
  const git = { run: vi.fn(async () => 'remote.origin.url\nhttps://code.invalid/user/repo.git\0') };
  const reader = new PlannerWorkHosting(git, api as unknown as HostingService);
  const branch: PlannerBranchReference = {
    id: 'workflow',
    projectId: 'project',
    name: 'task/work',
    baseRef: 'refs/heads/main',
    baseSha: oid,
    startedAt: 1,
    automationPaused: false,
  };
  const read = () => reader.read('repo', branch, new AbortController().signal);
  return { connection, source, pages, api, git, reader, branch, read, change };
}

describe('PlannerWorkHosting', () => {
  it.each(['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'] as const)(
    'uses normalized %s source identities and full pagination, including forks',
    async (provider) => {
      const f = fixture(provider, true);
      f.pages[0].nextCursor = '1';
      f.pages.push({ items: [f.change('2')], nextCursor: null, stale: false });
      const result = await f.read();
      expect(result.source).toEqual({ provider, server: 'https://code.invalid', repositoryId: 'source-id', fullPath: 'user/repo' });
      expect(result.requests).toHaveLength(2);
      expect(result.requests[0]).toMatchObject({ repositoryId: 'parent-id', workflowId: 'workflow', sourceBranch: 'task/work', headSha: oid });
      expect(JSON.stringify(result.source)).not.toContain('local-account');
    },
  );
  it('coalesces calls across tasks for sixty seconds and remaps workflows per caller', async () => {
    const f = fixture();
    await Promise.all([f.read(), f.read()]);
    await f.reader.read('repo', { ...f.branch, id: 'other-workflow' }, new AbortController().signal);
    expect(f.api.request.mock.calls.filter(([operation]) => operation === 'changeRequests')).toHaveLength(1);
    const other = await f.reader.read('repo', { ...f.branch, id: 'other-workflow' }, new AbortController().signal);
    expect(other.requests[0].workflowId).toBe('other-workflow');
  });
  it('does not retain an old response under a new account cache key', async () => {
    const f = fixture();
    const original = f.api.request.getMockImplementation()!;
    f.api.request.mockImplementation(async (operation, input) => {
      if (operation === 'changeRequests') f.connection.username = 'other-account';
      return original(operation, input);
    });
    await expect(f.read()).rejects.toThrow('session changed');
    f.api.request.mockImplementation(original);
    const count = f.api.request.mock.calls.length;
    await f.read();
    expect(f.api.request.mock.calls.length).toBeGreaterThan(count);
  });
  it('keeps the cooldown for sixty seconds after a slow inventory finishes', async () => {
    let now = 1;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const f = fixture();
    const original = f.api.request.getMockImplementation()!;
    f.api.request.mockImplementation(async (operation, input) => {
      if (operation === 'changeRequests') now = 120_001;
      return original(operation, input);
    });
    await f.read();
    f.api.request.mockImplementation(original);
    const count = f.api.request.mock.calls.length;
    await f.read();
    expect(f.api.request).toHaveBeenCalledTimes(count);
    now += 60_001;
    await f.read();
    expect(f.api.request.mock.calls.length).toBeGreaterThan(count);
  });
  it('does not associate requests by title or another source repository/branch', async () => {
    const f = fixture();
    f.pages[0].items = [
      { ...f.change('1'), sourceBranch: 'unrelated' },
      { ...f.change('2'), source: { ...f.source.ref, repositoryId: 'other' } },
    ];
    expect((await f.read()).requests).toEqual([]);
  });
  it('retains PR detection for known earlier names after an in-app local branch rename', async () => {
    const f = fixture();
    f.branch.name = 'task/renamed';
    f.branch.previousNames = ['task/work'];
    expect((await f.read()).requests).toHaveLength(1);
  });
  it('rejects partial, stale, cyclic and invalid-source responses, and backs off failures', async () => {
    const f = fixture();
    f.pages[0].nextCursor = '0';
    await expect(f.read()).rejects.toThrow('Incomplete');
    const count = f.api.request.mock.calls.length;
    await expect(f.read()).rejects.toThrow('Incomplete');
    expect(f.api.request).toHaveBeenCalledTimes(count);
    const stale = fixture();
    stale.pages[0].stale = true;
    await expect(stale.read()).rejects.toThrow('stale');
    const missing = fixture();
    missing.pages[0].items[0].headSha = '';
    await expect(missing.read()).rejects.toThrow('incomplete');
  });
  it('keeps offline reads unauthenticated and never follows mismatched hosting bindings', async () => {
    const f = fixture();
    f.connection.hasCredentials = false;
    await expect(f.read()).rejects.toThrow('No authenticated');
    expect(f.api.request).not.toHaveBeenCalled();
    const mismatch = fixture();
    mismatch.branch.repository = { provider: 'gitlab', server: 'https://other.invalid', repositoryId: 'source-id', fullPath: 'user/repo' };
    await expect(mismatch.read()).rejects.toThrow('No authenticated');
    expect(mismatch.api.request).not.toHaveBeenCalled();
  });
  it('rejects external and credential-bearing PR URLs', async () => {
    const f = fixture();
    f.pages[0].items[0].htmlUrl = 'https://elsewhere.invalid/pr/1';
    await expect(f.read()).rejects.toThrow('Invalid change-request link');
    const credential = fixture();
    credential.pages[0].items[0].htmlUrl = 'https://secret@code.invalid/pr/1';
    await expect(credential.read()).rejects.toThrow('Invalid change-request link');
  });
});
