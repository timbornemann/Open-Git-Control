import type { GitRemoteDto, GitPullRecoveryDto, RemoteTransferOperations } from '../../src/types/remoteTransfers';
import type { RemoteTransferContext, Runner } from './remoteTransferModels';
import { redactGitSensitiveText } from './GitErrorFormatter';
import { pullStrategyArguments } from './GitPullConfiguration';
import { lfsEndpoint, lfsTransferEnvironment } from './GitLfsTransfers';
import { refName, remoteName } from './remoteTransferValidation';
import { isMissingRemoteBranchError } from '../../src/shared/git/pullErrors';

type Credentials = <T>(
  environment: NodeJS.ProcessEnv,
  work: (environment: NodeJS.ProcessEnv, signal?: AbortSignal) => Promise<T>,
  lfsUrls?: string[],
) => Promise<T>;
type RecoveryInput = RemoteTransferOperations['getPullRecovery']['input'];

export async function pullRemoteBranch(
  repoPath: string,
  input: RemoteTransferOperations['pull']['input'],
  remote: GitRemoteDto,
  context: RemoteTransferContext,
  git: Runner,
  credentials: Credentials,
): Promise<{ output: string }> {
  await git.run(repoPath, ['check-ref-format', `refs/heads/${refName(input.branch)}`]);
  const flags = pullStrategyArguments(input.mode, input.autostash);
  const endpoint = await lfsEndpoint(repoPath, input.remote, git).catch(() => '');
  const base = { ...(endpoint ? lfsTransferEnvironment({}, input.remote, endpoint, remote.fetchUrls[0]) : {}), GIT_MERGE_AUTOEDIT: 'no' };
  const output = await credentials(
    base,
    (envOverrides, signal) =>
      git.streamOutput(repoPath, ['pull', ...flags, '--no-recurse-submodules', '--', input.remote, input.branch], context.onProgress ?? (() => {}), signal, {
        envOverrides,
      }),
    endpoint ? [endpoint] : [],
  );
  context.ensureActive();
  return { output: redactGitSensitiveText(output) };
}

/** Ask the selected server, since remote-tracking refs and origin/HEAD may both be stale. */
export async function inspectPullRecovery(
  repoPath: string,
  input: RecoveryInput,
  context: RemoteTransferContext,
  git: Runner,
  envOverrides: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<GitPullRecoveryDto> {
  const name = remoteName(input.remote);
  const branchRef = `refs/heads/${refName(input.branch)}`;
  await git.run(repoPath, ['check-ref-format', branchRef], { signal });
  const output = await git.run(repoPath, ['ls-remote', '--symref', '--', name, 'HEAD', branchRef], {
    envOverrides,
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20_000)]),
  });
  const oid = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;
  const refs = new Map<string, string>();
  for (const line of output.trim().split(/\r?\n/)) {
    const [value, ref] = line.split('\t');
    if (ref && oid.test(value)) refs.set(ref, value);
  }
  const branchExists = oid.test(refs.get(branchRef) ?? '');
  const defaultRef = output.match(/^ref: (refs\/heads\/[^\r\n\t]+)\tHEAD\r?$/m)?.[1];
  // A detached or unborn remote HEAD cannot authorize a guessed main/master fallback.
  if (!defaultRef || !oid.test(refs.get('HEAD') ?? '')) return { branchExists, defaultBranch: null };
  const valid = await git.runResult(repoPath, ['check-ref-format', defaultRef], { signal });
  if (valid.exitCode !== 0) return { branchExists, defaultBranch: null };
  const [current, local] = await Promise.all([
    git.runResult(repoPath, ['symbolic-ref', '--quiet', 'HEAD'], { signal }),
    git.runResult(repoPath, ['show-ref', '--verify', '--quiet', defaultRef], { signal }),
  ]);
  for (const result of [current, local])
    if (![0, 1].includes(result.exitCode)) throw new Error(redactGitSensitiveText(result.stderr || 'Could not inspect local branches.'));
  context.ensureActive();
  return {
    branchExists,
    defaultBranch: current.stdout.trim() !== defaultRef ? { name: defaultRef.slice('refs/heads/'.length), localExists: local.exitCode === 0 } : null,
  };
}

/** Fetch only remote-tracking refs. The existing branch-change workflow owns the checkout. */
export async function preparePullRecovery(
  repoPath: string,
  input: RemoteTransferOperations['preparePullRecovery']['input'],
  context: RemoteTransferContext,
  git: Runner,
  envOverrides: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<GitPullRecoveryDto> {
  const expected = refName(input.defaultBranch);
  const recovery = await inspectPullRecovery(repoPath, input, context, git, envOverrides, signal);
  if (recovery.branchExists || recovery.defaultBranch?.name !== expected) throw new Error('The remote branches changed. Review pull recovery again.');
  context.ensureActive();
  try {
    await git.streamOutput(
      repoPath,
      ['fetch', '--prune', '--no-tags', '--no-recurse-submodules', '--', input.remote],
      context.onProgress ?? (() => {}),
      signal,
      {
        envOverrides,
      },
    );
  } catch (error) {
    // A single-branch clone can still explicitly fetch the now-deleted branch.
    if (!isMissingRemoteBranchError(error instanceof Error ? error.message : String(error))) throw error;
    context.ensureActive();
  }
  const trackingRef = `refs/remotes/${remoteName(input.remote)}/${expected}`;
  // Single-branch clones may exclude the server's default branch from their fetch refspec.
  await git.streamOutput(
    repoPath,
    ['fetch', '--no-tags', '--no-recurse-submodules', '--', input.remote, `+refs/heads/${expected}:${trackingRef}`],
    context.onProgress ?? (() => {}),
    signal,
    { envOverrides },
  );
  context.ensureActive();
  return recovery;
}
