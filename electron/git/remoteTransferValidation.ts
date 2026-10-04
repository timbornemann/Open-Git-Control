import type { HostedRepositoryRef, RepositoryEndpoint } from '../../src/types/hostingDtos';
import type {
  GitRemoteSnapshotDto,
  RemotePreferences,
  RemoteSelectionMode,
  RemoteSelectionSnapshot,
  RemoteTransferAction,
} from '../../src/types/remoteTransfers';

const hasControls = (value: string): boolean => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function remoteName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 128 ||
    hasControls(value) ||
    /[\s~^:?*\[\\]/.test(value) ||
    value.startsWith('-') ||
    value.startsWith('/') ||
    value.includes('..') ||
    value.endsWith('/')
  )
    throw new Error('Invalid remote name.');
  return value;
}

export function remoteUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4_096 || hasControls(value) || value.startsWith('-') || /^[a-z][a-z0-9+.-]*::/i.test(value))
    throw new Error('Invalid Git remote URL.');
  const url = value.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]?.toLowerCase();
  if (scheme && !['https', 'http', 'ssh', 'git', 'file', 'ftp', 'ftps'].includes(scheme)) throw new Error('Unsupported Git remote transport.');
  if (scheme) {
    const parsed = new URL(url);
    if ((['http', 'https', 'ftp', 'ftps'].includes(scheme) && parsed.username) || parsed.password || parsed.search || parsed.hash)
      throw new Error('Use a credential-free remote URL and bind a hosting account instead.');
  }
  return url;
}

export function refName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 1_024 || hasControls(value) || /[\s~^:?*\[\\]/.test(value) || value.startsWith('-'))
    throw new Error('Invalid branch or tag name.');
  return value;
}

export function remoteFetchArguments(name: string, tagsOnly: boolean): string[] {
  if (typeof tagsOnly !== 'boolean') throw new Error('Invalid fetch mode.');
  return [
    'fetch',
    '--prune',
    '--no-tags',
    '--no-recurse-submodules',
    '--',
    name,
    ...(tagsOnly ? [`+refs/tags/*:refs/ogc/remote-tags/${remoteName(name)}/*`] : []),
  ];
}

function repositoryRef(value: unknown): HostedRepositoryRef | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') throw new Error('Invalid hosted repository binding.');
  const candidate = value as HostedRepositoryRef;
  if (
    ![candidate.connectionId, candidate.repositoryId, candidate.fullPath].every(
      (field) => typeof field === 'string' && field.length > 0 && field.length <= 2_048 && !hasControls(field),
    )
  )
    throw new Error('Invalid hosted repository binding.');
  return { connectionId: candidate.connectionId, repositoryId: candidate.repositoryId, fullPath: candidate.fullPath };
}

function stringList(value: unknown, normalize: (value: unknown) => string, limit: number): string[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error('Invalid remote preference list.');
  return [...new Set(value.map(normalize))];
}

function endpointBindings(value: unknown): RepositoryEndpoint[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error('Invalid endpoint bindings.');
  const bindings = value.map((binding) => {
    if (!binding || typeof binding !== 'object') throw new Error('Invalid endpoint binding.');
    if (binding.credentialMode !== undefined && !['hosting', 'system'].includes(binding.credentialMode)) throw new Error('Invalid endpoint credential mode.');
    return {
      remoteName: remoteName(binding.remoteName),
      url: remoteUrl(binding.url),
      repository: repositoryRef(binding.repository) ?? null,
      ...(binding.credentialMode ? { credentialMode: binding.credentialMode as 'hosting' | 'system' } : {}),
    };
  });
  const keys = bindings.map((binding) => `${binding.remoteName}\0${binding.url}`);
  if (new Set(keys).size !== keys.length) throw new Error('An endpoint can only be bound to one hosting account.');
  return bindings;
}

