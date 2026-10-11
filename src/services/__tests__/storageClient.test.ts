import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageClient } from '../storageClient';
import { appClient } from '../appClient';

afterEach(() => vi.unstubAllGlobals());
describe('typed maintenance and repository boundaries', () => {
  it('reports desktop capability accurately', () => {
    expect(storageClient.isAvailable()).toBe(false);
    expect(storageClient.hasUiPreferences()).toBe(false);
    vi.stubGlobal('window', {});
    expect(storageClient.isAvailable()).toBe(false);
    vi.stubGlobal('window', { electronAPI: { app: {} } });
    expect(storageClient.isAvailable()).toBe(false);
    vi.stubGlobal('window', { electronAPI: { app: { inspectStorage: vi.fn() } } });
    expect(storageClient.isAvailable()).toBe(true);
    vi.stubGlobal('window', { electronAPI: { app: { getRepositoryUiPreferences: vi.fn() } } });
    expect(storageClient.hasUiPreferences()).toBe(true);
  });
  it('delegates fixed cleanup categories and subscriptions without renderer file paths', async () => {
    const app = {
      inspectStorage: vi.fn(),
      runStorageMaintenance: vi.fn(),
      restoreRemovedRepository: vi.fn(),
      onStorageMaintenance: vi.fn(),
      getCompletedRecoveryBackups: vi.fn(),
      removeCompletedRecoveryBackups: vi.fn(),
      getRepositoryUiPreferences: vi.fn(),
      updateRepositoryUiPreferences: vi.fn(),
    };
    const repos = { mutateStoredRepos: vi.fn(), onStoredReposChanged: vi.fn() };
    vi.stubGlobal('window', { electronAPI: { app, repos } });
    await storageClient.inspect();
    expect(app.inspectStorage).toHaveBeenCalledWith();
    const request = { mode: 'all-caches' as const, categories: ['previews' as const] };
    await storageClient.run(request);
    expect(app.runStorageMaintenance).toHaveBeenCalledWith(request);
    await storageClient.restore('C:/repo');
    expect(app.restoreRemovedRepository).toHaveBeenCalledWith('C:/repo');
    const callback = vi.fn();
    storageClient.subscribe(callback);
    expect(app.onStorageMaintenance).toHaveBeenCalledWith(callback);
    await storageClient.recovery();
    expect(app.getCompletedRecoveryBackups).toHaveBeenCalledWith();
    const removal = { repoPath: 'C:/repo', ids: ['id'] };
    await storageClient.removeRecovery(removal);
    expect(app.removeCompletedRecoveryBackups).toHaveBeenCalledWith(removal);
    await storageClient.uiPreferences();
    expect(app.getRepositoryUiPreferences).toHaveBeenCalledWith();
    const ui = { repoPath: 'C:/repo', patch: { tagPanelCollapsed: true } };
    await storageClient.updateUiPreferences(ui);
    expect(app.updateRepositoryUiPreferences).toHaveBeenCalledWith(ui);
    await appClient.mutateStoredRepos({ kind: 'remove', path: 'C:/repo' });
    expect(repos.mutateStoredRepos).toHaveBeenCalledWith({ kind: 'remove', path: 'C:/repo' });
    appClient.onStoredReposChanged(callback);
    expect(repos.onStoredReposChanged).toHaveBeenCalledWith(callback);
  });
});
