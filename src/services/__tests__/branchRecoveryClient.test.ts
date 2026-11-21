import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBranchRecoveryApi } from '../../../electron/preload/createBranchRecoveryApi';
import { createStorageApi } from '../../../electron/preload/createStorageApi';
import { resourceKey, setActiveResourceRepository } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import type { BranchBackupOverview, BranchRecoveryInspection } from '@/shared/ipc/branchRecovery';
import { IpcChannel } from '@/types/ipcContract';
import { branchBackupClient, branchRecoveryClient } from '../branchRecoveryClient';
import { workingTreeReads } from '../workingTreeReads';

const repoPath = 'C:\\Code\\Repo\\';
const oid = '1'.repeat(40);
const request = { repoPath, confirmationId: 'review', oid };
const statusKey = (path: string) => resourceKey('git', 'getWorkingTreeSnapshot', [path]);
const invoke = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  const ipc = { invoke, on: vi.fn(), removeListener: vi.fn() };
  vi.stubGlobal('window', { electronAPI: { app: createStorageApi(ipc), git: createBranchRecoveryApi(ipc) } });
});
afterEach(() => vi.unstubAllGlobals());

describe('branch recovery and backup capabilities', () => {
  it('detects the native preload methods', () => {
    expect(branchRecoveryClient.isAvailable()).toBe(true);
    expect(branchBackupClient.isAvailable()).toBe(true);
  });

  it('does not mistake fallback tutorial functions for declared capabilities', () => {
    const fallback = vi.fn();
    const tutorialApi = new Proxy({}, { get: () => fallback });
    vi.stubGlobal('window', { electronAPI: { app: tutorialApi, git: tutorialApi } });
    expect(branchRecoveryClient.isAvailable()).toBe(false);
    expect(branchBackupClient.isAvailable()).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('requires a bridge with callable methods', () => {
    vi.stubGlobal('window', {});
    expect(branchRecoveryClient.isAvailable()).toBe(false);
    expect(branchBackupClient.isAvailable()).toBe(false);
    vi.stubGlobal('window', { electronAPI: { app: { getBranchBackupOverview: null }, git: { inspectBranchRecovery: null } } });
    expect(branchRecoveryClient.isAvailable()).toBe(false);
    expect(branchBackupClient.isAvailable()).toBe(false);
  });
});

describe('branch recovery operations', () => {
  it('reads the repository head and recovery inspection over their respective channels', async () => {
    const head = { success: true, data: { kind: 'ready', oid } };
    const inspection: BranchRecoveryInspection = {
      problem: { repoPath, ref: 'refs/heads/main', reason: 'broken-ref', repairable: true },
      candidates: [],
      confirmationId: null,
    };
    invoke.mockResolvedValueOnce(head).mockResolvedValueOnce({ success: true, data: inspection });

    await expect(workingTreeReads.getRepositoryHead(repoPath)).resolves.toEqual(head);
    await expect(branchRecoveryClient.inspect(repoPath)).resolves.toEqual({ success: true, data: inspection });
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitRepositoryHead, repoPath],
      [IpcChannel.GitInspectBranchRecovery, repoPath],
    ]);
  });

  it('invalidates the repaired repository even if another one is active', async () => {
    const other = 'C:/Other';
    setActiveResourceRepository(other);
    queryClient.setQueryData(statusKey(repoPath), 'stale');
    queryClient.setQueryData(statusKey(other), 'current');
    const repaired = { success: true, data: { oid } };
    invoke.mockResolvedValueOnce(repaired);

    await expect(branchRecoveryClient.repair(request)).resolves.toEqual(repaired);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(IpcChannel.GitRepairBranch, request);
    expect(queryClient.getQueryState(statusKey(repoPath))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(statusKey(other))?.isInvalidated).toBe(false);
  });

  it.each([
    { success: true, data: null },
    { success: false, error: 'The branch changed during review.' },
  ])('preserves the cached status when no repair was applied (%j)', async (outcome) => {
    queryClient.setQueryData(statusKey(repoPath), 'current');
    invoke.mockResolvedValueOnce(outcome);

    await expect(branchRecoveryClient.repair(request)).resolves.toEqual(outcome);
    expect(queryClient.getQueryState(statusKey(repoPath))?.isInvalidated).toBe(false);
  });
});

it('delegates repository backup controls and returns the native results', async () => {
  const directory = 'C:/Backups';
  const overview: BranchBackupOverview = {
    enabled: true,
    directory,
    defaultDirectory: directory,
    directoryError: null,
    versionCount: 1,
    totalBytes: 1024,
    repositories: [],
  };
  const result = { success: true, data: overview };
  const selection = { automatic: true, repoPath };
  const removal = { repositoryKey: 'repo-key', versionId: 'saved-version' };
  invoke.mockResolvedValue(result);

  await expect(branchBackupClient.overview()).resolves.toEqual(result);
  await expect(branchBackupClient.chooseDirectory()).resolves.toEqual(result);
  await expect(branchBackupClient.resetDirectory()).resolves.toEqual(result);
  await expect(branchBackupClient.enable(true)).resolves.toEqual(result);
  await expect(branchBackupClient.select(selection)).resolves.toEqual(result);
  invoke.mockResolvedValueOnce({ success: true, data: 'created' }).mockResolvedValueOnce({ success: true, data: 1 });
  await expect(branchBackupClient.backupNow(repoPath)).resolves.toEqual({ success: true, data: 'created' });
  await expect(branchBackupClient.remove(removal)).resolves.toEqual({ success: true, data: 1 });
  expect(invoke.mock.calls).toEqual([
    [IpcChannel.StorageBranchBackups],
    [IpcChannel.StorageBranchBackupDirectory],
    [IpcChannel.StorageBranchBackupDefaultDirectory],
    [IpcChannel.StorageBranchBackupEnabled, true],
    [IpcChannel.StorageBranchBackupSelection, selection],
    [IpcChannel.StorageBranchBackupNow, repoPath],
    [IpcChannel.StorageBranchBackupRemove, removal],
  ]);
});
