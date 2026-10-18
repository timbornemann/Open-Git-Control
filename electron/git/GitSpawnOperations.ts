import { toolExecutable, toolEnvironment } from '../system-tools/toolRuntime';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import type {
  DiffPreviewResult,
  GitBufferRunOptions,
  GitCloneProgressResult,
  GitLineHandler,
  GitLineStreamOptions,
  GitTransferOptions,
  GitProcessResult,
} from './GitProcessTypes';
import { createAbortError } from './GitProcessTypes';
import { redactGitSensitiveText } from './GitErrorFormatter';
import { gitProcessTree } from './GitProcessTree';
import { runGitLineConsumer } from './GitLineConsumer';

const MAX_STREAM_LINE_BYTES = 1024 * 1024;
const MAX_STREAM_OUTPUT_BYTES = 8 * 1024 * 1024;

export class GitSpawnOperations {
  runBuffer(repoPath: string, args: string[], options: GitBufferRunOptions, signal: AbortSignal): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const proc = spawn(toolExecutable('git'), args, {
        cwd: repoPath,
        windowsHide: true,
        stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        env: toolEnvironment(options.envOverrides),
      });
      const chunks: Buffer[] = [];
      let capturedBytes = 0;
      let stderr = '';
      let tooLarge = false;

      const abort = () => proc.kill();
      signal.addEventListener('abort', abort, { once: true });
      if (options.input !== undefined) {
        proc.stdin?.on('error', () => {});
        proc.stdin?.end(options.input);
      }

