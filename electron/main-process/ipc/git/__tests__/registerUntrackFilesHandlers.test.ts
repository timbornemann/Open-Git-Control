import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { GitService } from '../../../../GitService';
import type { UntrackFilesService } from '../../../../git/UntrackFilesService';
import type { UntrackContext } from '../../../../git/untrackFilesSnapshot';
import { registerUntrackFilesHandlers } from '../registerUntrackFilesHandlers';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { RepoJobRegistry } from '../../../repoJobRegistry';
import { beginCommitProtection, ensureCommitProtectionIsIdle } from '../../../RepositoryCommitProtection';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) } }));
describe('untracking IPC authorization and job lifecycle', () => {
  let active: string;
  let registry: RepoJobRegistry;
  let sender: { id: number; once: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
  let service: { inspect: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn>; forgetOwner: ReturnType<typeof vi.fn> };
  const inspect = () => ({ repoPath: 'C:/untrack-repo', operationId: randomUUID(), path: 'file.txt', scope: 'file' });
  const invoke = (channel: IpcChannel, request: unknown, owner = sender) => handlers.get(channel)!({ sender: owner }, request);
  beforeEach(() => {
    handlers.clear();
    active = 'C:/untrack-repo';
    registry = new RepoJobRegistry();
    sender = { id: 7, once: vi.fn(), send: vi.fn() };
    service = {
      inspect: vi.fn().mockResolvedValue({ planId: 'plan', candidates: [] }),
      execute: vi.fn().mockResolvedValue({ status: 'applied', paths: ['file.txt'] }),
      forgetOwner: vi.fn(),
    };
    registerUntrackFilesHandlers({ runner: {}, getRepoPath: () => active } as GitService, registry, service as unknown as UntrackFilesService);
  });
  it('forwards inspection, progress and structured stale results, releasing repository jobs', async () => {
    const request = inspect();
    service.inspect.mockImplementation(async (_request, context: UntrackContext) => {
      context.ensureActive();
      context.progress('inspect');
      return { planId: 'plan' };
    });
    expect(await invoke(IpcChannel.GitInspectUntrackFiles, request)).toEqual({ success: true, data: { planId: 'plan' } });
    expect(service.inspect).toHaveBeenCalledWith(request, expect.objectContaining({ ownerId: 7, generation: 0 }));
    expect(sender.send.mock.calls.map((call) => call[1].status)).toEqual(['start', 'progress', 'done']);
    service.execute.mockResolvedValue({ status: 'stale', reason: 'files' });
    expect(await invoke(IpcChannel.GitExecuteUntrackFiles, { ...request, planId: 'plan', selectedIds: ['id'] })).toEqual({
      success: true,
      data: { status: 'stale', reason: 'files' },
    });
    expect(registry.isRepositoryBusy(active)).toBe(false);
    expect(() => ensureCommitProtectionIsIdle(active)).not.toThrow();
  });
  it('rejects malformed and inactive-repository requests before starting a job', async () => {
    for (const request of [null, { ...inspect(), operationId: 'not-uuid' }, { ...inspect(), repoPath: 'C:/other' }])
      expect(await invoke(IpcChannel.GitInspectUntrackFiles, request)).toMatchObject({ success: false, error: expect.any(String) });
    expect(service.inspect).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });
  it('respects existing write protection and releases its own protection on failure', async () => {
    const release = beginCommitProtection(active);
    try {
      expect(await invoke(IpcChannel.GitExecuteUntrackFiles, inspect())).toMatchObject({ success: false });
    } finally {
      release?.();
    }
    expect(service.execute).not.toHaveBeenCalled();
    service.execute.mockRejectedValue(new Error('Index is locked'));
    expect(await invoke(IpcChannel.GitExecuteUntrackFiles, inspect())).toEqual({ success: false, error: 'Index is locked' });
    expect(() => ensureCommitProtectionIsIdle(active)).not.toThrow();
    expect(registry.isRepositoryBusy(active)).toBe(false);
    expect(sender.send.mock.calls.at(-1)?.[1].status).toBe('failed');
  });
  it('rejects duplicate operation IDs and only lets the owning window cancel', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let captured!: UntrackContext;
    service.inspect.mockImplementation(async (_request, context: UntrackContext) => {
      captured = context;
      await pending;
      context.ensureActive();
      return {};
    });
    const request = inspect();
    const result = invoke(IpcChannel.GitInspectUntrackFiles, request);
    expect(await invoke(IpcChannel.GitInspectUntrackFiles, request)).toMatchObject({ success: false });
    expect(invoke(IpcChannel.GitCancelUntrackFiles, request.operationId, { ...sender, id: 8 })).toBe(false);
    expect(invoke(IpcChannel.GitCancelUntrackFiles, null)).toBe(false);
    expect(invoke(IpcChannel.GitCancelUntrackFiles, request.operationId)).toBe(true);
    expect(captured.signal.aborted).toBe(true);
    finish();
    expect(await result).toMatchObject({ success: false });
    expect(sender.send.mock.calls.at(-1)?.[1].status).toBe('cancelled');
    expect(invoke(IpcChannel.GitCancelUntrackFiles, request.operationId)).toBe(false);
  });
  it('stops work after a repository switch and when its window is destroyed', async () => {
    service.inspect.mockImplementation(async (_request, context: UntrackContext) => {
      active = 'C:/different';
      context.ensureActive();
      return {};
    });
    expect(await invoke(IpcChannel.GitInspectUntrackFiles, inspect())).toMatchObject({ success: false });
    active = 'C:/untrack-repo';
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let captured!: UntrackContext;
    service.inspect.mockImplementation(async (_request, context: UntrackContext) => {
      captured = context;
      await pending;
      context.ensureActive();
      return {};
    });
    const result = invoke(IpcChannel.GitInspectUntrackFiles, inspect());
    sender.once.mock.calls[0][1]();
    expect(service.forgetOwner).toHaveBeenCalledWith(sender.id);
    expect(captured.signal.aborted).toBe(true);
    finish();
    expect(await result).toMatchObject({ success: false });
  });
  it('reports a completed atomic publication even if cancellation arrived at its end', async () => {
    const request = inspect();
    service.execute.mockImplementation(async () => {
      invoke(IpcChannel.GitCancelUntrackFiles, request.operationId);
      return { status: 'applied', paths: ['file.txt'] };
    });
    expect(await invoke(IpcChannel.GitExecuteUntrackFiles, request)).toEqual({ success: true, data: { status: 'applied', paths: ['file.txt'] } });
    expect(sender.send.mock.calls.at(-1)?.[1].status).toBe('done');
    expect(registry.isRepositoryBusy(active)).toBe(false);
  });
});
