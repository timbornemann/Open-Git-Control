import { describe, expect, it, vi } from 'vitest';
import { readGitPullConfiguration, pullStrategyArguments } from '../GitPullConfiguration';
import type { Runner } from '../remoteTransferModels';

describe('effective Git pull configuration', () => {
  const fixture = (configuration: string, branch = 'main') => {
    const runResult = vi.fn<Runner['runResult']>().mockImplementation(async (_repo, args) => {
      if (args[0] === 'symbolic-ref') return { exitCode: branch ? 0 : 1, stdout: branch, stderr: '' };
      if (args.includes('--get-regexp')) return { exitCode: configuration ? 0 : 1, stdout: configuration, stderr: '' };
      return { exitCode: 0, stdout: args.at(-1) === 'branch.main.rebase' ? 'false\n' : 'true\n', stderr: '' };
    });
    return { runResult };
  };

  it('prefers branch rebase and pull.ff over inherited settings', async () => {
    const runner = fixture('pull.rebase\ntrue\0branch.main.rebase\nfalse\0merge.ff\nfalse\0pull.ff\nonly\0branch.main.mergeoptions\n--log\0');
    await expect(readGitPullConfiguration('/repo', runner)).resolves.toEqual({
      branch: 'main',
      rebase: { key: 'branch.main.rebase', value: 'false' },
      fastForward: { key: 'pull.ff', value: 'only' },
      mergeOptions: '--log',
    });
  });

  it('distinguishes absent settings, boolean shorthand and branch-specific merge preservation', async () => {
    await expect(readGitPullConfiguration('/repo', fixture(''))).resolves.toEqual({ branch: 'main', rebase: null, fastForward: null, mergeOptions: null });
    await expect(readGitPullConfiguration('/repo', fixture('branch.main.rebase\nm\0merge.ff\nfalse\0'))).resolves.toMatchObject({
      rebase: { key: 'branch.main.rebase', value: 'merges' },
      fastForward: null,
    });
    await expect(readGitPullConfiguration('/repo', fixture('pull.rebase\ni\0', ''))).resolves.toMatchObject({
      branch: '',
      rebase: { key: 'pull.rebase', value: 'interactive' },
    });
    await expect(readGitPullConfiguration('/repo', fixture('pull.rebase\0'))).resolves.toMatchObject({ rebase: { value: 'true' } });
    await expect(readGitPullConfiguration('/repo', fixture('merge.ff\ntrue\0'))).resolves.toMatchObject({ fastForward: { key: 'merge.ff', value: 'true' } });
  });

  it('does not treat malformed or inaccessible Git configuration as unconfigured', async () => {
    const runner = fixture('');
    runner.runResult.mockResolvedValue({ exitCode: 128, stdout: '', stderr: 'fatal: bad config' });
    await expect(readGitPullConfiguration('/repo', runner)).rejects.toThrow('bad config');
    const invalid = fixture('pull.rebase\ninvalid\0');
    invalid.runResult.mockImplementation(async (_repo, args) => ({
      exitCode: args.includes('--type=bool') ? 128 : 0,
      stdout: args.includes('--get-regexp') ? 'pull.rebase\ninvalid\0' : 'main',
      stderr: 'invalid boolean value',
    }));
    await expect(readGitPullConfiguration('/repo', invalid)).rejects.toThrow('invalid boolean');
  });

  it('rejects unsupported strategies and malformed autostash instead of passing arbitrary arguments to Git', () => {
    expect(() => pullStrategyArguments('unsafe' as never)).toThrow('Unsupported pull strategy');
    expect(() => pullStrategyArguments('default', 'true' as never)).toThrow('Invalid pull autostash');
  });
});
