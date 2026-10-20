// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { branchCleanupClient } from './branchCleanupClient';
import { createBranchCleanupApi } from '../../electron/preload/createBranchCleanupApi';
import { IpcChannel } from '@/types/ipcContract';

afterEach(() => {
  delete window.electronAPI;
  vi.restoreAllMocks();
});
describe('branch cleanup typed IPC boundary', () => {
  it('forwards all five client methods and preload channels without caching inspections', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createBranchCleanupApi({ invoke });
    window.electronAPI = { git: api } as unknown as ElectronAPI;
    const inspect = { repoPath: 'C:/repo', operationId: 'inspection' };
    const execute = { repoPath: 'C:/repo', operationId: 'execution', planId: 'plan', selectedIds: ['branch'], confirmedUnmergedIds: [] };
    await branchCleanupClient.inspectBranchCleanup(inspect);
    await branchCleanupClient.inspectBranchCleanup(inspect);
    await branchCleanupClient.executeBranchCleanup(execute);
    await branchCleanupClient.cancelBranchCleanup('execution');
    await branchCleanupClient.getBranchCleanupPreferences('C:/repo');
    await branchCleanupClient.saveBranchCleanupPreferences('C:/repo', { protectedPatterns: ['release/*'] });
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitInspectBranchCleanup, inspect],
      [IpcChannel.GitInspectBranchCleanup, inspect],
      [IpcChannel.GitExecuteBranchCleanup, execute],
      [IpcChannel.GitCancelBranchCleanup, 'execution'],
      [IpcChannel.GitBranchCleanupPreferencesGet, 'C:/repo'],
      [IpcChannel.GitBranchCleanupPreferencesSave, 'C:/repo', { protectedPatterns: ['release/*'] }],
    ]);
  });
});
