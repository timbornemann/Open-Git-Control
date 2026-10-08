import { randomUUID } from 'crypto';
import { readPushSource } from './remoteSnapshot';
import { referencedLfsObjects, lfsEndpoint } from './GitLfsTransfers';
import { assertGroupedCredentialChoices } from './groupedRemotePush';
import { isolatedPushEnvironment, normalizeTargetBranches, resolvePushTargetUrls, refName, remoteName, remoteUrl } from './remoteTransferValidation';
import { digest, boundCredentialGenerations, PLAN_LIFETIME, type Runner, type StoredPlan, type RemoteTransferContext } from './remoteTransferModels';
import type { PublishedRef } from './remotePushResults';
import type { GitRemoteSnapshotDto, GitPushPlanDto, GitPushTargetDto, RemotePreferences, RemoteTransferOperations } from '../../src/types/remoteTransfers';

type Dependencies = {
  git: Runner;
  getPreferences: () => RemotePreferences;
  getRemotes: () => Promise<GitRemoteSnapshotDto>;
  fingerprint: () => Promise<string>;
  getCredentialGeneration?: (id: string) => number;
  advertised: (target: GitPushTargetDto, refs: PublishedRef[]) => Promise<Map<string, string>>;
  connectionId: (name: string, url: string) => string | null;
};

export async function createPushPlan(
  repoPath: string,
  input: RemoteTransferOperations['planPush']['input'],
  context: RemoteTransferContext,
  dependencies: Dependencies,
): Promise<StoredPlan> {
  const initialFingerprint = await dependencies.fingerprint();
  const credentialGenerations = Object.fromEntries(
    (dependencies.getPreferences().bindings ?? [])
      .filter((binding) => binding.repository && binding.credentialMode !== 'system')
      .map((binding) => [binding.repository!.connectionId, dependencies.getCredentialGeneration?.(binding.repository!.connectionId) ?? 0]),
  );
  const snapshot = await dependencies.getRemotes();
  if (!Array.isArray(input.remoteNames) || !input.remoteNames.length || input.remoteNames.length > 32) throw new Error('Select at least one push remote.');
  const targetUrls = resolvePushTargetUrls(input.targetUrls, snapshot, input.remoteNames);
  const targetBranches = input.targetBranches ? normalizeTargetBranches(input.targetBranches, input.remoteNames) : {};
  if (input.force !== undefined && typeof input.force !== 'boolean') throw new Error('Invalid push mode.');
  const { sourceBranch, destinationRef, sourceOid } = await readPushSource(repoPath, dependencies.git, snapshot.branch, input);
  const tagNames = [...new Set(input.tagNames ?? [])];
  if (!Array.isArray(input.tagNames ?? []) || tagNames.length > 64) throw new Error('Invalid selected tags.');
  const refs: PublishedRef[] = [{ sourceOid, destinationRef }];
  for (const name of tagNames) {
    const tagRef = `refs/tags/${refName(name)}`;
    await dependencies.git.run(repoPath, ['check-ref-format', tagRef]);
    refs.push({ sourceOid: (await dependencies.git.run(repoPath, ['rev-parse', '--verify', tagRef])).trim(), destinationRef: tagRef });
  }
  const id = randomUUID();
  const lfsObjects = await referencedLfsObjects(
    repoPath,
    refs.map((ref) => ref.sourceOid),
    dependencies.git,
    { signal: context.signal },
  );
  const targets: GitPushTargetDto[] = [];
  for (const name of [...new Set(input.remoteNames.map(remoteName))]) {
    const targetDestinationRef = targetBranches[name] ? `refs/heads/${targetBranches[name]}` : destinationRef;
    await dependencies.git.run(repoPath, ['check-ref-format', targetDestinationRef]);
    const remote = snapshot.remotes.find((candidate) => candidate.name === name);
    if (!remote) throw new Error('Unknown push remote.');
    const grouped = remote.pushUrls.length > 1 && !snapshot.supportsPushUrlIsolation;
    if (grouped && input.force) throw new Error('Force-with-lease requires isolated push URLs. Update Git or configure separate named remotes.');
    for (const value of targetUrls[name]) {
      const url = remoteUrl(value);
      const target: GitPushTargetDto = { id: digest([id, name, url]).slice(0, 32), remoteName: name, url, destinationRef: targetDestinationRef, sourceOid };
      if (lfsObjects.length)
        target.lfsEndpoint = await lfsEndpoint(
          repoPath,
          name,
          dependencies.git,
          isolatedPushEnvironment(name, url, snapshot.supportsPushUrlIsolation),
          true,
          url,
        );
      if (grouped) target.grouped = true;
      if (input.force)
        target.leaseOid = (await dependencies.advertised(target, [{ sourceOid, destinationRef: targetDestinationRef }])).get(targetDestinationRef) ?? null;
      targets.push(target);
    }
  }
  if (!targets.length || targets.length > 64) throw new Error('Invalid push endpoint count.');
  const marker = `__ogc_transfer_scan_${id}__`;
  const dto: GitPushPlanDto = {
    id,
    repoPath,
    sourceOid,
    branch: snapshot.branch,
    ...(input.sourceBranch === undefined ? {} : { sourceBranch }),
    tagNames,
    force: input.force === true,
    targets,
    secretScanArgs: [marker, ...refs.map((ref) => `${ref.sourceOid}:${ref.destinationRef}`)],
    ...(lfsObjects.length ? { lfsObjects } : {}),
  };
  const fingerprint = await dependencies.fingerprint();
  if (fingerprint !== initialFingerprint) throw new Error('Remote configuration or account bindings changed while planning. Review the push again.');
  context.ensureActive();
  const connections = Object.fromEntries(targets.map((target) => [target.id, dependencies.connectionId(target.remoteName, target.url)]));
  assertGroupedCredentialChoices(targets, connections);
  return {
    dto,
    refs,
    fingerprint,
    ownerId: context.ownerId,
    generation: context.generation,
    expiresAt: Date.now() + PLAN_LIFETIME,
    executed: false,
    connections,
    credentialGenerations: boundCredentialGenerations(connections, credentialGenerations),
  };
}
