import type { ResourceDomain } from '@/shared/cache/resource';

export type ReadPolicy = { staleTime: number; repoArgument?: number; repoProperty?: boolean };
const read = (staleTime: number, repoArgument?: number): ReadPolicy => ({ staleTime, repoArgument });
export const readPolicies: Record<ResourceDomain, Record<string, ReadPolicy>> = {
  app: { getSettings: read(Infinity), getStoredRepos: read(Infinity), getAppVersion: read(Infinity), getUpdaterStatus: read(30_000) },
  planner: { getData: read(30_000) },
  runs: { getConfig: read(30_000, 0), getState: read(1000) },
  github: {
    getRepository: read(300_000),
    getBranches: read(300_000),
    getPullRequests: read(60_000),
    getWorkflowRuns: read(40_000),
    getWorkflowRunsPage: read(40_000),
    getWorkflowJobsPage: read(40_000),
    getStatusChecks: read(40_000),
    getReleaseContext: read(300_000),
  },
  git: {
    getGitLfsStatus: { staleTime: 2000, repoProperty: true },
    getCommitLogPage: { staleTime: 30_000, repoProperty: true },
    getWorkingTreeSnapshot: read(4000, 0),
    getWorkingTreeStats: read(4000, 1),
    getSequencerState: read(4000, 0),
    getRepoOriginUrl: read(300_000, 0),
    listWorkingDirectory: read(30_000, 0),
    getWorkingDirectoryFileInfo: read(30_000, 1),
    getWorkingDirectoryPreview: read(30_000, 1),
    getRepositoryFilePreview: { staleTime: 30_000, repoProperty: true },
    getRepositoryFileInfo: { staleTime: 30_000, repoProperty: true },
    getDiffPreview: read(30_000, 2),
    getFileBlameRange: read(30_000, 4),
    getFileHistory: read(30_000, 3),
    getFileBlame: read(30_000, 2),
    getFileTimelineData: read(30_000, 1),
    getStashes: read(30_000, 0),
    readRepoFile: read(30_000, 1),
    getMarkdownPreviewFile: { staleTime: 30_000, repoProperty: true },
    getRepoFileDataUrl: { staleTime: 30_000, repoProperty: true },
  },
};

// Command reads are deliberately conservative. Anything outside this list is
// executed against the current repository and never served from a cache.
export function isReadCommand(command: unknown, args: unknown[]): boolean {
  if (
    [
      'status',
      'statusPorcelain',
      'log',
      'show',
      'diff',
      'reflog',
      'rev-parse',
      'ls-tree',
      'ls-files',
      'show-ref',
      'forEachRef',
      'submoduleStatus',
      'commitDetails',
      'branches',
      'forensicHistory',
    ].includes(String(command))
  )
    return true;
  if (command === 'config') return args.some((arg) => ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'].includes(String(arg)));
  if (command === 'branch') return args.length === 0 || args.every((arg) => ['-a', '-r', '--list', '-v', '-vv', '--show-current'].includes(String(arg)));
  if (command === 'tag') return args.length === 0 || args[0] === '--list' || args[0] === '-l';
  if (command === 'remote') return !args.length || ['-v', 'get-url'].includes(String(args[0]));
  if (command === 'submodule') return args[0] === 'status';
  return false;
}

export function isMutation(domain: ResourceDomain, name: string) {
  if (domain === 'planner') return /^(ensure|create|update|delete|materialize)/.test(name);
  if (domain === 'github') return /^(create|fork|merge|rerun|cancelWorkflow|uploadReleaseAsset)/.test(name);
  if (domain === 'runs') return ['saveConfig', 'start', 'stop'].includes(name);
  if (domain === 'app') return ['setSettings', 'setStoredRepos', 'setGeminiApiKey', 'clearGeminiApiKey', 'setOpenAiApiKey', 'clearOpenAiApiKey'].includes(name);
  return /^(trackWithGitLfs|createCommit|stagePaths|startInteractiveRebase|applyPatch|gitStashBranch|addIgnoreRule|gitFetch|gitPull|gitPush|writeRepoFile|saveRepositoryFile|deleteRepoFile|createWorking|replaceWorking|applyWorking|moveWorking|copyWorking|deleteWorking|deleteEmpty)/.test(
    name,
  );
}
