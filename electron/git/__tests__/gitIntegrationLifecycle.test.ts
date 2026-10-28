import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from './gitIntegrationLifecycle';
import { GitService } from '../../GitService';

// Exercise real process ownership without running a network transfer or
// relying on the installed Git's hook shell. Node acts as Git and its filter.
vi.mock('../../system-tools/toolRuntime', () => ({
  toolExecutable: () => process.execPath,
  toolEnvironment: (env: NodeJS.ProcessEnv) => ({ ...process.env, ...env }),
}));
const fixtureParent = fs.realpathSync.native(os.tmpdir());
let root: string;
let lifecycle: GitIntegrationLifecycle;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(fixtureParent, 'ogc-git-lifecycle-'));
  lifecycle = new GitIntegrationLifecycle();
});
const removeFixture = async () => {
  if (path.dirname(root) !== fixtureParent || !path.basename(root).startsWith('ogc-git-lifecycle-')) throw new Error('Unsafe test cleanup');
  await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
};

const processIsRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
};

afterEach(async () => {
  await lifecycle.close();
  await removeFixture();
});

describe('Git integration fixture teardown', () => {
  it('cancels GitService work and queued writes and waits for their callers before cleanup', async () => {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const execute = vi.fn(async (_file, _args, { signal }) => {
      return new Promise<{ stdout: string; stderr: string }>((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
        ready();
      });
    });
    const service = new GitService(execute, lifecycle.scheduler);
    let unwound = false;
    const read = lifecycle.track(
      service.runCommandAtPath(root, ['status', '--porcelain']).finally(async () => {
        await Promise.resolve();
        unwound = true;
      }),
    );
    const readOutcome = read.catch((error: Error) => error);
    await started;
    const queuedWrite = service.runCommandAtPath(root, ['commit', '-m', 'must not run']).catch((error: Error) => error);

    await lifecycle.close();

    expect(await readOutcome).toMatchObject({ name: 'AbortError' });
    expect(await queuedWrite).toMatchObject({ name: 'AbortError' });
    expect(unwound).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(service.runCommandAtPath(root, ['status'])).rejects.toMatchObject({ name: 'AbortError' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('aborts a running process and its filter and drains the test continuation before cleanup', async () => {
    const filter = "console.log('filter ready ' + process.pid); setInterval(() => {}, 1000);";
    const script = `console.log('git ready ' + process.pid); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(filter)}], { cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'] }); setInterval(() => {}, 1000);`;
    const pids = new Set<number>();
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let unwound = false;
    const operation = lifecycle.track(
      (async () => {
        try {
          await lifecycle.runner.streamOutput(root, ['-e', script], (line) => {
            const match = /^(?:git|filter) ready (\d+)$/.exec(line);
            if (match) pids.add(Number(match[1]));
            if (pids.size === 2) ready();
          });
        } finally {
          await Promise.resolve();
          unwound = true;
        }
      })(),
    );
    const outcome = operation.catch((error: Error) => error);
    await Promise.race([
      started,
      operation.then(() => {
        throw new Error('Process exited before starting the filter.');
      }),
    ]);

    await lifecycle.close();

    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(unwound).toBe(true);
    expect(pids.size).toBe(2);
    if (process.platform === 'win32') {
      // Check process termination independently: filesystem retries must not hide a live filter.
      await expect.poll(() => [...pids].filter(processIsRunning), { timeout: 5000, interval: 25 }).toEqual([]);
    }
    // Windows can release cwd/I/O handles shortly after the processes exit.
    await removeFixture();
    expect(fs.existsSync(root)).toBe(false);
    await expect(lifecycle.runner.streamOutput(os.tmpdir(), ['-e', "throw new Error('must not run')"], vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
  }, 15000);
});
