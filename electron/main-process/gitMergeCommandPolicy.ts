import { MERGE_MODES, type MergeIntoBranchRequest } from '../../src/shared/git/merge';
import type { GitMergeMode } from '../../src/types/git';

export function parseMergeIntoBranchArgs(args: string[]): MergeIntoBranchRequest {
  const [sourceBranch, targetBranch, mode, sourceOid, targetOid] = args;
  if (args.length !== 5 || !MERGE_MODES.includes(mode as GitMergeMode)) throw new Error('Invalid merge request.');
  if (!sourceBranch || sourceBranch.startsWith('-')) throw new Error('Invalid source branch.');
  if (!targetBranch || targetBranch.startsWith('-')) throw new Error('Invalid target branch.');
  if (![sourceOid, targetOid].every((oid) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(oid))) throw new Error('Full branch commit IDs are required.');
  return { sourceBranch, targetBranch, mode: mode as GitMergeMode, sourceOid, targetOid };
}
