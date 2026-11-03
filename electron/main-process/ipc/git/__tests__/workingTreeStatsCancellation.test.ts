import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerGitHistoryHandlers } from '../registerGitHistoryHandlers';
import { registerReadCancellation } from '../../../readRequests';
import { IpcChannel } from '../../../../../src/types/ipcContract';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => Promise<any>) => handlers.set(name, handler) } }));

describe('working tree line count request lifetime', () => {
  it.each([IpcChannel.GitWorkingTreeStatus, IpcChannel.GitWorkingTreeSnapshot])('binds %s cancellation to the requesting renderer', async (channel) => {
    const sender = Object.assign(new EventEmitter(), { id: 20, isDestroyed: () => false });
    let signal!: AbortSignal;
    const read = vi.fn(
      (_repo: string, active: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = active;
          signal.addEventListener('abort', () => reject(new Error('Read cancelled.')), { once: true });
        }),
    );
    registerReadCancellation();
    const reset = registerGitHistoryHandlers({
      gitService: { getRepoPath: () => 'C:/repo' },
      commitStatsService: { onUpdate: vi.fn() },
      workingTreeService: { getStatus: read, getSnapshot: read },
    } as any);
    const pending = handlers.get(channel)!({ sender }, 'C:/repo', { requestId: 'read', priority: 'speculative' });
    await handlers.get(IpcChannel.AppCancelRead)!({ sender: { id: 21 } }, 'read');
    expect(signal.aborted).toBe(false);
    await handlers.get(IpcChannel.AppCancelRead)!({ sender }, 'read');
    expect(await pending).toEqual({ success: false, error: 'Read cancelled.' });
    expect(sender.listenerCount('destroyed')).toBe(0);
    reset();
  });

  it('only lets the requesting window cancel a count and releases cancellation state when it completes', async () => {
    const sender = Object.assign(new EventEmitter(), { id: 17, isDestroyed: () => false });
    let signal!: AbortSignal;
    const getStats = vi.fn(
      (_id: string, _repo: string, readSignal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = readSignal;
          signal.addEventListener('abort', () => reject(new Error('Count cancelled.')), { once: true });
        }),
    );
    registerReadCancellation();
    const reset = registerGitHistoryHandlers({
      gitService: { getRepoPath: () => 'C:/repo' },
      commitStatsService: { onUpdate: vi.fn() },
      workingTreeService: { getStats },
    } as any);
    const pending = handlers.get(IpcChannel.GitWorkingTreeStats)!({ sender }, 'snapshot', 'C:/repo', { requestId: 'count', priority: 'speculative' });
    expect(getStats).toHaveBeenCalledWith('snapshot', 'C:/repo', expect.any(AbortSignal));
    await handlers.get(IpcChannel.AppCancelRead)!({ sender: { id: 18 } }, 'count');
    expect(signal.aborted).toBe(false);
    await handlers.get(IpcChannel.AppCancelRead)!({ sender }, 'count');
    expect(signal.aborted).toBe(true);
    expect(await pending).toEqual({ success: false, error: 'Count cancelled.' });
    expect(sender.listenerCount('destroyed')).toBe(0);
    reset();
  });
});
