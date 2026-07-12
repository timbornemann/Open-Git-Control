import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import type { DiffPreviewResult, GitBufferRunOptions, GitCloneProgressResult } from './GitProcessTypes';
import { createAbortError } from './GitProcessTypes';
import { redactGitSensitiveText } from './GitErrorFormatter';

const MAX_STREAM_LINE_BYTES = 1024 * 1024;
const MAX_STREAM_OUTPUT_BYTES = 8 * 1024 * 1024;

export class GitSpawnOperations {
  runBuffer(repoPath: string, args: string[], options: GitBufferRunOptions, signal: AbortSignal): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options.envOverrides ? { ...process.env, ...options.envOverrides } : process.env,
      });
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

  runWithInput(repoPath: string, args: string[], input: string | Buffer, signal: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
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
          reject(createAbortError('Git diff preview was aborted.'));
          return;
        }
        if (code !== 0 && !truncated && closeSignal == null) {
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

  streamLines(
    repoPath: string,
    args: string[],
    onLine: (line: string) => void,
    signal: AbortSignal,
    options: { redactOutput?: boolean; envOverrides?: NodeJS.ProcessEnv } = {},
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const redactOutput = options.redactOutput !== false;
      const redactLine = (line: string) => (redactOutput ? redactGitSensitiveText(line) : line);
      const proc = spawn('git', args, {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options.envOverrides ? { ...process.env, ...options.envOverrides } : process.env,
      });
      let pending = '';
      let stderr = '';
      let settled = false;
      const abort = () => proc.kill();
      signal.addEventListener('abort', abort, { once: true });

      const cleanup = () => signal.removeEventListener('abort', abort);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        proc.kill();
        reject(error);
      };

      proc.stdout.on('data', (chunk: Buffer) => {
        if (settled) return;
        const text = chunk.toString('utf8');
        let start = 0;
        let newlineIndex = text.indexOf('\n');
        while (newlineIndex >= 0) {
          const linePart = text.slice(start, newlineIndex);
          if (Buffer.byteLength(pending) + Buffer.byteLength(linePart) > MAX_STREAM_LINE_BYTES) {
            fail(new Error(`Git stream line exceeded the ${MAX_STREAM_LINE_BYTES / 1024 / 1024} MB limit.`));
            return;
          }
          onLine(redactLine(`${pending}${linePart}`.replace(/\r$/, '')));
          pending = '';
          start = newlineIndex + 1;
          newlineIndex = text.indexOf('\n', start);
        }
        const remaining = text.slice(start);
        if (Buffer.byteLength(pending) + Buffer.byteLength(remaining) > MAX_STREAM_LINE_BYTES) {
          fail(new Error(`Git stream line exceeded the ${MAX_STREAM_LINE_BYTES / 1024 / 1024} MB limit.`));
          return;
        }
        pending += remaining;
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
      });
      proc.on('error', (error) => fail(error));
      proc.on('close', (code, closeSignal) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (signal.aborted || closeSignal) {
          reject(createAbortError('Git stream was aborted.'));
          return;
        }
        if (code !== 0) {
          reject(new Error(redactGitSensitiveText((stderr || `git ${args.join(' ')} exited with code ${code}`).trim())));
          return;
        }
        if (pending) onLine(redactLine(pending.replace(/\r$/, '')));
        resolve();
      });
    });
  }

  streamOutput(repoPath: string, args: string[], onLine: (line: string) => void, signal: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
      const stdoutPending = { value: '' };
      const stderrPending = { value: '' };
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let settled = false;
      const abort = () => proc.kill();
      signal.addEventListener('abort', abort, { once: true });

      const cleanup = () => signal.removeEventListener('abort', abort);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        proc.kill();
        reject(error);
      };
      const consume = (chunk: Buffer, pending: { value: string }, capture: (text: string) => void) => {
        if (settled) return;
        outputBytes += chunk.length;
        if (outputBytes > MAX_STREAM_OUTPUT_BYTES) {
          fail(new Error(`Git stream output exceeded the ${MAX_STREAM_OUTPUT_BYTES / 1024 / 1024} MB limit.`));
          return;
        }
        if (!emitLines(chunk, pending, onLine, capture, MAX_STREAM_LINE_BYTES)) {
          fail(new Error(`Git stream line exceeded the ${MAX_STREAM_LINE_BYTES / 1024 / 1024} MB limit.`));
        }
      };

      proc.stdout.on('data', (chunk: Buffer) => {
        consume(chunk, stdoutPending, (text) => {
          stdout += text;
        });
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        consume(chunk, stderrPending, (text) => {
          if (stderr.length < 256 * 1024) stderr += text;
        });
      });
      proc.on('error', (error) => fail(error));
      proc.on('close', (code, closeSignal) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (signal.aborted || closeSignal) {
          reject(createAbortError('Git stream was aborted.'));
          return;
        }

        const stdoutTail = stdoutPending.value.trim();
        const stderrTail = stderrPending.value.trim();
        if (stdoutTail) onLine(redactGitSensitiveText(stdoutTail));
        if (stderrTail) onLine(redactGitSensitiveText(stderrTail));

        if (code !== 0) {
          reject(new Error(redactGitSensitiveText((stderr || stdout || `git ${args.join(' ')} exited with code ${code}`).trim())));
          return;
        }
        resolve(stdout.trimEnd());
      });
    });
  }

  cloneWithProgress(cloneUrl: string, repoPath: string, onProgress: (line: string) => void): Promise<GitCloneProgressResult> {
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
      const proc = spawn('git', ['clone', '--progress', '--', cloneUrl, repoPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const failForOversizedProgress = () => {
        if (settled) return;
        settled = true;
        proc.kill();
        resolve({ success: false, error: `Git clone progress line exceeded the ${MAX_STREAM_LINE_BYTES / 1024 / 1024} MB limit.` });
      };
      const stdoutProgress = createProgressCollector(emitProgress, MAX_STREAM_LINE_BYTES, failForOversizedProgress);
      const stderrProgress = createProgressCollector(emitProgress, MAX_STREAM_LINE_BYTES, failForOversizedProgress);

      proc.stderr.on('data', (data: Buffer) => stderrProgress.write(data));
      proc.stdout.on('data', (data: Buffer) => stdoutProgress.write(data));

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        stderrProgress.end();
        stdoutProgress.end();
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
        if (settled) return;
        settled = true;
        stderrProgress.end();
        stdoutProgress.end();
        resolve({ success: false, error: redactGitSensitiveText(err.message) });
      });
    });
  }
}

const emitLines = (
  chunk: Buffer,
  pendingRef: { value: string },
  onLine: (line: string) => void,
  capture: (text: string) => void,
  maxPendingBytes: number,
): boolean => {
  const text = chunk.toString('utf8');
  capture(text);

  const parts = `${pendingRef.value}${text}`.split(/\r\n|\n|\r/);
  pendingRef.value = parts.pop() ?? '';
  if (Buffer.byteLength(pendingRef.value) > maxPendingBytes) return false;
  for (const part of parts) {
    const line = part.trim();
    if (line) onLine(redactGitSensitiveText(line));
  }
  return true;
};

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
