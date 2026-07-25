import { gitClient, type GitCommandArgs, type PushCurrentBranchOptions } from '@/services/gitClient';

export const gitWorkflowCommands = {
  setUpstreamForBranch(branchName: string, remote = 'origin'): GitCommandArgs {
    return gitClient.buildSetUpstreamBranchArgs(branchName, remote);
  },

  pushCurrentBranch(options: PushCurrentBranchOptions = {}): GitCommandArgs {
    return gitClient.buildPushCurrentBranchArgs(options);
  },

  pushBranchWithUpstream(branchName: string, remote = 'origin'): GitCommandArgs {
    return gitClient.buildPushCurrentBranchArgs({ remote, ref: branchName, setUpstream: true });
  },

  checkoutBranch(branchName: string): GitCommandArgs {
    return gitClient.buildCheckoutBranchArgs(branchName);
  },

  checkoutRemoteTrackingBranch(remoteRef: string): GitCommandArgs {
    return gitClient.buildCheckoutRemoteBranchArgs(remoteRef);
  },

  pullRebase(): GitCommandArgs {
    return gitClient.buildPullRebaseArgs();
  },

  stashPushAll(message: string): GitCommandArgs {
    return gitClient.buildStashPushArgs(message, { includeUntracked: true });
  },

  stashPop(): GitCommandArgs {
    return gitClient.buildStashPopArgs();
  },

  adoptRemoteTag(remote: string, tagName: string): GitCommandArgs {
    return ['fetch', remote, '--no-tags', '--quiet', `+refs/tags/${tagName}:refs/tags/${tagName}`];
  },
};
