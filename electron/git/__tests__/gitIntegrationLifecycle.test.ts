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
let root: string;
let lifecycle: GitIntegrationLifecycle;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-git-lifecycle-'));
  lifecycle = new GitIntegrationLifecycle();
});
afterEach(async () => {
  await lifecycle.close();
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-git-lifecycle-')) throw new Error('Unsafe test cleanup');
  fs.rmSync(root, { recursive: true, force: true });
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
    const filter = "process.stdout.write('filter ready\\n'); setInterval(() => {}, 1000);";
    const script = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(filter)}], { cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'] }); setInterval(() => {}, 1000);`;
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let unwound = false;
    const operation = lifecycle.track(
      (async () => {
        try {
          await lifecycle.runner.streamOutput(root, ['-e', script], (line) => {
            if (line === 'filter ready') ready();
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
    // A live Windows child with this cwd would make this fail with EBUSY.
    fs.rmSync(root, { recursive: true, force: true });
    expect(fs.existsSync(root)).toBe(false);
    await expect(lifecycle.runner.streamOutput(os.tmpdir(), ['-e', "throw new Error('must not run')"], vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
  }, 15000);
});
