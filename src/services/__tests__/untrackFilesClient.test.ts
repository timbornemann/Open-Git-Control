import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '../gitClient';
import * as electronApi from '../electronApi';
import type { ElectronGitAPI } from '@/shared/ipc/contracts/electronApi';
import { resourceKey, setActiveResourceRepository } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import { createElectronApi } from '../../../electron/preload/createElectronApi';
import { IpcChannel } from '@/types/ipcContract';

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});
describe('untracking typed IPC and client cache', () => {
  it('delegates all operations in both preload namespaces and never caches an inspection plan', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, data: { candidates: [] } });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() });
    vi.spyOn(electronApi, 'requireElectronGitApi').mockReturnValue(api.git);
    const inspect = { repoPath: 'C:/repo', operationId: 'inspect', path: 'logs/a.log', scope: 'file' as const };
    const execute = { repoPath: 'C:/repo', operationId: 'execute', planId: 'plan', selectedIds: ['file'] };
    await gitClient.inspectUntrackFiles(inspect);
    await gitClient.inspectUntrackFiles(inspect);
    await gitClient.executeUntrackFiles(execute);
    await gitClient.cancelUntrackFiles('execute');
    await api.inspectUntrackFiles(inspect);
    await api.executeUntrackFiles(execute);
    await api.cancelUntrackFiles('execute');
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitInspectUntrackFiles, inspect],
      [IpcChannel.GitInspectUntrackFiles, inspect],
      [IpcChannel.GitExecuteUntrackFiles, execute],
      [IpcChannel.GitCancelUntrackFiles, 'execute'],
      [IpcChannel.GitInspectUntrackFiles, inspect],
      [IpcChannel.GitExecuteUntrackFiles, execute],
      [IpcChannel.GitCancelUntrackFiles, 'execute'],
    ]);
  });
  it('invalidates status, both diff sources and file previews only in the affected repository', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, data: { status: 'applied', paths: ['file.txt'] } });
    vi.spyOn(electronApi, 'requireElectronGitApi').mockReturnValue({ executeUntrackFiles: execute } as unknown as ElectronGitAPI);
    setActiveResourceRepository('C:/repo');
    const keys = [
      resourceKey('git', 'getDiffPreview', [['diff', '--', 'file.txt'], undefined, 'C:/repo']),
      resourceKey('git', 'getDiffPreview', [['diff', '--cached', '--', 'file.txt'], undefined, 'C:/repo']),
      resourceKey('git', 'getWorkingTreeSnapshot', ['C:/repo']),
      resourceKey('git', 'getRepositoryFilePreview', [{ repoPath: 'C:/repo', path: 'file.txt', source: 'staged' }]),
      resourceKey('git', 'getWorkingTreeSnapshot', ['C:/other']),
      resourceKey('git', 'getCommitLogPage', [{ repoPath: 'C:/repo', limit: 10, offset: 0, scope: 'head' }]),
    ];
    for (const key of keys) queryClient.setQueryData(key, { success: true, data: 'old' });
    await gitClient.executeUntrackFiles({ repoPath: 'C:/repo', operationId: 'execute', planId: 'plan', selectedIds: ['file'] });
    expect(keys.map((key) => queryClient.getQueryState(key)?.isInvalidated)).toEqual([true, true, true, true, false, false]);
  });
});
