import type { RepositoryEndpoint } from '../../types/hostingDtos';
import type { GitRemoteSnapshotDto, RemotePreferences, RemoteSelectionMode, RemoteSelectionSnapshot, RemoteTransferAction } from '../../types/remoteTransfers';

export interface RemoteTransferSelection {
  selectedRemoteNames: string[];
  remote?: string;
  branch: string;
  targetBranches: Record<string, string>;
}
export interface RemoteTransferResolution extends RemoteTransferSelection {
  state: 'ready' | 'choose' | 'configure';
  reason: 'single-remote' | 'remembered' | 'first-choice' | 'always-ask' | 'selection-invalid' | 'no-remotes' | 'no-branch';
}

function gitSource(snapshot: GitRemoteSnapshotDto): string | undefined {
  const names = snapshot.remotes.map((remote) => remote.name);
  if (snapshot.upstream && names.includes(snapshot.upstream.remote)) return snapshot.upstream.remote;
  if (names.includes('origin')) return 'origin';
  return names.length === 1 ? names[0] : undefined;
}

function selectedNames(action: RemoteTransferAction, snapshot: GitRemoteSnapshotDto, preferences: RemotePreferences): string[] {
  if (action === 'push') {
    const profile = preferences.profiles?.find((candidate) => candidate.id === preferences.activeProfileId);
    return preferences.pushRemotes ?? profile?.remoteNames ?? (snapshot.defaultPushRemote ? [snapshot.defaultPushRemote] : []);
  }
  const selected = action === 'pull' ? (preferences.pullRemote ?? preferences.fetchRemote) : preferences.fetchRemote;
  const source = selected ?? gitSource(snapshot);
  return source ? [source] : [];
}

function ownValue<T>(values: Record<string, T> | undefined, key: string): T | undefined {
  return values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

/** Suggestions never authorize a transfer; the resolver checks the saved identity separately. */
export function getRemoteTransferDefaults(
  action: RemoteTransferAction,
  snapshot: GitRemoteSnapshotDto,
  preferences: RemotePreferences,
): RemoteTransferSelection {
  const available = new Set(snapshot.remotes.map((remote) => remote.name));
  const names = selectedNames(action, snapshot, preferences).filter((name) => available.has(name));
  if (!names.length && snapshot.remotes.length === 1) names.push(snapshot.remotes[0].name);
  const remote = action === 'push' ? undefined : names[0];
  const branch =
    action === 'pull'
      ? ((preferences.pullRemote === remote ? ownValue(preferences.pullBranches, snapshot.branch) : undefined) ??
        (snapshot.upstream && snapshot.upstream.remote === remote ? snapshot.upstream.branch : snapshot.branch))
      : snapshot.branch;
  const profile = preferences.profiles?.find((candidate) => candidate.id === preferences.activeProfileId);
  const targetBranches = Object.fromEntries(
    names.map((name) => [
      name,
      ownValue(ownValue(preferences.pushBranches, snapshot.branch), name) ??
        (preferences.selectionModes?.push === undefined ? (ownValue(profile?.targetBranches, name) ?? profile?.destinationBranch) : undefined) ??
        snapshot.branch,
    ]),
  );
  return { selectedRemoteNames: names, ...(remote ? { remote } : {}), branch, targetBranches };
}

function bindingIdentity(binding: RepositoryEndpoint): RepositoryEndpoint {
  return {
    remoteName: binding.remoteName,
    url: binding.url,
    repository: binding.repository
      ? { connectionId: binding.repository.connectionId, repositoryId: binding.repository.repositoryId, fullPath: binding.repository.fullPath }
      : null,
    credentialMode: binding.credentialMode ?? (binding.repository ? 'hosting' : 'system'),
  };
}

/** Capture only URLs and account choices used by this operation, preserving every push URL. */
export function createRemoteSelectionSnapshot(
  action: RemoteTransferAction,
  snapshot: GitRemoteSnapshotDto,
  preferences: RemotePreferences,
  names: string[],
): RemoteSelectionSnapshot {
  if (!names.length || new Set(names).size !== names.length || (action !== 'push' && names.length !== 1))
    throw new Error('A transfer needs a complete remote selection.');
  return {
    remotes: [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const remote = snapshot.remotes.find((candidate) => candidate.name === name);
        if (!remote) throw new Error('The selected remote no longer exists.');
        const urls = action === 'push' ? remote.pushUrls : remote.fetchUrls;
        if (!urls.length) throw new Error('The selected remote has no transfer URL.');
        const bindings = (preferences.bindings ?? [])
          .filter((binding) => binding.remoteName === name && urls.includes(binding.url))
          .map(bindingIdentity)
          .sort((a, b) => a.url.localeCompare(b.url));
        return { name, urls: [...urls], bindings };
      }),
  };
}

