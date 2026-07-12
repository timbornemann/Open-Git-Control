import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitSpawnOperations } from '../GitSpawnOperations';

const { execFileMock, spawnMock } = vi.hoisted(() => ({ execFileMock: vi.fn(), spawnMock: vi.fn() }));

vi.mock('child_process', () => ({ execFile: execFileMock, spawn: spawnMock }));

class FakeGitProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => true);
}

describe('GitSpawnOperations stream limits', () => {
  afterEach(() => {
    spawnMock.mockReset();
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
});
