import type {
  GitCommandNameDto,
  GitCommandResultDto,
  IpcResult,
  SecretScanResultDto,
} from '../global';
import { getElectronApi, requireElectronApi } from './electronApi';

export type GitCommandArgs = [GitCommandNameDto, ...string[]];

export type PushCurrentBranchOptions = {
  remote?: string;
  ref?: string;
  setUpstream?: boolean;
  extraArgs?: string[];
};

const sanitizeBranchSuffix = (value: string): string => (
  value.replace(/[^a-zA-Z0-9._-]/g, '-')
);

const command = <TCommand extends GitCommandNameDto>(
  commandName: TCommand,
  ...args: string[]
): [TCommand, ...string[]] => [commandName, ...args];

export const gitClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async runGitCommand(commandName: GitCommandNameDto, ...args: string[]): Promise<GitCommandResultDto> {
    return requireElectronApi().runGitCommand(commandName, ...args);
  },

  async runGitArgs(args: GitCommandArgs): Promise<GitCommandResultDto> {
    const [commandName, ...rest] = args;
    return this.runGitCommand(commandName, ...rest);
  },

  async getStatusPorcelain(): Promise<GitCommandResultDto> {
    return this.runGitCommand('statusPorcelain');
  },

  async getBranchStatusPorcelainV2(): Promise<GitCommandResultDto> {
    return this.runGitCommand('status', '--porcelain=v2', '--branch');
  },

  async listRemotes(): Promise<GitCommandResultDto> {
    return this.runGitCommand('remote');
  },

  async getRemoteUrl(remote = 'origin'): Promise<GitCommandResultDto> {
    return this.runGitCommand('remote', 'get-url', remote);
  },

  async addRemote(remote: string, url: string): Promise<GitCommandResultDto> {
    return this.runGitCommand('remote', 'add', remote, url);
  },

  async removeRemote(remote: string): Promise<GitCommandResultDto> {
    return this.runGitCommand('remote', 'remove', remote);
  },

  async setRemoteUrl(remote: string, url: string): Promise<GitCommandResultDto> {
    return this.runGitCommand('remote', 'set-url', remote, url);
  },

  buildPushCurrentBranchArgs(options: PushCurrentBranchOptions = {}): GitCommandArgs {
    const remote = options.remote ?? 'origin';
    const ref = options.ref ?? 'HEAD';
    const extraArgs = options.extraArgs ?? [];
    return options.setUpstream === false
      ? command('push', ...extraArgs, remote, ref)
      : command('push', ...extraArgs, '-u', remote, ref);
  },

  async pushCurrentBranch(options: PushCurrentBranchOptions = {}): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildPushCurrentBranchArgs(options));
  },

  buildCheckoutBranchArgs(branchName: string): GitCommandArgs {
    return command('checkout', branchName);
  },

  async checkoutBranch(branchName: string): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildCheckoutBranchArgs(branchName));
  },

  buildCheckoutRemoteBranchArgs(remoteRef: string, localBranch?: string): GitCommandArgs {
    return localBranch
      ? command('checkout', '-b', localBranch, '--track', remoteRef)
      : command('checkout', '--track', remoteRef);
  },

  async checkoutRemoteBranch(remoteRef: string, localBranch?: string): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildCheckoutRemoteBranchArgs(remoteRef, localBranch));
  },

  getPullRequestBranchName(prNumber: number, headRef: string): string {
    return `pr-${prNumber}-${sanitizeBranchSuffix(headRef)}`;
  },

  buildFetchPullRequestBranchArgs(prNumber: number, targetBranch: string, remote = 'origin'): GitCommandArgs {
    return command('fetch', remote, `pull/${prNumber}/head:${targetBranch}`);
  },

  async fetchPullRequestBranch(
    prNumber: number,
    targetBranch: string,
    remote = 'origin',
  ): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildFetchPullRequestBranchArgs(prNumber, targetBranch, remote));
  },

  async stageAll(): Promise<GitCommandResultDto> {
    return this.runGitCommand('add', '-A');
  },

  async commitMessage(title: string, description?: string): Promise<GitCommandResultDto> {
    const trimmedDescription = (description || '').trim();
    return trimmedDescription
      ? this.runGitCommand('commit', '-m', title, '-m', trimmedDescription)
      : this.runGitCommand('commit', '-m', title);
  },

  async commitAllowEmpty(message: string): Promise<GitCommandResultDto> {
    return this.runGitCommand('commit', '--allow-empty', '-m', message);
  },

  async scanPushSecrets(params?: { includeTags?: boolean }): Promise<IpcResult<SecretScanResultDto>> {
    return requireElectronApi().scanPushSecrets(params);
  },

  async cancelSecretScan(): Promise<{ success: boolean; cancelled: boolean }> {
    return requireElectronApi().cancelSecretScan();
  },
};
