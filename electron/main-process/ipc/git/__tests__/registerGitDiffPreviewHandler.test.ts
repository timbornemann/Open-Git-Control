import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerReadCancellation } from '../../../readRequests';
import { registerGitDiffPreviewHandler } from '../registerGitDiffPreviewHandler';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler) } }));

describe('diff preview native request lifetime', () => {
  const preview = { text: 'diff', truncated: false, bytes: 4, lines: 1 };
  const read = vi.fn().mockResolvedValue(preview);
  const interrupt = vi.fn();
  const sender = () => Object.assign(new EventEmitter(), { id: 32, isDestroyed: (): boolean => false });
  const args = ['diff', '--', 'src/app.ts'];
  const request = { requestId: 'diff-read', priority: 'visible' as const };
  const start = (owner: ReturnType<typeof sender>, requestedArgs = args, repo = 'C:/repo') =>
    handlers.get(IpcChannel.GitDiffPreview)!({ sender: owner }, requestedArgs, { maxBytes: 65536, maxLines: 100 }, repo, request);

  beforeEach(() => {
    handlers.clear();
    read.mockReset().mockResolvedValue(preview);
    interrupt.mockClear();
    registerReadCancellation();
    registerGitDiffPreviewHandler({
      gitService: { getRepoPath: () => 'C:/repo', runner: { getDiffPreview: read } },
      commitStatsService: { interruptBackgroundWork: interrupt },
    } as any);
  });

  it('normalizes commands, keeps preview limits and releases cancellation state on success', async () => {
    const owner = sender();
    expect(await start(owner)).toEqual({ success: true, data: preview });
    expect(read).toHaveBeenCalledExactlyOnceWith(
      'C:/repo',
      ['diff', '--', ':(literal)src/app.ts'],
      { maxBytes: 65536, maxLines: 100 },
      expect.any(AbortSignal),
    );
    expect(owner.listenerCount('destroyed')).toBe(0);
    const signal = read.mock.calls[0][3] as AbortSignal;
    await handlers.get(IpcChannel.AppCancelRead)!({ sender: owner }, request.requestId);
    expect(signal.aborted).toBe(false);
  });

  it.each(['cancel', 'destroy'] as const)('aborts the matching read on %s and cleans up listeners', async (action) => {
    read.mockImplementation(
      (_repo, _args, _limits, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Diff cancelled')), { once: true });
        }),
    );
    const owner = sender();
    const pending = start(owner);
    const signal = read.mock.calls[0][3] as AbortSignal;
    await handlers.get(IpcChannel.AppCancelRead)!({ sender: { id: 33 } }, request.requestId);
    expect(signal.aborted).toBe(false);
    if (action === 'destroy') owner.emit('destroyed');
    else await handlers.get(IpcChannel.AppCancelRead)!({ sender: owner }, request.requestId);
    expect(signal.aborted).toBe(true);
    expect(await pending).toEqual({ success: false, error: 'Diff cancelled' });
    expect(owner.listenerCount('destroyed')).toBe(0);
  });

  it('rejects inactive repositories and unsupported commands before starting a process', async () => {
    const owner = sender();
    expect(await start(owner, args, 'C:/other')).toMatchObject({ success: false });
    expect(await start(owner, ['diff', '--no-index', '--', 'a', 'b'])).toMatchObject({ success: false });
    expect(await start(owner, ['diff', '--', '../secret'])).toMatchObject({ success: false });
    expect(read).not.toHaveBeenCalled();
    expect(interrupt).not.toHaveBeenCalled();
    expect(owner.listenerCount('destroyed')).toBe(0);
  });

  it('does not start work for an already destroyed window', async () => {
    const owner = sender();
    owner.isDestroyed = () => true;
    expect(await start(owner)).toMatchObject({ success: false });
    expect(read).not.toHaveBeenCalled();
    expect(owner.listenerCount('destroyed')).toBe(0);
  });
});
