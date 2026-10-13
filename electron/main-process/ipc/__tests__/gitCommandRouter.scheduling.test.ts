import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGitCommand } from '../gitCommandRouter';
import { cleanRepositories, repository } from '../../../ai/__tests__/repositoryFixture';
import type { GitJobKind } from '../../../GitScheduler';

describe('staging stats during commit graph refreshes', { timeout: 30000 }, () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanRepositories();
  });
  it.each([false, true])('finishes a %s staged numstat read while commit details are loaded', async (staged) => {
    const repo = await repository();
    repo.write('base.txt', 'changed\n');
    if (staged) await repo.run(['add', 'base.txt']);
    const schedule = repo.git.runner.schedule.bind(repo.git.runner);
    vi.spyOn(repo.git.runner, 'schedule').mockImplementation(
      <T>(cwd: string, kind: GitJobKind, command: string, run: (signal: AbortSignal) => Promise<T>, options = {}) =>
        schedule(
          cwd,
          kind,
          command,
          async (signal) => {
            if (command === 'diff') await repo.run(['show', '-s', '--format=%s', 'HEAD']);
            return run(signal);
          },
          options,
        ),
    );
    const result = await handleGitCommand({ sender: {} }, repo.git, 'diff', ['--numstat', ...(staged ? ['--cached'] : [])], repo.repoPath);
    expect(result).toEqual({ success: true, data: expect.stringContaining('base.txt') });
  });
});
