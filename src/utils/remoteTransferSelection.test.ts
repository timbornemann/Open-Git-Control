import { describe, expect, it } from 'vitest';
import type { GitRemoteSnapshotDto, RemotePreferences, RemoteTransferAction } from '../types/remoteTransfers';
import {
  createRemoteSelectionSnapshot,
  getBackgroundFetchRemote,
  getRemoteTransferDefaults,
  isRemoteSelectionValid,
  rememberRemoteTransferSelection,
  resolveRemoteTransferSelection,
} from './remoteTransferSelection';

function snapshot(names = ['origin', 'backup']): GitRemoteSnapshotDto {
  return {
    repoPath: '/repo',
    branch: 'feature/demo',
    upstream: { remote: 'origin', branch: 'review/demo' },
    defaultPushRemote: 'origin',
    supportsPushUrlIsolation: true,
    remotes: names.map((name) => ({ name, fetchUrls: [`https://${name}.test/team/repo.git`], pushUrls: [`ssh://git@${name}.test/team/repo.git`] })),
  };
}

function remember(action: RemoteTransferAction, preferences: RemotePreferences = {}, names = ['origin']): RemotePreferences {
  return rememberRemoteTransferSelection(action, snapshot(), preferences, { selectedRemoteNames: names }, 'remember');
}

