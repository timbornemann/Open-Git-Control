import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitIdentityStatus } from '@/shared/ipc/gitIdentity';
import { gitIdentityClient } from '@/services/gitIdentityClient';
import { ensureCommitIdentity, finishGitIdentitySetup, setGitIdentityRepository, useGitIdentityStore } from './gitIdentityStore';

const status: GitIdentityStatus = {
  repoPath: '/repo',
  scope: 'repository',
  name: '',
  email: '',
  ready: false,
  missing: ['name', 'email'],
  revision: 'a'.repeat(64),
};
beforeEach(() => {
  useGitIdentityStore.setState({ activeRepo: undefined, generation: 0, request: null });
  vi.spyOn(gitIdentityClient, 'read').mockResolvedValue({ success: true, data: status });
});
afterEach(() => {
  const pending = useGitIdentityStore.getState().request;
  if (pending) finishGitIdentitySetup(pending.id, false);
  vi.restoreAllMocks();
});

describe('commit identity preflight', () => {
  it('checks configured identities afresh and never asks to overwrite valid settings', async () => {
    vi.mocked(gitIdentityClient.read).mockResolvedValue({ success: true, data: { ...status, ready: true } });
    expect(await ensureCommitIdentity('/repo')).toBe(true);
    expect(await ensureCommitIdentity('/repo')).toBe(true);
    expect(gitIdentityClient.read).toHaveBeenCalledTimes(2);
    expect(useGitIdentityStore.getState().request).toBeNull();
  });
  it.each([true, false])('coalesces concurrent commits and resumes only after the matching dialog result (%s)', async (ready) => {
    setGitIdentityRepository('/repo');
    const first = ensureCommitIdentity('/repo'),
      second = ensureCommitIdentity('/repo');
    expect(first).toBe(second);
    await Promise.resolve();
    const request = useGitIdentityStore.getState().request!;
    expect(request.status).toBe(status);
    finishGitIdentitySetup(request.id + 1, true);
    expect(useGitIdentityStore.getState().request).toBe(request);
    finishGitIdentitySetup(request.id, ready);
    expect(await first).toBe(ready);
    expect(gitIdentityClient.read).toHaveBeenCalledTimes(1);
  });
  it('cancels an open dialog on a repository switch and ignores late completion', async () => {
    setGitIdentityRepository('/repo');
    const pending = ensureCommitIdentity('/repo');
    await Promise.resolve();
    const id = useGitIdentityStore.getState().request!.id;
    setGitIdentityRepository('/other');
    finishGitIdentitySetup(id, true);
    expect(await pending).toBe(false);
    expect(await ensureCommitIdentity('/repo')).toBe(false);
  });
  it('ignores a late inspection after switching away and back and allows a new check', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof gitIdentityClient.read>>) => void;
    vi.mocked(gitIdentityClient.read).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    setGitIdentityRepository('/repo');
    const pending = ensureCommitIdentity('/repo');
    setGitIdentityRepository('/other');
    setGitIdentityRepository('/repo');
    resolve({ success: true, data: status });
    expect(await pending).toBe(false);
    expect(useGitIdentityStore.getState().request).toBeNull();
    vi.mocked(gitIdentityClient.read).mockResolvedValue({ success: true, data: { ...status, ready: true } });
    expect(await ensureCommitIdentity('/repo')).toBe(true);
  });
  it('returns read failures to the existing notification flow', async () => {
    vi.mocked(gitIdentityClient.read).mockResolvedValue({ success: false, error: 'Git unavailable' });
    await expect(ensureCommitIdentity('/repo')).rejects.toThrow('Git unavailable');
    expect(useGitIdentityStore.getState().request).toBeNull();
  });
});
