import type { GitJobKind } from '../GitScheduler';
import { GitScheduler } from '../GitScheduler';
import { GitErrorFormatter } from './GitErrorFormatter';
import { GitProcessExecutor } from './GitProcessExecutor';
import { assertRepoPathAvailable } from './GitRepositoryPath';
import { GitRepositoryProbe } from './GitRepositoryProbe';
import { GitSpawnOperations } from './GitSpawnOperations';
import {
  defaultExecFileAsyncRunner,
  type DiffPreviewResult,
  type ExecFileAsyncRunner,
  type GitBufferRunOptions,
  type GitCloneProgressResult,
  type GitExecFileOptions,
  type GitInputRunOptions,
  type GitRunOptions,
} from './GitProcessTypes';

export {
  defaultExecFileAsyncRunner,
  type DiffPreviewResult,
  type ExecFileAsyncRunner,
  type GitBufferRunOptions,
  type GitCloneProgressResult,
  type GitExecFileOptions,
  type GitInputRunOptions,
  type GitRunOptions,
} from './GitProcessTypes';

const SERIALIZED_GIT_COMMANDS = new Set<string>([
  'add',
  'commit',
  'reset',
  'checkout',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'stash',
  'clean',
  'apply',
  'submodule',
  'fetch',
  'pull',
  'push',
  'rm',
  'mv',
  'init',
  'update-ref',
  'worktree',
  'restore',
  'switch',
  'read-tree',
  'update-index',
  'write-tree',
  'mktree',
  'commit-tree',
  'pack-refs',
  'index-pack',
  'unpack-objects',
  'replace',
  'notes',
  'gc',
  'repack',
  'prune',
  'maintenance',
  'bisect',
  'am',
  'sparse-checkout',
]);

const BRANCH_LIST_FLAGS = new Set([
  '-a',
  '--all',
  '-r',
  '--remotes',
  '-l',
  '--list',
  '-v',
  '--verbose',
  '--show-current',
  '--contains',
  '--no-contains',
  '--merged',
  '--no-merged',
  '--points-at',
  '--format',
  '--sort',
  '--column',
  '--no-column',
]);

const BRANCH_MUTATION_FLAGS = new Set([
  '-d',
  '-m',
  '-c',
  '-f',
  '--delete',
  '--move',
  '--copy',
  '--force',
  '--edit-description',
  '-u',
  '--set-upstream-to',
  '--unset-upstream',
  '--track',
  '--no-track',
]);

const optionName = (value: string): string => value.split('=', 1)[0];

const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set(['-c', '-C', '--config-env', '--exec-path', '--git-dir', '--namespace', '--super-prefix', '--work-tree']);
const GIT_GLOBAL_FLAG_OPTIONS = new Set([
  '--bare',
  '--html-path',
  '--info-path',
  '--literal-pathspecs',
  '--man-path',
  '--no-lazy-fetch',
  '--no-optional-locks',
  '--no-pager',
  '--no-replace-objects',
  '--paginate',
  '-p',
  '--version',
]);

const commandArguments = (args: string[]): string[] => {
  let index = 0;
  while (index < args.length) {
    const token = String(args[index]);
    if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(token)) {
      index += 2;
      continue;
    }
    const name = optionName(token);
    if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(name) || GIT_GLOBAL_FLAG_OPTIONS.has(token)) {
      index += 1;
      continue;
    }
    break;
  }
  return args.slice(index);
};

export class GitRunner {
  private readonly processExecutor: GitProcessExecutor;
  private readonly spawnOperations = new GitSpawnOperations();
  private readonly errorFormatter = new GitErrorFormatter();
  private readonly repositoryProbe = new GitRepositoryProbe();

  constructor(
    execFileAsyncRunner: ExecFileAsyncRunner = defaultExecFileAsyncRunner,
    private readonly scheduler: GitScheduler = new GitScheduler(),
  ) {
    this.processExecutor = new GitProcessExecutor(execFileAsyncRunner);
  }

  async run(repoPath: string, args: string[], options: GitRunOptions = {}): Promise<string> {
    this.assertRepoPathAvailable(repoPath);

    const env = options.envOverrides ? { ...process.env, ...options.envOverrides } : process.env;
    const execOptions: GitExecFileOptions = {
      cwd: repoPath,
      maxBuffer: 20 * 1024 * 1024,
      env,
      signal: options.signal,
    };

    const kind = this.classifyCommand(args, options.requestedKind);
    return this.schedule(
      repoPath,
      kind,
      args[0] || 'git',
      (activeSignal) => this.processExecutor.run(repoPath, args, { ...execOptions, signal: activeSignal }),
      {
        signal: options.signal,
        coalesceKey: kind === 'polling' ? (options.coalesceKey ?? args.join('\0')) : undefined,
      },
    );
  }

  resolveRepositoryRootSync(candidatePath: string): string {
    return this.repositoryProbe.resolveRepositoryRootSync(candidatePath);
  }

  detectIsBareRepositorySync(candidatePath: string): boolean {
    return this.repositoryProbe.detectIsBareRepositorySync(candidatePath);
  }

  async runBuffer(repoPath: string, args: string[], options: GitBufferRunOptions): Promise<Buffer> {
    this.assertRepoPathAvailable(repoPath);
    const kind = this.classifyCommand(args, options.requestedKind);
    return this.schedule(repoPath, kind, options.commandName ?? args[0] ?? 'git', (signal) => this.spawnOperations.runBuffer(repoPath, args, options, signal));
  }

