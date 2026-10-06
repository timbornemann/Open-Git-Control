import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseEndpointResolver, releaseCredentialUrls } from '../HostingReleaseEndpoint';
import { RemotePreferencesStore } from '../../git/RemotePreferencesStore';
import type { HostingAdapter } from '../HostingAdapter';
afterEach(() => vi.restoreAllMocks());
const repository = { connectionId: 'selected', repositoryId: '42', fullPath: 'group/repo' };
describe('release endpoint identity', () => {
  it('keeps explicit system credentials and SSH outside the account broker', () => {
    vi.spyOn(RemotePreferencesStore.prototype, 'read').mockReturnValue({
      bindings: [{ remoteName: 'origin', url: 'https://system.example/group/repo.git', repository, credentialMode: 'system' }],
    });
    expect(releaseCredentialUrls('C:/repo', 'origin', ['fetch', 'https://system.example/group/repo.git', 'git@private:group/repo.git'])).toEqual([]);
    expect(releaseCredentialUrls('C:/repo', 'origin', ['ls-remote', 'https://forge.example/group/repo.git'])).toEqual(['https://forge.example/group/repo.git']);
  });
  it('accepts an explicitly bound SSH alias and rejects a binding to another account or namespace', async () => {
    const read = vi.spyOn(RemotePreferencesStore.prototype, 'read').mockReturnValue({
      bindings: [
        { remoteName: 'origin', url: 'git@private-alias:group/repo.git', repository },
        { remoteName: 'origin', url: 'git@other-alias:group/repo.git', repository: { ...repository, connectionId: 'other' } },
        { remoteName: 'origin', url: 'git@namespace-alias:other/repo.git', repository: { ...repository, fullPath: 'other/repo' } },
      ],
    });
    const resolveRepository = vi.fn(async () => null);
    const resolver = releaseEndpointResolver('C:/repo', 'origin', repository, { resolveRepository } as unknown as HostingAdapter);
    expect(await resolver.matches('git@private-alias:group/repo.git')).toBe(true);
    expect(await resolver.matches('git@other-alias:group/repo.git')).toBe(false);
    expect(await resolver.matches('git@namespace-alias:other/repo.git')).toBe(false);
    expect(resolveRepository).not.toHaveBeenCalled();
    read.mockReturnValue({});
    expect(() => resolver.assertCurrent()).toThrow('binding changed');
  });
  it('resolves unbound URLs with the selected adapter and checks the complete repository identity', async () => {
    vi.spyOn(RemotePreferencesStore.prototype, 'read').mockReturnValue({});
    const resolveRepository = vi
      .fn()
      .mockResolvedValueOnce({ ref: repository })
      .mockResolvedValueOnce({ ref: { ...repository, fullPath: 'other/repo' } });
    const resolver = releaseEndpointResolver('C:/repo', 'origin', repository, { resolveRepository } as unknown as HostingAdapter);
    expect(await resolver.matches('https://forge.example/group/repo.git')).toBe(true);
    expect(await resolver.matches('https://forge.example/other/repo.git')).toBe(false);
    expect(() => resolver.assertCurrent()).not.toThrow();
  });
});
