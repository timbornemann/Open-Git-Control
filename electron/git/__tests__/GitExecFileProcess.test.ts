import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultExecFileAsyncRunner } from '../GitProcessTypes';
import { windowsSystemExecutable } from '../../system-tools/windowsSystemExecutable';

const { spawnMock, execFileMock } = vi.hoisted(() => {
  const execFileMock = vi.fn();
  Object.defineProperty(execFileMock, Symbol.for('nodejs.util.promisify.custom'), {
    value: () => Promise.resolve({ stdout: '', stderr: '' }),
  });
  return { spawnMock: vi.fn(), execFileMock };
});
vi.mock('child_process', () => ({ spawn: spawnMock, execFile: execFileMock }));
vi.mock('node:child_process', () => ({ spawn: spawnMock, execFile: execFileMock }));
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
class Child extends EventEmitter {
  pid: number | undefined = 4321;
  stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  kill = vi.fn(() => true);
}
const run = (signal?: AbortSignal, maxBuffer = 1024) =>
  defaultExecFileAsyncRunner('practice-git', ['status', '-z'], { cwd: '/practice', env: { PATH: 'practice' }, maxBuffer, signal, windowsHide: true });
beforeEach(() => {
  spawnMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, 'platform', platform);
});

it('rejects an already cancelled command without creating a process', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(run(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(spawnMock).not.toHaveBeenCalled();
});

it('preserves UTF-8 chunk boundaries, NUL records, raw whitespace and stderr independently', async () => {
  const child = new Child();
  spawnMock.mockReturnValue(child);
  const pending = run();
  const bytes = Buffer.from('Grüße\0README.md\0\n');
  child.stdout.emit('data', bytes.subarray(0, 3));
  child.stdout.emit('data', bytes.subarray(3));
  child.stderr.emit('data', Buffer.from('warning\n'));
  child.emit('close', 0, null);
  await expect(pending).resolves.toEqual({ stdout: 'Grüße\0README.md\0\n', stderr: 'warning\n' });
  expect(spawnMock).toHaveBeenCalledWith(
    'practice-git',
    ['status', '-z'],
    expect.objectContaining({ cwd: '/practice', env: { PATH: 'practice' }, windowsHide: true }),
  );
});

it('retains non-zero exit codes and both output streams for existing Git error handling', async () => {
  const child = new Child();
  spawnMock.mockReturnValue(child);
  const pending = run();
  child.stdout.emit('data', Buffer.from('partial records\0'));
  child.stderr.emit('data', Buffer.from('index.lock is present\n'));
  child.emit('close', 17, null);
  await expect(pending).rejects.toMatchObject({ code: 17, stdout: 'partial records\0', stderr: 'index.lock is present\n' });
});

it('does not release a cancelled Windows command until tree termination is confirmed', async () => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  const child = new Child(),
    killer = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValueOnce(child).mockReturnValueOnce(killer);
  const pending = run(controller.signal);
  let settled = false;
  const observed = pending.then(
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
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    child.emit('close', 0, null);
    killer.emit('close', 0);
    await observed;
  }
});

it('observes cancellation arriving during process creation', async () => {
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
  const pending = run(controller.signal);
  child.emit('close', 0, null);
  killer.emit('close', 0);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(spawnMock).toHaveBeenCalledTimes(2);
});

it('uses and cancels an owned Unix process group', async () => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
  const child = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValue(child);
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
  const pending = run(controller.signal);
  controller.abort();
  child.emit('close', null, 'SIGKILL');
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(kill).toHaveBeenCalledWith(-4321, 'SIGKILL');
  expect(spawnMock).toHaveBeenCalledWith('practice-git', ['status', '-z'], expect.objectContaining({ detached: true }));
});

it.each(['stdout', 'stderr'] as const)('bounds %s and waits for the whole process tree when the limit is exceeded', async (stream) => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  const child = new Child(),
    killer = new Child();
  spawnMock.mockReturnValueOnce(child).mockReturnValueOnce(killer);
  const pending = run(undefined, 4);
  child[stream].emit('data', Buffer.from('abcdef'));
  child.emit('close', 1, null);
  killer.emit('close', 0);
  await expect(pending).rejects.toMatchObject({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', [stream]: 'abcd' });
  expect(spawnMock).toHaveBeenCalledTimes(2);
});

it('applies the byte limit independently to stdout and stderr', async () => {
  const child = new Child();
  spawnMock.mockReturnValue(child);
  const pending = run(undefined, 3);
  child.stdout.emit('data', Buffer.from('abc'));
  child.stderr.emit('data', Buffer.from('xyz'));
  child.emit('close', 0, null);
  await expect(pending).resolves.toEqual({ stdout: 'abc', stderr: 'xyz' });
});

it('lets explicit cancellation override a size-limit error and only stops the tree once', async () => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  const child = new Child(),
    killer = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValueOnce(child).mockReturnValueOnce(killer);
  const pending = run(controller.signal, 2);
  child.stdout.emit('data', Buffer.from('abcd'));
  controller.abort();
  child.emit('close', 0, null);
  killer.emit('close', 0);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(spawnMock).toHaveBeenCalledTimes(2);
});

it('removes the abort listener on a failed process start', async () => {
  const child = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValue(child);
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const pending = run(controller.signal);
  child.pid = undefined;
  child.emit('error', Object.assign(new Error('Cannot start Git'), { code: 'ENOENT' }));
  await expect(pending).rejects.toMatchObject({ code: 'ENOENT' });
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  child.emit('close', -1, null);
});

it('does not kill a finished process after a later abort', async () => {
  const child = new Child(),
    controller = new AbortController();
  spawnMock.mockReturnValue(child);
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const pending = run(controller.signal);
  child.emit('close', 0, null);
  await pending;
  controller.abort();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(spawnMock).toHaveBeenCalledOnce();
});
