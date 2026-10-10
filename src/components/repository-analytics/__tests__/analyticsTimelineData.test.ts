import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAnalyticsTimelines, loadAnalyticsTimeline, readAnalyticsTimeline, TIMELINE_LIMIT } from '../analyticsTimelineData';
import { analyticsReport } from './analyticsFixtures';
import type { FileTimelineCommit } from '@/components/file-timeline/types';
const mocks = vi.hoisted(() => ({ timeline: vi.fn(), details: vi.fn() }));
vi.mock('@/services/gitClient', () => ({ gitClient: { getFileTimelineData: mocks.timeline, getRepositoryAnalyticsDetails: mocks.details } }));
const commits: FileTimelineCommit[] = ['c', 'b', 'a'].map((hash) => ({
  hash: hash.repeat(40),
  author: 'Alice',
  date: '2026-10-10',
  subject: hash,
  changes: [{ path: `${hash}.ts`, status: 'added' }],
}));
beforeEach(() => {
  vi.resetAllMocks();
  clearAnalyticsTimelines();
  mocks.timeline.mockResolvedValue({ success: true, data: commits });
});
describe('analytics timeline data reuse and filters', () => {
  it('reads the captured project commit and reuses the exact report across timestamp, remote-ref and unrelated comparison changes', async () => {
    const snapshot = analyticsReport();
    const first = await loadAnalyticsTimeline(snapshot, snapshot.filters);
    expect(mocks.timeline).toHaveBeenCalledWith(TIMELINE_LIMIT, 'C:/repo', snapshot.project.oid);
    expect(first.commits.map((commit) => commit.subject)).toEqual(['a', 'b', 'c']);
    const refreshed = { ...snapshot, id: 'new-remote-refs', savedAt: 3000, filters: { ...snapshot.filters, compareFrom: 'refs/tags/v1.0.0' } };
    expect(await loadAnalyticsTimeline(refreshed, refreshed.filters)).toBe(first);
    expect(readAnalyticsTimeline(refreshed, refreshed.filters)).toBe(first);
    expect(mocks.timeline).toHaveBeenCalledOnce();
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it('loads every filtered commit page while preserving intermediate changes in the complete parent-line history', async () => {
    const snapshot = analyticsReport();
    snapshot.filters = { ...snapshot.filters, author: 'canonical-mailmap-author', since: '2026-10-01', path: 'src/' };
    const rows = Array.from({ length: 450 }, (_, index) => ({ hash: index === 420 ? commits[0].hash : String(index).padStart(40, '0') }));
    mocks.details.mockImplementation(({ offset, limit }) =>
      Promise.resolve({ success: true, data: { items: rows.slice(offset, offset + limit), offset, total: rows.length } }),
    );
    const result = await loadAnalyticsTimeline(snapshot, snapshot.filters);
    expect(result.commits).toHaveLength(3);
    expect([...result.visibleCommitHashes!]).toEqual([commits[0].hash]);
    expect(mocks.details.mock.calls.map(([request]) => request.offset)).toEqual([0, 200, 400]);
    await loadAnalyticsTimeline({ ...snapshot, savedAt: 4000 }, snapshot.filters);
    expect(mocks.details).toHaveBeenCalledTimes(3);
    await loadAnalyticsTimeline({ ...snapshot, id: 'different-filter', filters: { ...snapshot.filters, path: 'lib/' } }, { ...snapshot.filters, path: 'lib/' });
    expect(mocks.timeline).toHaveBeenCalledOnce();
  });
  it('shares pending history reads, refreshes a changed project commit, and retries failed reads without caching the failure', async () => {
    const snapshot = analyticsReport();
    const [first, second] = await Promise.all([loadAnalyticsTimeline(snapshot, snapshot.filters), loadAnalyticsTimeline(snapshot, snapshot.filters)]);
    expect(first).toBe(second);
    expect(mocks.timeline).toHaveBeenCalledOnce();
    const changed = { ...snapshot, project: { ...snapshot.project, oid: 'd'.repeat(40) } };
    mocks.timeline.mockResolvedValueOnce({ success: false, error: 'Missing object' });
    await expect(loadAnalyticsTimeline(changed, changed.filters)).rejects.toThrow('Missing object');
    const fresh = await loadAnalyticsTimeline(changed, changed.filters);
    expect(fresh).not.toBe(first);
    expect(mocks.timeline).toHaveBeenCalledTimes(3);
  });
});
