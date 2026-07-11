import { afterEach, describe, expect, it, vi } from 'vitest';

const { statSyncMock } = vi.hoisted(() => ({ statSyncMock: vi.fn() }));
vi.mock('fs', () => ({ statSync: statSyncMock }));

import { assertRepoPathAvailable, isRepoPathAccessible } from '../GitRepositoryPath';

const statError = (code: string): NodeJS.ErrnoException => {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
};

describe('isRepoPathAccessible', () => {
  afterEach(() => {
    statSyncMock.mockReset();
  });

  it('is accessible for an existing directory', () => {
    statSyncMock.mockReturnValue({ isDirectory: () => true });
    expect(isRepoPathAccessible('/repo')).toBe(true);
  });

  it('is not accessible when the path is a file', () => {
    statSyncMock.mockReturnValue({ isDirectory: () => false });
    expect(isRepoPathAccessible('/repo')).toBe(false);
  });

  it('reports unavailable only for a genuinely missing path', () => {
    statSyncMock.mockImplementation(() => {
      throw statError('ENOENT');
    });
    expect(isRepoPathAccessible('/repo')).toBe(false);
    expect(() => assertRepoPathAvailable('/repo')).toThrow(/no longer available/i);
  });

  it('does not report a transient OS error as an unavailable repository', () => {
    // A briefly locked handle / too-many-open-files / permission blip under
    // heavy load must not remove a valid repository from the app.
    for (const code of ['EPERM', 'EBUSY', 'EMFILE', 'EACCES', 'EAGAIN']) {
      statSyncMock.mockImplementation(() => {
        throw statError(code);
      });
      expect(isRepoPathAccessible('/repo')).toBe(true);
      expect(() => assertRepoPathAvailable('/repo')).not.toThrow();
    }
  });
});
