// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitIdentityClient } from './gitIdentityClient';

afterEach(() => vi.unstubAllGlobals());
describe('Git identity client', () => {
  it('exposes availability and passes explicit context without a cache or hosting account', async () => {
    vi.stubGlobal('window', {});
    expect(gitIdentityClient.isAvailable()).toBe(false);
    const getGitIdentity = vi.fn().mockResolvedValue({ success: true, data: { ready: true } });
    const saveGitIdentity = vi.fn().mockResolvedValue({ success: false, error: 'config locked' });
    vi.stubGlobal('window', { electronAPI: { git: { getGitIdentity, saveGitIdentity } } });
    expect(gitIdentityClient.isAvailable()).toBe(true);
    const read = { repoPath: '/repo', scope: 'repository' as const };
    expect(await gitIdentityClient.read(read)).toMatchObject({ success: true });
    await gitIdentityClient.read(read);
    expect(getGitIdentity).toHaveBeenCalledTimes(2);
    expect(getGitIdentity).toHaveBeenCalledWith(read);
    const save = { repoPath: null, scope: 'global' as const, name: 'Name', email: 'name@example.invalid', expectedRevision: 'revision' };
    expect(await gitIdentityClient.save(save)).toEqual({ success: false, error: 'config locked' });
    expect(saveGitIdentity).toHaveBeenCalledExactlyOnceWith(save);
  });
});
