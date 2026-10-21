import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { BranchChangeService } from '../../BranchChangeService';
import type { GitService } from '../../../GitService';
const mocks = vi.hoisted(() => ({ handle: vi.fn(), emit: vi.fn(), release: vi.fn(), complete: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => 'unused' }, ipcMain: { handle: mocks.handle } }));
vi.mock('../jobEvents', () => ({ emitJobEvent: mocks.emit }));
vi.mock('../../RepositoryCommitProtection', () => ({ beginCommitProtection: () => mocks.release, ensureCommitProtectionIsIdle: vi.fn() }));
vi.mock('../../repoJobRegistry', () => ({
  repoJobRegistry: { begin: () => ({ signal: new AbortController().signal, ensureActive: vi.fn(), complete: mocks.complete }) },
}));
import { registerBranchChangeHandlers } from '../git/registerBranchChangeHandlers';

describe('branch-change IPC', () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const service = { inspect: vi.fn(), execute: vi.fn(), restore: vi.fn(), list: vi.fn(), cancel: vi.fn() };
  let event: { sender: EventEmitter & { id: number } };
  const repoPath = 'C:/repo';
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    event = { sender: Object.assign(new EventEmitter(), { id: 7 }) };
    mocks.handle.mockImplementation((channel, handler) => handlers.set(channel, handler));
    for (const method of [service.inspect, service.execute, service.restore]) method.mockResolvedValue({ ok: true });
    service.list.mockResolvedValue([]);
    service.cancel.mockReturnValue(false);
    registerBranchChangeHandlers({ getRepoPath: () => repoPath } as GitService, service as unknown as BranchChangeService);
  });
  it.each([
    [IpcChannel.GitInspectBranchChange, 'inspect'],
    [IpcChannel.GitExecuteBranchChange, 'execute'],
    [IpcChannel.GitRestoreBranchChange, 'restore'],
  ] as const)('pins %s to its repository and window', async (channel, method) => {
    const request = { repoPath, planId: 'plan', target: { kind: 'existing', branch: 'main' } };
    expect(await handlers.get(channel)!(event, request)).toEqual({ success: true, data: { ok: true } });
    const context = service[method].mock.calls[0][method === 'restore' ? 2 : 1];
    expect(context).toMatchObject({ ownerId: 7, signal: expect.any(AbortSignal) });
    expect(event.sender.listenerCount('destroyed')).toBe(0);
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.emit.mock.calls.map(([, value]) => value.status)).toEqual(['start', 'done']);
  });
  it('rejects foreign repositories before touching Git and releases writes after errors', async () => {
    expect(await handlers.get(IpcChannel.GitExecuteBranchChange)!(event, { repoPath: 'C:/elsewhere' })).toMatchObject({ success: false });
    expect(service.execute).not.toHaveBeenCalled();
    service.execute.mockRejectedValueOnce(new Error('Changed preview'));
    expect(await handlers.get(IpcChannel.GitExecuteBranchChange)!(event, { repoPath, planId: 'plan' })).toMatchObject({
      success: false,
      error: 'Changed preview',
    });
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it('lists recovery records and delegates cancellation to the owning window only', async () => {
    expect(await handlers.get(IpcChannel.GitListParkedBranchChanges)!(event, repoPath)).toEqual({ success: true, data: [] });
    handlers.get(IpcChannel.GitCancelBranchChange)!(event, repoPath);
    expect(service.cancel).toHaveBeenCalledWith(repoPath, 7);
  });
  it('tags progress events with the request identity and actual file counts', async () => {
    service.inspect.mockImplementationOnce(async (_request, context) => {
      context.progress('Checking changed file contents', { phase: 'files', processedFiles: 3, totalFiles: 10, path: 'draft.txt' });
      return { ok: true };
    });
    await handlers.get(IpcChannel.GitInspectBranchChange)!(event, { repoPath, progressId: 'visible-dialog' });
    expect(mocks.emit).toHaveBeenCalledWith(
      event.sender,
      expect.objectContaining({
        status: 'progress',
        details: {
          repoPath,
          branchChangeId: 'visible-dialog',
          branchChange: { phase: 'files', processedFiles: 3, totalFiles: 10, path: 'draft.txt' },
        },
      }),
    );
  });
});
