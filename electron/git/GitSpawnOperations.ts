import { spawn } from 'child_process';
import type { DiffPreviewResult, GitBufferRunOptions, GitCloneProgressResult } from './GitProcessTypes';
import { createAbortError } from './GitProcessTypes';

export class GitSpawnOperations {
  runBuffer(repoPath: string, args: string[], options: GitBufferRunOptions, signal: AbortSignal): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
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
          reject(createAbortError('Git file read was aborted.'));
          return;
        }
        if (code !== 0) {
          reject(new Error((stderr || `git ${args.join(' ')} exited with code ${code}`).trim()));
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

        const message = (stderr || stdout || `git ${args.join(' ')} exited with code ${code}`).trim();
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
    });
  }

  streamLines(repoPath: string, args: string[], onLine: (line: string) => void, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
      let pending = '';
      let stderr = '';
      const abort = () => proc.kill();
      signal.addEventListener('abort', abort, { once: true });

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
        signal.removeEventListener('abort', abort);
        if (signal.aborted || closeSignal) {
          reject(createAbortError('Git stream was aborted.'));
          return;
        }
        if (code !== 0) {
          reject(new Error((stderr || `git ${args.join(' ')} exited with code ${code}`).trim()));
          return;
        }
        if (pending) onLine(pending.replace(/\r$/, ''));
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
      const abort = () => proc.kill();
      signal.addEventListener('abort', abort, { once: true });

      proc.stdout.on('data', (chunk: Buffer) => {
        emitLines(chunk, stdoutPending, onLine, (text) => {
          stdout += text;
        });
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        emitLines(chunk, stderrPending, onLine, (text) => {
          if (stderr.length < 256 * 1024) stderr += text;
        });
      });
      proc.on('error', reject);
      proc.on('close', (code, closeSignal) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted || closeSignal) {
          reject(createAbortError('Git stream was aborted.'));
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
    });
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
}

const emitLines = (chunk: Buffer, pendingRef: { value: string }, onLine: (line: string) => void, capture: (text: string) => void) => {
  const text = chunk.toString('utf8');
  capture(text);

  const parts = `${pendingRef.value}${text}`.split(/\r\n|\n|\r/);
  pendingRef.value = parts.pop() ?? '';
  for (const part of parts) {
    const line = part.trim();
    if (line) onLine(line);
  }
};
