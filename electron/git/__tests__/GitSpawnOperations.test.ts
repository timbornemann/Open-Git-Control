import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitSpawnOperations } from '../GitSpawnOperations';
import { windowsSystemExecutable } from '../../system-tools/windowsSystemExecutable';

const { execFileMock, spawnMock } = vi.hoisted(() => ({ execFileMock: vi.fn(), spawnMock: vi.fn() }));

vi.mock('child_process', () => ({ execFile: execFileMock, spawn: spawnMock }));
vi.mock('node:child_process', () => ({ execFile: execFileMock, spawn: spawnMock }));
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

class FakeGitProcess extends EventEmitter {
  stdout = Object.assign(new EventEmitter(), { destroy: vi.fn(), pause: vi.fn(), resume: vi.fn() });
  stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  kill = vi.fn(() => {
    queueMicrotask(() => this.emit('close', null, 'SIGTERM'));
    return true;
  });
}

describe('GitSpawnOperations stream limits', () => {
  afterEach(() => {
    spawnMock.mockReset();
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('streams CR-delimited push diagnostics before exit while preserving partial porcelain results and a final error', async () => {
    const child = new FakeGitProcess();
    spawnMock.mockReturnValue(child);
    const progress = vi.fn();
    const result = new GitSpawnOperations().streamResult('/repo', ['push', '--porcelain', '--progress'], progress, new AbortController().signal);
    let completed = false;
    void result.then(() => {
      completed = true;
    });
    child.stdout.emit('data', Buffer.from('Uploading LFS objects: 50% (4/8), 4 MB | 1 MB/s\r'));
    child.stdout.emit('data', Buffer.from('Uploading LFS objects: 100% (8/8), 8 MB | 0 B/s, done.\r\n'));
    expect(progress).toHaveBeenCalledWith('Uploading LFS objects: 50% (4/8), 4 MB | 1 MB/s');
    expect(completed).toBe(false);
    child.stdout.emit('data', Buffer.from('*\tabc:refs/heads/main\t[new branch]\n!\tdef:refs/tags/v1\t[rejected]\n'));
    child.stderr.emit('data', Buffer.from('remote: tag rejected after LFS upload'));
    child.emit('close', 1, null);
    await expect(result).resolves.toMatchObject({
      exitCode: 1,
      stdout: expect.stringContaining('*\tabc:refs/heads/main'),
      stderr: 'remote: tag rejected after LFS upload',
    });
    expect(progress).toHaveBeenLastCalledWith('remote: tag rejected after LFS upload');
  });

  it('preserves split UTF-8 in both streamed and captured push output', async () => {
    const child = new FakeGitProcess();
    spawnMock.mockReturnValue(child);
    const progress = vi.fn();
    const result = new GitSpawnOperations().streamResult('/repo', ['push'], progress, new AbortController().signal);
    const bytes = Buffer.from('remote: Grüße\n');
    for (const byte of bytes) child.stderr.emit('data', Buffer.from([byte]));
    child.emit('close', 0, null);
    await expect(result).resolves.toMatchObject({ stderr: 'remote: Grüße\n' });
    expect(progress).toHaveBeenCalledExactlyOnceWith('remote: Grüße');
  });

  it('does not resolve a streamed push as successful when cancellation follows a completed LFS meter', async () => {
    const child = new FakeGitProcess();
    spawnMock.mockReturnValue(child);
    const controller = new AbortController();
    const result = new GitSpawnOperations().streamResult('/repo', ['push'], vi.fn(), controller.signal);
    child.stdout.emit('data', Buffer.from('Uploading LFS objects: 100% (8/8), 8 MB | 0 B/s, done.\n'));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it.each([
    [['diff', '--no-index', '--', '/dev/null', 'new.txt'], 1, true],
    [['diff', '--no-index', '--', '/dev/null', 'missing.txt'], 128, false],
    [['diff', '--', 'new.txt'], 1, false],
  ] as const)('accepts only the successful no-index diff exit status for %j', async (args, code, success) => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const operation = new GitSpawnOperations().getDiffPreview('/repo', [...args], 65536, 100, new AbortController().signal);
    process.stdout.emit('data', Buffer.from('diff content'));
    process.emit('close', code, null);

    if (success) {
      await expect(operation).resolves.toMatchObject({ text: 'diff content', truncated: false });
    } else {
      await expect(operation).rejects.toThrow(`exited with code ${code}`);
    }
  });

  it('rejects an unterminated stream line before retaining it without bound', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const controller = new AbortController();
    const operation = new GitSpawnOperations().streamLines('/repo', ['show'], vi.fn(), controller.signal);

    process.stdout.emit('data', Buffer.alloc(1024 * 1024 + 1, 'x'));

    await expect(operation).rejects.toThrow('line exceeded the 1 MB limit');
    expect(process.kill).toHaveBeenCalledTimes(1);
  });

  it('caps total streamed output even when every line is terminated', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const controller = new AbortController();
    const operation = new GitSpawnOperations().streamOutput('/repo', ['status'], vi.fn(), controller.signal);

    process.stdout.emit('data', Buffer.alloc(8 * 1024 * 1024 + 1, 'x'));

    await expect(operation).rejects.toThrow('output exceeded the 8 MB limit');
    expect(process.kill).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('delivers opted-in long lines as bounded Unicode-safe fragments (final newline: %s)', async (newline) => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const parts: Array<{ line: string; fragment?: { first: boolean; last: boolean } }> = [];
    const operation = new GitSpawnOperations().streamLines(
      '/repo',
      ['show'],
      (line, fragment) => {
        parts.push({ line, fragment });
      },
      new AbortController().signal,
      { redactOutput: false, fragmentLongLines: true },
    );
    const longLine = 'x'.repeat(65535) + '😀' + 'ä'.repeat(1024 * 1024);
    const bytes = Buffer.from(`${longLine}\r\nnext${newline ? '\n' : ''}`);
    for (let offset = 0; offset < bytes.length; offset += 32767) process.stdout.emit('data', bytes.subarray(offset, offset + 32767));
    process.emit('close', 0);
    await operation;
    const fragments = parts.filter((part) => part.fragment);
    expect(fragments.map((part) => part.line).join('')).toBe(longLine);
    expect(fragments[0].fragment).toEqual({ first: true, last: false });
    expect(fragments.at(-1)?.fragment).toEqual({ first: false, last: true });
    expect(fragments.every((part) => part.line.length <= 65536 && !/^[\udc00-\udfff]|[\ud800-\udbff]$/.test(part.line))).toBe(true);
    expect(parts.at(-1)).toEqual({ line: 'next', fragment: undefined });
    expect(process.kill).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'error'])('stops the process when a fragmented line consumer reports %s', async (mode) => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const controller = new AbortController();
    const consumer = vi.fn(() => {
      if (mode === 'cancel') controller.abort();
      else throw new Error('Fragment scan failed');
    });
    const operation = new GitSpawnOperations().streamLines('/repo', ['show'], consumer, controller.signal, { redactOutput: false, fragmentLongLines: true });
    process.stdout.emit('data', Buffer.alloc(2 * 1024 * 1024, 'x'));
    if (mode === 'cancel') await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    else await expect(operation).rejects.toThrow('Fragment scan failed');
    expect(consumer).toHaveBeenCalledTimes(1);
    expect(process.kill).toHaveBeenCalledOnce();
  });

  it('requires an explicit raw consumer before fragmenting potentially sensitive output', async () => {
    await expect(new GitSpawnOperations().streamLines('/repo', ['show'], vi.fn(), new AbortController().signal, { fragmentLongLines: true })).rejects.toThrow(
      'explicit raw-output consumer',
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('preserves Unicode characters split across line-stream chunks', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const lines: string[] = [];
    const operation = new GitSpawnOperations().streamLines(
      '/repo',
      ['show'],
      (line) => {
        lines.push(line);
      },
      new AbortController().signal,
      { redactOutput: false },
    );
    const bytes = Buffer.from('src/ä😀/日本語.ts\r\nlast ä');
    for (const byte of bytes) process.stdout.emit('data', Buffer.from([byte]));
    process.emit('close', 0);
    await operation;
    expect(lines).toEqual(['src/ä😀/日本語.ts', 'last ä']);
  });

  it('waits for asynchronous line consumers after the process exits', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lines: string[] = [];
    let completed = false;
    const operation = new GitSpawnOperations().streamLines(
      '/repo',
      ['show'],
      async (line) => {
        lines.push(line);
        if (line === 'first') await held;
      },
      new AbortController().signal,
    );
    void operation.then(() => {
      completed = true;
    });
    process.stdout.emit('data', Buffer.from('first\nsecond\nlast'));
    process.emit('close', 0);
    await vi.waitFor(() => expect(lines).toEqual(['first']));
    expect(completed).toBe(false);
    release();
    await operation;
    expect(lines).toEqual(['first', 'second', 'last']);
  });

  it('reports consumer failures and stops their Git process', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const operation = new GitSpawnOperations().streamLines(
      '/repo',
      ['show'],
      async () => {
        throw new Error('Scanner failed');
      },
      new AbortController().signal,
    );
    process.stdout.emit('data', Buffer.from('line\n'));
    await expect(operation).rejects.toThrow('Scanner failed');
    expect(process.kill).toHaveBeenCalledOnce();
  });

  it('assembles clone progress across chunks and split UTF-8 code points', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const progress = vi.fn();
    const operation = new GitSpawnOperations().cloneWithProgress('https://example.test/repo.git', '/target', progress);
    const output = Buffer.from('Receiving objects: 50% ä\rResolving deltas: 100%\r\nfinal tail', 'utf8');
    const umlautStart = output.indexOf(Buffer.from('ä', 'utf8'));

    process.stderr.emit('data', output.subarray(0, umlautStart + 1));
    process.stderr.emit('data', output.subarray(umlautStart + 1, output.length - 4));
    process.stderr.emit('data', output.subarray(output.length - 4));
    process.emit('close', 0);

    await expect(operation).resolves.toEqual({ success: true });
    expect(progress.mock.calls.map(([line]) => line)).toEqual(['Receiving objects: 50% ä', 'Resolving deltas: 100%', 'final tail']);
  });

  it('uses complete assembled clone lines in a failure tail', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const operation = new GitSpawnOperations().cloneWithProgress('https://example.test/repo.git', '/target', vi.fn());

    process.stderr.emit('data', Buffer.from('fatal: remote end hung '));
    process.stderr.emit('data', Buffer.from('up unexpectedly'));
    process.emit('close', 128);

    await expect(operation).resolves.toEqual({
      success: false,
      error: 'fatal: remote end hung up unexpectedly',
    });
  });

  it('flushes an unterminated clone progress tail when spawning fails', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const progress = vi.fn();
    const operation = new GitSpawnOperations().cloneWithProgress('https://example.test/repo.git', '/target', progress);

    process.stderr.emit('data', Buffer.from('clone setup before spawn failure'));
    process.emit('error', new Error('spawn failed'));

    await expect(operation).resolves.toEqual({ success: false, error: 'spawn failed' });
    expect(progress).toHaveBeenCalledWith('clone setup before spawn failure');
  });

  it('bounds an unterminated clone progress line', async () => {
    const process = new FakeGitProcess();
    spawnMock.mockReturnValue(process);
    const operation = new GitSpawnOperations().cloneWithProgress('https://example.test/repo.git', '/target', vi.fn());

    process.stderr.emit('data', Buffer.alloc(1024 * 1024 + 1, 'x'));

    await expect(operation).resolves.toEqual({ success: false, error: 'Git clone progress line exceeded the 1 MB limit.' });
    expect(process.kill).toHaveBeenCalledTimes(1);
  });

  it('passes scoped credential environment to streamed transfers and clone and stops clone on cancellation', async () => {
    const transferProcess = new FakeGitProcess();
    spawnMock.mockReturnValue(transferProcess);
    const signal = new AbortController();
    const stream = new GitSpawnOperations().streamOutput('/repo', ['fetch', 'origin'], vi.fn(), signal.signal, { OGC_OPERATION_SESSION: 'opaque-session' });
    expect(spawnMock.mock.calls[0][2].env.OGC_OPERATION_SESSION).toBe('opaque-session');
    transferProcess.emit('close', 0);
    await expect(stream).resolves.toBe('');
    const cloneProcess = new FakeGitProcess();
    spawnMock.mockReturnValue(cloneProcess);
    const clone = new GitSpawnOperations().cloneWithProgress('https://example.test/repo.git', '/target', vi.fn(), {
      envOverrides: { OGC_OPERATION_SESSION: 'second-session' },
      signal: signal.signal,
    });
    expect(spawnMock.mock.calls[1][2].env.OGC_OPERATION_SESSION).toBe('second-session');
    signal.abort();
    expect(cloneProcess.kill).toHaveBeenCalledTimes(1);
    cloneProcess.emit('close', 0);
    await expect(clone).resolves.toEqual({ success: false, error: 'Git clone was aborted.' });
  });

  it('does not start a clone when the account or operation was already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new GitSpawnOperations().cloneWithProgress('https://example.test/repo.git', '/target', vi.fn(), { signal: controller.signal }),
    ).resolves.toEqual({ success: false, error: 'Git clone was aborted.' });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each(['clone', 'pull'] as const)('waits for Windows child processes to stop before completing an aborted %s', async (kind) => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    const git = Object.assign(new FakeGitProcess(), { pid: 4321 });
    const killer = new FakeGitProcess();
    spawnMock.mockReturnValueOnce(git).mockReturnValueOnce(killer);
    const controller = new AbortController();
    const operations = new GitSpawnOperations();
    const operation =
      kind === 'clone'
        ? operations.cloneWithProgress('https://example.test/repo.git', '/target', vi.fn(), { signal: controller.signal })
        : operations.streamOutput('/repo', ['pull', 'origin'], vi.fn(), controller.signal);
    const finished = vi.fn();
    const outcome = operation.then(
      (value) => {
        finished();
        return value;
      },
      (error) => {
        finished();
        return error;
      },
    );
    controller.abort();
    expect(spawnMock.mock.calls[1].slice(0, 2)).toEqual([windowsSystemExecutable('taskkill.exe'), ['/PID', '4321', '/T', '/F']]);
    git.emit('close', null);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();

    killer.emit('close', 0);

    if (kind === 'clone') expect(await outcome).toEqual({ success: false, error: 'Git clone was aborted.' });
    else expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(git.stdout.destroy).toHaveBeenCalledOnce();
    expect(git.stderr.destroy).toHaveBeenCalledOnce();
  });
});
