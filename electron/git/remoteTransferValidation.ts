import type { HostedRepositoryRef } from '../../src/types/hostingDtos';
import type { RemotePreferences } from '../../src/types/remoteTransfers';

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

export function normalizeRemotePreferences(value: unknown): RemotePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid remote preferences.');
  const input = value as RemotePreferences;
  const result: RemotePreferences = {};
  if (input.hostingRemote !== undefined) result.hostingRemote = remoteName(input.hostingRemote);
  if (input.fetchRemote !== undefined) result.fetchRemote = remoteName(input.fetchRemote);
  if (input.hostingRepository !== undefined) result.hostingRepository = repositoryRef(input.hostingRepository);
  if (input.pushRemotes !== undefined) result.pushRemotes = stringList(input.pushRemotes, remoteName, 32);
  if (input.bindings !== undefined) {
    if (!Array.isArray(input.bindings) || input.bindings.length > 128) throw new Error('Invalid endpoint bindings.');
    result.bindings = input.bindings.map((binding) => {
      if (binding.credentialMode !== undefined && !['hosting', 'system'].includes(binding.credentialMode)) throw new Error('Invalid endpoint credential mode.');
      return {
        remoteName: remoteName(binding.remoteName),
        url: remoteUrl(binding.url),
        repository: repositoryRef(binding.repository) ?? null,
        ...(binding.credentialMode ? { credentialMode: binding.credentialMode } : {}),
      };
    });
    const keys = result.bindings.map((binding) => `${binding.remoteName}\0${binding.url}`);
    if (new Set(keys).size !== keys.length) throw new Error('An endpoint can only be bound to one hosting account.');
  }
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
