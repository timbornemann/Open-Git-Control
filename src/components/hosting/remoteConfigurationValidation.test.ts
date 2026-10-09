import { expect, it } from 'vitest';
import type { GitRemoteSnapshotDto, RemotePreferences } from '@/types/remoteTransfers';
import { remoteConfigurationIssue, remoteConfigurationPushTargets } from './remoteConfigurationValidation';

const snapshot: GitRemoteSnapshotDto = {
  repoPath: 'C:/repo',
  branch: 'main',
  upstream: null,
  defaultPushRemote: null,
  supportsPushUrlIsolation: true,
  remotes: [
    { name: 'primary', fetchUrls: ['https://one.test/repo.git'], pushUrls: ['https://one.test/repo.git'] },
    { name: 'backup', fetchUrls: ['https://two.test/repo.git'], pushUrls: ['https://two.test/repo.git'] },
  ],
};
const tr = (_de: string, en: string) => en;

it('explains an incomplete direct selection but permits asking before the transfer', () => {
  expect(remoteConfigurationIssue(snapshot, { selectionModes: { push: 'remember' }, pushRemotes: [] }, tr)).toContain('at least one push target');
  expect(remoteConfigurationIssue(snapshot, { selectionModes: { fetch: 'remember' } }, tr)).toContain('fetch source');
  expect(remoteConfigurationIssue(snapshot, { selectionModes: { push: 'ask' }, pushRemotes: [] }, tr)).toBeNull();
});

it.each(['explicit', 'profile'])('retains a missing %s backup target for correction instead of reducing a push', (kind) => {
  const prefs: RemotePreferences =
    kind === 'explicit'
      ? { pushRemotes: ['primary', 'removed-backup'] }
      : { activeProfileId: 'both', profiles: [{ id: 'both', name: 'Both', remoteNames: ['primary', 'removed-backup'] }] };
  expect(remoteConfigurationPushTargets(snapshot, prefs)).toEqual(['primary', 'removed-backup']);
  expect(remoteConfigurationIssue(snapshot, prefs, tr)).toContain('removed-backup');
});

it('explains a missing source even with only one remaining remote, and permits an explicit correction', () => {
  const single = { ...snapshot, remotes: [snapshot.remotes[0]] };
  expect(remoteConfigurationIssue(single, { pullRemote: 'removed' }, tr)).toContain('removed');
  expect(remoteConfigurationIssue(single, { pullRemote: 'primary', selectionModes: { pull: 'remember' } }, tr)).toBeNull();
  expect(remoteConfigurationPushTargets(single, { pushRemotes: [] })).toEqual(['primary']);
});
