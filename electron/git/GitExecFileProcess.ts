import { spawn } from 'node:child_process';
import type { ExecFileAsyncResult, GitExecFileOptions } from './GitProcessTypes';
import { gitProcessTree } from './GitProcessTree';

/** Preserve execFile results while cancellation owns the complete Git tree. */
export function runGitExecFile(file: string, args: string[], options: GitExecFileOptions): Promise<ExecFileAsyncResult> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted();
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: options.windowsHide ?? true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    const lengths = { stdout: 0, stderr: 0 };
    let failure: Error | undefined;
    const { stop, waitForStop } = gitProcessTree(child);
    const collect = (stream: 'stdout' | 'stderr', chunks: Buffer[]) => (data: Buffer) => {
      if (failure || options.signal?.aborted) return;
      const available = Math.max(0, options.maxBuffer - lengths[stream]);
      if (data.length > available) {
        if (available) chunks.push(data.subarray(0, available));
        failure = Object.assign(new RangeError(`${stream} maxBuffer length exceeded`), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
        stop();
      } else {
        lengths[stream] += data.length;
        chunks.push(data);
      }
    };
    child.stdout.on('data', collect('stdout', stdout));
    child.stderr.on('data', collect('stderr', stderr));
    child.once('error', (error) => {
      options.signal?.removeEventListener('abort', stop);
      failure ||= error;
      // A failed spawn has no child to wait for. A kill error on a running
      // process must still retain its scheduler lane until the close event.
      if (child.pid === undefined) reject(error);
    });
    options.signal?.addEventListener('abort', stop, { once: true });
    if (options.signal?.aborted) stop();
    child.once('close', (code, signal) => {
      options.signal?.removeEventListener('abort', stop);
      void waitForStop().then(() => {
        const result = { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') };
        if (options.signal?.aborted) {
          reject(Object.assign(new Error('Git operation was aborted.'), { name: 'AbortError' }));
        } else if (failure) {
          reject(Object.assign(failure, result));
        } else if (code !== 0) {
          reject(Object.assign(new Error(`Command failed: ${file} ${args.join(' ')}\n${result.stderr}`), result, { code, signal }));
        } else resolve(result);
      });
    });
  });
}
