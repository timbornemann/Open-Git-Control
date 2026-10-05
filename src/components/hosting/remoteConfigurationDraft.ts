import type { GitRemoteSnapshotDto, RemotePreferences, RemoteTransferAction } from '@/types/remoteTransfers';
import { getRemoteTransferDefaults, rememberRemoteTransferSelection } from '@/utils/remoteTransferSelection';

const key = (repoPath: string) => `open-git-control:remote-config-draft:${encodeURIComponent(repoPath)}`;
const identity = (snapshot: GitRemoteSnapshotDto) => JSON.stringify(snapshot.remotes);
type Draft = { version: 1; preferences: RemotePreferences; baseline: RemotePreferences; identity: string };

export function readRemoteConfigurationDraft(snapshot: GitRemoteSnapshotDto, baseline: RemotePreferences): RemotePreferences | null {
  try {
    const raw = window.sessionStorage.getItem(key(snapshot.repoPath));
    if (!raw) return null;
    const stored = JSON.parse(raw) as Draft;
    if (stored.version !== 1 || stored.identity !== identity(snapshot) || JSON.stringify(stored.baseline) !== JSON.stringify(baseline)) {
      clearRemoteConfigurationDraft(snapshot.repoPath);
      return null;
    }
    return stored.preferences && typeof stored.preferences === 'object' ? stored.preferences : null;
  } catch {
    return null;
  }
}

export function writeRemoteConfigurationDraft(snapshot: GitRemoteSnapshotDto, preferences: RemotePreferences, baseline: RemotePreferences): void {
  try {
    window.sessionStorage.setItem(key(snapshot.repoPath), JSON.stringify({ version: 1, preferences, baseline, identity: identity(snapshot) } satisfies Draft));
  } catch {
    /* An unavailable session store must not prevent editing. */
  }
}

export function clearRemoteConfigurationDraft(repoPath: string): void {
  try {
    window.sessionStorage.removeItem(key(repoPath));
  } catch {
    /* Keep the in-memory editor usable. */
  }
}

/** Preserve choices after explicit Git mutations while dropping removed endpoints. */
export function rebaseRemoteConfigurationDraft(before: GitRemoteSnapshotDto, after: GitRemoteSnapshotDto, draft: RemotePreferences): RemotePreferences {
  const rename = (name: string | undefined) => {
    if (!name) return undefined;
    if (after.remotes.some((remote) => remote.name === name)) return name;
    const previous = before.remotes.find((remote) => remote.name === name);
    const matches = previous
      ? after.remotes.filter((remote) => JSON.stringify([remote.fetchUrls, remote.pushUrls]) === JSON.stringify([previous.fetchUrls, previous.pushUrls]))
      : [];
    return matches.length === 1 ? matches[0].name : undefined;
  };
  const mapTargets = (targets: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(targets).flatMap(([name, branch]) => {
        const next = rename(name);
        return next ? [[next, branch]] : [];
      }),
    );
  const bindings = (draft.bindings ?? []).flatMap((binding) => {
    const name = rename(binding.remoteName);
    const remote = after.remotes.find((candidate) => candidate.name === name);
    return remote && [...remote.fetchUrls, ...remote.pushUrls].includes(binding.url) ? [{ ...binding, remoteName: remote.name }] : [];
  });
  const hostingRemote = rename(draft.hostingRemote);
  const hasHostingBinding = bindings.some(
    (binding) =>
      binding.remoteName === hostingRemote &&
      binding.repository?.connectionId === draft.hostingRepository?.connectionId &&
      binding.repository?.repositoryId === draft.hostingRepository?.repositoryId &&
      binding.repository?.fullPath === draft.hostingRepository?.fullPath,
  );
  const profiles = draft.profiles
    ?.map((profile) => ({
      ...profile,
      remoteNames: profile.remoteNames.map(rename).filter((name): name is string => Boolean(name)),
      targetBranches: mapTargets(profile.targetBranches ?? {}),
    }))
    .filter((profile) => profile.remoteNames.length);
  return {
    ...draft,
    fetchRemote: rename(draft.fetchRemote),
    pullRemote: rename(draft.pullRemote),
    pushRemotes: draft.pushRemotes?.map(rename).filter((name): name is string => Boolean(name)),
    pushBranches: Object.fromEntries(Object.entries(draft.pushBranches ?? {}).map(([branch, targets]) => [branch, mapTargets(targets)])),
    bindings,
    hostingRemote: hasHostingBinding ? hostingRemote : undefined,
    hostingRepository: hasHostingBinding ? draft.hostingRepository : undefined,
    profiles,
    activeProfileId: profiles?.some((profile) => profile.id === draft.activeProfileId) ? draft.activeProfileId : undefined,
  };
}

/** Save records the explicit page choices; it never prepares or performs a transfer. */
export function stampRemoteConfiguration(snapshot: GitRemoteSnapshotDto, preferences: RemotePreferences): RemotePreferences {
  let next = { ...preferences };
  for (const action of ['fetch', 'pull', 'push'] satisfies RemoteTransferAction[]) {
    const defaults = getRemoteTransferDefaults(action, snapshot, preferences);
    const configuredNames =
      action === 'push'
        ? (preferences.pushRemotes ?? [])
        : [action === 'fetch' ? preferences.fetchRemote : preferences.pullRemote].filter((name): name is string => Boolean(name));
    const mode = preferences.selectionModes?.[action] ?? 'ask';
    const names = configuredNames.length ? configuredNames : mode === 'remember' ? defaults.selectedRemoteNames : [];
    if (mode === 'remember' && !names.length) throw new Error(`Select ${action === 'push' ? 'push targets' : `a ${action} source`} before saving.`);
    if (names.length) {
      next = rememberRemoteTransferSelection(
        action,
        snapshot,
        next,
        { selectedRemoteNames: names, branch: defaults.branch, targetBranches: defaults.targetBranches },
        mode,
      );
    } else {
      const snapshots = { ...next.selectionSnapshots };
      delete snapshots[action];
      next = { ...next, selectionModes: { ...next.selectionModes, [action]: mode }, selectionSnapshots: snapshots };
    }
  }
  // Normal transfers always choose tags explicitly in their own review.
  // Empty inputs mean dynamic Git defaults, rather than literal saved defaults.
  next.pullBranches = preferences.pullBranches;
  next.pushBranches = preferences.pushBranches;
  next.profiles = next.profiles?.map(({ id, name, remoteNames, destinationBranch, targetBranches }) => ({
    id,
    name,
    remoteNames,
    destinationBranch,
    targetBranches,
  }));
  return next;
}
