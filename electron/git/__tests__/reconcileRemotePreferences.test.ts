import { describe, expect, it } from 'vitest';
import type { GitRemoteSnapshotDto, RemotePreferences } from '../../../src/types/remoteTransfers';
import { reconcileRemotePreferences } from '../reconcileRemotePreferences';
import { rememberRemoteTransferSelection, resolveRemoteTransferSelection } from '../../../src/shared/git/remoteTransferSelection';

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
  it('preserves remembered selection identity on rename, including separate pull and local branch mappings', () => {
    let prefs = preferences();
    const current = snapshot();
    prefs = rememberRemoteTransferSelection('fetch', current, prefs, { selectedRemoteNames: ['private'] }, 'remember');
    prefs = rememberRemoteTransferSelection('pull', current, prefs, { selectedRemoteNames: ['private'], branch: 'trunk' }, 'remember');
    prefs = rememberRemoteTransferSelection('push', current, prefs, { selectedRemoteNames: ['private'], targetBranches: { private: 'archive' } }, 'remember');
    const next = snapshot('forgejo');
    const renamed = reconcileRemotePreferences(prefs, { action: 'rename', name: 'private', newName: 'forgejo' }, next);
    expect(renamed.pullRemote).toBe('forgejo');
    expect(renamed.pullBranches).toEqual({ main: 'trunk' });
    expect(renamed.pushBranches).toEqual({ main: { forgejo: 'archive' } });
    for (const action of ['fetch', 'pull', 'push'] as const) expect(resolveRemoteTransferSelection(action, next, renamed).state).toBe('ready');
  });
  it('invalidates the complete multi-target choice after removing a target rather than auto-pushing the survivor', () => {
    const current = snapshot();
    current.remotes.push({ name: 'backup', fetchUrls: ['https://backup.test/repo.git'], pushUrls: ['https://backup.test/repo.git'] });
    const prefs = rememberRemoteTransferSelection('push', current, preferences(), { selectedRemoteNames: ['private', 'backup'] }, 'remember');
    const next = snapshot();
    const removed = reconcileRemotePreferences(prefs, { action: 'remove', name: 'backup' }, next);
    expect(removed.pushRemotes).toEqual(['private']);
    expect(resolveRemoteTransferSelection('push', next, removed)).toMatchObject({ state: 'choose', reason: 'selection-invalid' });
  });
  it('invalidates only affected operation identities when a push URL changes', () => {
    let prefs = preferences();
    const current = snapshot();
    prefs = rememberRemoteTransferSelection('fetch', current, prefs, { selectedRemoteNames: ['private'] }, 'remember');
    prefs = rememberRemoteTransferSelection('push', current, prefs, { selectedRemoteNames: ['private'] }, 'remember');
    const next = snapshot();
    next.remotes[0].pushUrls = ['https://github.com/team/other.git'];
    const updated = reconcileRemotePreferences(prefs, { action: 'set-url', name: 'private', pushUrls: next.remotes[0].pushUrls }, next);
    expect(resolveRemoteTransferSelection('fetch', next, updated).state).toBe('ready');
    expect(resolveRemoteTransferSelection('push', next, updated).reason).toBe('selection-invalid');
  });
});
