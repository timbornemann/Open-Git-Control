import { describe, expect, it, vi } from 'vitest';
import { EXPECTED_NON_FATAL_GIT_ERROR_NAME, GitErrorFormatter } from '../GitErrorFormatter';

describe('GitErrorFormatter', () => {
  it.each([
    ['--get', 'remote.pushDefault'],
    ['--get-all', 'remote.origin.push'],
  ])('does not log an absent optional config key read with %s', (flag, key) => {
    const error = new Error(`Command failed: git config ${flag} ${key}`);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const normalized = new GitErrorFormatter().normalizeGitError(error, ['config', flag, key]);

    expect(normalized.name).toBe(EXPECTED_NON_FATAL_GIT_ERROR_NAME);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('still logs malformed config queries', () => {
    const error = Object.assign(new Error('Command failed: git config --get invalid key'), { stderr: 'error: invalid key: invalid key' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const normalized = new GitErrorFormatter().normalizeGitError(error, ['config', '--get', 'invalid key']);

    expect(normalized.name).toBe('Error');
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
