import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../../../GitService';
import { GitIdentityService } from '../../../git/GitIdentityService';
import { repoJobRegistry } from '../../repoJobRegistry';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { registerGitIdentityHandlers } from '../registerGitIdentityHandlers';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>(), protection: vi.fn(), window: true }));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, callback: (...args: any[]) => Promise<any>) => mocks.handlers.set(channel, callback) },
  BrowserWindow: { fromWebContents: () => (mocks.window ? {} : null) },
}));
vi.mock('../../RepositoryCommitProtection', () => ({ ensureCommitProtectionIsIdle: mocks.protection }));
let activeRepo: string | null, generation: number;
const readRequest = { repoPath: '/repo', scope: 'repository' as const };
const status = { ...readRequest, name: '', email: '', ready: false, missing: ['name', 'email'], revision: 'a'.repeat(64) };
const saveRequest = { ...readRequest, name: 'Name', email: 'name@example.invalid', expectedRevision: status.revision };
const frame = { url: 'http://localhost:5173/' };
const event = { senderFrame: frame, sender: { mainFrame: frame } } as IpcMainInvokeEvent;
const invoke = (channel: IpcChannel, request: unknown, source = event) => mocks.handlers.get(channel)!(source, request);
beforeEach(() => {
  activeRepo = '/repo';
  generation = 1;
  mocks.window = true;
  mocks.handlers.clear();
  mocks.protection.mockReset();
  vi.stubEnv('NODE_ENV', 'development');
  vi.spyOn(repoJobRegistry, 'getGeneration').mockImplementation(() => generation);
  vi.spyOn(GitIdentityService.prototype, 'read').mockResolvedValue(status as Awaited<ReturnType<GitIdentityService['read']>>);
  vi.spyOn(GitIdentityService.prototype, 'save').mockImplementation(async (_request, current) => {
    current();
    return status as Awaited<ReturnType<GitIdentityService['read']>>;
  });
  registerGitIdentityHandlers({ runner: {}, getRepoPath: () => activeRepo } as unknown as GitService);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('trusted, context-bound Git identity configuration', () => {
  it('reads and writes only the selected repository in the trusted app frame', async () => {
    expect(await invoke(IpcChannel.GitGetIdentity, readRequest)).toMatchObject({ success: true });
    expect(await invoke(IpcChannel.GitSaveIdentity, saveRequest)).toMatchObject({ success: true });
    expect(GitIdentityService.prototype.read).toHaveBeenCalledWith(readRequest);
    expect(GitIdentityService.prototype.save).toHaveBeenCalledWith(saveRequest, expect.any(Function));
    for (const channel of [IpcChannel.GitGetIdentity, IpcChannel.GitSaveIdentity]) {
      expect(await invoke(channel, { ...saveRequest, repoPath: '/other' })).toMatchObject({ success: false });
      expect(await invoke(channel, saveRequest, { ...event, senderFrame: { url: frame.url } } as IpcMainInvokeEvent)).toMatchObject({ success: false });
      const external = { url: 'https://example.com' };
      expect(await invoke(channel, saveRequest, { senderFrame: external, sender: { mainFrame: external } } as IpcMainInvokeEvent)).toMatchObject({
        success: false,
      });
      mocks.window = false;
      expect(await invoke(channel, saveRequest)).toMatchObject({ success: false });
      mocks.window = true;
    }
  });
  it('allows explicit global setup without a repository and rejects a changed context', async () => {
    activeRepo = null;
    const request = { ...saveRequest, repoPath: null, scope: 'global' };
    expect(await invoke(IpcChannel.GitGetIdentity, request)).toMatchObject({ success: true });
    expect(await invoke(IpcChannel.GitSaveIdentity, request)).toMatchObject({ success: true });
    activeRepo = '/repo';
    expect(await invoke(IpcChannel.GitSaveIdentity, request)).toMatchObject({ success: false, error: expect.stringContaining('context changed') });
    expect(await invoke(IpcChannel.GitSaveIdentity, { ...request, scope: 'system' })).toMatchObject({ success: false });
    expect(await invoke(IpcChannel.GitGetIdentity, { ...request, repoPath: '' })).toMatchObject({ success: false });
  });
  it('ignores a read result when the selection changes, including away and back', async () => {
    vi.mocked(GitIdentityService.prototype.read).mockImplementation(async () => {
      generation++;
      return status as Awaited<ReturnType<GitIdentityService['read']>>;
    });
    expect(await invoke(IpcChannel.GitGetIdentity, readRequest)).toMatchObject({ success: false, error: expect.stringContaining('repository changed') });
  });
  it('stops saving after a context switch and blocks changes during protected commit operations', async () => {
    vi.mocked(GitIdentityService.prototype.save).mockImplementation(async (_request, current) => {
      generation++;
      current();
      return status as Awaited<ReturnType<GitIdentityService['read']>>;
    });
    expect(await invoke(IpcChannel.GitSaveIdentity, saveRequest)).toMatchObject({ success: false, error: expect.stringContaining('repository changed') });
    mocks.protection.mockImplementation(() => {
      throw new Error('A protected commit is running');
    });
    expect(await invoke(IpcChannel.GitSaveIdentity, saveRequest)).toMatchObject({ success: false, error: 'A protected commit is running' });
  });
});