      proc.stdout!.on('data', (chunk: Buffer) => {
        capturedBytes += chunk.length;
        if (capturedBytes > options.maxBytes) {
          if (options.allowTruncation) chunks.push(chunk.subarray(0, Math.max(0, options.maxBytes - (capturedBytes - chunk.length))));
          tooLarge = true;
          proc.kill();
          return;
        }
        chunks.push(chunk);
      });
      proc.stderr!.on('data', (chunk: Buffer) => {
        if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('close', (code, closeSignal) => {
        signal.removeEventListener('abort', abort);
        if (tooLarge) {
          if (options.allowTruncation && !signal.aborted) {
            resolve(Buffer.concat(chunks));
            return;
          }
          reject(new Error(options.tooLargeMessage));
          return;
        }
        if (signal.aborted || closeSignal) {
          reject(createAbortError('Git file read was aborted.'));
          return;
        }
        if (code !== 0) {
          reject(new Error(redactGitSensitiveText((stderr || `git ${args.join(' ')} exited with code ${code}`).trim())));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  }

  runWithInput(repoPath: string, args: string[], input: string | Buffer, signal: AbortSignal, envOverrides?: NodeJS.ProcessEnv): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(toolExecutable('git'), args, {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: toolEnvironment(envOverrides),
      });
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
          reject(createAbortError('Git command was aborted.'));
          return;
        }
        if (code === 0) {
          resolve(stdout.trimEnd());
          return;
        }

        const message = redactGitSensitiveText((stderr || stdout || `git ${args.join(' ')} exited with code ${code}`).trim());
        reject(new Error(message));
      });

      proc.stdin.end(input);
    });
  }

  getDiffPreview(repoPath: string, args: string[], maxBytes: number, maxLines: number, signal: AbortSignal): Promise<DiffPreviewResult> {
    return new Promise<DiffPreviewResult>((resolve, reject) => {
      const proc = spawn(toolExecutable('git'), args, { cwd: repoPath, windowsHide: true, env: toolEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
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
          reject(createAbortError('Git diff preview was aborted.'));
          return;
        }
        // --no-index uses exit code 1 for a successful diff with changes.
        const hasNoIndexChanges = code === 1 && args[0] === 'diff' && args.includes('--no-index');
        if (code !== 0 && !hasNoIndexChanges && !truncated && closeSignal == null) {
          reject(new Error(redactGitSensitiveText((stderr || `git ${args.join(' ')} exited with code ${code}`).trim())));
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
    });
  }

  streamLines(repoPath: string, args: string[], onLine: GitLineHandler, signal: AbortSignal, options: GitLineStreamOptions = {}): Promise<void> {
    return runGitLineConsumer(repoPath, args, onLine, signal, options);
  }

  async streamOutput(repoPath: string, args: string[], onLine: (line: string) => void, signal: AbortSignal, envOverrides?: NodeJS.ProcessEnv): Promise<string> {
    const result = await this.streamResult(repoPath, args, onLine, signal, envOverrides);
    if (result.exitCode !== 0) throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} exited with code ${result.exitCode}`).trim());
    return result.stdout.trimEnd();
  }

  streamResult(
    repoPath: string,
    args: string[],
    onLine: (line: string) => void,
    signal: AbortSignal,
    envOverrides?: NodeJS.ProcessEnv,
  ): Promise<GitProcessResult> {
    return new Promise<GitProcessResult>((resolve, reject) => {
      const proc = spawn(toolExecutable('git'), args, {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: toolEnvironment(envOverrides),
      });
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let settled = false;
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');
      const { stop: abort, waitForStop } = gitProcessTree(proc);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();

      const cleanup = () => signal.removeEventListener('abort', abort);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        abort();
        void waitForStop().then(() => reject(error));
      };
      const emit = (line: string) => {
        if (settled || !line.trim()) return;
        try {
          onLine(redactGitSensitiveText(line.trim()));
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Git progress delivery failed.'));
        }
      };
      const oversized = () => fail(new Error(`Git stream line exceeded the ${MAX_STREAM_LINE_BYTES / 1024 / 1024} MB limit.`));
      const stdoutProgress = createProgressCollector(emit, MAX_STREAM_LINE_BYTES, oversized);
      const stderrProgress = createProgressCollector(emit, MAX_STREAM_LINE_BYTES, oversized);
      const consume = (chunk: Buffer, collector: ReturnType<typeof createProgressCollector>, capture: (data: Buffer) => void) => {
        if (settled) return;
        outputBytes += chunk.length;
        if (outputBytes > MAX_STREAM_OUTPUT_BYTES) {
          fail(new Error(`Git stream output exceeded the ${MAX_STREAM_OUTPUT_BYTES / 1024 / 1024} MB limit.`));
          return;
        }
        capture(chunk);
        collector.write(chunk);
      };

      proc.stdout.on('data', (chunk: Buffer) => {
        consume(chunk, stdoutProgress, (data) => {
          stdout += stdoutDecoder.write(data);
        });
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        consume(chunk, stderrProgress, (data) => {
          stderr = (stderr + stderrDecoder.write(data)).slice(-256 * 1024);
        });
      });
      proc.on('error', (error) => fail(error));
      proc.on('close', async (code, closeSignal) => {
        if (settled) return;
        cleanup();
        await waitForStop();
        if (signal.aborted || closeSignal) {
          settled = true;
          reject(createAbortError('Git stream was aborted.'));
          return;
        }

        stdoutProgress.end();
        stderrProgress.end();
        stdout += stdoutDecoder.end();
        stderr = (stderr + stderrDecoder.end()).slice(-256 * 1024);
        if (settled) return;
        settled = true;
        resolve({ stdout: redactGitSensitiveText(stdout), stderr: redactGitSensitiveText(stderr), exitCode: code ?? -1 });
      });
    });
  }

  cloneWithProgress(cloneUrl: string, repoPath: string, onProgress: (line: string) => void, options: GitTransferOptions = {}): Promise<GitCloneProgressResult> {
    if (options.signal?.aborted) return Promise.resolve({ success: false, error: 'Git clone was aborted.' });
    return new Promise((resolve) => {
      const progressTail: string[] = [];
      let settled = false;
      const emitProgress = (line: string) => {
        const trimmed = redactGitSensitiveText(line.trim());
        if (!trimmed) return;
        progressTail.push(trimmed);
        if (progressTail.length > 24) {
          progressTail.splice(0, progressTail.length - 24);
        }
        // Progress is delivered from a stream 'data' handler. A throwing
        // consumer (e.g. sending to a destroyed window) must not surface as an
        // uncaught exception outside the clone promise.
        try {
          onProgress(trimmed);
        } catch {
          // Ignore progress delivery failures; the clone itself continues.
        }
      };
      const proc = spawn(toolExecutable('git'), ['clone', '--progress', '--', cloneUrl, repoPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: toolEnvironment(options.envOverrides),
      });
      const { stop: abort, waitForStop } = gitProcessTree(proc);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      const failForOversizedProgress = () => {
        if (settled) return;
        settled = true;
        abort();
        void waitForStop().then(() =>
          resolve({ success: false, error: `Git clone progress line exceeded the ${MAX_STREAM_LINE_BYTES / 1024 / 1024} MB limit.` }),
        );
      };
      const stdoutProgress = createProgressCollector(emitProgress, MAX_STREAM_LINE_BYTES, failForOversizedProgress);
      const stderrProgress = createProgressCollector(emitProgress, MAX_STREAM_LINE_BYTES, failForOversizedProgress);

      proc.stderr.on('data', (data: Buffer) => stderrProgress.write(data));
      proc.stdout.on('data', (data: Buffer) => stdoutProgress.write(data));

      proc.on('close', async (code) => {
        options.signal?.removeEventListener('abort', abort);
        if (settled) return;
        settled = true;
        stderrProgress.end();
        stdoutProgress.end();
        await waitForStop();
        if (options.signal?.aborted) {
          resolve({ success: false, error: 'Git clone was aborted.' });
          return;
        }
        if (code === 0) {
          resolve({ success: true });
          return;
        }

        const details = progressTail.slice(-4).join('\n').trim();
        resolve({
          success: false,
          error: details || redactGitSensitiveText(`Git clone exited with code ${code} (source: ${cloneUrl}, target: ${repoPath})`),
        });
      });

      proc.on('error', (err) => {
        options.signal?.removeEventListener('abort', abort);
        if (settled) return;
        settled = true;
        stderrProgress.end();
        stdoutProgress.end();
        resolve({ success: false, error: redactGitSensitiveText(err.message) });
      });
    });
  }
}

const createProgressCollector = (onLine: (line: string) => void, maxPendingBytes: number, onLimitExceeded: () => void) => {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let ended = false;

  const drain = (final: boolean) => {
    let lineStart = 0;
    for (let index = 0; index < pending.length; index += 1) {
      const character = pending[index];
      if (character !== '\n' && character !== '\r') continue;
      // A CR at the end of a chunk may be the first half of CRLF. Keep it
      // until the next chunk so CRLF never produces a spurious empty update.
      if (character === '\r' && index === pending.length - 1 && !final) break;
      onLine(pending.slice(lineStart, index));
      if (character === '\r' && pending[index + 1] === '\n') index += 1;
      lineStart = index + 1;
    }
    pending = pending.slice(lineStart);
    if (final && pending) {
      onLine(pending);
      pending = '';
    }
  };

  return {
    write(chunk: Buffer) {
      if (ended) return;
      pending += decoder.write(chunk);
      drain(false);
      if (Buffer.byteLength(pending) > maxPendingBytes) {
        pending = '';
        ended = true;
        decoder.end();
        onLimitExceeded();
      }
    },
    end() {
      if (ended) return;
      ended = true;
      pending += decoder.end();
      drain(true);
    },
  };
};
