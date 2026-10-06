import type { GitRemoteSnapshotDto, RemotePreferences } from '../../src/types/remoteTransfers';
import { displayUrl, lines, digest, type Runner } from './remoteTransferModels';
import { gitConfigurationEnvironment } from './remoteTransferValidation';
import { lfsConfigurationStamp } from './GitLfsTransfers';

export async function probePushUrlIsolation(repoPath: string, git: Runner): Promise<boolean | undefined> {
  // The probe needs an existing named remote; all overrides are process-local.
  const name = lines(await git.run(repoPath, ['remote']))[0];
  if (!name) return undefined;
  const expected = 'https://ogc.invalid/probe-second.git';
  const envOverrides = gitConfigurationEnvironment([
    [`remote.${name}.url`, 'https://ogc.invalid/probe.git'],
    [`remote.${name}.pushurl`, 'https://ogc.invalid/probe-first.git'],
    [`remote.${name}.pushurl`, ''],
    [`remote.${name}.pushurl`, expected],
  ]);
  const result = await git.runResult(repoPath, ['remote', 'get-url', '--push', '--all', name], { envOverrides });
  return result.exitCode === 0 && result.stdout.trim() === expected;
}

export async function remoteConfigurationFingerprint(repoPath: string, git: Runner, preferences: RemotePreferences): Promise<string> {
  const config = await git.run(repoPath, ['config', '--null', '--list']);
  // Authentication/lock capability caches do not change the captured LFS destination.
  const stable = config
    .split('\0')
    .filter((entry) => !/^lfs\..*\.(?:access|locksverify)\n/.test(entry))
    .join('\0');
  return digest([stable, preferences, await lfsConfigurationStamp(repoPath, git)]);
}

export async function readRemoteSnapshot(repoPath: string, git: Runner, supportsPushUrlIsolation: boolean): Promise<GitRemoteSnapshotDto> {
  const optional = async (args: string[]) => {
    const result = await git.runResult(repoPath, args);
    return result.exitCode === 0 ? result.stdout.trim() : '';
  };
  const names = lines(await git.run(repoPath, ['remote']));
  const remotes = [];
  for (const name of names) {
    const fetchUrls = lines(await git.run(repoPath, ['remote', 'get-url', '--all', name]));
    const pushUrls = lines(await git.run(repoPath, ['remote', 'get-url', '--push', '--all', name]));
    remotes.push({ name, fetchUrls: fetchUrls.map(displayUrl), pushUrls: pushUrls.map(displayUrl) });
  }
  const branch = await optional(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const upstreamRemote = branch ? await optional(['config', '--get', `branch.${branch}.remote`]) : '';
  const upstreamRef = branch ? await optional(['config', '--get', `branch.${branch}.merge`]) : '';
  const preferred =
    (branch ? await optional(['config', '--get', `branch.${branch}.pushRemote`]) : '') ||
    (await optional(['config', '--get', 'remote.pushDefault'])) ||
    upstreamRemote ||
    (names.includes('origin') ? 'origin' : names.length === 1 ? names[0] : '');
  return {
    repoPath,
    branch,
    upstream: upstreamRemote && upstreamRef ? { remote: upstreamRemote, branch: upstreamRef.replace(/^refs\/heads\//, '') } : null,
    defaultPushRemote: preferred || null,
    remotes,
    supportsPushUrlIsolation,
  };
}
