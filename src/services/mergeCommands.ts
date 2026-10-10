import type { GitCommandName } from '@/shared/ipc/gitCommands';
import type { MergeIntoBranchRequest } from '@/shared/git/merge';

export const mergeCommands = {
  buildMergeBranchArgs(mergeTarget: string, flags: string[] = []): [GitCommandName, ...string[]] {
    return ['merge', ...flags, mergeTarget];
  },
  buildMergeIntoBranchArgs(request: MergeIntoBranchRequest): [GitCommandName, ...string[]] {
    return ['mergeIntoBranch', request.sourceBranch, request.targetBranch, request.mode, request.sourceOid, request.targetOid];
  },
};
