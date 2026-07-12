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
});
