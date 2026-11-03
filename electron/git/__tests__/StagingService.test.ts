import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitRunner, type ExecFileAsyncRunner } from '../GitRunner';
import { StagingService } from '../StagingService';

let repo: string;
beforeEach(() => {
  repo = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'ogc-stage-service-'));
  fs.writeFileSync(path.join(repo, 'file.txt'), 'text');
});
afterEach(() => {
  if (path.dirname(repo) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(repo).startsWith('ogc-stage-service-')) throw new Error('Unsafe fixture.');
  fs.rmSync(repo, { recursive: true, force: true });
});
describe('exclusive staging', () => {
  it('preempts background work before validation and runs only one index writer', async () => {
    let reading!: () => void;
    const began = new Promise<void>((resolve) => {
      reading = resolve;
    });
    let activeWrites = 0,
      maximumWrites = 0;
    const execute = vi.fn<ExecFileAsyncRunner>(async (_file, args, options) => {
      if (args[0] === 'diff')
        return new Promise((_resolve, reject) => {
          reading();
          options.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      if (args[0] === 'ls-files') return { stdout: 'file.txt\0', stderr: '' };
      if (args[0] === 'add') {
        activeWrites++;
        maximumWrites = Math.max(maximumWrites, activeWrites);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        activeWrites--;
      }
      return { stdout: '', stderr: '' };
    });
    const runner = new GitRunner(execute);
    const staging = new StagingService(runner);
    const background = runner.run(repo, ['diff', '--numstat'], { requestedKind: 'background' });
    const cancelled = expect(background).rejects.toMatchObject({ name: 'AbortError' });
    await began;
    await Promise.all([staging.stagePathsAtPath(repo, ['file.txt']), staging.stageCommandAtPath(repo, ['add', '-A'])]);
    await cancelled;
    expect(maximumWrites).toBe(1);
    expect(execute.mock.calls.filter(([, args]) => args[0] === 'add')).toHaveLength(2);
    expect(staging.getDiagnostics()).toHaveLength(2);
    expect(staging.getDiagnostics().every((entry) => entry.success && entry.queueWaitMs >= 0 && entry.validationMs >= 0)).toBe(true);
  });

  it('rechecks authorization after validation and never starts Git when it changed', async () => {
    let allowed = true;
    const execute = vi.fn<ExecFileAsyncRunner>(async (_file, args) => {
      if (args[0] === 'ls-files') allowed = false;
      return { stdout: 'file.txt\0', stderr: '' };
    });
    const staging = new StagingService(new GitRunner(execute));
    await expect(
      staging.stagePathsAtPath(repo, ['file.txt'], () => {
        if (!allowed) throw new Error('Commit protection is active.');
      }),
    ).rejects.toThrow('Commit protection');
    expect(execute.mock.calls.some(([, args]) => args[0] === 'add')).toBe(false);
    expect(staging.getDiagnostics()[0].success).toBe(false);
  });

  it('rechecks protection before retrying an externally locked index', async () => {
    let allowed = true;
    const execute = vi.fn<ExecFileAsyncRunner>(async (_file, args) => {
      if (args[0] === 'add') {
        allowed = false;
        throw new Error('Unable to create index.lock: File exists.');
      }
      return { stdout: 'file.txt\0', stderr: '' };
    });
    const staging = new StagingService(new GitRunner(execute));
    await expect(
      staging.stagePathsAtPath(repo, ['file.txt'], () => {
        if (!allowed) throw new Error('Commit protection is active.');
      }),
    ).rejects.toThrow('Commit protection');
    expect(execute.mock.calls.filter(([, args]) => args[0] === 'add')).toHaveLength(1);
    expect(staging.getDiagnostics()[0].success).toBe(false);
  });
});
