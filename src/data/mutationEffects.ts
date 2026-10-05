import type { ResourceKey } from '@/shared/cache/resource';
import { normalizeRepoPathKey } from '@/utils/repoPath';

const workingTree = new Set([
  'getRepositoryChangeSummary',
  'getWorkingTreeSnapshot',
  'getWorkingTreeStats',
  'getSequencerState',
  'getDiffPreview',
  'listWorkingDirectory',
  'getWorkingDirectoryFileInfo',
  'getWorkingDirectoryPreview',
  'getRepositoryFilePreview',
  'getRepositoryFileInfo',
  'readRepoFile',
  'getMarkdownPreviewFile',
  'getRepoFileDataUrl',
  'getFileBlame',
  'getFileBlameRange',
  'blameView',
]);
const history = new Set(['getCommitLogPage', 'graph', 'getFileHistory', 'getFileTimelineData', 'getStashes']);
const treeCommands = new Set(['status', 'statusPorcelain', 'diff', 'ls-files']);
const historyCommands = new Set(['log', 'reflog', 'forEachRef', 'branch', 'branches', 'tag', 'show-ref', 'rev-parse', 'forensicHistory']);

export function gitMutationScope(method: string, args: unknown[], active: string): string {
  if (method === 'runGitCommandForRepo') return normalizeRepoPathKey(String(args[0]));
  const indices: Record<string, number> = {
    stagePaths: 1,
    writeRepoFile: 2,
    deleteRepoFile: 1,
    applyPatch: 2,
    addIgnoreRule: 1,
    startInteractiveRebase: 1,
    gitStashBranch: 2,
    createWorkingDirectoryFile: 1,
    createWorkingDirectoryFolder: 1,
    replaceWorkingDirectory: 1,
    applyWorkingDirectoryMoves: 2,
    deleteEmptyWorkingDirectoryFolders: 1,
    createWorkingDirectoryArchive: 2,
    moveWorkingDirectoryEntry: 3,
    copyWorkingDirectoryEntry: 3,
    deleteWorkingDirectoryEntry: 1,
  };
  const explicit = indices[method] === undefined ? (args[0] as { repoPath?: string } | undefined)?.repoPath : args[indices[method]];
  return typeof explicit === 'string' ? normalizeRepoPathKey(explicit) : active;
}

export function gitMutationAffects(method: string, args: unknown[], key: readonly unknown[]): boolean {
  const command = method === 'runGitCommandForRepo' ? String(args[1]) : method === 'runGitCommand' ? String(args[0]) : method;
  const operation = String(key[3]);
  const cachedCommand = operation === 'command' ? String(key[4]) : '';
  if (['add', 'stagePaths', 'applyPatch'].includes(command)) return workingTree.has(operation) || treeCommands.has(cachedCommand);
  if (/WorkingDirectory|RepoFile|RepositoryFile|IgnoreRule/.test(command) || ['clean', 'rm', 'restore'].includes(command)) {
    return workingTree.has(operation) || treeCommands.has(cachedCommand);
  }
  if (command === 'branch' || command === 'tag') return history.has(operation) || historyCommands.has(cachedCommand) || cachedCommand === 'status';
  if (['fetch', 'gitFetch', 'push', 'gitPush'].includes(command))
    return history.has(operation) || historyCommands.has(cachedCommand) || cachedCommand === 'status';
  if (command === 'remote' || command === 'config')
    return operation === 'getRepoOriginUrl' || cachedCommand === 'remote' || cachedCommand === 'config' || historyCommands.has(cachedCommand);
  // Checkout, commit, merge, reset, rebase and stash can affect both trees and history.
  return (
    workingTree.has(operation) ||
    history.has(operation) ||
    treeCommands.has(cachedCommand) ||
    historyCommands.has(cachedCommand) ||
    cachedCommand === 'submoduleStatus'
  );
}

export function githubMutationAffects(method: string, args: unknown[], key: readonly unknown[]): boolean {
  const operation = String(key[3]);
  if (['createRepository', 'createRepositoryWithReadme', 'forkRepository'].includes(method)) return operation === 'catalog';
  const target = typeof args[0] === 'string' ? { owner: args[0], repo: args[1] } : (args[0] as { owner?: string; repo?: string });
  const cached = typeof key[4] === 'string' ? { owner: key[4], repo: key[5] } : (key[4] as { owner?: string; repo?: string });
  if (!target?.owner || !cached?.owner || `${target.owner}/${target.repo}`.toLowerCase() !== `${cached.owner}/${cached.repo}`.toLowerCase()) return false;
  if (method === 'createPullRequest') return operation === 'getPullRequests';
  if (method === 'mergePullRequest')
    return ['getPullRequests', 'getBranches', 'getStatusChecks', 'getWorkflowRuns', 'getWorkflowRunsPage', 'getReleaseContext'].includes(operation);
  if (method === 'createRelease' || method === 'uploadReleaseAsset') return operation === 'getReleaseContext';
  return ['getWorkflowRuns', 'getWorkflowRunsPage', 'getWorkflowJobsPage', 'getStatusChecks'].includes(operation);
}

export function isImmutableGitRead(method: string, args: unknown[]): boolean {
  const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value);
  if (['getRepositoryFilePreview', 'getRepositoryFileInfo', 'getMarkdownPreviewFile', 'getRepoFileDataUrl'].includes(method)) {
    const request = args[0] as { source?: string; commitHash?: string } | undefined;
    return request?.source === 'commit' && sha(request.commitHash);
  }
  if (['getFileHistory', 'getFileBlame', 'getFileBlameRange', 'getDiffPreview'].includes(method)) return sha(args[1]);
  const commandIndex = method === 'runGitCommandForRepo' ? 1 : 0;
  return ['show', 'commitDetails'].includes(String(args[commandIndex])) && args.slice(commandIndex + 1).some(sha);
}

export const workingTreeResource = (key: ResourceKey) => workingTree.has(key[3]) || (key[3] === 'command' && treeCommands.has(String(key[4])));
