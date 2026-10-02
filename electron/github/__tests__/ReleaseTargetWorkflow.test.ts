import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanReleaseRepositories, releaseRepository } from './releaseTargetFixture';
import { beginCommitProtection } from '../../main-process/RepositoryCommitProtection';
import { repoJobRegistry } from '../../main-process/repoJobRegistry';

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanReleaseRepositories();
});

describe('release target publication with real Git', { timeout: 30_000 }, () => {
  it('uses the canonical active path when the repository was opened through a directory alias', async () => {
    const r = await releaseRepository({ usePathAlias: true });
    expect(r.params.repoPath).toBe(r.gitService.getRepoPath());
    expect(r.repo).toBe(r.gitService.getRepoPath());
    const sha = await r.commit('unpublished through an alias');
    await r.create('push-local');
    expect(await r.run(['rev-parse', 'main'], r.remote)).toBe(sha);
    expect(r.createRelease).toHaveBeenCalledWith(expect.objectContaining({ targetCommitish: sha }));
  });

  it('pins a synchronized release to the verified remote SHA', async () => {
    const r = await releaseRepository();
    const state = await r.workflow.inspect(r.event, r.params);
    expect(state).toMatchObject({ ahead: 0, behind: 0, localSha: r.initial, remoteSha: r.initial, canPush: false });
    await r.workflow.create(r.event, { ...r.params, targetInspection: { id: state.inspectionId, mode: 'remote' } });
    expect(r.createRelease).toHaveBeenCalledWith(expect.objectContaining({ targetCommitish: r.initial }));
    expect(r.pushGuard.requirePushSecretScanApproval).not.toHaveBeenCalled();
  });

  it('pushes the exact inspected commit while leaving staged and unstaged changes alone', async () => {
    const r = await releaseRepository();
    const local = await r.commit('unpublished');
    fs.writeFileSync(path.join(r.repo, 'file.txt'), 'staged');
    await r.run(['add', 'file.txt']);
    fs.writeFileSync(path.join(r.repo, 'file.txt'), 'unstaged');
    const index = await r.run(['write-tree']);
    const state = await r.workflow.inspect(r.event, r.params);
    expect(state).toMatchObject({ ahead: 1, behind: 0, canPush: true, remoteSha: r.initial });
    expect(r.createRelease).not.toHaveBeenCalled();
    await r.workflow.create(r.event, { ...r.params, targetInspection: { id: state.inspectionId, mode: 'push-local' } });
    expect(await r.run(['rev-parse', 'main'], r.remote)).toBe(local);
    expect(await r.run(['write-tree'])).toBe(index);
    expect(fs.readFileSync(path.join(r.repo, 'file.txt'), 'utf8')).toBe('unstaged');
    expect(r.createRelease).toHaveBeenCalledWith(expect.objectContaining({ targetCommitish: local }));
    expect(r.pushGuard.requirePushSecretScanApproval).toHaveBeenCalledOnce();
  });

  it('can deliberately publish the old remote commit without pushing', async () => {
    const r = await releaseRepository();
    await r.commit('unpublished');
    await r.create('remote');
    expect(await r.run(['rev-parse', 'main'], r.remote)).toBe(r.initial);
    expect(r.createRelease).toHaveBeenCalledWith(expect.objectContaining({ targetCommitish: r.initial }));
    expect(r.pushGuard.requirePushSecretScanApproval).not.toHaveBeenCalled();
  });

  it('uses the selected branch and creates a missing remote branch without setting upstream', async () => {
    const r = await releaseRepository();
    await r.run(['checkout', '-b', 'release/next']);
    const sha = await r.commit('release branch');
    await r.run(['checkout', 'main']);
    const params = { ...r.params, targetCommitish: 'release/next' };
    const state = await r.workflow.inspect(r.event, params);
    expect(state).toMatchObject({ targetBranch: 'release/next', remoteSha: null, canPush: true, canReleaseRemote: false });
    await r.workflow.create(r.event, { ...params, targetInspection: { id: state.inspectionId, mode: 'push-local' } });
    expect(await r.run(['rev-parse', 'refs/heads/release/next'], r.remote)).toBe(sha);
    expect(await r.run(['branch', '--show-current'])).toBe('main');
    await expect(r.run(['config', '--get', 'branch.release/next.remote'])).rejects.toThrow();
  });

  it('fetches missing remote objects and prevents pushing a diverged branch', async () => {
    const r = await releaseRepository();
    const tree = await r.run(['rev-parse', 'HEAD^{tree}']);
    const remoteCommit = await r.run(
      ['-c', 'user.name=Remote', '-c', 'user.email=remote@example.test', 'commit-tree', tree, '-p', r.initial, '-m', 'remote only'],
      r.remote,
    );
    await r.run(['update-ref', 'refs/heads/main', remoteCommit], r.remote);
    await r.commit('local only');
    const state = await r.workflow.inspect(r.event, r.params);
    expect(state).toMatchObject({ ahead: 1, behind: 1, remoteSha: remoteCommit, canPush: false, canReleaseRemote: true });
    expect(fs.existsSync(path.join(r.repo, '.git', 'FETCH_HEAD'))).toBe(false);
    await expect(r.workflow.create(r.event, { ...r.params, targetInspection: { id: state.inspectionId, mode: 'push-local' } })).rejects.toThrow(
      'synchronisieren',
    );
    expect(r.createRelease).not.toHaveBeenCalled();
  });

  it.each(['local', 'remote', 'account', 'repository', 'target'])('rejects a changed %s after inspection', async (change) => {
    const r = await releaseRepository();
    await r.commit('unpublished');
    const state = await r.workflow.inspect(r.event, r.params);
    if (change === 'local') await r.commit('new local');
    if (change === 'remote') await r.run(['push', r.remote, 'main']);
    if (change === 'account') r.githubService.getAuthenticationGeneration.mockReturnValue(2);
    if (change === 'repository') repoJobRegistry.cancelForRepoChange(null);
    const params = change === 'target' ? { ...r.params, targetCommitish: 'other' } : r.params;
    await expect(r.workflow.create(r.event, { ...params, targetInspection: { id: state.inspectionId, mode: 'push-local' } })).rejects.toThrow();
    expect(r.createRelease).not.toHaveBeenCalled();
  });

  it('blocks mismatched push URLs while still allowing the remote release', async () => {
    const r = await releaseRepository();
    await r.commit('unpublished');
    await r.run(['remote', 'set-url', '--add', '--push', 'origin', 'https://github.com/other/project.git']);
    const state = await r.workflow.inspect(r.event, r.params);
    expect(state).toMatchObject({ canPush: false, canReleaseRemote: true, pushBlockedReason: expect.stringContaining('Push-URLs') });
    await r.workflow.create(r.event, { ...r.params, targetInspection: { id: state.inspectionId, mode: 'remote' } });
    expect(r.createRelease).toHaveBeenCalledOnce();
  });

  it.each(['secret', 'hook', 'busy'])('does not publish after a %s rejection', async (failure) => {
    const r = await releaseRepository();
    await r.commit('unpublished');
    if (failure === 'secret') r.pushGuard.requirePushSecretScanApproval.mockResolvedValue({ success: false, error: 'Secret detected' });
    if (failure === 'hook') {
      const hook = path.join(r.repo, '.git', 'hooks', 'pre-push');
      fs.writeFileSync(hook, '#!/bin/sh\necho release-test-hook-rejected >&2\nexit 1\n');
      fs.chmodSync(hook, 0o755);
    }
    const release = failure === 'busy' ? beginCommitProtection(r.repo) : null;
    const reason = { secret: 'Secret detected', hook: 'release-test-hook-rejected', busy: 'Schreiboperation' }[failure];
    try {
      await expect(r.create('push-local')).rejects.toThrow(reason);
    } finally {
      release?.();
    }
    expect(r.createRelease).not.toHaveBeenCalled();
    expect(await r.run(['rev-parse', 'main'], r.remote)).toBe(r.initial);
  });

  it('retains the completed push if GitHub rejects release creation', async () => {
    const r = await releaseRepository();
    const sha = await r.commit('unpublished');
    r.createRelease.mockRejectedValue(new Error('GitHub unavailable'));
    await expect(r.create('push-local')).rejects.toThrow('Commits wurden gepusht');
    expect(await r.run(['rev-parse', 'main'], r.remote)).toBe(sha);
  });

  it.each(['local', 'remote'])('rejects a conflicting %s release tag', async (location) => {
    const r = await releaseRepository();
    await r.run(['tag', 'v1.0.0']);
    if (location === 'remote') {
      await r.run(['push', r.remote, 'refs/tags/v1.0.0']);
      await r.run(['tag', '-d', 'v1.0.0']);
    }
    await r.commit('unpublished');
    await expect(r.create('push-local')).rejects.toThrow('different commit');
    expect(await r.run(['rev-parse', 'main'], r.remote)).toBe(r.initial);
    expect(r.createRelease).not.toHaveBeenCalled();
  });

  it('accepts an explicit published SHA but rejects an unpublished SHA', async () => {
    const r = await releaseRepository();
    await r.create('remote', { ...r.params, targetCommitish: r.initial });
    const local = await r.commit('unpublished');
    await expect(r.workflow.inspect(r.event, { ...r.params, targetCommitish: local })).rejects.toThrow('nicht verfügbar');
    expect(r.createRelease).toHaveBeenCalledOnce();
  });

  it('consumes an inspection only once', async () => {
    const r = await releaseRepository();
    const state = await r.workflow.inspect(r.event, r.params);
    const params = { ...r.params, targetInspection: { id: state.inspectionId, mode: 'remote' as const } };
    const first = r.workflow.create(r.event, params);
    await expect(r.workflow.create(r.event, params)).rejects.toThrow();
    await first;
    expect(r.createRelease).toHaveBeenCalledOnce();
  });

  it('accepts a matching annotated tag and rejects an unpublished local tag', async () => {
    const r = await releaseRepository();
    await r.run(['tag', '-a', 'published', '-m', 'Published tag']);
    await r.run(['push', r.remote, 'refs/tags/published']);
    await r.create('remote', { ...r.params, targetCommitish: 'refs/tags/published' });
    expect(r.createRelease).toHaveBeenCalledWith(expect.objectContaining({ targetCommitish: r.initial }));
    await r.run(['tag', 'local-only']);
    await expect(r.workflow.inspect(r.event, { ...r.params, targetCommitish: 'local-only' })).rejects.toThrow('nicht verfügbar');
  });

  it('does not resolve an unpublished detached HEAD through the remote default branch', async () => {
    const r = await releaseRepository();
    const sha = await r.commit('unpublished');
    await r.run(['checkout', '--detach', sha]);
    await expect(r.workflow.inspect(r.event, { ...r.params, targetCommitish: 'HEAD' })).rejects.toThrow('nicht verfügbar');
  });

  it('resolves relative commits locally and does not confuse explicit branch and tag names', async () => {
    const r = await releaseRepository();
    await r.commit('unpublished first');
    await r.commit('unpublished second');
    await expect(r.workflow.inspect(r.event, { ...r.params, targetCommitish: 'HEAD~1' })).rejects.toThrow('nicht verfügbar');
    await r.create('remote', { ...r.params, targetCommitish: 'HEAD~2' });
    expect(r.createRelease).toHaveBeenCalledWith(expect.objectContaining({ targetCommitish: r.initial }));
    await r.run(['tag', 'tag-only', r.initial]);
    await r.run(['push', r.remote, 'refs/tags/tag-only']);
    await expect(r.workflow.inspect(r.event, { ...r.params, targetCommitish: 'refs/heads/tag-only' })).rejects.toThrow('Ziel-Branch');
  });

  it('does not include other tags even when followTags is configured', async () => {
    const r = await releaseRepository();
    await r.commit('unpublished');
    await r.run(['tag', '-a', 'private-tag', '-m', 'Keep local']);
    await r.run(['config', 'push.followTags', 'true']);
    await r.create('push-local');
    expect(await r.run(['tag', '--list'], r.remote)).toBe('');
  });

  it('stops if the account changes during the secret scan', async () => {
    const r = await releaseRepository();
    await r.commit('unpublished');
    r.pushGuard.requirePushSecretScanApproval.mockImplementation(async () => {
      r.githubService.getAuthenticationGeneration.mockReturnValue(2);
      return null;
    });
    await expect(r.create('push-local')).rejects.toThrow('Release-Zustand');
    expect(r.pushGuard.requirePushSecretScanApproval).toHaveBeenCalledOnce();
    expect(r.createRelease).not.toHaveBeenCalled();
    expect(await r.run(['rev-parse', 'main'], r.remote)).toBe(r.initial);
  });

  it('rejects a publication without inspection or from another renderer', async () => {
    const r = await releaseRepository();
    await expect(r.workflow.create(r.event, r.params)).rejects.toThrow();
    const state = await r.workflow.inspect(r.event, r.params);
    const otherEvent = { sender: { ...r.event.sender, id: 9 } } as typeof r.event;
    await expect(r.workflow.create(otherEvent, { ...r.params, targetInspection: { id: state.inspectionId, mode: 'remote' } })).rejects.toThrow();
    expect(r.createRelease).not.toHaveBeenCalled();
  });

  it('times out a network inspection without creating a release', async () => {
    const r = await releaseRepository();
    let networkSignal: AbortSignal | undefined;
    vi.mocked(r.gitService.runner.withExclusiveWrite).mockImplementation(async (_repo, _command, work) =>
      work({
        run: async (_cwd, args, options) => {
          if (args[0] === 'ls-remote')
            return new Promise<string>((_resolve, reject) => {
              networkSignal = options!.signal!;
              networkSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            });
          if (args[0] === 'remote') return 'https://github.com/acme/project.git';
          if (args.includes('--abbrev-ref')) return 'main';
          if (args[0] === 'for-each-ref') return `${r.initial} refs/heads/main`;
          return r.initial;
        },
        buffer: vi.fn(),
        input: vi.fn(),
      }),
    );
    vi.useFakeTimers();
    try {
      const result = expect(r.workflow.inspect(r.event, r.params)).rejects.toThrow('60 Sekunden');
      await vi.waitFor(() => expect(networkSignal).toBeDefined());
      await vi.advanceTimersByTimeAsync(60_001);
      await result;
      expect(networkSignal?.aborted).toBe(true);
      expect(r.createRelease).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
