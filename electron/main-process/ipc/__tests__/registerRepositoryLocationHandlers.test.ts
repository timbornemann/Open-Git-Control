import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from '../../../GitService';
import type { RepositoryLocationService } from '../../RepositoryLocationService';
import { repoJobRegistry } from '../../repoJobRegistry';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { registerRepositoryLocationHandlers } from '../registerRepositoryLocationHandlers';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>(), picker: vi.fn(), window: true, protection: vi.fn() }));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, callback: (...args: any[]) => Promise<any>) => mocks.handlers.set(channel, callback) },
  BrowserWindow: { fromWebContents: () => (mocks.window ? {} : null) },
  dialog: { showOpenDialog: mocks.picker },
}));
vi.mock('../../RepositoryCommitProtection', () => ({ ensureCommitProtectionIsIdle: mocks.protection }));
let active: string | null, generation: number;
const repoPath = path.resolve('missing-repository');
const candidate = path.resolve('moved-repository');
const service = { recheck: vi.fn(), relocate: vi.fn() };
const frame = { url: 'http://localhost:5173/' };
const event = { senderFrame: frame, sender: { mainFrame: frame } };
const invoke = (channel: IpcChannel, source: unknown = event, request: unknown = { repoPath }) => mocks.handlers.get(channel)!(source, request);
beforeEach(() => {
  active = repoPath;
  generation = 1;
  mocks.window = true;
  mocks.handlers.clear();
  mocks.picker.mockReset().mockResolvedValue({ canceled: false, filePaths: [candidate] });
  mocks.protection.mockReset();
  service.recheck.mockReset().mockImplementation(async (_path, current) => {
    current();
    return repoPath;
  });
  service.relocate.mockReset().mockImplementation(async (_path, _candidate, current) => {
    current();
    return candidate;
  });
  vi.stubEnv('NODE_ENV', 'development');
  vi.spyOn(repoJobRegistry, 'getGeneration').mockImplementation(() => generation);
  registerRepositoryLocationHandlers({ runner: {}, getRepoPath: () => active } as unknown as GitService, service as unknown as RepositoryLocationService);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('trusted repository recovery IPC', () => {
  it('rechecks the captured active repository without opening the folder picker', async () => {
    expect(await invoke(IpcChannel.ReposRecheck)).toEqual({ success: true, data: repoPath });
    expect(service.recheck).toHaveBeenCalledWith(repoPath, expect.any(Function));
    expect(mocks.picker).not.toHaveBeenCalled();
  });
  it('uses only the natively selected folder and returns cancellation without moving any record', async () => {
    expect(await invoke(IpcChannel.ReposSelectLocation)).toEqual({ success: true, data: candidate });
    expect(service.relocate).toHaveBeenCalledWith(repoPath, candidate, expect.any(Function));
    service.relocate.mockClear();
    mocks.picker.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await invoke(IpcChannel.ReposSelectLocation)).toEqual({ success: true, data: null });
    expect(service.relocate).not.toHaveBeenCalled();
  });
  it('rejects a switch away and back while the native folder dialog was open', async () => {
    mocks.picker.mockImplementation(async () => {
      generation++;
      return { canceled: false, filePaths: [candidate] };
    });
    expect(await invoke(IpcChannel.ReposSelectLocation)).toMatchObject({ success: false, error: expect.stringContaining('recovery was stopped') });
    expect(service.relocate).not.toHaveBeenCalled();
  });
  it('revalidates the captured context after asynchronous filesystem/Git work', async () => {
    service.recheck.mockImplementation(async (_path, current) => {
      active = candidate;
      current();
      return repoPath;
    });
    expect(await invoke(IpcChannel.ReposRecheck)).toMatchObject({ success: false });
  });
  it('reports invalid folders and refuses missing, untrusted or different repository contexts', async () => {
    service.relocate.mockRejectedValueOnce(new Error('Not a Git repository'));
    expect(await invoke(IpcChannel.ReposSelectLocation)).toEqual({ success: false, error: 'Not a Git repository' });
    expect(await invoke(IpcChannel.ReposRecheck, { ...event, senderFrame: { url: frame.url } })).toMatchObject({ success: false });
    mocks.window = false;
    expect(await invoke(IpcChannel.ReposRecheck)).toMatchObject({ success: false });
    mocks.window = true;
    expect(await invoke(IpcChannel.ReposRecheck, event, null)).toMatchObject({ success: false });
    expect(await invoke(IpcChannel.ReposRecheck, event, { repoPath: 'relative' })).toMatchObject({ success: false });
    active = null;
    expect(await invoke(IpcChannel.ReposRecheck)).toMatchObject({ success: false });
  });
});
