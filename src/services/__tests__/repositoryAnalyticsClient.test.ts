import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '../gitClient';
import { DEFAULT_ANALYTICS_FILTERS } from '@/shared/ipc/repositoryAnalytics';

afterEach(() => vi.unstubAllGlobals());
describe('analytics renderer client contract', () => {
  it('delegates explicit repository, filters, paging and progress through the git API', async () => {
    const api = {
      getRepositoryAnalyticsSnapshot: vi.fn().mockResolvedValue({ success: true, data: null }),
      refreshRepositoryAnalytics: vi.fn().mockResolvedValue({ success: true }),
      getRepositoryAnalyticsDetails: vi.fn().mockResolvedValue({ success: true }),
      onRepositoryAnalyticsProgress: vi.fn().mockReturnValue(vi.fn()),
    };
    vi.stubGlobal('window', { electronAPI: { git: api } });
    const request = { repoPath: 'C:/repo', filters: DEFAULT_ANALYTICS_FILTERS, readRequest: { requestId: 'analytics-1', priority: 'speculative' as const } };
    await gitClient.getRepositoryAnalyticsSnapshot(request);
    expect(api.getRepositoryAnalyticsSnapshot).toHaveBeenCalledWith(request);
    await gitClient.refreshRepositoryAnalytics(request);
    expect(api.refreshRepositoryAnalytics).toHaveBeenCalledWith(request);
    const details = { repoPath: 'C:/repo', snapshotId: 'one', kind: 'commits' as const, offset: 50, limit: 50 };
    await gitClient.getRepositoryAnalyticsDetails(details);
    expect(api.getRepositoryAnalyticsDetails).toHaveBeenCalledWith(details);
    const listener = vi.fn();
    const dispose = gitClient.onRepositoryAnalyticsProgress(listener);
    expect(api.onRepositoryAnalyticsProgress).toHaveBeenCalledWith(listener);
    expect(dispose).toBeTypeOf('function');
  });
});
