import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanReleaseRepositories, releaseRepository } from '../../github/__tests__/releaseTargetFixture';
import { HostingReleaseSafety } from '../HostingReleaseSafety';
import type { HostingService } from '../HostingService';
import type { HostingCreateRelease } from '../../../src/types/hostingDtos';
import { RemotePreferencesStore } from '../../git/RemotePreferencesStore';

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanReleaseRepositories();
});

async function fixture() {
  const preferences = vi.spyOn(RemotePreferencesStore.prototype, 'read').mockReturnValue({});
  const git = await releaseRepository();
  let generation = 1;
  const repository = { connectionId: 'github-account', repositoryId: 'project-id', fullPath: 'acme/project' };
  const createRelease = vi.fn(async (input: HostingCreateRelease) => ({
    id: 'release-id',
    tagName: input.tagName,
    name: input.name,
    htmlUrl: 'https://github.com/acme/project/releases/tag/v1.0.0',
    draft: false,
    prerelease: false,
  }));
  const hosting = {
    generation: () => generation,
    getConnectionSignal: () => new AbortController().signal,
    validateRepository: vi.fn(),
    createGitCredentialEnvironment: vi.fn(async () => ({ envOverrides: {}, dispose: () => {} })),
    authenticatedAdapter: async () => ({
      resolveRepository: async (url: string) => (url === 'https://github.com/acme/project.git' ? { ref: repository } : null),
      createRelease,
    }),
  } as unknown as HostingService;
  const safety = new HostingReleaseSafety({ gitService: git.gitService, hostingService: hosting, pushGuard: git.pushGuard });
  const input: HostingCreateRelease = {
    repository,
    repoPath: git.repo,
    remoteName: 'origin',
    tagName: 'v1.0.0',
    name: 'Release',
    body: 'Notes',
    target: 'main',
  };
  return { ...git, safety, input, preferences, publish: createRelease, changeAccount: () => generation++ };
}