describe('remote transfer selection', () => {
  it.each(['fetch', 'pull', 'push'] as const)('starts %s immediately with a single remote', (action) => {
    expect(resolveRemoteTransferSelection(action, snapshot(['origin']), {})).toMatchObject({
      state: 'ready',
      reason: 'single-remote',
      selectedRemoteNames: ['origin'],
    });
  });

  it.each(['fetch', 'pull', 'push'] as const)('asks for %s on multiple remotes until that action is remembered', (action) => {
    expect(resolveRemoteTransferSelection(action, snapshot(), {})).toMatchObject({ state: 'choose', reason: 'first-choice' });
    const preferences = remember(action);
    expect(resolveRemoteTransferSelection(action, snapshot(), preferences)).toMatchObject({ state: 'ready', reason: 'remembered' });
    const other = action === 'pull' ? 'fetch' : 'pull';
    expect(resolveRemoteTransferSelection(other, snapshot(), preferences).state).toBe('choose');
  });

  it('keeps ask mode independent and applies it to every repeated transfer', () => {
    const preferences = rememberRemoteTransferSelection('fetch', snapshot(), remember('push'), { selectedRemoteNames: ['backup'] }, 'ask');
    expect(resolveRemoteTransferSelection('fetch', snapshot(), preferences)).toMatchObject({ state: 'choose', reason: 'always-ask', remote: 'backup' });
    expect(resolveRemoteTransferSelection('push', snapshot(), preferences).state).toBe('ready');
    expect(resolveRemoteTransferSelection('fetch', snapshot(['backup']), preferences).state).toBe('ready');
  });

  it('uses tracking only when its remote matches the chosen pull source', () => {
    expect(getRemoteTransferDefaults('pull', snapshot(), { pullRemote: 'origin' }).branch).toBe('review/demo');
    expect(getRemoteTransferDefaults('pull', snapshot(), { pullRemote: 'backup' }).branch).toBe('feature/demo');
    const preferences = rememberRemoteTransferSelection('pull', snapshot(), {}, { selectedRemoteNames: ['backup'], branch: 'private/demo' }, 'remember');
    expect(resolveRemoteTransferSelection('pull', snapshot(), preferences).branch).toBe('private/demo');
    expect(resolveRemoteTransferSelection('pull', { ...snapshot(), branch: 'another' }, preferences).branch).toBe('another');
    expect(getRemoteTransferDefaults('pull', snapshot(['origin']), { pullRemote: 'missing', pullBranches: { 'feature/demo': 'old/private' } }).branch).toBe(
      'review/demo',
    );
  });

  it('uses an explicit common push destination unless a target has its own mapping', () => {
    const preferences = rememberRemoteTransferSelection(
      'push',
      snapshot(),
      {},
      {
        selectedRemoteNames: ['origin', 'backup'],
        branch: 'shared/demo',
        targetBranches: { backup: 'private/demo' },
      },
      'remember',
    );
    expect(resolveRemoteTransferSelection('push', snapshot(), preferences).targetBranches).toEqual({ origin: 'shared/demo', backup: 'private/demo' });
  });

  it('treats ordinary branch and remote names matching JavaScript object keys as strings', () => {
    const current = { ...snapshot(['constructor']), branch: 'toString', upstream: null, defaultPushRemote: 'constructor' };
    expect(resolveRemoteTransferSelection('push', current, { pushBranches: {} }).targetBranches).toEqual({ constructor: 'toString' });
    expect(getRemoteTransferDefaults('pull', current, { pullRemote: 'constructor', pullBranches: {} }).branch).toBe('toString');
  });

  it('preserves all push URLs and records per-local-branch target mappings', () => {
    const current = snapshot();
    current.remotes[1].pushUrls.push('https://second-backup.test/team/repo.git');
    const preferences = rememberRemoteTransferSelection(
      'push',
      current,
      {},
      {
        selectedRemoteNames: ['origin', 'backup'],
        targetBranches: { origin: 'public/demo', backup: 'private/demo' },
      },
      'remember',
    );
    expect(preferences.selectionSnapshots!.push!.remotes.find((remote) => remote.name === 'backup')!.urls).toEqual(current.remotes[1].pushUrls);
    expect(resolveRemoteTransferSelection('push', current, preferences)).toMatchObject({
      state: 'ready',
      selectedRemoteNames: ['origin', 'backup'],
      targetBranches: { origin: 'public/demo', backup: 'private/demo' },
    });
    expect(resolveRemoteTransferSelection('push', { ...current, branch: 'next' }, preferences).targetBranches).toEqual({ origin: 'next', backup: 'next' });
  });

  it('does not add profile tags or force to ordinary transfer defaults', () => {
    const preferences: RemotePreferences = {
      profiles: [{ id: 'backup', name: 'Backup', remoteNames: ['origin', 'backup'], tagNames: ['v1'], destinationBranch: 'release' }],
      activeProfileId: 'backup',
    };
    const selection = getRemoteTransferDefaults('push', snapshot(), preferences);
    expect(selection.selectedRemoteNames).toEqual(['origin', 'backup']);
    expect(selection).not.toHaveProperty('tagNames');
    expect(selection).not.toHaveProperty('force');
    const saved = rememberRemoteTransferSelection('push', snapshot(), preferences, selection, 'remember');
    expect(resolveRemoteTransferSelection('push', { ...snapshot(), branch: 'new-branch' }, saved).targetBranches).toEqual({
      origin: 'new-branch',
      backup: 'new-branch',
    });
  });

  it('does not authorize legacy preferences or an unstamped remember mode', () => {
    expect(resolveRemoteTransferSelection('push', snapshot(), { pushRemotes: ['origin'] }).reason).toBe('first-choice');
    expect(resolveRemoteTransferSelection('push', snapshot(), { pushRemotes: ['origin'], selectionModes: { push: 'remember' } }).reason).toBe(
      'selection-invalid',
    );
    const legacyProfile = { id: 'release', name: 'Release', remoteNames: ['origin'], destinationBranch: 'release' };
    expect(resolveRemoteTransferSelection('push', snapshot(['origin']), { profiles: [legacyProfile], activeProfileId: 'release' }).targetBranches).toEqual({
      origin: 'feature/demo',
    });
  });

  it('requires a new decision when a URL changes, even with only one remote left', () => {
    const preferences = remember('fetch');
    const next = snapshot(['origin']);
    next.remotes[0].fetchUrls = ['https://different.test/team/repo.git'];
    expect(resolveRemoteTransferSelection('fetch', next, preferences)).toMatchObject({ state: 'choose', reason: 'selection-invalid' });
  });

  it('does not shrink remembered multi-push targets when one target disappears', () => {
    const preferences = remember('push', {}, ['origin', 'backup']);
    expect(resolveRemoteTransferSelection('push', snapshot(['origin']), preferences)).toMatchObject({ state: 'choose', reason: 'selection-invalid' });
  });

  it.each(['connectionId', 'repositoryId', 'fullPath'] as const)('invalidates a saved choice when binding %s changes', (field) => {
    const current = snapshot();
    const preferences = remember('fetch', {
      bindings: [
        { remoteName: 'origin', url: current.remotes[0].fetchUrls[0], repository: { connectionId: 'account', repositoryId: '1', fullPath: 'team/repo' } },
      ],
    });
    preferences.bindings![0].repository![field] = 'changed';
    expect(isRemoteSelectionValid('fetch', current, preferences)).toBe(false);
  });

  it('keeps source and push identity checks limited to the URLs each operation uses', () => {
    const preferences = remember('fetch');
    const next = snapshot();
    next.remotes[0].pushUrls = ['https://new-backup.test/team/repo.git'];
    expect(isRemoteSelectionValid('fetch', next, preferences)).toBe(true);
    const bound = remember('fetch', {
      bindings: [{ remoteName: 'origin', url: next.remotes[0].fetchUrls[0], repository: null, credentialMode: 'system' }],
    });
    bound.bindings![0].credentialMode = 'hosting';
    expect(isRemoteSelectionValid('fetch', snapshot(), bound)).toBe(false);
  });

  it('uses a remembered fetch source in the background and Git defaults for ask/unset/invalid settings', () => {
    const preferences = remember('fetch', {}, ['backup']);
    expect(getBackgroundFetchRemote(snapshot(), preferences)).toBe('backup');
    expect(getBackgroundFetchRemote(snapshot(), { ...preferences, selectionModes: { fetch: 'ask' } })).toBe('origin');
    expect(getBackgroundFetchRemote(snapshot(), { fetchRemote: 'backup' })).toBe('origin');
    expect(getBackgroundFetchRemote(snapshot(['origin']), preferences)).toBeUndefined();
    expect(getBackgroundFetchRemote({ ...snapshot(['backup', 'private']), upstream: null }, {})).toBeUndefined();
  });

  it('requests configuration when there is no remote or no current branch', () => {
    expect(resolveRemoteTransferSelection('fetch', snapshot([]), {})).toMatchObject({ state: 'configure', reason: 'no-remotes' });
    expect(resolveRemoteTransferSelection('push', { ...snapshot(), branch: '' }, {})).toMatchObject({ state: 'configure', reason: 'no-branch' });
    expect(resolveRemoteTransferSelection('fetch', { ...snapshot(['origin']), branch: '' }, {}).state).toBe('ready');
  });

  it('rejects incomplete or duplicated selection snapshots', () => {
    expect(() => createRemoteSelectionSnapshot('push', snapshot(), {}, ['missing'])).toThrow();
    expect(() => createRemoteSelectionSnapshot('push', snapshot(), {}, ['origin', 'origin'])).toThrow();
    expect(() => createRemoteSelectionSnapshot('pull', snapshot(), {}, ['origin', 'backup'])).toThrow();
  });
});
