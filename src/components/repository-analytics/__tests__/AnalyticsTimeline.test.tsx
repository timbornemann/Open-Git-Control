// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { host, root, mocks, render, click, deferred } from './repositoryAnalyticsViewFixture';
import { analyticsReport } from './analyticsFixtures';
import type { FileTimelineCommit } from '@/components/file-timeline/types';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
vi.mock('@/components/FileTimelineCanvas', () => ({
  FileTimelineCanvas: ({ activeCommit }: { activeCommit: FileTimelineCommit }) => <div className="timeline-test-map" data-commit={activeCommit.hash} />,
}));
const commits: FileTimelineCommit[] = ['b', 'a'].map((hash) => ({
  hash: hash.repeat(40),
  author: 'Alice',
  date: '2026-10-01',
  subject: hash,
  changes: [{ path: `${hash}.ts`, status: 'added' }],
}));
describe('timeline in the analytics workspace', () => {
  it('opens from the shared sidebar and retains commit selection and mounted content across background refreshes and reopening', async () => {
    mocks.timeline.mockResolvedValue({ success: true, data: commits });
    await render();
    await click('Timeline');
    expect(host.querySelector('.analytics-sidebar-nav [aria-current="page"]')?.textContent).toBe('Timeline');
    expect(mocks.timeline).toHaveBeenCalledWith(5000, 'C:/repo', 'b'.repeat(40));
    expect(host.querySelector('.analytics-content--timeline')).toBeTruthy();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="First commit"]')!.click());
    const map = host.querySelector('.timeline-test-map');
    const slider = host.querySelector('.file-timeline-slider');
    const refreshed = { ...analyticsReport(), savedAt: 2000 };
    mocks.refresh.mockResolvedValueOnce({ success: true, data: refreshed });
    await render('C:/repo', false, 1);
    expect(host.querySelector('.timeline-test-map')).toBe(map);
    expect(host.querySelector('.file-timeline-slider')).toBe(slider);
    expect(map?.getAttribute('data-commit')).toBe('a'.repeat(40));
    expect(mocks.timeline).toHaveBeenCalledOnce();
    const nextHistory = deferred<{ success: true; data: FileTimelineCommit[] }>();
    mocks.timeline.mockReturnValueOnce(nextHistory.promise);
    const advanced = { ...refreshed, id: 'new-head', head: 'c'.repeat(40), project: { ...refreshed.project, oid: 'c'.repeat(40) } };
    mocks.refresh.mockResolvedValueOnce({ success: true, data: advanced });
    await render('C:/repo', false, 2);
    expect(host.querySelector('.timeline-test-map')).toBe(map);
    expect(host.textContent).not.toContain('Loading timeline');
    await act(async () => nextHistory.resolve({ success: true, data: [{ ...commits[0], hash: advanced.head, subject: 'c' }, ...commits] }));
    expect(host.querySelector('.timeline-test-map')).toBe(map);
    expect(map?.getAttribute('data-commit')).toBe('a'.repeat(40));
    await act(async () => root.render(null));
    await render('C:/repo', false, 2);
    expect(host.querySelector('.timeline-test-map')?.getAttribute('data-commit')).toBe('a'.repeat(40));
    expect(host.textContent).not.toContain('Loading timeline');
    expect(mocks.timeline).toHaveBeenCalledTimes(2);
  });
  it('does not let a delayed timeline from another repository replace the current map', async () => {
    const old = deferred<{ success: true; data: FileTimelineCommit[] }>();
    mocks.timeline.mockReturnValueOnce(old.promise);
    await render();
    await click('Timeline');
    const next: RepositoryAnalyticsSnapshot = {
      ...analyticsReport('C:/another'),
      head: 'd'.repeat(40),
      project: { ...analyticsReport().project, oid: 'd'.repeat(40) },
    };
    mocks.cache.mockResolvedValue({ success: true, data: next });
    mocks.timeline.mockResolvedValue({ success: true, data: [{ ...commits[0], hash: next.head, subject: 'another repository' }] });
    await render('C:/another');
    await click('Timeline');
    await act(async () => old.resolve({ success: true, data: commits }));
    expect(host.querySelector('.timeline-test-map')?.getAttribute('data-commit')).toBe(next.head);
    expect(host.textContent).toContain('another repository');
  });
});
