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
