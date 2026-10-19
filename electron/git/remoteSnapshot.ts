import type { GitRemoteSnapshotDto, GitPushPlanDto, RemotePreferences, RemoteTransferOperations } from '../../src/types/remoteTransfers';
import { displayUrl, lines, digest, type Runner } from './remoteTransferModels';
import { gitConfigurationEnvironment, refName } from './remoteTransferValidation';
import { lfsConfigurationStamp } from './GitLfsTransfers';
import { gitConfigurationEntries } from './GitConfigurationEntries';

export async function readPushSource(repoPath: string, git: Runner, currentBranch: string, input: RemoteTransferOperations['planPush']['input']) {
  const sourceBranch = input.sourceBranch === undefined ? currentBranch : refName(input.sourceBranch);
  if (!sourceBranch) throw new Error('Select a local branch before pushing.');
  await git.run(repoPath, ['check-ref-format', `refs/heads/${sourceBranch}`]);
  const destinationRef = `refs/heads/${refName(input.destinationBranch ?? sourceBranch)}`;
  await git.run(repoPath, ['check-ref-format', destinationRef]);
  const sourceOid = (await git.run(repoPath, ['rev-parse', '--verify', `refs/heads/${sourceBranch}^{commit}`])).trim();
  return { sourceBranch, destinationRef, sourceOid };
}

export async function assertPushSourceUnchanged(repoPath: string, git: Runner, plan: GitPushPlanDto) {
  const branches = plan.branchRefs ?? (plan.sourceBranch ? [{ sourceBranch: plan.sourceBranch, sourceOid: plan.sourceOid }] : []);
  for (const branch of branches)
    if ((await git.run(repoPath, ['rev-parse', '--verify', `refs/heads/${branch.sourceBranch}^{commit}`])).trim() !== branch.sourceOid)
      throw new Error('A selected source branch changed. Create a new push plan.');
  // Explicit publication mappings stop on local ref changes. Ordinary pushes
  // retain their existing behavior of publishing the captured immutable tag OID.
  for (const tag of plan.branchRefs ? (plan.tagRefs ?? []) : [])
    if ((await git.run(repoPath, ['rev-parse', '--verify', `refs/tags/${tag.name}`])).trim() !== tag.oid)
      throw new Error('A selected tag changed. Create a new push plan.');
}

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

export async function remoteConfigurationFingerprint(
  repoPath: string,
  git: Pick<Runner, 'run' | 'runResult'> & Partial<Pick<Runner, 'runBuffer'>>,
  preferences: RemotePreferences,
  configuration?: string,
): Promise<string> {
  const config = configuration ?? (await git.run(repoPath, ['config', '--null', '--list']));
  // Authentication/lock capability caches do not change the captured LFS destination.
  const stable = config
    .split('\0')
    .filter((entry) => !/^lfs\..*\.(?:access|locksverify)\n/.test(entry))
    .join('\0');
  return digest([stable, preferences, await lfsConfigurationStamp(repoPath, git)]);
}

/** One request-owned configuration snapshot feeds both selection and validation. */
export async function readPushPlanningContext(repoPath: string, git: Runner, preferences: RemotePreferences, supportsIsolation: boolean, signal?: AbortSignal) {
  const config = await git.run(repoPath, ['config', '--null', '--list'], { signal });
  const [snapshot, fingerprint] = await Promise.all([
    readRemoteSnapshot(repoPath, git, supportsIsolation, config),
    remoteConfigurationFingerprint(repoPath, git, preferences, config),
  ]);
  return { snapshot, fingerprint };
}

export async function readRemoteSnapshot(
  repoPath: string,
  git: Pick<Runner, 'run' | 'runResult'>,
  supportsPushUrlIsolation: boolean,
  configuration?: string,
): Promise<GitRemoteSnapshotDto> {
  const optional = async (args: string[]) => {
    const result = await git.runResult(repoPath, args);
    return result.exitCode === 0 ? result.stdout.trim() : '';
  };
  const [rawNames, branch, rawConfig] = await Promise.all([
    git.run(repoPath, ['remote']),
    optional(['symbolic-ref', '--quiet', '--short', 'HEAD']),
    configuration ?? git.run(repoPath, ['config', '--null', '--list']),
  ]);
  const names = lines(rawNames);
  const values = new Map(gitConfigurationEntries(rawConfig));
  const remotes = await Promise.all(
    names.map(async (name) => {
      const [fetch, push] = await Promise.all([
        git.run(repoPath, ['remote', 'get-url', '--all', name]),
        git.run(repoPath, ['remote', 'get-url', '--push', '--all', name]),
      ]);
      return { name, fetchUrls: lines(fetch).map(displayUrl), pushUrls: lines(push).map(displayUrl) };
    }),
  );
  const upstreamRemote = branch ? (values.get(`branch.${branch}.remote`) ?? '') : '';
  const upstreamRef = branch ? (values.get(`branch.${branch}.merge`) ?? '') : '';
  const preferred =
    (branch ? values.get(`branch.${branch}.pushremote`) : '') ||
    values.get('remote.pushdefault') ||
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