describe('provider-neutral release target safety', { timeout: 30_000 }, () => {
  it('uses a selected remote tag even when a backup has a conflicting local tag', async () => {
    const f = await fixture();
    await f.run(['tag', 'v0.9.0', f.initial], f.remote);
    const backup = await f.commit('backup-only change');
    await f.run(['tag', 'v0.9.0', backup]);
    const input = { ...f.input, target: 'refs/tags/v0.9.0' };
    const inspected = await f.safety.inspect(f.event, input);
    expect(inspected).toMatchObject({ localSha: f.initial, remoteSha: f.initial, targetBranch: null });
    await f.safety.create(f.event, { ...input, inspectionId: inspected.inspectionId, mode: 'remote' });
    expect(f.publish).toHaveBeenCalledWith(expect.objectContaining({ target: f.initial }));
    expect(await f.run(['rev-parse', 'refs/tags/v0.9.0'])).toBe(backup);
  });

  it('rejects a changed account binding after inspection even when the remote URL and SHA stay unchanged', async () => {
    const f = await fixture();
    const inspected = await f.safety.inspect(f.event, f.input);
    f.preferences.mockReturnValue({
      bindings: [{ remoteName: 'origin', url: 'https://github.com/acme/project.git', repository: f.input.repository, credentialMode: 'system' }],
    });
    await expect(f.safety.create(f.event, { ...f.input, inspectionId: inspected.inspectionId, mode: 'remote' })).rejects.toThrow('state changed');
    expect(f.publish).not.toHaveBeenCalled();
  });
  it('inspects another existing local branch for a push without checking it out', async () => {
    const f = await fixture();
    await f.run(['checkout', '-b', 'release']);
    const releaseOid = await f.commit('release change');
    await f.run(['checkout', 'main']);
    const inspection = await f.safety.inspect(f.event, { ...f.input, target: 'release' });
    expect(inspection).toMatchObject({ localSha: releaseOid, remoteSha: null, targetBranch: 'release', canPush: true, canReleaseRemote: false });
    expect(await f.run(['symbolic-ref', '--short', 'HEAD'])).toBe('main');
    expect(f.publish).not.toHaveBeenCalled();
  });

  it('supports a published explicit commit expression without treating it as a push branch', async () => {
    const f = await fixture();
    await f.commit('unpublished');
    const input = { ...f.input, target: 'HEAD~1' };
    const inspection = await f.safety.inspect(f.event, input);
    expect(inspection).toMatchObject({ localSha: f.initial, remoteSha: f.initial, targetBranch: null, canPush: false, canReleaseRemote: true });
    await f.safety.create(f.event, { ...input, inspectionId: inspection.inspectionId, mode: 'remote' });
    expect(f.publish).toHaveBeenCalledWith(expect.objectContaining({ target: f.initial }));
  });

  it('rejects a checkout change between inspection and publication even when HEAD stays at the same commit', async () => {
    const f = await fixture();
    const inspection = await f.safety.inspect(f.event, f.input);
    await f.run(['checkout', '-b', 'another']);
    await expect(f.safety.create(f.event, { ...f.input, inspectionId: inspection.inspectionId, mode: 'remote' })).rejects.toThrow('state changed');
    expect(f.publish).not.toHaveBeenCalled();
  });

  it('publishes only the inspected remote SHA without changing Git refs', async () => {
    const f = await fixture();
    const local = await f.commit('unpublished change');
    const inspection = await f.safety.inspect(f.event, f.input);
    expect(inspection).toMatchObject({ localSha: local, remoteSha: f.initial, canPush: true, canReleaseRemote: true, ahead: 1 });
    await f.safety.create(f.event, { ...f.input, inspectionId: inspection.inspectionId, mode: 'remote' });
    expect(f.publish).toHaveBeenCalledWith(expect.objectContaining({ target: f.initial }));
    expect(await f.run(['rev-parse', 'main'], f.remote)).toBe(f.initial);
    expect(f.pushGuard.requirePushSecretScanApproval).not.toHaveBeenCalled();
  });

  it('refuses direct push-local publication until the transfer review is used', async () => {
    const f = await fixture();
    const inspection = await f.safety.inspect(f.event, f.input);
    await expect(f.safety.create(f.event, { ...f.input, inspectionId: inspection.inspectionId, mode: 'push-local' })).rejects.toThrow('transfer review');
    expect(f.publish).not.toHaveBeenCalled();
  });

  it('allows an independently selected backup hosting endpoint on one named remote', async () => {
    const f = await fixture();
    await f.run(['remote', 'set-url', 'origin', 'https://forgejo.example.test/acme/project.git']);
    await f.run(['remote', 'set-url', '--push', 'origin', 'https://github.com/acme/project.git']);
    const inspection = await f.safety.inspect(f.event, f.input);
    expect(inspection.remoteSha).toBe(f.initial);
    await f.safety.create(f.event, { ...f.input, inspectionId: inspection.inspectionId, mode: 'remote' });
    expect(f.publish).toHaveBeenCalledWith(expect.objectContaining({ repository: f.input.repository, target: f.initial }));
  });

  it('rejects account changes after inspection', async () => {
    const f = await fixture();
    const inspection = await f.safety.inspect(f.event, f.input);
    f.changeAccount();
    await expect(f.safety.create(f.event, { ...f.input, inspectionId: inspection.inspectionId, mode: 'remote' })).rejects.toThrow('account changed');
    expect(f.publish).not.toHaveBeenCalled();
  });

  it('rejects a forged namespace even when the repository ID matches the selected endpoint', async () => {
    const f = await fixture();
    await expect(f.safety.inspect(f.event, { ...f.input, repository: { ...f.input.repository, fullPath: 'different/project' } })).rejects.toThrow(
      'no endpoint',
    );
    expect(f.publish).not.toHaveBeenCalled();
  });

  it('binds upload authority to the exact release repository namespace', async () => {
    const f = await fixture();
    const inspected = await f.safety.inspect(f.event, f.input);
    await f.safety.create(f.event, { ...f.input, inspectionId: inspected.inspectionId, mode: 'remote' });
    f.safety.authorizeUpload(f.event.sender.id, { repository: f.input.repository, releaseId: 'release-id', repoPath: f.repo });
    expect(() =>
      f.safety.authorizeUpload(f.event.sender.id, {
        repository: { ...f.input.repository, fullPath: 'different/project' },
        releaseId: 'release-id',
        repoPath: f.repo,
      }),
    ).toThrow('release created');
  });

  it('rejects a changed remote commit and conflicting local release tags', async () => {
    const f = await fixture();
    const inspection = await f.safety.inspect(f.event, f.input);
    await f.commit('new commit');
    await expect(f.safety.create(f.event, { ...f.input, inspectionId: inspection.inspectionId, mode: 'remote' })).rejects.toThrow('state changed');
    const refreshed = await f.safety.inspect(f.event, f.input);
    await f.run(['tag', 'v1.0.0']);
    await expect(f.safety.create(f.event, { ...f.input, inspectionId: refreshed.inspectionId, mode: 'remote' })).rejects.toThrow('local release tag');
    expect(f.publish).not.toHaveBeenCalled();
  });
});