function objectEntries(value: unknown, limit: number, description: string): [string, unknown][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${description}.`);
  const entries = Object.entries(value);
  if (entries.length > limit) throw new Error(`Too many ${description}.`);
  return entries;
}

function selectionAction(value: string): RemoteTransferAction {
  if (!['fetch', 'pull', 'push'].includes(value)) throw new Error('Invalid transfer selection action.');
  return value as RemoteTransferAction;
}

function normalizeSelectionModes(value: unknown): Partial<Record<RemoteTransferAction, RemoteSelectionMode>> {
  return Object.fromEntries(
    objectEntries(value, 3, 'selection modes').map(([action, mode]) => {
      if (mode !== 'remember' && mode !== 'ask') throw new Error('Invalid transfer selection mode.');
      return [selectionAction(action), mode];
    }),
  );
}

function normalizeSelectionSnapshots(value: unknown): Partial<Record<RemoteTransferAction, RemoteSelectionSnapshot>> {
  return Object.fromEntries(
    objectEntries(value, 3, 'selection snapshots').map(([action, value]) => {
      selectionAction(action);
      const input = value as RemoteSelectionSnapshot;
      if (!input || typeof input !== 'object' || !Array.isArray(input.remotes) || !input.remotes.length || input.remotes.length > 32)
        throw new Error('Invalid transfer selection snapshot.');
      if (action !== 'push' && input.remotes.length !== 1) throw new Error('A source selection must contain exactly one remote.');
      const remotes = input.remotes.map((remote) => {
        if (!remote || typeof remote !== 'object') throw new Error('Invalid transfer selection remote.');
        const name = remoteName(remote.name);
        const urls = stringList(remote.urls, remoteUrl, 128);
        if (!urls.length) throw new Error('A selected remote needs a URL.');
        const bindings = endpointBindings(remote.bindings);
        if (bindings.some((binding) => binding.remoteName !== name || !urls.includes(binding.url)))
          throw new Error('Selection binding does not match its endpoint.');
        return { name, urls, bindings };
      });
      if (new Set(remotes.map((remote) => remote.name)).size !== remotes.length) throw new Error('Duplicate selected remote.');
      return [action, { remotes }];
    }),
  );
}

function normalizeBranchMappings(value: unknown): Record<string, string> {
  return Object.fromEntries(objectEntries(value, 256, 'branch mappings').map(([branch, destination]) => [refName(branch), refName(destination)]));
}

function normalizePushBranchMappings(value: unknown): Record<string, Record<string, string>> {
  return Object.fromEntries(
    objectEntries(value, 256, 'push branch mappings').map(([branch, targets]) => [
      refName(branch),
      Object.fromEntries(objectEntries(targets, 32, 'push target branches').map(([name, destination]) => [remoteName(name), refName(destination)])),
    ]),
  );
}

export function normalizeRemotePreferences(value: unknown): RemotePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid remote preferences.');
  const input = value as RemotePreferences;
  const result: RemotePreferences = {};
  if (input.hostingRemote !== undefined) result.hostingRemote = remoteName(input.hostingRemote);
  if (input.fetchRemote !== undefined) result.fetchRemote = remoteName(input.fetchRemote);
  if (input.pullRemote !== undefined) result.pullRemote = remoteName(input.pullRemote);
  if (input.selectionModes !== undefined) result.selectionModes = normalizeSelectionModes(input.selectionModes);
  if (input.selectionSnapshots !== undefined) result.selectionSnapshots = normalizeSelectionSnapshots(input.selectionSnapshots);
  if (input.pullBranches !== undefined) result.pullBranches = normalizeBranchMappings(input.pullBranches);
  if (input.pushBranches !== undefined) result.pushBranches = normalizePushBranchMappings(input.pushBranches);
  if (input.hostingRepository !== undefined) result.hostingRepository = repositoryRef(input.hostingRepository);
  if (input.pushRemotes !== undefined) result.pushRemotes = stringList(input.pushRemotes, remoteName, 32);
  if (input.bindings !== undefined) result.bindings = endpointBindings(input.bindings);
  if (input.profiles !== undefined) {
    if (!Array.isArray(input.profiles) || input.profiles.length > 32) throw new Error('Invalid push profiles.');
    const ids = new Set<string>();
    result.profiles = input.profiles.map((profile) => {
      if (typeof profile.id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(profile.id) || ids.has(profile.id))
        throw new Error('Invalid push profile identifier.');
      ids.add(profile.id);
      if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 128) throw new Error('Invalid push profile name.');
      return {
        id: profile.id,
        name: profile.name.trim(),
        remoteNames: stringList(profile.remoteNames, remoteName, 32),
        ...(profile.destinationBranch ? { destinationBranch: refName(profile.destinationBranch) } : {}),
        ...(profile.targetBranches ? { targetBranches: normalizeTargetBranches(profile.targetBranches, profile.remoteNames) } : {}),
        ...(profile.tagNames ? { tagNames: stringList(profile.tagNames, refName, 64) } : {}),
      };
    });
  }
  if (input.activeProfileId !== undefined) {
    if (typeof input.activeProfileId !== 'string' || !result.profiles?.some((profile) => profile.id === input.activeProfileId))
      throw new Error('Unknown active push profile.');
    result.activeProfileId = input.activeProfileId;
  }
  return result;
}

export function normalizeTargetBranches(value: unknown, names: string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid target branch mapping.');
  const entries = Object.entries(value);
  if (entries.length > 32 || entries.some(([name]) => !names.includes(remoteName(name))))
    throw new Error('Target branch mapping references an unselected remote.');
  return Object.fromEntries(entries.map(([name, branch]) => [name, refName(branch)]));
}

/** Stamps can intentionally reference obsolete endpoints; only active preferences need existing remotes. */
export function referencedRemotePreferenceNames(preferences: RemotePreferences): string[] {
  return [
    preferences.hostingRemote,
    preferences.fetchRemote,
    preferences.pullRemote,
    ...(preferences.pushRemotes ?? []),
    ...(preferences.profiles?.flatMap((profile) => profile.remoteNames) ?? []),
    ...(preferences.bindings?.map((binding) => binding.remoteName) ?? []),
    ...Object.values(preferences.pushBranches ?? {}).flatMap((mapping) => Object.keys(mapping)),
  ].filter((name): name is string => typeof name === 'string');
}

/** Explicit publication endpoints must be native URLs of the chosen named remotes. */
export function resolvePushTargetUrls(value: unknown, snapshot: GitRemoteSnapshotDto, names: string[]): Record<string, string[]> {
  const selections = value === undefined ? [] : objectEntries(value, 32, 'push target URL selections');
  const overrides = Object.fromEntries(
    selections.map(([name, urls]) => {
      if (!names.includes(remoteName(name))) throw new Error('Push URL selection references an unselected remote.');
      const selected = stringList(urls, remoteUrl, 128);
      if (!selected.length) throw new Error('A push URL selection cannot be empty.');
      return [name, selected];
    }),
  );
  return Object.fromEntries(
    [...new Set(names.map(remoteName))].map((name) => {
      const remote = snapshot.remotes.find((candidate) => candidate.name === name);
      if (!remote) throw new Error('Unknown push remote.');
      const nativeUrls = [...new Set(remote.pushUrls.map(remoteUrl))];
      const urls = Object.hasOwn(overrides, name) ? overrides[name] : nativeUrls;
      if (!urls.length || urls.some((url) => !nativeUrls.includes(url))) throw new Error('Selected push URL does not belong to this remote.');
      if (!snapshot.supportsPushUrlIsolation && remote.pushUrls.length > 1 && urls.length !== nativeUrls.length)
        throw new Error('Targeted push URL selection requires isolated push URLs. Configure separate named remotes or update Git.');
      return [name, urls];
    }),
  );
}

/** Git config runtime overlays are process-local and never stored in .git/config. */
export function gitConfigurationEnvironment(entries: [string, string][], base: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...base };
  let count = Number(env.GIT_CONFIG_COUNT ?? 0);
  if (!Number.isInteger(count) || count < 0 || count > 256) throw new Error('Invalid Git runtime configuration.');
  for (const [key, value] of entries) {
    env[`GIT_CONFIG_KEY_${count}`] = key;
    env[`GIT_CONFIG_VALUE_${count}`] = value;
    count += 1;
  }
  env.GIT_CONFIG_COUNT = String(count);
  return env;
}

export function isolatedPushEnvironment(name: string, url: string, isolate: boolean): NodeJS.ProcessEnv {
  const entries: [string, string][] = [
    ['push.followTags', 'false'],
    [`remote.${name}.mirror`, 'false'],
  ];
  if (isolate) entries.push([`remote.${name}.pushurl`, ''], [`remote.${name}.pushurl`, url]);
  return gitConfigurationEnvironment(entries);
}
