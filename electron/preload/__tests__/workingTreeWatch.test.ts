import { describe, expect, it, vi } from 'vitest';
import { createElectronApi } from '../createElectronApi';
import { IpcChannel } from '../../../src/types/ipcContract';

describe('working tree preload boundary', () => {
  it('exposes scoped watch requests, typed events and cleanup in both API namespaces', async () => {
    const ipc = { invoke: vi.fn().mockResolvedValue({ success: true, data: { recursive: true } }), on: vi.fn(), removeListener: vi.fn() };
    const api = createElectronApi(ipc as any);
    const request = { repoPath: 'C:/repo', subscriptionId: 'reader-1', enabled: true };
    await expect(api.git.watchWorkingTree(request)).resolves.toMatchObject({ success: true });
    await api.watchWorkingTree({ ...request, enabled: false });
    expect(ipc.invoke.mock.calls).toEqual([
      [IpcChannel.GitWorkingTreeWatch, request],
      [IpcChannel.GitWorkingTreeWatch, { ...request, enabled: false }],
    ]);
    const callback = vi.fn();
    const unsubscribe = api.git.onWorkingTreeChanged(callback);
    const event = { repoPath: 'C:/repo', rescan: true };
    ipc.on.mock.calls[0][1]({}, event);
    expect(callback).toHaveBeenCalledExactlyOnceWith(event);
    unsubscribe();
    expect(ipc.removeListener).toHaveBeenCalledExactlyOnceWith(IpcChannel.GitWorkingTreeChanged, ipc.on.mock.calls[0][1]);
    expect(api.onWorkingTreeChanged).toBe(api.git.onWorkingTreeChanged);
  });

  it('forwards cancellation tokens without changing legacy line-count arguments', async () => {
    const ipc = { invoke: vi.fn().mockResolvedValue({ success: true }), on: vi.fn(), removeListener: vi.fn() };
    const api = createElectronApi(ipc as any);
    const request = { requestId: 'count-1', priority: 'speculative' as const };
    await api.git.getWorkingTreeStats('id', 'C:/repo', request);
    await api.getWorkingTreeStats('id', undefined, request);
    await api.git.getWorkingTreeStats('id', 'C:/repo');
    await api.getWorkingTreeStats('id');
    expect(ipc.invoke.mock.calls).toEqual([
      [IpcChannel.GitWorkingTreeStats, 'id', 'C:/repo', request],
      [IpcChannel.GitWorkingTreeStats, 'id', undefined, request],
      [IpcChannel.GitWorkingTreeStats, 'id', 'C:/repo'],
      [IpcChannel.GitWorkingTreeStats, 'id'],
    ]);
  });
});
