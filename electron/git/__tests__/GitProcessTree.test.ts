import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitProcessTree } from '../GitProcessTree';
import { windowsSystemExecutable } from '../../system-tools/windowsSystemExecutable';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn }));
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const setPlatform = (platform: string) => Object.defineProperty(process, 'platform', { configurable: true, value: platform });
const child = () => ({ pid: 4321, kill: vi.fn(), stdout: { destroy: vi.fn() }, stderr: { destroy: vi.fn() } });
afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
  vi.restoreAllMocks();
  spawn.mockReset();
});

describe('owned Git process trees', () => {
  it('waits for Windows tree termination and releases inherited pipes, stopping only once', async () => {
    setPlatform('win32');
    const git = child();
    const killer = new EventEmitter();
    spawn.mockReturnValue(killer);
    const tree = gitProcessTree(git as unknown as ChildProcess);
    tree.stop();
    tree.stop();
    expect(spawn).toHaveBeenCalledExactlyOnceWith(windowsSystemExecutable('taskkill.exe'), ['/PID', '4321', '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    const finished = vi.fn();
    const stopping = tree.waitForStop().then(finished);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    expect(git.stdout.destroy).not.toHaveBeenCalled();

    killer.emit('close', 0);
    await stopping;
    expect(finished).toHaveBeenCalledOnce();
    expect(git.stdout.destroy).toHaveBeenCalledOnce();
    expect(git.stderr.destroy).toHaveBeenCalledOnce();
    expect(git.kill).not.toHaveBeenCalled();
  });

  it.each(['error', 'non-zero'])('falls back if Windows tree termination fails (%s)', async (failure) => {
    setPlatform('win32');
    const git = child();
    const killer = new EventEmitter();
    spawn.mockReturnValue(killer);
    const tree = gitProcessTree(git as unknown as ChildProcess);
    tree.stop();
    if (failure === 'error') killer.emit('error', new Error('taskkill missing'));
    else killer.emit('close', 1);
    await tree.waitForStop();
    expect(git.kill).toHaveBeenCalledOnce();
    // A failed tree kill is no proof that descendants released their pipes.
    expect(git.stdout.destroy).not.toHaveBeenCalled();
  });

  it.each(['linux', 'darwin'])('stops the dedicated Unix process group on %s', async (platform) => {
    setPlatform(platform);
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const git = child();
    const tree = gitProcessTree(git as unknown as ChildProcess);
    tree.stop();
    await tree.waitForStop();
    expect(kill).toHaveBeenCalledExactlyOnceWith(-4321, 'SIGKILL');
    expect(git.kill).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('falls back when the Unix group is already gone', async () => {
    setPlatform('linux');
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    const git = child();
    const tree = gitProcessTree(git as unknown as ChildProcess);
    tree.stop();
    await tree.waitForStop();
    expect(git.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  });
});
