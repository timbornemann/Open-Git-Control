import { describe, expect, it, vi } from 'vitest';
import type { PreviewSnapshot } from '../../../../src/shared/cache/resource';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { registerBootstrapHandlers } from '../registerBootstrapHandlers';
import type { GitHubService } from '../../../GitHubService';

const state = vi.hoisted(() => ({ handlers: new Map<string, () => Promise<any>>(), snapshots: [] as PreviewSnapshot[] }));
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: () => Promise<any>) => state.handlers.set(key, handler) } }));
vi.mock('../../settingsStore', () => ({ readSettingsWithMigration: () => ({ githubHost: 'github.com' }) }));
vi.mock('../../secureStore', () => ({ readSavedGithubTokenWithHost: () => null }));
vi.mock('../../githubCatalogCache', () => ({ readGithubCatalogCache: () => null }));
vi.mock('../../repoStore', () => ({
  readStoreData: () => ({ activeRepo: '/active', repos: ['/active', '/first', '/second', '/older'].map((path, index) => ({ path, lastOpened: 100 - index })) }),
}));
vi.mock('../../previewCache', () => ({
  readPreviewCache: async (allowed: (entry: PreviewSnapshot) => boolean) => state.snapshots.filter(allowed),
  savePreviewCache: vi.fn(),
}));

describe('repository activity bootstrap', () => {
  it('restores every registered summary while retaining the recent-repository limit for large previews', async () => {
    state.snapshots = ['/active', '/first', '/second', '/older', '/removed'].flatMap((path) =>
      ['getRepositoryChangeSummary', 'getWorkingTreeSnapshot'].map((method): PreviewSnapshot => ({
        version: 1,
        key: ['resource', 'git', path, method],
        savedAt: Date.now(),
        sourceRevision: '1',
        complete: true,
        data: {},
      })),
    );
    registerBootstrapHandlers({ normalizeHost: (host: string) => host, isAuthenticated: () => false } as GitHubService);
    const result = await state.handlers.get(IpcChannel.AppBootstrap)!();
    expect(
      result.snapshots.filter((entry: PreviewSnapshot) => entry.key[3] === 'getRepositoryChangeSummary').map((entry: PreviewSnapshot) => entry.key[2]),
    ).toEqual(['/active', '/first', '/second', '/older']);
    expect(
      result.snapshots.filter((entry: PreviewSnapshot) => entry.key[3] === 'getWorkingTreeSnapshot').map((entry: PreviewSnapshot) => entry.key[2]),
    ).toEqual(['/active', '/first', '/second']);
  });
});
