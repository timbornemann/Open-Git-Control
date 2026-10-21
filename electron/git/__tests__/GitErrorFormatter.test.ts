import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPECTED_NON_FATAL_GIT_ERROR_NAME, GitErrorFormatter } from '../GitErrorFormatter';

afterEach(() => vi.restoreAllMocks());

describe('GitErrorFormatter', () => {
  it.each(['git', 'C:\\Program Files\\Git\\cmd\\git.exe', '/usr/local/bin/git'])(
    'treats a quiet missing-ref exit from %s as an expected lookup result',
    (executable) => {
      const args = ['rev-parse', '--verify', '--quiet', 'refs/heads/task/missing^{commit}'];
      const error = Object.assign(new Error(`Command failed: ${executable} ${args.join(' ')}`), { code: 1, stdout: '', stderr: '' });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const normalized = new GitErrorFormatter().normalizeGitError(error, args);
      expect(normalized.name).toBe(EXPECTED_NON_FATAL_GIT_ERROR_NAME);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );
  it.each([
    [128, 'fatal: corrupt object file'],
    [1, 'fatal: permission denied'],
    [137, ''],
  ])('keeps real quiet-ref failures visible (exit %s, %s)', (code, stderr) => {
    const args = ['rev-parse', '--verify', '--quiet', 'refs/heads/task/example^{commit}'];
    const error = Object.assign(new Error(`Command failed: git ${args.join(' ')}`), { code, stdout: '', stderr });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(new GitErrorFormatter().normalizeGitError(error, args).name).toBe('Error');
    expect(consoleError).toHaveBeenCalledOnce();
  });

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
