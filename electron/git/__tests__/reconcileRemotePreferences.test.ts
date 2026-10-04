import { describe, expect, it } from 'vitest';
import type { GitRemoteSnapshotDto, RemotePreferences } from '../../../src/types/remoteTransfers';
import { reconcileRemotePreferences } from '../reconcileRemotePreferences';

describe('remote preference reconciliation', () => {
  const identity = { connectionId: 'forgejo-account', repositoryId: '1', fullPath: 'team/private' };
  const preferences = (): RemotePreferences => ({
    hostingRemote: 'private',
    hostingRepository: identity,
    fetchRemote: 'private',
    pushRemotes: ['private'],
    profiles: [{ id: 'mixed', name: 'Mixed', remoteNames: ['private'], targetBranches: { private: 'trunk' } }],
    bindings: [
      { remoteName: 'private', url: 'git@alias:team/private.git', repository: identity, credentialMode: 'system' },
      { remoteName: 'private', url: 'https://github.com/team/old.git', repository: { ...identity, connectionId: 'github-account' } },
    ],
  });
  const snapshot = (name = 'private'): GitRemoteSnapshotDto => ({
    repoPath: '/repo',
    branch: 'main',
    upstream: null,
    defaultPushRemote: name,
    supportsPushUrlIsolation: true,
    remotes: [{ name, fetchUrls: ['git@alias:team/private.git'], pushUrls: ['https://github.com/team/new.git'] }],
  });
  it('retains the unchanged fetch identity and native Git choice when a backup URL changes', () => {
    const result = reconcileRemotePreferences(preferences(), { action: 'set-url', name: 'private' }, snapshot());
    expect(result.bindings).toEqual([preferences().bindings![0]]);
    expect(result.hostingRepository).toEqual(identity);
  });
  it('moves branch mappings and endpoint identities on rename and removes them on removal', () => {
    const renamed = reconcileRemotePreferences(preferences(), { action: 'rename', name: 'private', newName: 'forgejo' }, snapshot('forgejo'));
    expect(renamed.profiles![0].targetBranches).toEqual({ forgejo: 'trunk' });
    expect(renamed.bindings!.every((binding) => binding.remoteName === 'forgejo')).toBe(true);
    const removed = reconcileRemotePreferences(renamed, { action: 'remove', name: 'forgejo' }, { ...snapshot(), remotes: [] });
    expect(removed.bindings).toEqual([]);
    expect(removed.profiles![0].targetBranches).toEqual({});
    expect(removed.hostingRepository).toBeUndefined();
    expect(removed.fetchRemote).toBeUndefined();
  });
});
