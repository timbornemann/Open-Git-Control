import type { ElectronAPI, GitCommandNameDto, GitCommandResultDto, IpcResult, SecretScanResultDto } from '@/global';
import { getElectronApi, requireElectronApi } from './electronApi';
import { isRepoUnavailableError, type RepoUnavailablePayload } from './repoUnavailableClassifier';

export type GitCommandArgs = [GitCommandNameDto, ...string[]];

export type PushCurrentBranchOptions = {
  remote?: string;
  ref?: string;
  setUpstream?: boolean;
  extraArgs?: string[];
};

const sanitizeBranchSuffix = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '-');

const command = <TCommand extends GitCommandNameDto>(commandName: TCommand, ...args: string[]): [TCommand, ...string[]] => [commandName, ...args];

const repoUnavailableListeners = new Set<(payload: RepoUnavailablePayload) => void>();
let lastRepoUnavailableNotifyAt = 0;

const notifyRepoUnavailable = (payload: RepoUnavailablePayload) => {
  const now = Date.now();
  if (now - lastRepoUnavailableNotifyAt < 1200) {
    return;
  }
  lastRepoUnavailableNotifyAt = now;
  for (const listener of repoUnavailableListeners) {
    listener(payload);
  }
};

const notifyRepoUnavailableIfNeeded = (result: { success?: boolean; error?: string } | null | undefined, commandName: string) => {
  if (result && result.success === false && isRepoUnavailableError(result.error)) {
    notifyRepoUnavailable({
      command: commandName,
      error: String(result.error || ''),
    });
  }
};

