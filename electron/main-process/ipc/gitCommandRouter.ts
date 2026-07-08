import type { GitService } from '../../GitService';
import { assertAllowedGitCommand, createJobId, normalizeArgs, validateCommandArgs, type GitCommandName } from '../gitCommandPolicy';
import { emitJobEvent } from './jobEvents';

type GitCommandRouterEvent = {
  sender: any;
};

type GitCommandExecutionContext = {
  gitService: GitService;
  event: GitCommandRouterEvent;
  commandName: GitCommandName;
  args: string[];
  jobId: string | null;
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

const executeStreamingCommand: GitCommandExecutor = async ({ gitService, event, commandName, args, jobId }) => {
  return gitService.streamCommandOutput(withProgressFlag(commandName, args), (line: string) => {
    if (!jobId) return;
    emitJobEvent(event.sender, {
      id: jobId,
      operation: `git:${commandName}`,
      status: 'progress',
      message: line,
      timestamp: Date.now(),
    });
  });
};

const executeForensicHistory: GitCommandExecutor = async ({ gitService, args }) => {
  const searchType = args[0];
  const targetPath = args[1];
  const searchTerm = args[2] || '';
  const startLine = Number(args[3]);
  const endLine = Number(args[4]);
  const limit = Number(args[5]) || 200;

  if (searchType === 'string') {
    return gitService.getForensicHistoryByString(searchTerm, targetPath, limit);
  }
  if (searchType === 'regex') {
    return gitService.getForensicHistoryByRegex(searchTerm, targetPath, limit);
  }
  return gitService.getForensicHistoryByLineRange(targetPath, startLine, endLine, limit);
};

const COMMAND_EXECUTORS: Partial<Record<GitCommandName, GitCommandExecutor>> = {
  status: async ({ gitService, args }) => (args.length > 0 ? gitService.runCommand(['status', ...args]) : gitService.getStatus()),
  statusPorcelain: async ({ gitService }) => gitService.getStatusPorcelain(),
  log: async ({ gitService, args }) => gitService.getLog(Number(args[0]) || 50, args[1] !== 'head', Number(args[2]) || 0),
  branches: async ({ gitService }) => gitService.getBranches(),
  commitDetails: async ({ gitService, args }) => gitService.getCommitDetails(args[0]),
  conflictTakeOurs: async ({ gitService, args }) => gitService.checkoutConflictVersion(args[0], 'ours'),
  conflictTakeTheirs: async ({ gitService, args }) => gitService.checkoutConflictVersion(args[0], 'theirs'),
  conflictMarkResolved: async ({ gitService, args }) => gitService.addFile(args[0]),
  mergeContinue: async ({ gitService }) => gitService.continueMerge(),
  mergeAbort: async ({ gitService }) => gitService.abortMerge(),
  rebaseContinue: async ({ gitService }) => gitService.continueRebase(),
  rebaseAbort: async ({ gitService }) => gitService.abortRebase(),
  fetch: executeStreamingCommand,
  pull: executeStreamingCommand,
  submoduleStatus: async ({ gitService }) => gitService.getSubmoduleStatus(),
  submoduleUpdateInitRecursive: async ({ gitService }) => gitService.updateSubmodulesInitRecursive(),
  submoduleSyncRecursive: async ({ gitService }) => gitService.syncSubmodulesRecursive(),
  reflog: async ({ gitService, args }) => gitService.getReflog(Number(args[0]) || 300),
  forensicHistory: executeForensicHistory,
};

const executeGitCommand = async (context: GitCommandExecutionContext): Promise<string> => {
  const executor = COMMAND_EXECUTORS[context.commandName];
  if (executor) return executor(context);
  return context.gitService.runCommand([context.commandName, ...context.args]);
};

export const handleGitCommand = async (event: GitCommandRouterEvent, gitService: GitService, commandName: unknown, ...rawArgs: unknown[]) => {
  let jobId: string | null = null;

  try {
    assertAllowedGitCommand(commandName);
    const args = normalizeArgs(rawArgs);
    validateCommandArgs(commandName, args);

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
