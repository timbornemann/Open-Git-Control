import { describe, expect, it, vi } from 'vitest';
import { handleGitCommand } from '../gitCommandRouter';

describe('gitCommandRouter conflict resolution', () => {
  it('honors conflict-marker-size before staging through the IPC route', async () => {
    const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
      if (args[0] === 'check-attr') return ['conflict.txt', 'conflict-marker-size', '3', ''].join('\0');
      return 'staged';
    });
    const gitService = {
      files: {
        readRepoFileAtPath: vi.fn(async () => '<<< HEAD\nours\n===\ntheirs\n>>> topic\n'),
      },
      runCommandAtPath,
      requireActiveRepoPath: () => '/repo',
    } as any;

    const result = await handleGitCommand({ sender: {} }, gitService, 'conflictMarkResolved', ['conflict.txt'], '/repo');

    expect(result).toEqual({ success: false, error: expect.stringContaining('Conflict markers remain') });
    expect(runCommandAtPath).toHaveBeenCalledTimes(1);
    expect(runCommandAtPath).toHaveBeenCalledWith('/repo', ['check-attr', '-z', 'conflict-marker-size', '--', 'conflict.txt']);
  });
});

describe('gitCommandRouter cross-branch merge', () => {
  const source = 'a'.repeat(40),
    target = 'b'.repeat(40);
  function service() {
    let branch = 'feature';
    const run = vi.fn(async (_repo: string, args: string[]) => {
      if (args[0] === 'symbolic-ref') return branch;
      if (args[0] === 'rev-parse') return args[1] === '--absolute-git-dir' ? '/nonexistent-merge-fixture/.git' : args[2].includes('/feature') ? source : target;
      if (args[0] === 'checkout') branch = args.at(-1)!;
      return args[0] === 'merge' ? 'Merge complete' : '';
    });
    const withExclusiveWrite = vi.fn(async (_repo: string, _label: string, work: (git: any) => Promise<string>) => work({ run }));
    return { run, withExclusiveWrite, git: { runner: { withExclusiveWrite }, getRepoPath: vi.fn(() => '/repo'), requireActiveRepoPath: () => '/repo' } as any };
  }

  it('routes a validated request into one exclusive write and merges the captured commit after checkout', async () => {
    const f = service();
    const result = await handleGitCommand({ sender: {} }, f.git, 'mergeIntoBranch', ['feature', 'main', 'noFf', source, target], '/repo');
    expect(result).toEqual({ success: true, data: 'Merge complete' });
    expect(f.withExclusiveWrite).toHaveBeenCalledExactlyOnceWith('/repo', 'merge-into-branch', expect.any(Function));
    expect(f.run).toHaveBeenCalledWith('/repo', ['checkout', '--no-guess', '--no-overwrite-ignore', 'main']);
    expect(f.run).toHaveBeenLastCalledWith('/repo', ['merge', '--no-ff', '--no-edit', '-m', "Merge branch 'feature' into main", source], expect.any(Object));
  });

  it('rechecks active-repository authorization before switching and rejects unsafe arguments before scheduling', async () => {
    const f = service();
    f.git.getRepoPath.mockReturnValueOnce('/repo').mockReturnValue('/other');
    expect(await handleGitCommand({ sender: {} }, f.git, 'mergeIntoBranch', ['feature', 'main', 'default', source, target], '/repo')).toEqual({
      success: false,
      error: expect.stringContaining('not the active repository'),
    });
    expect(f.run.mock.calls.some(([, args]) => args[0] === 'checkout')).toBe(false);
    const invalid = service();
    expect(await handleGitCommand({ sender: {} }, invalid.git, 'mergeIntoBranch', ['feature', 'main', '--force', source, target], '/repo')).toEqual({
      success: false,
      error: 'Invalid merge request.',
    });
    expect(invalid.withExclusiveWrite).not.toHaveBeenCalled();
  });
});