export const gitClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  onRepoUnavailable(callback: (payload: RepoUnavailablePayload) => void): () => void {
    repoUnavailableListeners.add(callback);
    return () => {
      repoUnavailableListeners.delete(callback);
    };
  },

  async runGitCommand(commandName: GitCommandNameDto, ...args: string[]): Promise<GitCommandResultDto> {
    const result = await requireElectronApi().runGitCommand(commandName, ...args);
    notifyRepoUnavailableIfNeeded(result, commandName);
    return result;
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
    return options.setUpstream === false ? command('push', ...extraArgs, remote, ref) : command('push', ...extraArgs, '-u', remote, ref);
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
    return localBranch ? command('checkout', '-b', localBranch, '--track', remoteRef) : command('checkout', '--track', remoteRef);
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

  async fetchPullRequestBranch(prNumber: number, targetBranch: string, remote = 'origin'): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildFetchPullRequestBranchArgs(prNumber, targetBranch, remote));
  },

  async stageAll(): Promise<GitCommandResultDto> {
    return this.runGitCommand('add', '-A');
  },

  async commitMessage(title: string, description?: string): Promise<GitCommandResultDto> {
    const trimmedDescription = (description || '').trim();
    return trimmedDescription ? this.runGitCommand('commit', '-m', title, '-m', trimmedDescription) : this.runGitCommand('commit', '-m', title);
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

  async createCommit(...args: Parameters<ElectronAPI['createCommit']>): ReturnType<ElectronAPI['createCommit']> {
    const result = await requireElectronApi().createCommit(...args);
    notifyRepoUnavailableIfNeeded(result, 'commit');
    return result;
  },

  async getCommitLogPage(...args: Parameters<ElectronAPI['getCommitLogPage']>): ReturnType<ElectronAPI['getCommitLogPage']> {
    return requireElectronApi().getCommitLogPage(...args);
  },

  async requestCommitStats(...args: Parameters<ElectronAPI['requestCommitStats']>): ReturnType<ElectronAPI['requestCommitStats']> {
    return requireElectronApi().requestCommitStats(...args);
  },

  onCommitStats(...args: Parameters<ElectronAPI['onCommitStats']>): ReturnType<ElectronAPI['onCommitStats']> {
    return requireElectronApi().onCommitStats(...args);
  },

  async getWorkingTreeSnapshot(...args: Parameters<ElectronAPI['getWorkingTreeSnapshot']>): ReturnType<ElectronAPI['getWorkingTreeSnapshot']> {
    return requireElectronApi().getWorkingTreeSnapshot(...args);
  },

  async getWorkingTreeStats(...args: Parameters<ElectronAPI['getWorkingTreeStats']>): ReturnType<ElectronAPI['getWorkingTreeStats']> {
    return requireElectronApi().getWorkingTreeStats(...args);
  },

  async stagePaths(...args: Parameters<ElectronAPI['stagePaths']>): ReturnType<ElectronAPI['stagePaths']> {
    const result = await requireElectronApi().stagePaths(...args);
    notifyRepoUnavailableIfNeeded(result, 'add');
    return result;
  },

  async getDiffPreview(...args: Parameters<ElectronAPI['getDiffPreview']>): ReturnType<ElectronAPI['getDiffPreview']> {
    return requireElectronApi().getDiffPreview(...args);
  },

  async getFileBlameRange(...args: Parameters<ElectronAPI['getFileBlameRange']>): ReturnType<ElectronAPI['getFileBlameRange']> {
    return requireElectronApi().getFileBlameRange(...args);
  },

  async startInteractiveRebase(...args: Parameters<ElectronAPI['startInteractiveRebase']>): ReturnType<ElectronAPI['startInteractiveRebase']> {
    return requireElectronApi().startInteractiveRebase(...args);
  },

  async applyPatch(...args: Parameters<ElectronAPI['applyPatch']>): ReturnType<ElectronAPI['applyPatch']> {
    const result = await requireElectronApi().applyPatch(...args);
    notifyRepoUnavailableIfNeeded(result, 'apply');
    return result;
  },

  async getStashes(...args: Parameters<ElectronAPI['getStashes']>): ReturnType<ElectronAPI['getStashes']> {
    return requireElectronApi().getStashes(...args);
  },

  async gitStashBranch(...args: Parameters<ElectronAPI['gitStashBranch']>): ReturnType<ElectronAPI['gitStashBranch']> {
    const result = await requireElectronApi().gitStashBranch(...args);
    notifyRepoUnavailableIfNeeded(result, 'stash branch');
    return result;
  },

  async getRepoOriginUrl(...args: Parameters<ElectronAPI['getRepoOriginUrl']>): ReturnType<ElectronAPI['getRepoOriginUrl']> {
    return requireElectronApi().getRepoOriginUrl(...args);
  },

  async addIgnoreRule(...args: Parameters<ElectronAPI['addIgnoreRule']>): ReturnType<ElectronAPI['addIgnoreRule']> {
    const result = await requireElectronApi().addIgnoreRule(...args);
    notifyRepoUnavailableIfNeeded(result, 'ignore');
    return result;
  },

  async gitFetch(): ReturnType<ElectronAPI['gitFetch']> {
    const result = await requireElectronApi().gitFetch();
    notifyRepoUnavailableIfNeeded(result, 'fetch');
    return result;
  },

  async gitPull(): ReturnType<ElectronAPI['gitPull']> {
    const result = await requireElectronApi().gitPull();
    notifyRepoUnavailableIfNeeded(result, 'pull');
    return result;
  },

  async gitPush(): ReturnType<ElectronAPI['gitPush']> {
    const result = await requireElectronApi().gitPush();
    notifyRepoUnavailableIfNeeded(result, 'push');
    return result;
  },

  async gitClone(...args: Parameters<ElectronAPI['gitClone']>): ReturnType<ElectronAPI['gitClone']> {
    return requireElectronApi().gitClone(...args);
  },

  async gitInit(...args: Parameters<ElectronAPI['gitInit']>): ReturnType<ElectronAPI['gitInit']> {
    return requireElectronApi().gitInit(...args);
  },

  async getFileHistory(...args: Parameters<ElectronAPI['getFileHistory']>): ReturnType<ElectronAPI['getFileHistory']> {
    return requireElectronApi().getFileHistory(...args);
  },

  async getFileBlame(...args: Parameters<ElectronAPI['getFileBlame']>): ReturnType<ElectronAPI['getFileBlame']> {
    return requireElectronApi().getFileBlame(...args);
  },

  async getFileTimelineData(...args: Parameters<ElectronAPI['getFileTimelineData']>): ReturnType<ElectronAPI['getFileTimelineData']> {
    return requireElectronApi().getFileTimelineData(...args);
  },

  async readRepoFile(...args: Parameters<ElectronAPI['readRepoFile']>): ReturnType<ElectronAPI['readRepoFile']> {
    return requireElectronApi().readRepoFile(...args);
  },

  async getMarkdownPreviewFile(...args: Parameters<ElectronAPI['getMarkdownPreviewFile']>): ReturnType<ElectronAPI['getMarkdownPreviewFile']> {
    return requireElectronApi().getMarkdownPreviewFile(...args);
  },

  async getRepoFileDataUrl(...args: Parameters<ElectronAPI['getRepoFileDataUrl']>): ReturnType<ElectronAPI['getRepoFileDataUrl']> {
    return requireElectronApi().getRepoFileDataUrl(...args);
  },

  async writeRepoFile(...args: Parameters<ElectronAPI['writeRepoFile']>): ReturnType<ElectronAPI['writeRepoFile']> {
    const result = await requireElectronApi().writeRepoFile(...args);
    notifyRepoUnavailableIfNeeded(result, 'write');
    return result;
  },

  async openSubmodule(...args: Parameters<ElectronAPI['openSubmodule']>): ReturnType<ElectronAPI['openSubmodule']> {
    return requireElectronApi().openSubmodule(...args);
  },

  onCloneProgress(...args: Parameters<ElectronAPI['onCloneProgress']>): ReturnType<ElectronAPI['onCloneProgress']> {
    return requireElectronApi().onCloneProgress(...args);
  },
};
