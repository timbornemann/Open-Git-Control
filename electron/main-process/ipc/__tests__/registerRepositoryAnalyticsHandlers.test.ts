import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../../../GitService';
import { RepositoryAnalyticsService } from '../../../analytics/RepositoryAnalyticsService';
import { registerRepositoryAnalyticsHandlers } from '../registerRepositoryAnalyticsHandlers';
import { registerReadCancellation } from '../../readRequests';
import { repoJobRegistry } from '../../repoJobRegistry';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { DEFAULT_ANALYTICS_FILTERS } from '../../../../src/shared/ipc/repositoryAnalytics';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>(), window: true }));
vi.mock('electron', () => ({
  app: { getPath: () => '/app-data' },
  BrowserWindow: { fromWebContents: () => (mocks.window ? {} : null) },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<any>) => mocks.handlers.set(channel, handler) },
}));
let activeRepo: string, event: IpcMainInvokeEvent;
const invoke = (channel: IpcChannel, request: unknown, source = event) => mocks.handlers.get(channel)!(source, request);
beforeEach(() => {
  activeRepo = '/repo';
  mocks.window = true;
  mocks.handlers.clear();
  vi.stubEnv('NODE_ENV', 'development');
  repoJobRegistry.cancelForRepoChange(activeRepo);
  const frame = { url: 'http://localhost:5173/' };
  const sender = Object.assign(new EventEmitter(), { id: 1, mainFrame: frame, send: vi.fn(), isDestroyed: () => false });
  event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent;
  vi.spyOn(RepositoryAnalyticsService.prototype, 'snapshot').mockReturnValue(null);
  vi.spyOn(RepositoryAnalyticsService.prototype, 'details').mockReturnValue({ items: [], total: 0, offset: 0 });
  vi.spyOn(RepositoryAnalyticsService.prototype, 'refresh').mockResolvedValue({ id: 'one' } as any);
  registerRepositoryAnalyticsHandlers({ getRepoPath: () => activeRepo } as GitService);
  registerReadCancellation();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('context-bound analytics IPC', () => {
  it('permits the trusted active repository and refuses other repositories and external frames', async () => {
    const request = { repoPath: '/repo', filters: DEFAULT_ANALYTICS_FILTERS };
    for (const channel of [IpcChannel.GitAnalyticsSnapshot, IpcChannel.GitAnalyticsRefresh, IpcChannel.GitAnalyticsDetails]) {
      expect(await invoke(channel, request)).toMatchObject({ success: true });
      expect(await invoke(channel, { ...request, repoPath: '/other' })).toMatchObject({ success: false });
      expect(await invoke(channel, request, { ...event, senderFrame: { url: 'https://example.com' } } as any)).toMatchObject({ success: false });
    }
  });
  it('cancels on repository changes including away-and-back, and drops late progress', async () => {
    vi.mocked(RepositoryAnalyticsService.prototype.refresh).mockImplementation(async (_request, signal, progress) => {
      repoJobRegistry.cancelForRepoChange('/other');
      repoJobRegistry.cancelForRepoChange('/repo');
      expect(signal.aborted).toBe(true);
      progress({ repoPath: '/repo', requestId: 'one', phase: 'history', completed: 1, total: 1 });
      return { id: 'late' } as any;
    });
    expect(await invoke(IpcChannel.GitAnalyticsRefresh, { repoPath: '/repo', filters: DEFAULT_ANALYTICS_FILTERS })).toMatchObject({ success: false });
    expect(event.sender.send).not.toHaveBeenCalled();
  });
  it('connects explicit read cancellation and cleans up sender listeners', async () => {
    vi.mocked(RepositoryAnalyticsService.prototype.refresh).mockImplementation(async (_request, signal) => {
      await invoke(IpcChannel.AppCancelRead, 'analytics-1');
      signal.throwIfAborted();
      return {} as any;
    });
    expect(
      await invoke(IpcChannel.GitAnalyticsRefresh, {
        repoPath: '/repo',
        filters: DEFAULT_ANALYTICS_FILTERS,
        readRequest: { requestId: 'analytics-1', priority: 'speculative' },
      }),
    ).toMatchObject({ success: false });
    expect((event.sender as unknown as EventEmitter).listenerCount('destroyed')).toBe(0);
  });
});
