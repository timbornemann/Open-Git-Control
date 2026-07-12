import type { GitService } from '../../GitService';
import { assertAllowedGitCommand, createJobId, normalizeCommandArgs, type GitCommandName } from '../gitCommandPolicy';
import { emitJobEvent } from './jobEvents';
import { normalizeRepositoryRelativePath, toLiteralPathspec } from '../../git/RepositoryPathSafety';
import { hasUnresolvedConflictMarkers, parseConflictMarkerSize } from '../../git/MergeConflictService';

type GitCommandRouterEvent = {
  sender: any;
};

type GitCommandExecutionContext = {
  gitService: GitService;
  event: GitCommandRouterEvent;
  commandName: GitCommandName;
  args: string[];
  jobId: string | null;
  repoPath?: string;
};

type GitCommandExecutor = (context: GitCommandExecutionContext) => Promise<string>;

const STREAMING_PROGRESS_COMMANDS = new Set<GitCommandName>(['fetch', 'pull']);
const LONG_RUNNING_COMMANDS = new Set<GitCommandName>(['fetch', 'pull', 'push', 'add', 'commit', 'reset']);

const withProgressFlag = (commandName: GitCommandName, args: string[]): string[] => {
  const baseArgs = [commandName, ...args];
  if (!STREAMING_PROGRESS_COMMANDS.has(commandName)) return baseArgs;
  if (args.some((arg) => arg === '--progress' || arg === '--no-progress' || arg === '--quiet' || arg === '-q')) {
    return baseArgs;
  }
  return [commandName, '--progress', ...args];
};

const executeStreamingCommand: GitCommandExecutor = async ({ gitService, event, commandName, args, jobId, repoPath }) => {
  const commandArgs = withProgressFlag(commandName, args);
  const onLine = (line: string) => {
    if (!jobId) return;
    emitJobEvent(event.sender, {
      id: jobId,
      operation: `git:${commandName}`,
      status: 'progress',
      message: line,
      timestamp: Date.now(),
    });
  };
  return repoPath ? gitService.streamCommandOutputAtPath(repoPath, commandArgs, onLine) : gitService.streamCommandOutput(commandArgs, onLine);
};

const STRUCTURED_LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%(decorate:prefix=,suffix=,separator=%x1d)%x00';

const runInContext = (context: GitCommandExecutionContext, args: string[]): Promise<string> =>
  context.repoPath ? context.gitService.runCommandAtPath(context.repoPath, args) : context.gitService.runCommand(args);

const executeForensicHistory: GitCommandExecutor = async (context) => {
  const { args } = context;
  const searchType = args[0];
  const targetPath = args[1];
  const searchTerm = args[2] || '';
  const startLine = Number(args[3]);
  const endLine = Number(args[4]);
  const limit = Number(args[5]) || 200;

  if (searchType === 'string') {
    return runInContext(context, [
      'log',
      '-z',
      `-${Math.max(1, Math.min(Math.floor(limit), 500))}`,
      '--date=iso',
      `--pretty=format:${STRUCTURED_LOG_FORMAT}`,
      '--numstat',
      '-S',
      searchTerm,
      '--',
      toLiteralPathspec(targetPath),
    ]);
  }
  if (searchType === 'regex') {
    return runInContext(context, [
      'log',
      '-z',
      `-${Math.max(1, Math.min(Math.floor(limit), 500))}`,
      '--date=iso',
      `--pretty=format:${STRUCTURED_LOG_FORMAT}`,
      '--numstat',
      '-G',
      searchTerm,
      '--',
      toLiteralPathspec(targetPath),
    ]);
  }
  return runInContext(context, [
    'log',
    `-${Math.max(1, Math.min(Math.floor(limit), 500))}`,
    '--date=iso',
    '--pretty=format:%x1e%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%x00',
    `-L${startLine},${endLine}:${normalizeRepositoryRelativePath(targetPath)}`,
  ]);
};

const executeLog: GitCommandExecutor = (context) => {
  const limit = Number(context.args[0]) || 50;
  const includeAll = context.args[1] !== 'head';
  const offset = Number(context.args[2]) || 0;
  const args = ['log', '--topo-order', '-z', `-${limit}`, `--skip=${offset}`, `--pretty=format:${STRUCTURED_LOG_FORMAT}`, '--date=iso'];
  if (includeAll) args.splice(1, 0, '--all');
  return runInContext(context, args);
};

