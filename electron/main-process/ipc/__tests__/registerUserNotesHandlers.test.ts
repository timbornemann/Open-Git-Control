import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { UserNotesManager } from '../../UserNotesManager';
import { registerUserNotesHandlers } from '../registerUserNotesHandlers';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle } }));

describe('user notes IPC', () => {
  beforeEach(() => vi.clearAllMocks());
  it('exposes local status and content separately from an explicit network check', async () => {
    const manager = {
      getStatus: vi.fn().mockResolvedValue({ notes: [] }),
      getNote: vi.fn().mockResolvedValue({ markdown: '# Info', images: {} }),
      check: vi.fn().mockResolvedValue({ success: true }),
      acknowledge: vi.fn().mockResolvedValue({ success: true }),
    };
    registerUserNotesHandlers(manager as unknown as UserNotesManager);
    const handlers = new Map(
      handle.mock.calls.map(([channel, listener]) => [channel as IpcChannel, listener as (...args: unknown[]) => Promise<unknown>] as const),
    );
    const identity = { id: 'info.md', revision: 'a'.repeat(64) };
    await expect(handlers.get(IpcChannel.UserNotesGetStatus)!(null)).resolves.toEqual({ notes: [] });
    await expect(handlers.get(IpcChannel.UserNotesGetNote)!(null, identity)).resolves.toMatchObject({ success: true, data: { markdown: '# Info' } });
    expect(manager.check).not.toHaveBeenCalled();
    await handlers.get(IpcChannel.UserNotesCheck)!(null);
    await handlers.get(IpcChannel.UserNotesAcknowledge)!(null, [identity]);
    expect(manager.check).toHaveBeenCalledExactlyOnceWith();
    expect(manager.getNote).toHaveBeenCalledExactlyOnceWith(identity);
    expect(manager.acknowledge).toHaveBeenCalledExactlyOnceWith([identity]);
    manager.getNote.mockRejectedValue(new Error('Notice was removed'));
    await expect(handlers.get(IpcChannel.UserNotesGetNote)!(null, identity)).resolves.toEqual({ success: false, error: 'Notice was removed' });
  });
});