  async runWithInput(repoPath: string, args: string[], input: string | Buffer, options: GitInputRunOptions = {}): Promise<string> {
    this.assertRepoPathAvailable(repoPath);
    const kind = this.classifyCommand(args, options.requestedKind);
    return this.schedule(repoPath, kind, options.commandName ?? args[0] ?? 'git', (signal) => this.spawnOperations.runWithInput(repoPath, args, input, signal));
  }

  async getDiffPreview(repoPath: string, args: string[], limits: { maxBytes?: number; maxLines?: number } = {}): Promise<DiffPreviewResult> {
    this.assertRepoPathAvailable(repoPath);
    const maxBytes = Math.max(64 * 1024, Math.min(limits.maxBytes || 2 * 1024 * 1024, 8 * 1024 * 1024));
    const maxLines = Math.max(100, Math.min(limits.maxLines || 5000, 20_000));

    return this.schedule(repoPath, 'interactive', args[0] || 'diff', (signal) =>
      this.spawnOperations.getDiffPreview(repoPath, args, maxBytes, maxLines, signal),
    );
  }

  async streamLines(repoPath: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<void> {
    this.assertRepoPathAvailable(repoPath);
    await this.schedule(
      repoPath,
      'interactive',
      args[0] || 'stream',
      (schedulerSignal) => this.spawnOperations.streamLines(repoPath, args, onLine, schedulerSignal),
      { signal },
    );
  }

  async streamOutput(repoPath: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<string> {
    this.assertRepoPathAvailable(repoPath);
    const kind = this.classifyCommand(args);
    return this.schedule(repoPath, kind, args[0] || 'stream', (schedulerSignal) => this.spawnOperations.streamOutput(repoPath, args, onLine, schedulerSignal), {
      signal,
    });
  }

  cloneWithProgress(cloneUrl: string, repoPath: string, onProgress: (line: string) => void): Promise<GitCloneProgressResult> {
    return this.spawnOperations.cloneWithProgress(cloneUrl, repoPath, onProgress);
  }

  schedule<T>(
    repoPath: string,
    kind: GitJobKind,
    command: string,
    run: (signal: AbortSignal) => Promise<T>,
    options: { coalesceKey?: string; signal?: AbortSignal } = {},
  ): Promise<T> {
    return this.scheduler.schedule(repoPath, kind, command, run, options);
  }

  getSchedulerDiagnostics() {
    return this.scheduler.getDiagnostics();
  }

  classifyCommand(args: string[], requestedKind?: GitJobKind): GitJobKind {
    if (requestedKind) return requestedKind;
    const commandArgs = commandArguments(args);
    const primary = String(commandArgs[0] || '')
      .trim()
      .toLowerCase();
    const secondary = String(commandArgs[1] || '')
      .trim()
      .toLowerCase();
    if (primary === 'branch') {
      const flags = commandArgs.slice(1).map((value) => String(value).toLowerCase());
      if (flags.some((flag) => BRANCH_MUTATION_FLAGS.has(optionName(flag)))) return 'write';
      if (flags.length === 0 || flags.some((flag) => BRANCH_LIST_FLAGS.has(optionName(flag)))) return 'polling';
      // A positional branch name creates a branch. Unknown future branch
      // modes are serialized conservatively instead of racing the ref store.
      return 'write';
    }
    if (primary === 'remote') {
      return !secondary || ['-v', '--verbose', 'show', 'get-url'].includes(secondary) ? 'polling' : 'write';
    }
    if (primary === 'tag') {
      const isList =
        commandArgs.length === 1 ||
        ['-l', '--list', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format'].includes(optionName(secondary));
      return isList ? 'polling' : 'write';
    }
    if (primary === 'config') {
      const flags = commandArgs.slice(1).map((value) => optionName(String(value).toLowerCase()));
      if (flags.some((flag) => ['--unset', '--unset-all', '--rename-section', '--remove-section', '--add', '--replace-all', '--edit', '-e'].includes(flag))) {
        return 'write';
      }
      if (flags.some((flag) => ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'].includes(flag))) return 'polling';
      return commandArgs.length <= 2 ? 'polling' : 'write';
    }
    if (primary === 'symbolic-ref') {
      const values = commandArgs.slice(1).filter((value) => !String(value).startsWith('-'));
      return commandArgs.includes('--delete') || values.length >= 2 ? 'write' : 'polling';
    }
    if (primary === 'reflog') {
      return ['expire', 'delete', 'write'].includes(secondary) ? 'write' : 'polling';
    }
    if (primary === 'hash-object' && commandArgs.includes('-w')) return 'write';
    if (primary === 'submodule' && secondary === 'status') return 'polling';
    if (this.shouldSerializeCommand(commandArgs)) return 'write';
    if (primary === 'status') return 'polling';
    if (['rev-parse', 'for-each-ref', 'symbolic-ref'].includes(primary)) return 'polling';
    if (primary === 'diff' && commandArgs.includes('--numstat')) return 'background';
    return 'interactive';
  }

  normalizeGitError(error: unknown, args: string[]): Error {
    return this.errorFormatter.normalizeGitError(error, args);
  }

  assertRepoPathAvailable(repoPath: string): void {
    assertRepoPathAvailable(repoPath);
  }

  private shouldSerializeCommand(args: string[]): boolean {
    const commandArgs = commandArguments(args);
    const firstToken = String(commandArgs?.[0] || '')
      .trim()
      .toLowerCase();
    if (!firstToken) return false;
    return SERIALIZED_GIT_COMMANDS.has(firstToken);
  }
}
