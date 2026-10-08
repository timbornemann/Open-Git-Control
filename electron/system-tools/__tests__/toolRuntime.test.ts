import { describe, expect, it, vi } from 'vitest';
import { manageToolRuntime, toolEnvironment, toolExecutable, updateToolRuntime } from '../toolRuntime';
import { GitProcessExecutor } from '../../git/GitProcessExecutor';
import { isRepoUnavailableError } from '../../../src/shared/git/errors';
import * as path from 'node:path';

describe('verified executables used by Git operations', () => {
  it('blocks unverified Git without classifying the repository as removed, then routes through the discovered executable', async () => {
    expect(toolExecutable('github-cli')).toBe('gh');
    expect(toolExecutable('git-lfs')).toBe('git-lfs');
    manageToolRuntime();
    const run = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '' });
    const executor = new GitProcessExecutor(run);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = { cwd: process.cwd(), maxBuffer: 1024, env: { GIT_OPTIONAL_LOCKS: '0' } };
    try {
      await executor.run(process.cwd(), ['status'], options);
      throw new Error('Should be blocked');
    } catch (error) {
      expect(String(error)).toContain('SYSTEM_TOOL_UNAVAILABLE:git');
      expect(isRepoUnavailableError(String(error))).toBe(false);
    }
    expect(run).not.toHaveBeenCalled();
    const executable = path.join(process.cwd(), 'verified-tools', process.platform === 'win32' ? 'git.exe' : 'git');
    updateToolRuntime({ id: 'git', required: true, state: 'available', version: '2.52.0', executable, downloadUrl: '', instructionsUrl: '' });
    expect(await executor.run(process.cwd(), ['status'], options)).toBe('ok');
    expect(run.mock.calls[0][0]).toBe(executable);
    const env = toolEnvironment({ GIT_OPTIONAL_LOCKS: '0' });
    const envPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')![1]!;
    expect(envPath.split(path.delimiter)[0]).toBe(path.dirname(executable));
    expect(env.GIT_OPTIONAL_LOCKS).toBe('0');
    log.mockRestore();
  });
});
