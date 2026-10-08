import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSecretScanFindingPaths, repositorySecretScanAllowlistClient as client } from '../repositorySecretScanAllowlistClient';
import type { RepositorySecretScanAllowlistDto } from '@/types/repositorySecretScanAllowlist';

const value: RepositorySecretScanAllowlistDto = {
  repoPath: '/repo',
  relativePath: '.Open-Git-Control/secret-scan-allowlist.txt',
  exists: false,
  text: '',
  version: 'missing',
};
const api = {
  getRepositorySecretScanAllowlist: vi.fn(),
  saveRepositorySecretScanAllowlist: vi.fn(),
  addRepositorySecretScanAllowlistPaths: vi.fn(),
  watchRepositorySecretScanAllowlist: vi.fn(),
  onRepositorySecretScanAllowlistChanged: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { electronAPI: { git: api } });
  api.getRepositorySecretScanAllowlist.mockResolvedValue({ success: true, data: value });
});
afterEach(() => vi.unstubAllGlobals());

describe('repository allowlist client', () => {
  it('uses uncached repository-bound reads and delegates edits and subscriptions', async () => {
    expect(client.isAvailable()).toBe(true);
    await client.get('/repo');
    await client.get('/repo');
    expect(api.getRepositorySecretScanAllowlist).toHaveBeenCalledTimes(2);
    await client.save({ repoPath: '/repo', text: 'path:file', expectedVersion: 'missing' });
    expect(api.saveRepositorySecretScanAllowlist).toHaveBeenCalledWith({ repoPath: '/repo', text: 'path:file', expectedVersion: 'missing' });
    await client.addPaths({ repoPath: '/repo', paths: ['file'], expectedVersion: 'missing' });
    expect(api.addRepositorySecretScanAllowlistPaths).toHaveBeenCalledWith({ repoPath: '/repo', paths: ['file'], expectedVersion: 'missing' });
    await client.watch('/repo');
    await client.watch(null);
    expect(api.watchRepositorySecretScanAllowlist).toHaveBeenLastCalledWith(null);
    const callback = vi.fn();
    const stop = vi.fn();
    api.onRepositorySecretScanAllowlistChanged.mockReturnValue(stop);
    expect(client.onChanged(callback)).toBe(stop);
    expect(api.onRepositorySecretScanAllowlistChanged).toHaveBeenCalledWith(callback);
  });
  it('notifies migration listeners only when Main returns a report, and unsubscribes', async () => {
    const listener = vi.fn();
    const stop = client.onMigration(listener);
    const migration = { importedRules: 2, discardedRules: 1, preservedExisting: false };
    api.getRepositorySecretScanAllowlist.mockResolvedValueOnce({ success: true, data: { ...value, migration } });
    await client.get('/repo');
    await client.get('/repo');
    expect(listener).toHaveBeenCalledExactlyOnceWith('/repo', migration);
    stop();
    api.getRepositorySecretScanAllowlist.mockResolvedValue({ success: true, data: { ...value, migration } });
    await client.get('/repo');
    expect(listener).toHaveBeenCalledTimes(1);
    api.getRepositorySecretScanAllowlist.mockResolvedValue({ success: false, error: 'read failed' });
    expect(await client.get('/repo')).toEqual({ success: false, error: 'read failed' });
  });
  it('loads the current version before appending finding paths and propagates failures', async () => {
    api.addRepositorySecretScanAllowlistPaths.mockResolvedValue({ success: true, data: { ...value, text: 'path:file' } });
    await addSecretScanFindingPaths('/repo', [{ filePath: 'file' }]);
    expect(api.addRepositorySecretScanAllowlistPaths).toHaveBeenCalledWith({ repoPath: '/repo', paths: ['file'], expectedVersion: 'missing' });
    api.addRepositorySecretScanAllowlistPaths.mockResolvedValue({ success: false, error: 'version changed' });
    await expect(addSecretScanFindingPaths('/repo', [{ filePath: 'file' }])).rejects.toThrow('version changed');
    api.getRepositorySecretScanAllowlist.mockResolvedValue({ success: false, error: 'read failed' });
    await expect(addSecretScanFindingPaths('/repo', [{ filePath: 'file' }])).rejects.toThrow('read failed');
  });
  it('does not pretend the API exists outside Electron', async () => {
    vi.unstubAllGlobals();
    expect(client.isAvailable()).toBe(false);
    await expect(client.get('/repo')).rejects.toThrow('Electron API');
  });
});
