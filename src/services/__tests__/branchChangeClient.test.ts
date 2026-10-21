import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBranchChangeApi } from '../../../electron/preload/createBranchChangeApi';
import { branchChangeClient } from '../branchChangeClient';
import { IpcChannel } from '@/types/ipcContract';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';

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
});
