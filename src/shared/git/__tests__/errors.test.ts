import { describe, expect, it } from 'vitest';
import { createRepoUnavailableErrorMessage, isRepoUnavailableError, REPO_UNAVAILABLE_ERROR_PREFIX } from '../errors';

describe('shared git error classification', () => {
  it('detects repository unavailable errors from renderer, node and git output', () => {
    expect(isRepoUnavailableError('[REPO_UNAVAILABLE] Repository is gone')).toBe(true);
    expect(isRepoUnavailableError('fatal: not a git repository (or any of the parent directories): .git')).toBe(true);
    expect(isRepoUnavailableError('No repository path set.')).toBe(true);
    expect(isRepoUnavailableError("fatal: cannot change to 'D:/missing': No such file or directory")).toBe(true);
    expect(isRepoUnavailableError('fatal: Unable to get current working directory')).toBe(true);
    expect(isRepoUnavailableError('Error: uv_cwd')).toBe(true);
  });

  it('does not classify ordinary git failures as repository unavailable', () => {
    expect(isRepoUnavailableError('fatal: bad revision HEAD~12')).toBe(false);
    expect(isRepoUnavailableError('merge conflict in src/App.tsx')).toBe(false);
    expect(isRepoUnavailableError('')).toBe(false);
    expect(isRepoUnavailableError(null)).toBe(false);
  });

  it('creates a stable tagged message for IPC and renderer classifiers', () => {
    const message = createRepoUnavailableErrorMessage('fatal: cannot change to repo');

    expect(message.startsWith(REPO_UNAVAILABLE_ERROR_PREFIX)).toBe(true);
    expect(message).toContain('Git Output: fatal: cannot change to repo');
    expect(isRepoUnavailableError(message)).toBe(true);
  });
});
