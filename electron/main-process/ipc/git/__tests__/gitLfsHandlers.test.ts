import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { repoJobRegistry } from '../../../repoJobRegistry';
import { registerGitLfsHandlers } from '../gitLfsHandlers';

const { handlers, getStatus, track } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  getStatus: vi.fn(),
  track: vi.fn(),
}));
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, callback: (...args: any[]) => Promise<any>) => handlers.set(channel, callback) } }));
vi.mock('../../../../git/GitLfsService', () => ({
  GitLfsService: class {
    getStatus = getStatus;
    track = track;
  },
}));

const repo = path.resolve('lfs-test-repo');
beforeEach(() => {
  handlers.clear();
  getStatus.mockReset();
  track.mockReset();
  repoJobRegistry.cancelForRepoChange(repo);
});
function fixture() {
  let active: string | null = repo;
  const guard = vi.fn();
  registerGitLfsHandlers({ runner: {}, getRepoPath: () => active } as any, guard);
  const event = { sender: { send: vi.fn(), isDestroyed: () => false } };
  const request = { repoPath: repo, path: 'design.psd', source: 'staged', scope: 'file', expectedVersion: 'index-version' };
  return {
    event,
    request,
    guard,
    switchRepo: () => {
      active = path.resolve('another-repo');
      repoJobRegistry.cancelForRepoChange(active);
    },
  };
}
describe('Git LFS IPC authorization and lifecycle', () => {
  it('pins inspection and checked conversion to the active repository and emits the existing job lifecycle', async () => {
    const f = fixture();
    getStatus.mockResolvedValue({ available: true, files: [] });
    track.mockImplementation(async (request, ensure) => {
      ensure();
      return { path: request.path, oid: 'a'.repeat(64), bytes: 10 };
    });
    expect(await handlers.get(IpcChannel.GitGetLfsStatus)!(f.event, { repoPath: repo, files: [] })).toMatchObject({ success: true });
    expect(await handlers.get(IpcChannel.GitTrackWithLfs)!(f.event, f.request)).toMatchObject({ success: true });
    expect(track.mock.calls[0][0]).toEqual(f.request);
    expect(f.guard).toHaveBeenCalledWith(repo);
    expect(f.event.sender.send.mock.calls.map((call) => call[1].status)).toEqual(['start', 'done']);
  });
  it('rejects stale repository requests and protected writes before preparing conversion', async () => {
    const f = fixture();
    f.switchRepo();
    expect(await handlers.get(IpcChannel.GitGetLfsStatus)!(f.event, { repoPath: repo, files: [] })).toMatchObject({ success: false });
    expect(getStatus).not.toHaveBeenCalled();
    const protectedRepo = fixture();
    protectedRepo.guard.mockImplementation(() => {
      throw new Error('Commit operation is active');
    });
    expect(await handlers.get(IpcChannel.GitTrackWithLfs)!(protectedRepo.event, protectedRepo.request)).toMatchObject({
      success: false,
      error: 'Commit operation is active',
    });
    expect(track).not.toHaveBeenCalled();
  });
  it('cancels conversion after a repository switch before publication', async () => {
    const f = fixture();
    track.mockImplementation(async (_request, ensure) => {
      f.switchRepo();
      ensure();
      return {};
    });
    expect(await handlers.get(IpcChannel.GitTrackWithLfs)!(f.event, f.request)).toMatchObject({ success: false });
    expect(f.event.sender.send.mock.calls.at(-1)?.[1].status).toBe('cancelled');
  });
});
