import { afterEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '../appClient';
import { peekResource } from '@/data/clientCache';
import type { UserNotesStatusDto } from '@/shared/userNotes';

afterEach(() => vi.unstubAllGlobals());

describe('user notes client', () => {
  it('delegates local reads, manual checks and exact revision acknowledgements to the app namespace', async () => {
    const status: UserNotesStatusDto = { state: 'ready', notes: [], lastCheckedAt: 1, error: null };
    const identity = { id: 'notice.md', revision: 'a'.repeat(64) };
    const api = {
      getUserNotesStatus: vi.fn().mockResolvedValue(status),
      getUserNote: vi.fn().mockResolvedValue({ success: true, data: { ...identity, markdown: '# Info', images: {} } }),
      checkUserNotes: vi.fn().mockResolvedValue({ success: true }),
      acknowledgeUserNotes: vi.fn().mockResolvedValue({ success: true }),
    };
    vi.stubGlobal('window', { electronAPI: { app: api } });
    expect(await appClient.getUserNotesStatus()).toEqual(status);
    expect(await appClient.getUserNote(identity)).toMatchObject({ success: true });
    await appClient.checkUserNotes();
    await appClient.checkUserNotes();
    await appClient.acknowledgeUserNotes([identity]);
    expect(api.getUserNote).toHaveBeenCalledExactlyOnceWith(identity);
    expect(api.checkUserNotes).toHaveBeenCalledTimes(2);
    expect(api.acknowledgeUserNotes).toHaveBeenCalledExactlyOnceWith([identity]);
  });
  it('updates the shared status cache before notifying the renderer and preserves unsubscription', () => {
    let receive!: (status: UserNotesStatusDto) => void;
    const unsubscribe = vi.fn();
    vi.stubGlobal('window', {
      electronAPI: {
        app: {
          onUserNotesChanged: (callback: typeof receive) => {
            receive = callback;
            return unsubscribe;
          },
        },
      },
    });
    const status: UserNotesStatusDto = { state: 'ready', notes: [], lastCheckedAt: 2, error: null };
    const listener = vi.fn((next) => expect(peekResource('app', 'getUserNotesStatus')).toBe(next));
    const stop = appClient.onUserNotesChanged(listener);
    receive(status);
    expect(listener).toHaveBeenCalledExactlyOnceWith(status);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
