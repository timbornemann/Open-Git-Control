import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanReleaseRepositories, releaseRepository } from '../../github/__tests__/releaseTargetFixture';
import type { HostingService } from '../HostingService';
import { getHostingReleaseContext } from '../HostingReleaseContext';
import { RemotePreferencesStore } from '../../git/RemotePreferencesStore';

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanReleaseRepositories();
});

async function fixture() {
  const preferences = vi.spyOn(RemotePreferencesStore.prototype, 'read').mockReturnValue({});
  const git = await releaseRepository();
  let generation = 1;
  const repository = { connectionId: 'selected-account', repositoryId: '42', fullPath: 'acme/project' };
  const adapter = {
    repository: vi.fn(async () => ({ ref: repository, htmlUrl: 'https://github.com/acme/project' })),
    tags: vi.fn(async (_input: { cursor?: string }) => ({ items: ['v1.0.0'], nextCursor: null as string | null })),
    releases: vi.fn(async () => ({ items: [{ tagName: 'v1.0.0', draft: false }] })),
    resolveRepository: vi.fn(async (url: string) => (url === 'https://github.com/acme/project.git' ? { ref: repository } : null)),
  };
  const hosting = {
    generation: () => generation,
    validateRepository: vi.fn(),
    authenticatedAdapter: async () => adapter,
    getConnectionSignal: () => new AbortController().signal,
    createGitCredentialEnvironment: vi.fn(async () => ({ envOverrides: {}, dispose: vi.fn() })),
  } as unknown as HostingService;
  await git.run(['tag', 'v1.0.0', git.initial], git.remote);
  const input = { repository, repoPath: git.repo, remoteName: 'origin', target: 'main' };
  return {
    ...git,
    input,
    adapter,
    hosting,
    preferences,
    changeAccount: () => generation++,
    context: () => getHostingReleaseContext(input, git.gitService, hosting),
  };
}

describe('endpoint-specific release context', { timeout: 30_000 }, () => {
  it('uses remote tag OIDs for history and suggestions without rewriting a conflicting local tag or tracking', async () => {
    const f = await fixture();
    const next = await f.commit('change after selected release\n\nFirst description paragraph.\n\nBREAKING CHANGE: move configuration.\n- Keep user values.');
    await f.run(['tag', 'v1.0.0', next]);
    await f.run(['config', 'branch.main.remote', 'backup']);
    await f.run(['config', 'branch.main.merge', 'refs/heads/elsewhere']);
    const context = await f.context();
    expect(context).toMatchObject({ existingTags: ['v1.0.0'], lastReleaseTag: 'v1.0.0', targetOid: next, fallbackUsed: false });
    expect(context.commitsSinceLastRelease.map((commit) => commit.hash)).toEqual([next]);
    expect(context.commitsSinceLastRelease[0]).toMatchObject({
      subject: 'change after selected release',
      description: 'First description paragraph.\n\nBREAKING CHANGE: move configuration.\n- Keep user values.',
    });
    expect(context.warning).toBeUndefined();
    expect(await f.run(['rev-parse', 'refs/tags/v1.0.0'])).toBe(next);
    expect(await f.run(['config', 'branch.main.remote'])).toBe('backup');
    expect(await f.run(['for-each-ref', '--format=%(refname)', 'refs/remotes'])).toBe('');
  });

  it('reads an explicit target tag from the selected endpoint instead of its same-named local tag', async () => {
    const f = await fixture();
    const local = await f.commit('backup-only change');
    await f.run(['tag', 'v1.0.0', local]);
    f.input.target = 'refs/tags/v1.0.0';
    expect((await f.context()).targetOid).toBe(f.initial);
    expect(await f.run(['rev-parse', 'refs/tags/v1.0.0'])).toBe(local);
  });

  it('acquires missing objects without adding local tags and reports a missing previous release basis', async () => {
    const f = await fixture();
    const tree = await f.run(['rev-parse', `${f.initial}^{tree}`]);
    const remoteOnly = await f.run(
      ['-c', 'user.name=Remote Test', '-c', 'user.email=remote@example.invalid', 'commit-tree', tree, '-p', f.initial, '-m', 'remote-only change'],
      f.remote,
    );
    await f.run(['update-ref', 'refs/heads/remote-only', remoteOnly], f.remote);
    await expect(f.run(['cat-file', '-e', remoteOnly])).rejects.toThrow();
    f.input.target = 'remote-only';
    f.adapter.releases.mockResolvedValue({ items: [{ tagName: 'missing-release-tag', draft: false }] });
    const context = await f.context();
    expect(context).toMatchObject({ targetOid: remoteOnly, fallbackUsed: true, lastReleaseTag: 'missing-release-tag' });
    expect(context.commitsSinceLastRelease).toHaveLength(2);
    expect(await f.run(['cat-file', '-t', remoteOnly])).toBe('commit');
    expect(await f.run(['tag', '--list'])).toBe('');
    expect(await f.run(['for-each-ref', '--format=%(refname)', 'refs/remotes'])).toBe('');
  });

  it('loads all tag pages and respects an explicit notes base', async () => {
    const f = await fixture();
    const next = await f.commit('next');
    f.adapter.tags.mockImplementation(async ({ cursor }) => (cursor ? { items: ['v2.0.0'], nextCursor: null } : { items: ['v1.0.0'], nextCursor: 'second' }));
    const context = await getHostingReleaseContext({ ...f.input, fromRef: f.initial }, f.gitService, f.hosting);
    expect(context.existingTags).toEqual(['v1.0.0', 'v2.0.0']);
    expect(context.commitsSinceLastRelease.map((commit) => commit.hash)).toEqual([next]);
    expect(f.adapter.tags).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'second' }));
  });

  it('preserves authentication and transport errors instead of returning an empty context', async () => {
    const f = await fixture();
    f.adapter.releases.mockRejectedValueOnce(new Error('Release permission denied'));
    await expect(f.context()).rejects.toThrow('Release permission denied');
    await f.run(['remote', 'set-url', 'origin', 'https://different.example/acme/project.git']);
    await expect(f.context()).rejects.toThrow('no endpoint');
  });

  it('rejects late account results and a repository that is no longer active', async () => {
    const f = await fixture();
    f.adapter.tags.mockImplementationOnce(async () => {
      f.changeAccount();
      return { items: [], nextCursor: null };
    });
    await expect(f.context()).rejects.toThrow('account changed');
    f.gitService.setRepoPath(f.remote);
    await expect(f.context()).rejects.toThrow('active');
  });
});
