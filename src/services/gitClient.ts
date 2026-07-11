import type { GitCommandName } from '@/shared/ipc/gitCommands';
import type { GitCommandResultDto, SecretScanResultDto } from '@/types/gitDtos';
import type { IpcResult } from '@/types/ipc';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { getElectronApi, requireElectronGitApi } from './electronApi';
import type { RepoUnavailablePayload } from './repoUnavailableClassifier';

export type GitCommandArgs = [GitCommandName, ...string[]];

export type PushCurrentBranchOptions = {
  remote?: string;
  ref?: string;
  setUpstream?: boolean;
  extraArgs?: string[];
};

export type CreateTagOptions = {
  message?: string;
  target?: string;
};

export type RevertCommitOptions = {
  mainline?: number;
  noEdit?: boolean;
};

const sanitizeBranchSuffix = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '-');

const command = <TCommand extends GitCommandName>(commandName: TCommand, ...args: string[]): [TCommand, ...string[]] => [commandName, ...args];

export const gitClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  onRepoUnavailable(callback: (payload: RepoUnavailablePayload) => void): () => void {
    return requireElectronGitApi().onRepoUnavailable(callback);
  },

  async runGitCommand(commandName: GitCommandName, ...args: string[]): Promise<GitCommandResultDto> {
    const result = await requireElectronGitApi().runGitCommand(commandName, ...args);
    return result;
  },

  async runGitCommandForRepo(repoPath: string, commandName: GitCommandName, ...args: string[]): Promise<GitCommandResultDto> {
    const result = await requireElectronGitApi().runGitCommandForRepo(repoPath, commandName, ...args);
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

  buildPushArgs(extraArgs: string[] = []): GitCommandArgs {
    return command('push', ...extraArgs);
  },

  buildSetUpstreamBranchArgs(branchName: string, remote = 'origin'): GitCommandArgs {
    return command('branch', '--set-upstream-to', `${remote}/${branchName}`, branchName);
  },

  async setUpstreamBranch(branchName: string, remote = 'origin'): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildSetUpstreamBranchArgs(branchName, remote));
  },

  async pushCurrentBranch(options: PushCurrentBranchOptions = {}): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildPushCurrentBranchArgs(options));
  },

  buildCheckoutBranchArgs(branchName: string): GitCommandArgs {
    return command('checkout', branchName);
  },

  buildCheckoutRefArgs(ref: string): GitCommandArgs {
    return command('checkout', ref);
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

  buildCreateBranchArgs(branchName: string, startPoint?: string): GitCommandArgs {
    return startPoint ? command('checkout', '-b', branchName, startPoint) : command('checkout', '-b', branchName);
  },

  buildDeleteBranchArgs(branchName: string, options: { force?: boolean } = {}): GitCommandArgs {
    return command('branch', options.force ? '-D' : '-d', branchName);
  },

  buildRenameBranchArgs(oldName: string, newName: string): GitCommandArgs {
    return command('branch', '-m', oldName, newName);
  },

  buildMergeBranchArgs(mergeTarget: string, flags: string[] = []): GitCommandArgs {
    return command('merge', ...flags, mergeTarget);
  },

  buildCherryPickCommitArgs(commitHash: string): GitCommandArgs {
    return command('cherry-pick', commitHash);
  },

  buildRevertCommitArgs(commitHash: string, options: RevertCommitOptions = {}): GitCommandArgs {
    const args: string[] = [];
    if (options.mainline) args.push('-m', String(options.mainline));
    if (options.noEdit) args.push('--no-edit');
    return command('revert', ...args, commitHash);
  },

  buildResetToCommitArgs(mode: '--soft' | '--mixed' | '--hard', commitHash: string): GitCommandArgs {
    return command('reset', mode, commitHash);
  },

  getPullRequestBranchName(prNumber: number, headRef: string): string {
    return `pr-${prNumber}-${sanitizeBranchSuffix(headRef)}`;
  },

  buildFetchPullRequestBranchArgs(prNumber: number, remote = 'origin'): GitCommandArgs {
    // Fetch only into FETCH_HEAD. Updating the local PR branch directly fails
    // when it is currently checked out and also rejects a force-pushed PR.
    return command('fetch', remote, `pull/${prNumber}/head`);
  },

  async fetchPullRequestBranch(prNumber: number, remote = 'origin'): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildFetchPullRequestBranchArgs(prNumber, remote));
  },

  buildCheckoutPullRequestBranchArgs(targetBranch: string): GitCommandArgs {
    // -B intentionally moves this disposable local review branch to the
    // freshly fetched PR head, including after a force-push.
    return command('checkout', '-B', targetBranch, 'FETCH_HEAD');
  },

  buildPullArgs(extraArgs: string[] = []): GitCommandArgs {
    return command('pull', ...extraArgs);
  },

  buildPullRebaseArgs(): GitCommandArgs {
    return command('pull', '--rebase');
  },

  async pullRebase(): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildPullRebaseArgs());
  },

  buildStashPushArgs(message: string, options: { includeUntracked?: boolean } = {}): GitCommandArgs {
    const includeUntracked = options.includeUntracked ?? true;
    return includeUntracked ? command('stash', 'push', '-u', '-m', message) : command('stash', 'push', '-m', message);
  },

  async stashPush(message: string, options: { includeUntracked?: boolean } = {}): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildStashPushArgs(message, options));
  },

  buildStashPopArgs(): GitCommandArgs {
    return command('stash', 'pop');
  },

  async stashPop(): Promise<GitCommandResultDto> {
    return this.runGitArgs(this.buildStashPopArgs());
  },

  buildMergeContinueArgs(): GitCommandArgs {
    return command('mergeContinue');
  },

  buildMergeAbortArgs(): GitCommandArgs {
    return command('mergeAbort');
  },

  buildRebaseContinueArgs(): GitCommandArgs {
    return command('rebaseContinue');
  },

  buildRebaseAbortArgs(): GitCommandArgs {
    return command('rebaseAbort');
  },

  buildCherryPickContinueArgs(): GitCommandArgs {
    return command('cherryPickContinue');
  },

  buildCherryPickAbortArgs(): GitCommandArgs {
    return command('cherryPickAbort');
  },

  buildCreateTagArgs(name: string, options: CreateTagOptions = {}): GitCommandArgs {
    const target = options.target ? [options.target] : [];
    return options.message ? command('tag', '-a', name, '-m', options.message, ...target) : command('tag', name, ...target);
  },

  buildDeleteTagArgs(tagName: string): GitCommandArgs {
    return command('tag', '-d', tagName);
  },

  buildPushTagsArgs(): GitCommandArgs {
    return command('push', '--tags');
  },

  buildAddRemoteArgs(remote: string, url: string): GitCommandArgs {
    return command('remote', 'add', remote, url);
  },

  buildRemoveRemoteArgs(remote: string): GitCommandArgs {
    return command('remote', 'remove', remote);
  },

  buildRenameRemoteArgs(oldName: string, newName: string): GitCommandArgs {
    return command('remote', 'rename', oldName, newName);
  },

  buildSetRemoteUrlArgs(remote: string, url: string): GitCommandArgs {
    return command('remote', 'set-url', remote, url);
  },

  buildSubmoduleUpdateInitRecursiveArgs(): GitCommandArgs {
    return command('submoduleUpdateInitRecursive');
  },

  buildSubmoduleSyncRecursiveArgs(): GitCommandArgs {
    return command('submoduleSyncRecursive');
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

  async scanPushSecrets(params: { repoPath: string; includeTags?: boolean; pushArgs?: string[] }): Promise<IpcResult<SecretScanResultDto>> {
    return requireElectronGitApi().scanPushSecrets(params);
  },

  async approveSecretScanPush(pushArgs: string[] | undefined, repoPath: string): Promise<{ success: boolean }> {
    return requireElectronGitApi().approveSecretScanPush(pushArgs, repoPath);
  },

  async cancelSecretScan(repoPath: string): Promise<{ success: boolean; cancelled: boolean; error?: string }> {
    return requireElectronGitApi().cancelSecretScan(repoPath);
  },

  async createCommit(...args: Parameters<ElectronAPI['createCommit']>): ReturnType<ElectronAPI['createCommit']> {
    const result = await requireElectronGitApi().createCommit(...args);
    return result;
  },

  async getCommitLogPage(...args: Parameters<ElectronAPI['getCommitLogPage']>): ReturnType<ElectronAPI['getCommitLogPage']> {
    return requireElectronGitApi().getCommitLogPage(...args);
  },

  async requestCommitStats(...args: Parameters<ElectronAPI['requestCommitStats']>): ReturnType<ElectronAPI['requestCommitStats']> {
    return requireElectronGitApi().requestCommitStats(...args);
  },

  onCommitStats(...args: Parameters<ElectronAPI['onCommitStats']>): ReturnType<ElectronAPI['onCommitStats']> {
    return requireElectronGitApi().onCommitStats(...args);
  },

  async getWorkingTreeSnapshot(...args: Parameters<ElectronAPI['getWorkingTreeSnapshot']>): ReturnType<ElectronAPI['getWorkingTreeSnapshot']> {
    return requireElectronGitApi().getWorkingTreeSnapshot(...args);
  },

  async getWorkingTreeStats(...args: Parameters<ElectronAPI['getWorkingTreeStats']>): ReturnType<ElectronAPI['getWorkingTreeStats']> {
    return requireElectronGitApi().getWorkingTreeStats(...args);
  },

  async getSequencerState(...args: Parameters<ElectronAPI['getSequencerState']>): ReturnType<ElectronAPI['getSequencerState']> {
    return requireElectronGitApi().getSequencerState(...args);
  },

  async stagePaths(...args: Parameters<ElectronAPI['stagePaths']>): ReturnType<ElectronAPI['stagePaths']> {
    const result = await requireElectronGitApi().stagePaths(...args);
    return result;
  },

  async getDiffPreview(...args: Parameters<ElectronAPI['getDiffPreview']>): ReturnType<ElectronAPI['getDiffPreview']> {
    return requireElectronGitApi().getDiffPreview(...args);
  },

  async getFileBlameRange(...args: Parameters<ElectronAPI['getFileBlameRange']>): ReturnType<ElectronAPI['getFileBlameRange']> {
    return requireElectronGitApi().getFileBlameRange(...args);
  },

  async startInteractiveRebase(...args: Parameters<ElectronAPI['startInteractiveRebase']>): ReturnType<ElectronAPI['startInteractiveRebase']> {
    return requireElectronGitApi().startInteractiveRebase(...args);
  },

  async applyPatch(...args: Parameters<ElectronAPI['applyPatch']>): ReturnType<ElectronAPI['applyPatch']> {
    const result = await requireElectronGitApi().applyPatch(...args);
    return result;
  },

  async getStashes(...args: Parameters<ElectronAPI['getStashes']>): ReturnType<ElectronAPI['getStashes']> {
    return requireElectronGitApi().getStashes(...args);
  },

  async gitStashBranch(stashName: string, branchName: string, repoPath?: string): Promise<IpcResult<string>> {
    const result = repoPath
      ? await requireElectronGitApi().gitStashBranch(stashName, branchName, repoPath)
      : await requireElectronGitApi().gitStashBranch(stashName, branchName);
    return result;
  },

  async getRepoOriginUrl(...args: Parameters<ElectronAPI['getRepoOriginUrl']>): ReturnType<ElectronAPI['getRepoOriginUrl']> {
    return requireElectronGitApi().getRepoOriginUrl(...args);
  },

  async addIgnoreRule(...args: Parameters<ElectronAPI['addIgnoreRule']>): ReturnType<ElectronAPI['addIgnoreRule']> {
    const result = await requireElectronGitApi().addIgnoreRule(...args);
    return result;
  },

  async gitFetch(): ReturnType<ElectronAPI['gitFetch']> {
    const result = await requireElectronGitApi().gitFetch();
    return result;
  },

  async gitPull(): ReturnType<ElectronAPI['gitPull']> {
    const result = await requireElectronGitApi().gitPull();
    return result;
  },

  async gitPush(): ReturnType<ElectronAPI['gitPush']> {
    const result = await requireElectronGitApi().gitPush();
    return result;
  },

  async gitClone(...args: Parameters<ElectronAPI['gitClone']>): ReturnType<ElectronAPI['gitClone']> {
    return requireElectronGitApi().gitClone(...args);
  },

  async gitInit(...args: Parameters<ElectronAPI['gitInit']>): ReturnType<ElectronAPI['gitInit']> {
    return requireElectronGitApi().gitInit(...args);
  },

  async getFileHistory(...args: Parameters<ElectronAPI['getFileHistory']>): ReturnType<ElectronAPI['getFileHistory']> {
    return requireElectronGitApi().getFileHistory(...args);
  },

  async getFileBlame(...args: Parameters<ElectronAPI['getFileBlame']>): ReturnType<ElectronAPI['getFileBlame']> {
    return requireElectronGitApi().getFileBlame(...args);
  },

  async getFileTimelineData(...args: Parameters<ElectronAPI['getFileTimelineData']>): ReturnType<ElectronAPI['getFileTimelineData']> {
    return requireElectronGitApi().getFileTimelineData(...args);
  },

  async readRepoFile(...args: Parameters<ElectronAPI['readRepoFile']>): ReturnType<ElectronAPI['readRepoFile']> {
    return requireElectronGitApi().readRepoFile(...args);
  },

  async getMarkdownPreviewFile(...args: Parameters<ElectronAPI['getMarkdownPreviewFile']>): ReturnType<ElectronAPI['getMarkdownPreviewFile']> {
    return requireElectronGitApi().getMarkdownPreviewFile(...args);
  },

  async getRepoFileDataUrl(...args: Parameters<ElectronAPI['getRepoFileDataUrl']>): ReturnType<ElectronAPI['getRepoFileDataUrl']> {
    return requireElectronGitApi().getRepoFileDataUrl(...args);
  },

  async writeRepoFile(...args: Parameters<ElectronAPI['writeRepoFile']>): ReturnType<ElectronAPI['writeRepoFile']> {
    const result = await requireElectronGitApi().writeRepoFile(...args);
    return result;
  },

  async openSubmodule(...args: Parameters<ElectronAPI['openSubmodule']>): ReturnType<ElectronAPI['openSubmodule']> {
    return requireElectronGitApi().openSubmodule(...args);
  },

  onCloneProgress(...args: Parameters<ElectronAPI['onCloneProgress']>): ReturnType<ElectronAPI['onCloneProgress']> {
    return requireElectronGitApi().onCloneProgress(...args);
  },
};
