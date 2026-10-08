import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRepositorySecretScanAllowlistHandlers } from '../registerRepositorySecretScanAllowlistHandlers';
import { repositorySecretScanAllowlistService } from '../../repositorySecretScanAllowlist';
import { RepoJobRegistry } from '../../repoJobRegistry';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { GitService } from '../../../GitService';
import { createRepositorySecretScanAllowlistApi } from '../../../preload/createRepositorySecretScanAllowlistApi';

const state = vi.hoisted(() => ({ directory: '', handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  ipcMain: { handle: (channel: string, callback: (...args: any[]) => any) => state.handlers.set(channel, callback) },
}));
let activeRepo: string;
let repository: string;
let registry: RepoJobRegistry;
let destroy: (() => void) | undefined;
const event = {
  sender: {
    id: 1,
    send: vi.fn(),
    isDestroyed: () => false,
    once: vi.fn((_type: string, callback: () => void) => {
      destroy = callback;
    }),
  },
};
beforeEach(() => {
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-allowlist-ipc-'));
  repository = path.join(state.directory, 'repository');
  fs.mkdirSync(repository);
  activeRepo = repository;
  state.handlers.clear();
  event.sender.send.mockClear();
  destroy = undefined;
  registry = new RepoJobRegistry();
  registerRepositorySecretScanAllowlistHandlers({
    gitService: { getRepoPath: () => activeRepo } as GitService,
    repoJobRegistry: registry,
    readSettingsWithMigration: () => ({}),
  });
});
afterEach(() => {
  destroy?.();
  vi.restoreAllMocks();
  fs.rmSync(state.directory, { recursive: true, force: true });
});
const request = (channel: IpcChannel, input: unknown) => state.handlers.get(channel)!(event, input);

describe('repository allowlist IPC', () => {
  it('reads, saves, adds paths and emits invalidation without running Git transfers', async () => {
    expect(await request(IpcChannel.RepositorySecretScanAllowlistGet, repository)).toMatchObject({
      success: true,
      data: { exists: false, version: 'missing' },
    });
    const saved = await request(IpcChannel.RepositorySecretScanAllowlistSave, { repoPath: repository, expectedVersion: 'missing', text: '# Team policy' });
    expect(saved.success).toBe(true);
    const added = await request(IpcChannel.RepositorySecretScanAllowlistAddPaths, {
      repoPath: repository,
      paths: ['sample.env'],
      expectedVersion: saved.data.version,
    });
    expect(added).toMatchObject({ success: true, data: { text: '# Team policy\npath:sample.env\n' } });
    expect(event.sender.send).toHaveBeenCalledWith(IpcChannel.RepositorySecretScanAllowlistChanged, repository);
  });
  it('rejects writes for other repositories and stale versions', async () => {
    const other = path.join(state.directory, 'other');
    fs.mkdirSync(other);
    expect(await request(IpcChannel.RepositorySecretScanAllowlistSave, { repoPath: other, expectedVersion: 'missing', text: 'path:file' })).toMatchObject({
      success: false,
    });
    await request(IpcChannel.RepositorySecretScanAllowlistSave, { repoPath: repository, expectedVersion: 'missing', text: 'path:first' });
    expect(
      await request(IpcChannel.RepositorySecretScanAllowlistSave, { repoPath: repository, expectedVersion: 'missing', text: 'path:second' }),
    ).toMatchObject({ success: false, error: expect.stringContaining('changed') });
  });
  it('does not write after a repository switch during preparation', async () => {
    const value = repositorySecretScanAllowlistService.read(repository);
    let complete!: (result: typeof value) => void;
    vi.spyOn(repositorySecretScanAllowlistService, 'prepare').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const operation = request(IpcChannel.RepositorySecretScanAllowlistSave, { repoPath: repository, expectedVersion: 'missing', text: 'path:file' });
    activeRepo = path.join(state.directory, 'other');
    registry.cancelForRepoChange(activeRepo);
    complete(value);
    expect(await operation).toMatchObject({ success: false });
    expect(repositorySecretScanAllowlistService.read(repository).exists).toBe(false);
  });
  it('starts and disposes a watcher and rejects watches for unauthorized repos', async () => {
    expect(await request(IpcChannel.RepositorySecretScanAllowlistWatch, repository)).toEqual({ success: true, data: true });
    expect(destroy).toBeTypeOf('function');
    expect(await request(IpcChannel.RepositorySecretScanAllowlistWatch, '/other')).toMatchObject({ success: false });
    expect(await request(IpcChannel.RepositorySecretScanAllowlistWatch, null)).toEqual({ success: true, data: true });
  });
  it('exposes the same typed operations and detachable change listener in preload', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const on = vi.fn();
    const removeListener = vi.fn();
    const api = createRepositorySecretScanAllowlistApi({ invoke, on, removeListener });
    await api.getRepositorySecretScanAllowlist('/repo');
    await api.saveRepositorySecretScanAllowlist({ repoPath: '/repo', text: '', expectedVersion: 'missing' });
    await api.addRepositorySecretScanAllowlistPaths({ repoPath: '/repo', paths: ['file'], expectedVersion: 'missing' });
    await api.watchRepositorySecretScanAllowlist(null);
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      IpcChannel.RepositorySecretScanAllowlistGet,
      IpcChannel.RepositorySecretScanAllowlistSave,
      IpcChannel.RepositorySecretScanAllowlistAddPaths,
      IpcChannel.RepositorySecretScanAllowlistWatch,
    ]);
    const callback = vi.fn();
    const stop = api.onRepositorySecretScanAllowlistChanged(callback);
    on.mock.calls[0][1]({}, '/repo');
    stop();
    expect(callback).toHaveBeenCalledWith('/repo');
    expect(removeListener).toHaveBeenCalledWith(IpcChannel.RepositorySecretScanAllowlistChanged, on.mock.calls[0][1]);
  });
});
