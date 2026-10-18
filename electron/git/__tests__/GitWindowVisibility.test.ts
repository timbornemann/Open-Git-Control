import { EventEmitter } from 'node:events';
import type * as ChildProcess from 'node:child_process';
import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner, type ExecFileAsyncRunner } from '../GitRunner';
import { GitSpawnOperations } from '../GitSpawnOperations';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', async (importOriginal) => ({ ...(await importOriginal<typeof ChildProcess>()), spawn: spawnMock }));

afterEach(() => vi.restoreAllMocks());

describe('Git subprocess window visibility', () => {
  it.each(['run', 'runResult'] as const)('keeps %s background queries from opening a Windows console', async (method) => {
    const execute = vi.fn<ExecFileAsyncRunner>().mockResolvedValue({ stdout: 'main\n', stderr: '' });
    const runner = new GitRunner(execute);

    await runner[method](os.tmpdir(), ['rev-parse', '--abbrev-ref', 'HEAD'], { requestedKind: 'polling' });

    expect(execute).toHaveBeenCalledOnce();
    const [, args, options] = execute.mock.calls[0];
    expect(args).toEqual(['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(options.cwd).toBe(os.tmpdir());
    expect(options.windowsHide).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps diff preview subprocesses hidden while still returning their output', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });
    spawnMock.mockReturnValue(child);
    const signal = new AbortController().signal;
    const preview = new GitSpawnOperations().getDiffPreview(os.tmpdir(), ['diff', '--', 'file.txt'], 4096, 100, signal);
    child.stdout.emit('data', Buffer.from('+changed\n'));
    child.emit('close', 0, null);

    await expect(preview).resolves.toMatchObject({ text: '+changed\n', truncated: false });
    expect(spawnMock).toHaveBeenCalledOnce();
    const [, args, options] = spawnMock.mock.calls[0];
    expect(args).toEqual(['diff', '--', 'file.txt']);
    expect(options.windowsHide).toBe(true);
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
  });
});
