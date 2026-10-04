import type { GitPushTargetDto, GitPushTargetResultDto } from '../../src/types/remoteTransfers';
import { redactGitSensitiveText } from './GitErrorFormatter';
import type { CredentialEnvironmentFactory, RemoteTransferContext, Runner, StoredPlan } from './remoteTransferModels';
import { lines } from './remoteTransferModels';
import { gitConfigurationEnvironment } from './remoteTransferValidation';
import { pushResult, type PublishedRef } from './remotePushResults';

export function assertGroupedCredentialChoices(targets: GitPushTargetDto[], connections: Record<string, string | null>): void {
  for (const name of new Set(targets.filter((target) => target.grouped).map((target) => target.remoteName))) {
    const accounts = new Set(targets.filter((target) => target.remoteName === name).map((target) => connections[target.id]));
    if (accounts.size > 1)
      throw new Error('This Git cannot select different hosting accounts within a grouped remote. Use separate named remotes or update Git.');
  }
}

/** Older Git can still publish a whole named remote, without unsafe endpoint-specific overrides. */
export async function runGroupedRemotePush(
  git: Runner,
  credentials: CredentialEnvironmentFactory | undefined,
  repoPath: string,
  plan: StoredPlan,
  targets: GitPushTargetDto[],
  context: RemoteTransferContext,
  advertised: (target: GitPushTargetDto, refs: PublishedRef[]) => Promise<Map<string, string>>,
): Promise<GitPushTargetResultDto[]> {
  if (plan.dto.force) throw new Error('Force-with-lease requires isolated push URLs. Use separate named remotes or update Git.');
  assertGroupedCredentialChoices(targets, plan.connections);
  const first = targets[0];
  const connectionId = plan.connections[first.id];
  const refs = plan.refs.map((ref) => (ref.destinationRef.startsWith('refs/heads/') ? { ...ref, destinationRef: first.destinationRef } : ref));
  const base = gitConfigurationEnvironment([
    ['push.followTags', 'false'],
    [`remote.${first.remoteName}.mirror`, 'false'],
  ]);
  const scope = await credentials?.({
    connectionId,
    urls: targets.map((target) => target.url).filter((url) => /^https:\/\//i.test(url)),
    signal: context.signal,
    envOverrides: base,
    expectedGeneration: connectionId ? plan.credentialGenerations[connectionId] : undefined,
  });
  let result;
  try {
    context.ensureActive();
    const signal = scope?.signal ? AbortSignal.any([...(context.signal ? [context.signal] : []), scope.signal]) : context.signal;
    const envOverrides = scope?.envOverrides ?? base;
    const actualUrls = new Set(lines(await git.run(repoPath, ['remote', 'get-url', '--push', '--all', first.remoteName], { envOverrides, signal })));
    if (actualUrls.size !== targets.length || targets.some((target) => !actualUrls.has(target.url)))
      throw new Error('The grouped push URL list changed after review. Create a new push plan.');
    result = await git.runResult(
      repoPath,
      [
        'push',
        '--porcelain',
        '--no-follow-tags',
        '--recurse-submodules=no',
        '--',
        first.remoteName,
        ...refs.map((ref) => `${ref.sourceOid}:${ref.destinationRef}`),
      ],
      { envOverrides, signal },
    );
  } finally {
    await scope?.dispose();
  }
  const outcomes: GitPushTargetResultDto[] = [];
  for (const target of targets) {
    context.onProgress?.(`Verifying grouped push: ${target.remoteName} (${target.url})`);
    try {
      context.ensureActive();
      const actual = await advertised(target, refs);
      const summary = pushResult(target, result);
      const refResults = refs.map((ref) => ({
        ...ref,
        status: actual.get(ref.destinationRef) === ref.sourceOid ? ('up-to-date' as const) : ('unknown' as const),
        message:
          actual.get(ref.destinationRef) === ref.sourceOid
            ? 'The captured revision is present on this endpoint.'
            : 'Publication of the captured revision could not be confirmed.',
      }));
      const confirmed = refResults.every((ref) => ref.status === 'up-to-date');
      outcomes.push({
        ...target,
        status: confirmed ? (result.exitCode === 0 && summary.status !== 'up-to-date' ? 'success' : 'up-to-date') : 'unknown',
        message: confirmed ? 'All captured refs were verified on this grouped endpoint.' : redactGitSensitiveText(summary.message),
        refResults,
      });
    } catch (error) {
      outcomes.push({
        ...target,
        status: 'unknown',
        message: redactGitSensitiveText(error instanceof Error ? error.message : 'Grouped endpoint publication is unknown.'),
      });
    }
  }
  return outcomes;
}
