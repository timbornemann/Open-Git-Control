import { execFile, execFileSync, spawn } from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { GitJobKind } from '../GitScheduler';
import { GitScheduler } from '../GitScheduler';

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

export type ExecFileAsyncRunner = (file: string, args: string[], options: GitExecFileOptions) => Promise<ExecFileAsyncResult>;

export const defaultExecFileAsyncRunner = execFileAsync as ExecFileAsyncRunner;

export type GitRunOptions = {
  envOverrides?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  requestedKind?: GitJobKind;
  coalesceKey?: string;
};

export type GitBufferRunOptions = {
  maxBytes: number;
  tooLargeMessage: string;
  requestedKind?: GitJobKind;
  commandName?: string;
};

export type GitInputRunOptions = {
  requestedKind?: GitJobKind;
  commandName?: string;
};

export type DiffPreviewResult = {
  text: string;
  truncated: boolean;
  bytes: number;
  lines: number;
};

export type GitCloneProgressResult = {
  success: boolean;
  error?: string;
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

          const delayMs = Math.min(INDEX_LOCK_RETRY_MAX_DELAY_MS, INDEX_LOCK_RETRY_BASE_DELAY_MS * 2 ** retryAttempt);
          retryAttempt += 1;
          await this.sleep(delayMs);
        }
      }
    };

    const kind = this.classifyCommand(args, options.requestedKind);
    return this.schedule(repoPath, kind, args[0] || 'git', executeWithRetries, {
      signal: options.signal,
      coalesceKey: kind === 'polling' ? (options.coalesceKey ?? args.join('\0')) : undefined,
    });
  }

  resolveRepositoryRootSync(candidatePath: string): string {
    try {
      const rootPath = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      return rootPath || candidatePath;
    } catch {
      return candidatePath;
    }
  }

  detectIsBareRepositorySync(candidatePath: string): boolean {
    try {
      const output = execFileSync('git', ['rev-parse', '--is-bare-repository'], {
        cwd: candidatePath,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .toLowerCase();
      return output === 'true';
    } catch {
      return false;
    }
  }

  async runBuffer(repoPath: string, args: string[], options: GitBufferRunOptions): Promise<Buffer> {
    this.assertRepoPathAvailable(repoPath);
    const kind = this.classifyCommand(args, options.requestedKind);
    return this.schedule(
      repoPath,
      kind,
      options.commandName ?? args[0] ?? 'git',
      (signal) =>
        new Promise<Buffer>((resolve, reject) => {
          const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
          const chunks: Buffer[] = [];
          let capturedBytes = 0;
          let stderr = '';
          let tooLarge = false;

          const abort = () => proc.kill();
          signal.addEventListener('abort', abort, { once: true });

          proc.stdout.on('data', (chunk: Buffer) => {
            capturedBytes += chunk.length;
            if (capturedBytes > options.maxBytes) {
              tooLarge = true;
              proc.kill();
              return;
            }
            chunks.push(chunk);
          });
          proc.stderr.on('data', (chunk: Buffer) => {
            if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
          });
          proc.on('error', reject);
          proc.on('close', (code, closeSignal) => {
            signal.removeEventListener('abort', abort);
            if (tooLarge) {
              reject(new Error(options.tooLargeMessage));
              return;
            }
            if (signal.aborted || closeSignal) {
              reject(this.createAbortError('Git file read was aborted.'));
              return;
            }
            if (code !== 0) {
              reject(new Error((stderr || `git ${args.join(' ')} exited with code ${code}`).trim()));
              return;
            }
            resolve(Buffer.concat(chunks));
          });
        }),
    );
  }

  async runWithInput(repoPath: string, args: string[], input: string | Buffer, options: GitInputRunOptions = {}): Promise<string> {
    this.assertRepoPathAvailable(repoPath);
    const kind = this.classifyCommand(args, options.requestedKind);
    return this.schedule(
      repoPath,
      kind,
      options.commandName ?? args[0] ?? 'git',
      (signal) =>
        new Promise<string>((resolve, reject) => {
          const proc = spawn('git', args, { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          const abort = () => proc.kill();
          signal.addEventListener('abort', abort, { once: true });

          proc.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
          });

          proc.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
          });

          proc.stdin.on('error', () => {
            // The process can close stdin early when git rejects the input.
          });

          proc.on('error', reject);

          proc.on('close', (code) => {
            signal.removeEventListener('abort', abort);
            if (signal.aborted) {
              reject(this.createAbortError('Git command was aborted.'));
              return;
            }
            if (code === 0) {
              resolve(stdout.trimEnd());
              return;
            }

            const message = (stderr || stdout || `git ${args.join(' ')} exited with code ${code}`).trim();
            reject(new Error(message));
          });

          proc.stdin.end(input);
        }),
    );
  }

  async getDiffPreview(repoPath: string, args: string[], limits: { maxBytes?: number; maxLines?: number } = {}): Promise<DiffPreviewResult> {
    this.assertRepoPathAvailable(repoPath);
    const maxBytes = Math.max(64 * 1024, Math.min(limits.maxBytes || 2 * 1024 * 1024, 8 * 1024 * 1024));
    const maxLines = Math.max(100, Math.min(limits.maxLines || 5000, 20_000));

    return this.schedule(
      repoPath,
      'interactive',
      args[0] || 'diff',
      (signal) =>
        new Promise<DiffPreviewResult>((resolve, reject) => {
          const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
          const chunks: Buffer[] = [];
          let capturedBytes = 0;
          let lineCount = 0;
          let truncated = false;
          let stderr = '';
          const abort = () => proc.kill();
          signal.addEventListener('abort', abort, { once: true });

          proc.stdout.on('data', (chunk: Buffer) => {
            if (truncated) return;
            const remainingBytes = maxBytes - capturedBytes;
            if (remainingBytes <= 0) {
              truncated = true;
              proc.kill();
              return;
            }
            const accepted = chunk.length > remainingBytes ? chunk.subarray(0, remainingBytes) : chunk;
            chunks.push(accepted);
            capturedBytes += accepted.length;
            lineCount += accepted.toString('utf8').split('\n').length - 1;
            if (accepted.length < chunk.length || lineCount >= maxLines) {
              truncated = true;
              proc.kill();
            }
          });
          proc.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
          });
          proc.on('error', reject);
          proc.on('close', (code, closeSignal) => {
            signal.removeEventListener('abort', abort);
            if (closeSignal && !truncated) {
              reject(this.createAbortError('Git diff preview was aborted.'));
              return;
            }
            if (code !== 0 && !truncated && closeSignal == null) {
              reject(new Error((stderr || `git ${args.join(' ')} exited with code ${code}`).trim()));
              return;
            }
            let text = Buffer.concat(chunks).toString('utf8');
            if (lineCount >= maxLines) {
              text = text.split('\n').slice(0, maxLines).join('\n');
            }
            resolve({
              text,
              truncated,
              bytes: Buffer.byteLength(text),
              lines: text ? text.split('\n').length : 0,
            });
          });
        }),
    );
  }

  async streamLines(repoPath: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<void> {
    this.assertRepoPathAvailable(repoPath);
    await this.schedule(
      repoPath,
      'interactive',
      args[0] || 'stream',
      (schedulerSignal) =>
        new Promise<void>((resolve, reject) => {
          const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
          let pending = '';
          let stderr = '';
          const abort = () => proc.kill();
          schedulerSignal.addEventListener('abort', abort, { once: true });

          proc.stdout.on('data', (chunk: Buffer) => {
            pending += chunk.toString('utf8');
            let newlineIndex = pending.indexOf('\n');
            while (newlineIndex >= 0) {
              onLine(pending.slice(0, newlineIndex).replace(/\r$/, ''));
              pending = pending.slice(newlineIndex + 1);
              newlineIndex = pending.indexOf('\n');
            }
          });
          proc.stderr.on('data', (chunk: Buffer) => {
            if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
          });
          proc.on('error', reject);
          proc.on('close', (code, closeSignal) => {
            schedulerSignal.removeEventListener('abort', abort);
            if (schedulerSignal.aborted || closeSignal) {
              reject(this.createAbortError('Git stream was aborted.'));
              return;
            }
            if (code !== 0) {
              reject(new Error((stderr || `git ${args.join(' ')} exited with code ${code}`).trim()));
              return;
            }
            if (pending) onLine(pending.replace(/\r$/, ''));
            resolve();
          });
        }),
      { signal },
    );
  }

  async streamOutput(repoPath: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<string> {
    this.assertRepoPathAvailable(repoPath);

    const emitLines = (chunk: Buffer, pendingRef: { value: string }, capture: (text: string) => void) => {
      const text = chunk.toString('utf8');
      capture(text);

      const parts = `${pendingRef.value}${text}`.split(/\r\n|\n|\r/);
      pendingRef.value = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (line) onLine(line);
      }
    };

    const kind = this.classifyCommand(args);
    return this.schedule(
      repoPath,
      kind,
      args[0] || 'stream',
      (schedulerSignal) =>
        new Promise<string>((resolve, reject) => {
          const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
          const stdoutPending = { value: '' };
          const stderrPending = { value: '' };
          let stdout = '';
          let stderr = '';
          const abort = () => proc.kill();
          schedulerSignal.addEventListener('abort', abort, { once: true });

          proc.stdout.on('data', (chunk: Buffer) => {
            emitLines(chunk, stdoutPending, (text) => {
              stdout += text;
            });
          });
          proc.stderr.on('data', (chunk: Buffer) => {
            emitLines(chunk, stderrPending, (text) => {
              if (stderr.length < 256 * 1024) stderr += text;
            });
          });
          proc.on('error', reject);
          proc.on('close', (code, closeSignal) => {
            schedulerSignal.removeEventListener('abort', abort);
            if (schedulerSignal.aborted || closeSignal) {
              reject(this.createAbortError('Git stream was aborted.'));
              return;
            }

            const stdoutTail = stdoutPending.value.trim();
            const stderrTail = stderrPending.value.trim();
            if (stdoutTail) onLine(stdoutTail);
            if (stderrTail) onLine(stderrTail);

            if (code !== 0) {
              reject(new Error((stderr || stdout || `git ${args.join(' ')} exited with code ${code}`).trim()));
              return;
            }
            resolve(stdout.trimEnd());
          });
        }),
      { signal },
    );
  }

  cloneWithProgress(cloneUrl: string, repoPath: string, onProgress: (line: string) => void): Promise<GitCloneProgressResult> {
    return new Promise((resolve) => {
      const progressTail: string[] = [];
      const collectProgress = (data: Buffer) => {
        const lines = data.toString().split(/\r?\n|\r/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          progressTail.push(trimmed);
          if (progressTail.length > 24) {
            progressTail.splice(0, progressTail.length - 24);
          }
          onProgress(trimmed);
        }
      };

      const proc = spawn('git', ['clone', '--progress', cloneUrl, repoPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stderr.on('data', collectProgress);
      proc.stdout.on('data', collectProgress);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
          return;
        }

        const details = progressTail.slice(-4).join('\n').trim();
        resolve({
          success: false,
          error: details || `Git clone exited with code ${code} (source: ${cloneUrl}, target: ${repoPath})`,
        });
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
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
    const primary = String(commandArgs[0] || '')
      .trim()
      .toLowerCase();
    const secondary = String(commandArgs[1] || '')
      .trim()
      .toLowerCase();
    if (primary === 'branch') {
      return ['-d', '-D', '-m', '-M', '-c', '-C', '--delete', '--move', '--copy', '--edit-description'].some((flag) => commandArgs.slice(1).includes(flag))
        ? 'write'
        : 'polling';
    }
    if (primary === 'remote') {
      return ['add', 'remove', 'rename', 'set-url', 'set-head', 'update', 'prune'].includes(secondary) ? 'write' : 'polling';
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
    const firstToken = String(commandArgs?.[0] || '')
      .trim()
      .toLowerCase();
    if (!firstToken) return false;
    return SERIALIZED_GIT_COMMANDS.has(firstToken);
  }

  private isExpectedNonFatalGitError(args: string[], errorText: string): boolean {
    const primary = String(args?.[0] || '')
      .trim()
      .toLowerCase();
    const secondary = String(args?.[1] || '')
      .trim()
      .toLowerCase();
    const expectsUpstreamRef = args.some((arg) => String(arg || '').trim() === '@{upstream}');
    if (primary === 'rev-parse' && expectsUpstreamRef) {
      return (
        /no upstream configured for branch/i.test(errorText) ||
        /upstream branch .* not stored as a remote-tracking branch/i.test(errorText) ||
        /fatal: no such branch/i.test(errorText)
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

  private createAbortError(message: string): Error {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
  }
}