export function isRemoteSelectionValid(action: RemoteTransferAction, snapshot: GitRemoteSnapshotDto, preferences: RemotePreferences): boolean {
  const stored = preferences.selectionSnapshots?.[action];
  if (!stored) return false;
  try {
    const current = createRemoteSelectionSnapshot(action, snapshot, preferences, selectedNames(action, snapshot, preferences));
    return JSON.stringify(current) === JSON.stringify(stored);
  } catch {
    return false;
  }
}

export function resolveRemoteTransferSelection(
  action: RemoteTransferAction,
  snapshot: GitRemoteSnapshotDto,
  preferences: RemotePreferences,
): RemoteTransferResolution {
  const defaults = getRemoteTransferDefaults(action, snapshot, preferences);
  const result = (state: RemoteTransferResolution['state'], reason: RemoteTransferResolution['reason']) => ({ ...defaults, state, reason });
  if (!snapshot.remotes.length) return result('configure', 'no-remotes');
  if (action !== 'fetch' && !snapshot.branch) return result('configure', 'no-branch');
  const mode = preferences.selectionModes?.[action];
  if (preferences.selectionSnapshots?.[action] && !isRemoteSelectionValid(action, snapshot, preferences)) return result('choose', 'selection-invalid');
  if (mode === 'remember' && !isRemoteSelectionValid(action, snapshot, preferences)) return result('choose', 'selection-invalid');
  if (snapshot.remotes.length === 1) {
    if (action === 'push' && mode === undefined) defaults.targetBranches = { [snapshot.remotes[0].name]: snapshot.branch };
    return result('ready', 'single-remote');
  }
  if (mode === 'remember') return result('ready', 'remembered');
  return result('choose', mode === 'ask' ? 'always-ask' : 'first-choice');
}

export function rememberRemoteTransferSelection(
  action: RemoteTransferAction,
  snapshot: GitRemoteSnapshotDto,
  preferences: RemotePreferences,
  selection: { selectedRemoteNames: string[]; branch?: string; targetBranches?: Record<string, string> },
  mode: RemoteSelectionMode,
): RemotePreferences {
  const stamp = createRemoteSelectionSnapshot(action, snapshot, preferences, selection.selectedRemoteNames);
  const next: RemotePreferences = {
    ...preferences,
    selectionModes: { ...preferences.selectionModes, [action]: mode },
    selectionSnapshots: { ...preferences.selectionSnapshots, [action]: stamp },
  };
  if (action === 'fetch') next.fetchRemote = selection.selectedRemoteNames[0];
  if (action === 'pull') {
    next.pullRemote = selection.selectedRemoteNames[0];
    if (snapshot.branch && selection.branch) next.pullBranches = { ...preferences.pullBranches, [snapshot.branch]: selection.branch };
  }
  if (action === 'push') {
    next.pushRemotes = [...selection.selectedRemoteNames];
    if (snapshot.branch) {
      const branches = Object.fromEntries(
        selection.selectedRemoteNames.map((name) => [name, ownValue(selection.targetBranches, name) || selection.branch || snapshot.branch]),
      );
      next.pushBranches = { ...preferences.pushBranches, [snapshot.branch]: branches };
    }
  }
  return next;
}

/** Background synchronization does not prompt and only applies explicitly remembered choices. */
export function getBackgroundFetchRemote(snapshot: GitRemoteSnapshotDto, preferences: RemotePreferences): string | undefined {
  if (preferences.selectionModes?.fetch === 'remember') return isRemoteSelectionValid('fetch', snapshot, preferences) ? preferences.fetchRemote : undefined;
  return gitSource(snapshot);
}