const executeCommitDetails: GitCommandExecutor = async (context) => {
  const commitHash = context.args[0];
  const parentsRaw = await runInContext(context, ['show', '-s', '--format=%P', commitHash]);
  const firstParent = parentsRaw.trim().split(/\s+/).filter(Boolean)[0];
  if (firstParent) {
    return runInContext(context, ['diff', '--name-status', '-M', '-z', firstParent, commitHash]);
  }
  return runInContext(context, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-z', commitHash]);
};

const executeConflictMarkResolved: GitCommandExecutor = async (context) => {
  const repoPath = context.repoPath || context.gitService.requireActiveRepoPath();
  const filePath = normalizeRepositoryRelativePath(context.args[0], 'Conflict file path');
  const [contents, markerSizeRaw] = await Promise.all([
    context.gitService.files.readRepoFileAtPath(repoPath, filePath),
    context.gitService.runCommandAtPath(repoPath, ['check-attr', '-z', 'conflict-marker-size', '--', filePath]),
  ]);
  if (hasUnresolvedConflictMarkers(contents, parseConflictMarkerSize(markerSizeRaw))) {
    throw new Error('Conflict markers remain in the file. Resolve them before marking the file as resolved.');
  }
  return context.gitService.runCommandAtPath(repoPath, ['add', '--', toLiteralPathspec(filePath)]);
};

const executeSequencerCommand = (context: GitCommandExecutionContext, args: string[], envOverrides: NodeJS.ProcessEnv = {}): Promise<string> =>
  context.repoPath
    ? context.gitService.runCommandAtPathWithEnv(context.repoPath, args, envOverrides)
    : context.gitService.runCommandAtPathWithEnv(context.gitService.requireActiveRepoPath(), args, envOverrides);

const COMMAND_EXECUTORS: Partial<Record<GitCommandName, GitCommandExecutor>> = {
  status: async ({ gitService, args, repoPath }) =>
    repoPath && gitService.isBareRepositoryAtPath?.(repoPath)
      ? ''
      : repoPath
        ? gitService.runCommandAtPath(repoPath, ['status', ...(args.length > 0 ? args : ['--short'])])
        : args.length > 0
          ? gitService.runCommand(['status', ...args])
          : gitService.getStatus(),
  statusPorcelain: async ({ gitService, repoPath }) => (repoPath ? gitService.getStatusPorcelainAtPath(repoPath) : gitService.getStatusPorcelain()),
  log: executeLog,
  branches: async (context) => runInContext(context, ['branch', '-a']),
  commitDetails: executeCommitDetails,
  conflictTakeOurs: async (context) => runInContext(context, ['checkout', '--ours', '--', toLiteralPathspec(context.args[0])]),
  conflictTakeTheirs: async (context) => runInContext(context, ['checkout', '--theirs', '--', toLiteralPathspec(context.args[0])]),
  conflictTakeDeleted: async (context) => runInContext(context, ['rm', '-f', '--', toLiteralPathspec(context.args[0])]),
  conflictMarkResolved: executeConflictMarkResolved,
  mergeContinue: async (context) => executeSequencerCommand(context, ['merge', '--continue'], { GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' }),
  mergeAbort: async (context) => executeSequencerCommand(context, ['merge', '--abort']),
  rebaseContinue: async (context) => executeSequencerCommand(context, ['rebase', '--continue'], { GIT_EDITOR: 'true' }),
  rebaseAbort: async (context) => executeSequencerCommand(context, ['rebase', '--abort']),
  cherryPickContinue: async (context) => executeSequencerCommand(context, ['cherry-pick', '--continue'], { GIT_EDITOR: 'true' }),
  cherryPickAbort: async (context) => executeSequencerCommand(context, ['cherry-pick', '--abort']),
  fetch: executeStreamingCommand,
  pull: executeStreamingCommand,
  submoduleStatus: async (context) => {
    try {
      return await runInContext(context, ['submodule', 'status', '--recursive']);
    } catch (error: any) {
      if (/no submodule mapping found in \.gitmodules for path/i.test(String(error?.message || ''))) return '';
      throw error;
    }
  },
  submoduleUpdateInitRecursive: async (context) => runInContext(context, ['submodule', 'update', '--init', '--recursive']),
  submoduleSyncRecursive: async (context) => runInContext(context, ['submodule', 'sync', '--recursive']),
  reflog: async (context) =>
    runInContext(context, [
      'reflog',
      '--date=iso',
      `--max-count=${Math.max(1, Math.min(Number(context.args[0]) || 300, 1000))}`,
      '--pretty=format:%H%x1f%h%x1f%gd%x1f%gs%x1f%cd%x00',
    ]),
  forensicHistory: executeForensicHistory,
};

const executeGitCommand = async (context: GitCommandExecutionContext): Promise<string> => {
  const executor = COMMAND_EXECUTORS[context.commandName];
  if (executor) return executor(context);
  if (context.repoPath) return context.gitService.runCommandAtPath(context.repoPath, [context.commandName, ...context.args]);
  return context.gitService.runCommand([context.commandName, ...context.args]);
};

export const handleGitCommand = async (event: GitCommandRouterEvent, gitService: GitService, commandName: unknown, rawArgs: unknown[], repoPath?: string) => {
  let jobId: string | null = null;

  try {
    assertAllowedGitCommand(commandName);
    const args = normalizeCommandArgs(commandName, rawArgs);

    jobId = LONG_RUNNING_COMMANDS.has(commandName) ? createJobId(`git-${commandName}`) : null;
    if (jobId) {
      emitJobEvent(event.sender, {
        id: jobId,
        operation: `git:${commandName}`,
        status: 'start',
        timestamp: Date.now(),
      });
    }

    const data = await executeGitCommand({
      gitService,
      event,
      commandName,
      args,
      jobId,
      repoPath,
    });

    if (jobId) {
      emitJobEvent(event.sender, {
        id: jobId,
        operation: `git:${commandName}`,
        status: 'done',
        timestamp: Date.now(),
      });
    }

    return { success: true, data };
  } catch (error: any) {
    if (jobId && typeof commandName === 'string') {
      emitJobEvent(event.sender, {
        id: jobId,
        operation: `git:${commandName}`,
        status: 'failed',
        message: error.message,
        timestamp: Date.now(),
      });
    }
    return { success: false, error: error.message };
  }
};
