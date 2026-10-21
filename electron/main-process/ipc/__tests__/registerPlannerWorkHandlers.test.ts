import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { PlannerWorkService } from '../../PlannerWorkService';
import type { GitService } from '../../../GitService';
const mocks = vi.hoisted(() => ({ handle: vi.fn(), emit: vi.fn(), release: vi.fn(), ensureIdle: vi.fn(), complete: vi.fn(), active: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => 'unused' }, ipcMain: { handle: mocks.handle } }));
vi.mock('../../../hosting/HostingService', () => ({ hostingService: {} }));
vi.mock('../jobEvents', () => ({ emitJobEvent: mocks.emit }));
vi.mock('../../RepositoryCommitProtection', () => ({ beginCommitProtection: () => mocks.release, ensureCommitProtectionIsIdle: mocks.ensureIdle }));
vi.mock('../../repoJobRegistry', () => ({
  repoJobRegistry: { begin: () => ({ signal: new AbortController().signal, ensureActive: mocks.active, complete: mocks.complete }) },
}));
import { registerPlannerWorkHandlers } from '../registerPlannerWorkHandlers';

describe('planner work IPC authorization', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  const request = { repoPath: 'C:/repo', itemId: 'task' };
  const service = { inspect: vi.fn(), start: vi.fn(), get: vi.fn(), refresh: vi.fn(), update: vi.fn(), renamed: vi.fn(), detached: vi.fn() };
  let event: { sender: EventEmitter & { id: number } };
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    event = { sender: Object.assign(new EventEmitter(), { id: 7 }) };
    mocks.handle.mockImplementation((channel, handler) => handlers.set(channel, handler));
    for (const method of [service.inspect, service.start, service.get, service.refresh, service.update]) method.mockResolvedValue({ itemId: 'task' });
    registerPlannerWorkHandlers({ getRepoPath: () => 'C:/repo' } as GitService, service as unknown as PlannerWorkService);
  });
  it.each([
    [IpcChannel.PlannerInspectWork, 'inspect'],
    [IpcChannel.PlannerStartWork, 'start'],
    [IpcChannel.PlannerGetWork, 'get'],
    [IpcChannel.PlannerRefreshWork, 'refresh'],
    [IpcChannel.PlannerUpdateWork, 'update'],
  ] as const)('authorizes and delegates %s with owner-scoped cancellation', async (channel, method) => {
    expect(await handlers.get(channel)!(event, request)).toMatchObject({ success: true });
    expect(service[method].mock.calls[0][0]).toEqual(request);
    if (method !== 'get') expect(service[method].mock.calls[0][1]).toMatchObject({ ownerId: 7, signal: expect.any(AbortSignal) });
    expect(event.sender.listenerCount('destroyed')).toBe(0);
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.emit.mock.calls.map(([, detail]) => detail.status)).toEqual(['start', 'done']);
  });
  it('rejects foreign repositories and invalid task IDs before touching Git or the cache', async () => {
    expect(await handlers.get(IpcChannel.PlannerStartWork)!(event, { ...request, repoPath: 'C:/foreign' })).toMatchObject({ success: false });
    expect(await handlers.get(IpcChannel.PlannerGetWork)!(event, { ...request, itemId: '' })).toMatchObject({ success: false });
    expect(service.start).not.toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
  });
  it('canonicalizes saved repository subdirectories to the authorized active root', async () => {
    await handlers.get(IpcChannel.PlannerGetWork)!(event, { ...request, repoPath: 'C:/repo/subfolder' });
    expect(service.get).toHaveBeenCalledWith(request);
  });
  it('releases protected write ownership after errors', async () => {
    service.start.mockRejectedValueOnce(new Error('Checkout conflict'));
    expect(await handlers.get(IpcChannel.PlannerStartWork)!(event, request)).toEqual({ success: false, error: 'Checkout conflict' });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
});
