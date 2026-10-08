import { readPushSource } from './remoteSnapshot';
import { refName } from './remoteTransferValidation';
import type { Runner } from './remoteTransferModels';
import type { PublishedRef } from './remotePushResults';
import type { GitPushPlanDto, RemoteTransferOperations } from '../../src/types/remoteTransfers';

/** Resolve every explicitly selected ref before the immutable plan is created. */
export async function capturePushRefs(repoPath: string, git: Runner, currentBranch: string, input: RemoteTransferOperations['planPush']['input']) {
  const branchTargets = input.branchTargets;
  if (
    branchTargets &&
    (!Array.isArray(branchTargets) ||
      !branchTargets.length ||
      branchTargets.length > 64 ||
      input.force ||
      input.sourceBranch !== undefined ||
      input.destinationBranch !== undefined ||
      input.targetBranches !== undefined)
  )
    throw new Error('Explicit branch mappings require one to 64 branches without force or conflicting branch options.');
  const primary = branchTargets?.[0];
  const source = await readPushSource(
    repoPath,
    git,
    currentBranch,
    primary ? { ...input, sourceBranch: primary.sourceBranch, destinationBranch: primary.destinationBranch } : input,
  );
  const branchRefs = branchTargets ? ([] as NonNullable<GitPushPlanDto['branchRefs']>) : undefined;
  if (!Array.isArray(input.tagNames ?? [])) throw new Error('Invalid selected tags.');
  const tagNames = [...new Set(input.tagNames ?? [])];
  if (tagNames.length > 64) throw new Error('Invalid selected tags.');
  const refs: PublishedRef[] = branchRefs ? [] : [{ sourceOid: source.sourceOid, destinationRef: source.destinationRef }];
  for (const mapping of branchTargets ?? []) {
    const captured = await readPushSource(repoPath, git, currentBranch, {
      ...input,
      sourceBranch: mapping.sourceBranch,
      destinationBranch: mapping.destinationBranch,
    });
    if (refs.some((ref) => ref.destinationRef === captured.destinationRef)) throw new Error('Each destination branch may be selected only once.');
    refs.push({ sourceOid: captured.sourceOid, destinationRef: captured.destinationRef });
    branchRefs!.push({
      sourceBranch: captured.sourceBranch,
      destinationBranch: captured.destinationRef.slice('refs/heads/'.length),
      sourceOid: captured.sourceOid,
    });
  }
  const tagRefs: NonNullable<GitPushPlanDto['tagRefs']> = [];
  for (const name of tagNames) {
    const tagRef = `refs/tags/${refName(name)}`;
    await git.run(repoPath, ['check-ref-format', tagRef]);
    const oid = (await git.run(repoPath, ['rev-parse', '--verify', tagRef])).trim();
    refs.push({ sourceOid: oid, destinationRef: tagRef });
    tagRefs.push({ name, oid });
  }
  return { ...source, refs, branchRefs, tagNames, tagRefs };
}
