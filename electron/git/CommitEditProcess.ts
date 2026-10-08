import { toolExecutable, toolEnvironment } from '../system-tools/toolRuntime';
import { spawn } from 'node:child_process';
import { redactGitSensitiveText } from './GitErrorFormatter';

/** Wait for the owned process tree to exit before cleaning an isolated worktree. */
export function runCommitEditProcess(cwd: string, args: string[], signal?: AbortSignal, envOverrides?: NodeJS.ProcessEnv): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(toolExecutable('git'), args, {
      cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: toolEnvironment({ GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0', ...envOverrides }),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    let stopping: Promise<void> | undefined;
    const stop = () => {
      if (stopping || !child.pid) return;
      const pid = child.pid;
      stopping = new Promise<void>((done) => {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.once('error', () => {
            child.kill();
            done();
          });
          killer.once('close', (code) => {
            // Git for Windows/MSYS can leave inherited pipe handles open after
            // the confirmed tree termination. They must not block cancellation.
            if (code === 0) {
              child.stdout.destroy();
              child.stderr.destroy();
            }
            done();
          });
        } else {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
          done();
        }
      });
    };
    const collect = (target: Buffer[]) => (data: Buffer) => {
      size += data.length;
      if (size > 20 * 1024 * 1024) {
        failure = new Error('Commit edit Git output exceeded its size limit.');
        stop();
      } else target.push(data);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', (error) => {
      failure = error;
    });
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.once('close', (code) => {
      signal?.removeEventListener('abort', stop);
      void (stopping ?? Promise.resolve()).then(() => {
        if (signal?.aborted) {
          const error = new Error('Git operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        } else if (failure) reject(failure);
        else if (code !== 0) reject(new Error(redactGitSensitiveText(Buffer.concat(stderr).toString('utf8') || `Git exited with code ${code}.`)));
        else resolve(Buffer.concat(stdout).toString('utf8').trimEnd());
      });
    });
  });
}
