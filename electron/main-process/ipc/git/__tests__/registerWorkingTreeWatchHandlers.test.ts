import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerWorkingTreeWatchHandlers } from '../registerWorkingTreeWatchHandlers';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => Promise<any>) => handlers.set(name, handler) } }));
const sender = () => Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: vi.fn(() => false) }) as unknown as WebContents;
const created: {
  repoPath: string;
  changed: (rescan: boolean) => void;
  start: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  recursive: boolean;
}[] = [];
let active: string;
let reset: () => void;
let owner: WebContents;
const watch = (subscriptionId = 'one', enabled = true, repoPath = active, window = owner) =>
  handlers.get(IpcChannel.GitWorkingTreeWatch)!({ sender: window }, { repoPath, subscriptionId, enabled });

beforeEach(() => {
  active = 'C:/repo';
  owner = sender();
  created.length = 0;
  reset = registerWorkingTreeWatchHandlers({ getRepoPath: () => active } as any, (repoPath, changed) => {
    const monitor = { repoPath, changed, start: vi.fn(async () => {}), dispose: vi.fn(), recursive: true };
    created.push(monitor);
    return monitor;
  });
});
afterEach(() => reset());

describe('working tree watch ownership', () => {
  it('shares a window monitor and closes it only after its last subscription leaves', async () => {
    expect(await watch()).toEqual({ success: true, data: { recursive: true } });
    await watch('two');
    expect(created).toHaveLength(1);
    created[0].changed(false);
    expect(owner.send).toHaveBeenCalledExactlyOnceWith(IpcChannel.GitWorkingTreeChanged, { repoPath: active });
    await watch('one', false);
    expect(created[0].dispose).not.toHaveBeenCalled();
    await watch('two', false);
    expect(created[0].dispose).toHaveBeenCalledTimes(1);
    created[0].changed(true);
    expect(owner.send).toHaveBeenCalledTimes(1);
    expect(owner.listenerCount('destroyed')).toBe(0);
  });

  it('validates requests and only watches the main process active repository', async () => {
    expect(await watch('bad-id/../../')).toMatchObject({ success: false });
    expect(await watch('valid', true, 'C:/foreign')).toMatchObject({ success: false });
    expect(await handlers.get(IpcChannel.GitWorkingTreeWatch)!({ sender: owner }, { repoPath: active, subscriptionId: 'x', enabled: 'true' })).toMatchObject({
      success: false,
    });
    expect(created).toHaveLength(0);
    await watch();
    active = 'C:/new';
    created[0].changed(true);
    expect(owner.send).not.toHaveBeenCalled();
  });

  it('closes the previous repository monitor and ignores old callbacks and unsubscriptions', async () => {
    await watch();
    const previous = created[0];
    active = 'C:/next';
    await watch('one');
    expect(previous.dispose).toHaveBeenCalledTimes(1);
    await watch('one', false, previous.repoPath);
    previous.changed(false);
    expect(created[1].dispose).not.toHaveBeenCalled();
    created[1].changed(true);
    expect(owner.send).toHaveBeenCalledExactlyOnceWith(IpcChannel.GitWorkingTreeChanged, { repoPath: active, rescan: true });
  });

  it('isolates windows and releases monitors on destruction and repository reset', async () => {
    const other = sender();
    await watch();
    await watch('one', true, active, other);
    owner.emit('destroyed');
    expect(created[0].dispose).toHaveBeenCalledTimes(1);
    expect(created[1].dispose).not.toHaveBeenCalled();
    reset();
    expect(created[1].dispose).toHaveBeenCalledTimes(1);
    expect(other.listenerCount('destroyed')).toBe(0);
  });

  it('bounds subscriptions without disturbing existing owners', async () => {
    for (let i = 0; i < 16; i++) expect(await watch(`reader-${i}`)).toMatchObject({ success: true });
    expect(await watch('overflow')).toMatchObject({ success: false });
    expect(await watch('reader-0')).toMatchObject({ success: true });
    expect(created).toHaveLength(1);
    expect(created[0].dispose).not.toHaveBeenCalled();
  });

  it('does not revive an initialization that completes after reset', async () => {
    await watch();
    reset();
    let finish!: () => void;
    reset = registerWorkingTreeWatchHandlers({ getRepoPath: () => active } as any, (_repoPath, changed) => {
      const monitor = {
        repoPath: active,
        changed,
        recursive: true,
        dispose: vi.fn(),
        start: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        ),
      };
      created.push(monitor);
      return monitor;
    });
    const pending = watch();
    reset();
    finish();
    expect(await pending).toEqual({ success: true, data: { recursive: false } });
    created[1].changed(true);
    expect(owner.send).not.toHaveBeenCalled();
    expect(created[1].dispose).toHaveBeenCalledTimes(1);
  });
});
