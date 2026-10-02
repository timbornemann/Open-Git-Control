import { describe, expect, it, vi } from 'vitest';
import type { CommitEditGit } from '../CommitEditGit';
import { verifyUnpublished } from '../commitMessageEditRemotes';

describe('remote verification cancellation', () => {
  it('times out and removes only its temporary refs', async () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn(async (_repo: string, args: string[], options?: Parameters<CommitEditGit['run']>[2]) => {
      if (args[0] === 'remote' && args.length === 1) return 'origin';
      if (args[0] === 'remote') return 'https://example.test/repo.git';
      if (args[0] === 'ls-remote') {
        signals.push(options!.signal!);
        await new Promise<void>((_done, reject) => {
          options!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return '';
    });
    const git: CommitEditGit = { run, buffer: vi.fn(), input: vi.fn() };
    await expect(verifyUnpublished(git, 'repo', 'a'.repeat(40), 'test-id', new AbortController().signal, 10)).rejects.toThrow('timed out');
    expect(signals[0].aborted).toBe(true);
    expect(run).toHaveBeenLastCalledWith('repo', ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/ogc/reword-check/test-id/0/'], {
      ignoreAbort: true,
    });
  });
});
