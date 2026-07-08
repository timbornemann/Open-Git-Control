import { execFile, execFileSync } from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { GitJobKind, GitScheduler } from '../GitScheduler';

const execFileAsync = util.promisify(execFile);
const STALE_INDEX_LOCK_MAX_AGE_MS = 45_000;
const INDEX_LOCK_RETRY_MAX_ATTEMPTS = 6;
const INDEX_LOCK_RETRY_BASE_DELAY_MS = 75;
const INDEX_LOCK_RETRY_MAX_DELAY_MS = 600;

const REPO_UNAVAILABLE_PATTERNS: RegExp[] = [
  /not a git repository/i,
  /no repository path set/i,
  /cannot change to/i,
  /unable to get current working directory/i,
  /no such file or directory/i,
  /the system cannot find the path specified/i,
  /\buv_cwd\b/i,
];

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
]);

type ExecFileAsyncResult = { stdout: string; stderr: string };

export type GitExecFileOptions = {
  cwd: string;
  maxBuffer: number;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

export type ExecFileAsyncRunner = (
  file: string,
  args: string[],
  options: GitExecFileOptions,
) => Promise<ExecFileAsyncResult>;

export const defaultExecFileAsyncRunner = execFileAsync as ExecFileAsyncRunner;

export type GitRunOptions = {
  envOverrides?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  requestedKind?: GitJobKind;
  coalesceKey?: string;
};

const readErrorText = (error: unknown, key: 'stdout' | 'stderr' | 'message' | 'name' | 'code'): string => {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : String(value ?? '');
};

export class GitRunner {
  constructor(
    private readonly execFileAsyncRunner: ExecFileAsyncRunner = defaultExecFileAsyncRunner,
    private readonly scheduler: GitScheduler = new GitScheduler(),
  ) {}

  async run(repoPath: string, args: string[], options: GitRunOptions = {}): Promise<string> {
    this.assertRepoPathAvailable(repoPath);

    const env = options.envOverrides ? { ...process.env, ...options.envOverrides } : process.env;
    const execOptions: GitExecFileOptions = {
      cwd: repoPath,
      maxBuffer: 20 * 1024 * 1024,
      env,
      signal: options.signal,
    };

    const executeWithRetries = async (activeSignal: AbortSignal): Promise<string> => {
      let retryAttempt = 0;
      const activeExecOptions = { ...execOptions, signal: activeSignal };

      while (true) {
        try {
          const { stdout } = await this.execFileAsyncRunner('git', args, activeExecOptions);
          return stdout.trimEnd();
        } catch (error: unknown) {
          const errorName = readErrorText(error, 'name');
          const errorCode = readErrorText(error, 'code');
          if (activeSignal.aborted || errorName === 'AbortError' || errorCode === 'ABORT_ERR') {
            const aborted = new Error('Git operation was aborted.');
            aborted.name = 'AbortError';
            throw aborted;
          }

          if (errorCode === 'ENOENT' && !this.isRepoPathAccessible(repoPath)) {
            throw new Error('[REPO_UNAVAILABLE] Repository is no longer available (moved, deleted, or not accessible).');
          }

          if (errorCode === 'ENOENT' && /spawn\s+git\s+enoent/i.test(readErrorText(error, 'message'))) {
            throw new Error('Git executable not found in PATH (spawn git ENOENT). Please install Git and restart the app.');
          }

          if (!this.isIndexLockError(error)) {
            throw this.normalizeGitError(error, args);
          }

          if (this.removeStaleIndexLockIfSafe(repoPath, args)) {
            continue;
          }

          if (retryAttempt >= INDEX_LOCK_RETRY_MAX_ATTEMPTS) {
            throw this.normalizeGitError(error, args);
          }

          const delayMs = Math.min(
            INDEX_LOCK_RETRY_MAX_DELAY_MS,
            INDEX_LOCK_RETRY_BASE_DELAY_MS * (2 ** retryAttempt),
          );
          retryAttempt += 1;
          await this.sleep(delayMs);
        }
      }
    };

    const kind = this.classifyCommand(args, options.requestedKind);
    return this.schedule(
      repoPath,
      kind,
      args[0] || 'git',
      executeWithRetries,
      {
        signal: options.signal,
        coalesceKey: kind === 'polling'
          ? options.coalesceKey ?? args.join('\0')
          : undefined,
      },
    );
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
    const commandArgs = args[0] === '-c' ? args.slice(2) : args;
    const primary = String(commandArgs[0] || '').trim().toLowerCase();
    const secondary = String(commandArgs[1] || '').trim().toLowerCase();
    if (primary === 'branch') {
      return ['-d', '-D', '-m', '-M', '-c', '-C', '--delete', '--move', '--copy', '--edit-description']
        .some((flag) => commandArgs.slice(1).includes(flag))
        ? 'write'
        : 'polling';
    }
    if (primary === 'remote') {
      return ['add', 'remove', 'rename', 'set-url', 'set-head', 'update', 'prune']
        .includes(secondary)
        ? 'write'
        : 'polling';
    }
    if (primary === 'tag') {
      const isList = commandArgs.length === 1 || ['-l', '--list', '--contains', '--points-at'].includes(secondary);
      return isList ? 'polling' : 'write';
    }
    if (primary === 'submodule' && secondary === 'status') return 'polling';
    if (this.shouldSerializeCommand(commandArgs)) return 'write';
    if (primary === 'status') return 'polling';
    if (['rev-parse', 'for-each-ref', 'symbolic-ref'].includes(primary)) return 'polling';
    if (primary === 'diff' && commandArgs.includes('--numstat')) return 'background';
    return 'interactive';
  }

  normalizeGitError(error: unknown, args: string[]): Error {
    const gitOut = readErrorText(error, 'stderr').trim() || readErrorText(error, 'stdout').trim();
    const fallbackMessage = readErrorText(error, 'message') || 'Unknown git error';
    const detailedMessage = gitOut ? `${fallbackMessage}\nGit Output: ${gitOut}` : fallbackMessage;
    const isRepoUnavailable = this.isRepoUnavailableError(detailedMessage);
    const isExpectedNonFatal = this.isExpectedNonFatalGitError(args, detailedMessage);
    const finalMessage = isRepoUnavailable
      ? `[REPO_UNAVAILABLE] Repository is no longer available (moved, deleted, or not a Git repo).\nGit Output: ${gitOut || fallbackMessage}`
      : detailedMessage;

    if (!isRepoUnavailable && !isExpectedNonFatal) {
      console.error(`Git Error executing "git ${args.join(' ')}":\n${finalMessage}`);
    }
    return new Error(finalMessage);
  }

  assertRepoPathAvailable(repoPath: string): void {
    try {
      const stat = fs.statSync(repoPath);
      if (!stat.isDirectory()) {
        throw new Error('Repository path is not a directory.');
      }
    } catch {
      throw new Error('[REPO_UNAVAILABLE] Repository is no longer available (moved, deleted, or not accessible).');
    }
  }

  private shouldSerializeCommand(args: string[]): boolean {
    const commandArgs = args[0] === '-c' ? args.slice(2) : args;
    const firstToken = String(commandArgs?.[0] || '').trim().toLowerCase();
    if (!firstToken) return false;
    return SERIALIZED_GIT_COMMANDS.has(firstToken);
  }

  private isExpectedNonFatalGitError(args: string[], errorText: string): boolean {
    const primary = String(args?.[0] || '').trim().toLowerCase();
    const secondary = String(args?.[1] || '').trim().toLowerCase();
    const expectsUpstreamRef = args.some((arg) => String(arg || '').trim() === '@{upstream}');
    if (primary === 'rev-parse' && expectsUpstreamRef) {
      return (
        /no upstream configured for branch/i.test(errorText)
        || /upstream branch .* not stored as a remote-tracking branch/i.test(errorText)
        || /fatal: no such branch/i.test(errorText)
      );
    }
    if (primary === 'rev-parse' && args.includes('--verify') && args.includes('--quiet')) {
      return true;
    }
    if (primary === 'submodule' && secondary === 'status') {
      return /no submodule mapping found in \.gitmodules for path/i.test(errorText);
    }
    return false;
  }

  private isRepoUnavailableError(errorText: string): boolean {
    const text = String(errorText || '');
    if (!text.trim()) return false;
    return REPO_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(text));
  }

  private isIndexLockError(error: unknown): boolean {
    const text = `${readErrorText(error, 'stderr')}\n${readErrorText(error, 'stdout')}\n${readErrorText(error, 'message')}`;
    return /index\.lock/i.test(text) && /file exists/i.test(text);
  }

  private resolveIndexLockPath(repoPath: string): string {
    try {
      const gitDirRaw = execFileSync('git', ['rev-parse', '--git-dir'], {
        cwd: repoPath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const gitDirPath = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(repoPath, gitDirRaw || '.git');
      return path.join(gitDirPath, 'index.lock');
    } catch {
      return path.join(repoPath, '.git', 'index.lock');
    }
  }

  private removeStaleIndexLockIfSafe(repoPath: string, args: string[]): boolean {
    const lockPath = this.resolveIndexLockPath(repoPath);
    if (!fs.existsSync(lockPath)) {
      return false;
    }

    try {
      const stat = fs.statSync(lockPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (!Number.isFinite(ageMs) || ageMs < STALE_INDEX_LOCK_MAX_AGE_MS) {
        return false;
      }

      fs.rmSync(lockPath, { force: true });
      console.warn(`Removed stale git index lock (${lockPath}) and retrying: git ${args.join(' ')}`);
      return true;
    } catch {
      return false;
    }
  }

  private isRepoPathAccessible(repoPath: string): boolean {
    try {
      const stat = fs.statSync(repoPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
