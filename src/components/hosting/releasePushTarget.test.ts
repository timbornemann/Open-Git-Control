import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hostingClient, transferClient } from '@/services/hostingClient';
import { resolveReleasePushTarget } from './releasePushTarget';
import type { HostedRepository, HostedRepositoryRef } from '@/types/hostingDtos';
import type { GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';

vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: vi.fn() }, transferClient: { request: vi.fn() } }));
const repository: HostedRepositoryRef = { connectionId: 'private', repositoryId: '42', fullPath: 'team/demo' };
const privateUrl = 'ssh://git@private-alias/team/demo.git';
const backupUrl = 'https://github.com/team/demo.git';
const snapshot: GitRemoteSnapshotDto = {
  repoPath: '/repo/demo',
  branch: 'main',
  upstream: null,
  defaultPushRemote: 'origin',
  supportsPushUrlIsolation: true,
  remotes: [{ name: 'origin', fetchUrls: ['https://forgejo.example/team/demo.git'], pushUrls: [privateUrl, backupUrl] }],
};
let preferences: RemotePreferences;
beforeEach(() => {
  vi.clearAllMocks();
  preferences = {};
  vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getRemotes' ? snapshot : preferences));
  vi.mocked(hostingClient.request).mockResolvedValue(null);
});

describe('release push destination identity', () => {
  it('selects only the explicit hosting URL from a named remote with backup push URLs', async () => {
    expect(await resolveReleasePushTarget('/repo/demo', 'origin', repository, privateUrl)).toEqual({ origin: [privateUrl] });
    expect(hostingClient.request).not.toHaveBeenCalled();
  });

  it('uses an exact SSH alias binding when fetch and push URLs differ', async () => {
    preferences.bindings = [{ remoteName: 'origin', url: privateUrl, repository, credentialMode: 'hosting' }];
    expect(await resolveReleasePushTarget('/repo/demo', 'origin', repository, snapshot.remotes[0].fetchUrls[0])).toEqual({ origin: [privateUrl] });
    expect(hostingClient.request).not.toHaveBeenCalled();
  });

  it('resolves push URLs through the selected account and rejects equal IDs from another namespace', async () => {
    vi.mocked(hostingClient.request).mockImplementation(async (_operation, input) => {
      const url = (input as { url: string }).url;
      return { ref: url === privateUrl ? repository : { ...repository, fullPath: 'other/demo' } } as HostedRepository;
    });
    expect(await resolveReleasePushTarget('/repo/demo', 'origin', repository)).toEqual({ origin: [privateUrl] });
    expect(hostingClient.request).toHaveBeenCalledWith('resolveRepository', { connectionId: 'private', url: privateUrl });
  });

  it('does not fall back to a backup when the selected account cannot resolve its private endpoint', async () => {
    preferences.bindings = [{ remoteName: 'origin', url: backupUrl, repository: { ...repository, connectionId: 'github' } }];
    vi.mocked(hostingClient.request).mockRejectedValue(new Error('Server unreachable'));
    await expect(resolveReleasePushTarget('/repo/demo', 'origin', repository)).rejects.toThrow('No push URL matches');
  });

  it('rejects a removed explicit remote', async () => {
    await expect(resolveReleasePushTarget('/repo/demo', 'removed', repository)).rejects.toThrow('no longer exists');
  });
});
