// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import { rebaseRemoteConfigurationDraft, stampRemoteConfiguration } from './remoteConfigurationDraft';
const before: GitRemoteSnapshotDto = {
  repoPath: 'C:/repo',
  branch: 'main',
  upstream: null,
  defaultPushRemote: null,
  supportsPushUrlIsolation: true,
  remotes: [{ name: 'private', fetchUrls: ['https://server/repo.git'], pushUrls: ['https://server/repo.git'] }],
};
const binding = {
  remoteName: 'private',
  url: 'https://server/repo.git',
  repository: { connectionId: 'account', repositoryId: '1', fullPath: 'team/repo' },
  credentialMode: 'hosting' as const,
};
it('rebases a draft across an explicit rename without losing branch mappings or account choices', () => {
  const draft: RemotePreferences = {
    fetchRemote: 'private',
    pullRemote: 'private',
    pushRemotes: ['private'],
    pushBranches: { main: { private: 'production' } },
    bindings: [binding],
    hostingRemote: 'private',
    hostingRepository: binding.repository,
    selectionModes: { fetch: 'remember' },
  };
  const after = { ...before, remotes: [{ ...before.remotes[0], name: 'internal' }] };
  expect(rebaseRemoteConfigurationDraft(before, after, draft)).toMatchObject({
    fetchRemote: 'internal',
    pullRemote: 'internal',
    pushRemotes: ['internal'],
    pushBranches: { main: { internal: 'production' } },
    bindings: [{ remoteName: 'internal', repository: binding.repository }],
    hostingRemote: 'internal',
  });
});
it('drops old endpoint bindings and their hosting target when the native URL changes', () => {
  const after = { ...before, remotes: [{ ...before.remotes[0], fetchUrls: ['https://other/repo.git'], pushUrls: ['https://other/repo.git'] }] };
  const next = rebaseRemoteConfigurationDraft(before, after, {
    fetchRemote: 'private',
    bindings: [binding],
    hostingRemote: 'private',
    hostingRepository: binding.repository,
  });
  expect(next.bindings).toEqual([]);
  expect(next.hostingRepository).toBeUndefined();
  expect(next.hostingRemote).toBeUndefined();
});
it('saves identity choices without inventing branch mappings or saving normal-transfer tags', () => {
  const result = stampRemoteConfiguration(before, {
    fetchRemote: 'private',
    pullRemote: 'private',
    pushRemotes: ['private'],
    profiles: [{ id: '1', name: 'Backup', remoteNames: ['private'], tagNames: ['v1'] }],
  });
  expect(result.selectionSnapshots?.push).toBeDefined();
  expect(result.pullBranches).toBeUndefined();
  expect(result.pushBranches).toBeUndefined();
  expect(result.profiles?.[0].tagNames).toBeUndefined();
  expect(result).not.toHaveProperty('force');
});

it('remembers the Git default when the user enables saved selection without manually selecting a source or targets', () => {
  const modes = { fetch: 'remember', pull: 'remember', push: 'remember' } as const;
  const current = { ...before, upstream: { remote: 'private', branch: 'trunk' } };
  const saved = stampRemoteConfiguration(current, { selectionModes: modes });
  expect(saved).toMatchObject({ fetchRemote: 'private', pullRemote: 'private', pushRemotes: ['private'], selectionModes: modes });
  expect(saved.selectionSnapshots?.push?.remotes[0].name).toBe('private');
  expect(saved.pullBranches).toBeUndefined();
  expect(saved.pushBranches).toBeUndefined();
});

it('rejects an empty remembered push selection on multiple remotes instead of saving unusable rules', () => {
  const current = { ...before, remotes: [...before.remotes, { ...before.remotes[0], name: 'backup' }] };
  expect(() => stampRemoteConfiguration(current, { selectionModes: { push: 'remember' }, pushRemotes: [] })).toThrow('Select push targets');
});
