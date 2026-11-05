import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { GitSpawnOperations } from '../GitSpawnOperations';
import { windowsSystemExecutable } from '../../system-tools/windowsSystemExecutable';
const { spawnMock, execFileMock } = vi.hoisted(() => ({ spawnMock: vi.fn(), execFileMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock, execFile: execFileMock }));
vi.mock('node:child_process', () => ({ spawn: spawnMock, execFile: execFileMock }));
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
class Child extends EventEmitter {
  pid = 4321;
  stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  kill = vi.fn(() => true);
}
type Mode = 'buffer' | 'input';
const begin = (mode: Mode, signal: AbortSignal) =>
  mode === 'buffer'
    ? new GitSpawnOperations().runBuffer(
        '/repo',
        ['check-attr', '--stdin', 'filter'],
        { maxBytes: 4096, input: 'a.txt\n', tooLargeMessage: 'Too large' },
        signal,
      )
    : new GitSpawnOperations().runWithInput('/repo', ['check-attr', '--stdin', 'filter'], 'a.txt\n', signal);
afterEach(() => {
  spawnMock.mockReset();
  vi.restoreAllMocks();
  Object.defineProperty(process, 'platform', platform);
});

it.each<Mode>(['buffer', 'input'])('does not start an already cancelled %s read', async (mode) => {
  const controller = new AbortController();
  controller.abort();
  const child = new Child();
  spawnMock.mockReturnValue(child);
  const operation = begin(mode, controller.signal);
  // Let a broken implementation settle too, so this regression never relies
  // on a timeout or leaves a rejected Promise behind.
  child.emit('close', 0);
  await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  expect(spawnMock).not.toHaveBeenCalled();
});

it.each<Mode>(['buffer', 'input'])('holds a Windows %s read until its process tree termination is confirmed', async (mode) => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  const child = new Child(),
    killer = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValueOnce(child).mockReturnValueOnce(killer);
  const operation = begin(mode, controller.signal);
  let settled = false;
  const observed = operation.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    controller.abort();
    expect(spawnMock).toHaveBeenNthCalledWith(2, windowsSystemExecutable('taskkill.exe'), ['/PID', '4321', '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    child.emit('close', 0, null);
    await Promise.resolve();
    expect(settled).toBe(false);
    killer.emit('close', 0);
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(child.stdout.destroy).toHaveBeenCalledOnce();
    expect(child.stderr.destroy).toHaveBeenCalledOnce();
  } finally {
    child.emit('close', 0, null);
    killer.emit('close', 0);
    await observed;
  }
});

it.each<Mode>(['buffer', 'input'])('observes cancellation that arrives while the %s process is being created', async (mode) => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  const child = new Child(),
    killer = new Child(),
    controller = new AbortController();
  spawnMock
    .mockImplementationOnce(() => {
      controller.abort();
      return child;
    })
    .mockReturnValueOnce(killer);
  const operation = begin(mode, controller.signal);
  child.emit('close', 0, null);
  killer.emit('close', 0);
  await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  expect(spawnMock).toHaveBeenCalledTimes(2);
});

it.each<Mode>(['buffer', 'input'])('removes the abort listener if the %s process cannot start', async (mode) => {
  const child = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValue(child);
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const operation = begin(mode, controller.signal);
  child.emit('error', new Error('Cannot start Git'));
  await expect(operation).rejects.toThrow('Cannot start Git');
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  child.emit('close', 1, null);
});

it.each([false, true])('waits for termination after a buffer limit and lets cancellation override truncation: %s', async (cancel) => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  const child = new Child(),
    killer = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValueOnce(child).mockReturnValueOnce(killer);
  const operation = new GitSpawnOperations().runBuffer(
    '/repo',
    ['show'],
    { maxBytes: 3, allowTruncation: true, tooLargeMessage: 'Too large' },
    controller.signal,
  );
  let settled = false;
  const observed = operation.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    child.stdout.emit('data', Buffer.from('abcdef'));
    if (cancel) controller.abort();
    child.emit('close', 0, null);
    await Promise.resolve();
    expect(settled).toBe(false);
    killer.emit('close', 0);
    if (cancel) await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    else await expect(operation).resolves.toEqual(Buffer.from('abc'));
  } finally {
    child.emit('close', 0, null);
    killer.emit('close', 0);
    await observed;
  }
});

it.each<Mode>(['buffer', 'input'])('terminates the complete Unix process group for a cancelled %s read', async (mode) => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
  const child = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValue(child);
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
  const operation = begin(mode, controller.signal);
  const observed = operation.catch(() => undefined);
  try {
    controller.abort();
    expect(kill).toHaveBeenCalledWith(-4321, 'SIGKILL');
    expect(spawnMock.mock.calls[0][2]).toMatchObject({ detached: true });
  } finally {
    child.emit('close', null, 'SIGKILL');
    await observed;
  }
});
