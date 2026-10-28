import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBranchChangeApi } from '../../../electron/preload/createBranchChangeApi';
import { branchChangeClient } from '../branchChangeClient';
import { IpcChannel } from '@/types/ipcContract';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { resourceKey, setActiveResourceRepository } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import { gitHistoryVersion } from '@/data/gitHistoryRefresh';

describe('branch-change client and sandbox preload', () => {
  const invoke = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = { electronAPI: { git: createBranchChangeApi({ invoke }) } as unknown as ElectronAPI } as Window & typeof globalThis;
    invoke.mockResolvedValue({ success: true, data: {} });
  });
  it('delegates all typed operations without a cached inspection or renderer Git commands', async () => {
    const inspect = { repoPath: '/repo', target: { kind: 'existing' as const, branch: 'main' } };
    const execute = { repoPath: '/repo', planId: 'plan', mode: 'carry' as const, name: 'My work' };
    await branchChangeClient.inspectBranchChange(inspect);
    await branchChangeClient.inspectBranchChange(inspect);
    await branchChangeClient.executeBranchChange(execute);
    await branchChangeClient.listParkedBranchChanges('/repo');
    await branchChangeClient.restoreBranchChange({ repoPath: '/repo', planId: 'restore' });
    await branchChangeClient.cancelBranchChange('/repo');
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitInspectBranchChange, inspect],
      [IpcChannel.GitInspectBranchChange, inspect],
      [IpcChannel.GitExecuteBranchChange, execute],
      [IpcChannel.GitListParkedBranchChanges, '/repo'],
      [IpcChannel.GitRestoreBranchChange, { repoPath: '/repo', planId: 'restore' }],
      [IpcChannel.GitCancelBranchChange, '/repo'],
    ]);
  });

  it.each(['executeBranchChange', 'restoreBranchChange'] as const)(
    'invalidates the explicit repository after %s, including partial failures',
    async (method) => {
      const repoPath = 'C:\\Code\\Repo\\';
      setActiveResourceRepository('C:/other');
      const keys = [
        resourceKey('git', 'runGitCommandForRepo', [repoPath, 'branch', '-a']),
        resourceKey('git', 'getCommitLogPage', [{ repoPath }]),
        resourceKey('git', 'getWorkingTreeSnapshot', [repoPath]),
        ['resource', 'git', 'c:/code/repo', 'graph', 'all'],
      ];
      const other = resourceKey('git', 'getCommitLogPage', [{ repoPath: 'C:/other' }]);
      for (const result of [
        { success: true, data: { switched: true, restored: true, conflicts: [] } },
        { success: true, data: { switched: true, restored: false, conflicts: ['file'], error: 'Restoration conflicts' } },
        { success: false, error: 'Checkout cancelled after saving changes' },
      ]) {
        for (const key of [...keys, other]) queryClient.setQueryData(key, { success: true, data: 'old' });
        const before = gitHistoryVersion('c:/code/repo');
        invoke.mockResolvedValueOnce(result);
        await expect(branchChangeClient[method]({ repoPath, planId: 'plan', mode: 'carry', name: 'Switch' })).resolves.toEqual(result);
        for (const key of keys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
        expect(gitHistoryVersion('c:/code/repo')).toBe(before + 1);
      }
    },
  );

  it('does not invalidate repository views during inspection, listing or a cancellation request', async () => {
    const repoPath = '/repo';
    const key = resourceKey('git', 'getCommitLogPage', [{ repoPath }]);
    queryClient.setQueryData(key, { success: true, data: 'cached' });
    const before = gitHistoryVersion(repoPath);
    await branchChangeClient.inspectBranchChange({ repoPath, target: { kind: 'existing', branch: 'main' } });
    await branchChangeClient.listParkedBranchChanges(repoPath);
    await branchChangeClient.cancelBranchChange(repoPath);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    expect(gitHistoryVersion(repoPath)).toBe(before);
  });
});
