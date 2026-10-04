import type { GitRemoteSnapshotDto, RemoteMutation, RemotePreferences } from '../../src/types/remoteTransfers';

/** Keep identities and credential choices bound to URLs that still exist after a remote edit. */
export function reconcileRemotePreferences(preferences: RemotePreferences, mutation: RemoteMutation, snapshot: GitRemoteSnapshotDto): RemotePreferences {
  const name = mutation.name;
  const rename = (value: string) => (value === name && mutation.action === 'rename' ? mutation.newName! : value);
  const keep = (value: string) => value !== name || mutation.action !== 'remove';
  if (preferences.hostingRemote && !keep(preferences.hostingRemote)) {
    delete preferences.hostingRemote;
    delete preferences.hostingRepository;
  } else if (preferences.hostingRemote) preferences.hostingRemote = rename(preferences.hostingRemote);
  if (preferences.fetchRemote && !keep(preferences.fetchRemote)) delete preferences.fetchRemote;
  else if (preferences.fetchRemote) preferences.fetchRemote = rename(preferences.fetchRemote);
  preferences.pushRemotes = preferences.pushRemotes?.filter(keep).map(rename);
  preferences.profiles = preferences.profiles?.map((profile) => ({
    ...profile,
    remoteNames: profile.remoteNames.filter(keep).map(rename),
    ...(profile.targetBranches
      ? {
          targetBranches: Object.fromEntries(
            Object.entries(profile.targetBranches)
              .filter(([key]) => keep(key))
              .map(([key, value]) => [rename(key), value]),
          ),
        }
      : {}),
  }));
  const updated = snapshot.remotes.find((remote) => remote.name === name);
  const urls = new Set([...(updated?.fetchUrls ?? []), ...(updated?.pushUrls ?? [])]);
  preferences.bindings = preferences.bindings
    ?.filter((binding) => keep(binding.remoteName) && (mutation.action !== 'set-url' || binding.remoteName !== name || urls.has(binding.url)))
    .map((binding) => ({ ...binding, remoteName: rename(binding.remoteName) }));
  return preferences;
}
