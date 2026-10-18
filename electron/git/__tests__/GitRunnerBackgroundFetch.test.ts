import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { GitSpawnOperations } from '../GitSpawnOperations';
import { BackgroundFetchPreemptedError } from '../BackgroundFetchPreemptedError';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFile: vi.fn(), spawn }));
vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn }));
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
  spawn.mockReset();
  vi.restoreAllMocks();
});

describe('runner automatic fetch ownership', () => {
  it('waits for Windows descendant termination as well as Git exit before starting staging', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    const child = Object.assign(new EventEmitter(), {
      pid: 4321,
      stdout: Object.assign(new EventEmitter(), { destroy: vi.fn() }),
      stderr: Object.assign(new EventEmitter(), { destroy: vi.fn() }),
      kill: vi.fn(),
    });
    const killer = new EventEmitter();
    spawn.mockReturnValueOnce(child).mockReturnValueOnce(killer);
    const runner = new GitRunner();
    const fetch = runner.streamOutput(os.tmpdir(), ['fetch', 'origin'], () => {}, undefined, { backgroundFetch: true });
    const failure = expect(fetch).rejects.toBeInstanceOf(BackgroundFetchPreemptedError);
    const stageFile = vi.fn(async () => 'staged');
    const stage = runner.schedule(os.tmpdir(), 'write', 'add', stageFile);
    expect(spawn.mock.calls[1][1]).toEqual(['/PID', '4321', '/T', '/F']);
    child.emit('close', null, 'SIGTERM');
    await Promise.resolve();
    expect(stageFile).not.toHaveBeenCalled();
    killer.emit('close', 0);
    await failure;
    await expect(stage).resolves.toBe('staged');
    expect(stageFile).toHaveBeenCalledOnce();
    expect(child.stdout.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    { args: ['fetch', 'origin'], background: false, kind: 'network' },
    { args: ['-c', 'fetch.prune=true', 'fetch', 'origin'], background: true, kind: 'background-fetch' },
    { args: ['push', 'origin'], background: true, kind: 'network' },
    { args: ['lfs', 'push', 'origin'], background: true, kind: 'network' },
  ])('uses $kind for $args (automatic: $background)', async ({ args, background, kind }) => {
    vi.spyOn(GitSpawnOperations.prototype, 'streamOutput').mockResolvedValue('ok');
    const runner = new GitRunner();
    await runner.streamOutput(os.tmpdir(), args, () => {}, undefined, { backgroundFetch: background });
    expect(runner.getSchedulerDiagnostics()).toEqual([expect.objectContaining({ kind, aborted: false })]);
  });
});
