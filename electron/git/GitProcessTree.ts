import { spawn, type ChildProcess } from 'node:child_process';
import { windowsSystemExecutable } from '../system-tools/windowsSystemExecutable';

/** The child must own a process group (detached) on Unix. */
export function gitProcessTree(child: ChildProcess): { stop: () => void; waitForStop: () => Promise<void> } {
  let stopping: Promise<void> | undefined;
  const stop = () => {
    if (stopping) return;
    const pid = child.pid;
    if (!pid) {
      child.kill();
      stopping = Promise.resolve();
      return;
    }
    stopping = new Promise<void>((done) => {
      if (process.platform === 'win32') {
        const killer = spawn(windowsSystemExecutable('taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('error', () => {
          child.kill();
          done();
        });
        killer.once('close', (code) => {
          if (code === 0) {
            // MSYS descendants can retain inherited pipe handles after the
            // confirmed tree termination. Do not wait for those stale handles.
            child.stdout?.destroy();
            child.stderr?.destroy();
          } else child.kill();
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
  return { stop, waitForStop: () => stopping ?? Promise.resolve() };
}
