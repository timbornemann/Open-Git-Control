// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsProgress, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { RepositoryAnalyticsView } from '../RepositoryAnalyticsView';
import { readAnalyticsFilters } from '../analyticsPreferences';

const mocks = vi.hoisted(() => ({
  cache: vi.fn(),
  refresh: vi.fn(),
  details: vi.fn(),
  subscribe: vi.fn(),
  cancel: vi.fn(),
  publish: vi.fn(),
  update: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock('@/services/gitClient', () => ({
  gitClient: {
    getRepositoryAnalyticsSnapshot: mocks.cache,
    refreshRepositoryAnalytics: mocks.refresh,
    getRepositoryAnalyticsDetails: mocks.details,
    onRepositoryAnalyticsProgress: mocks.subscribe,
  },
}));
vi.mock('@/data/ipcRead', () => ({
  cancellableRead: async (signal: AbortSignal, _priority: string, run: (request: unknown) => Promise<unknown>) => {
    signal.addEventListener('abort', mocks.cancel);
    return run({ requestId: `test-${++serial}`, priority: 'speculative' });
  },
}));
let serial = 0;
let host: HTMLDivElement, root: Root;
let listeners: ((event: AnalyticsProgress) => void)[];
const openFile = vi.fn(),
  openCommit = vi.fn();
function report(repoPath = 'C:/repo', commits = 3): RepositoryAnalyticsSnapshot {
  return {
    id: repoPath,
    repoPath,
    savedAt: 1000,
    complete: true,
    filters: { ...DEFAULT_ANALYTICS_FILTERS },
    sections: ['history', 'project', 'blame', 'comparison'],
    authors: [{ id: 'alice', name: 'Alice', email: 'alice@test.invalid' }],
    refs: [{ name: 'refs/heads/main', oid: 'a'.repeat(40), remote: false }],
    tags: [{ name: 'v1.0.0', oid: 'a'.repeat(40), version: true, date: 1000 }],
    head: 'b'.repeat(40),
    totals: { commits, merges: 0, contributors: 1, firstActivity: 1000, lastActivity: 2000 },
    filteredCommits: commits,
    additions: 3,
    deletions: 0,
    excludedCouplingCommits: 0,
    contributors: [],
    periods: [{ date: '2026-10-08', commits, merges: 0, additions: 3, deletions: 0 }],
    calendar: [],
    hotspots: [{ path: 'a.ts', changes: 3, additions: 3, deletions: 0, authors: 1, hash: 'b'.repeat(40), lastChanged: 2000, binary: false }],
    directories: [],
    coupling: [],
    comparison: null,
    warnings: [],
    project: {
      oid: 'b'.repeat(40),
      files: 1,
      textFiles: 1,
      binaryFiles: 0,
      lfsFiles: 0,
      symlinks: 0,
      submodules: 0,
      excludedFiles: 0,
      lines: 3,
      blamedLines: 3,
      unblamedFiles: 0,
      languages: [{ language: 'TypeScript', files: 1, lines: 3 }],
      ownership: [],
    },
  };
}
const notifications = { publish: mocks.publish, update: mocks.update, dismiss: mocks.dismiss };
const render = (repoPath = 'C:/repo', busy = false, refreshTrigger = 0) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <NotificationProvider value={notifications}>
          <RepositoryAnalyticsView repoPath={repoPath} refreshTrigger={refreshTrigger} busy={busy} onOpenFile={openFile} onOpenCommit={openCommit} />
        </NotificationProvider>
      </I18nProvider>,
    ),
  );
const click = async (text: string) => {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  listeners = [];
  serial = 0;
  mocks.cache.mockResolvedValue({ success: true, data: report() });
  mocks.refresh.mockImplementation(() => new Promise(() => {}));
  mocks.details.mockResolvedValue({ success: true, data: { items: [], total: 0, offset: 0 } });
  mocks.subscribe.mockImplementation((listener) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((value) => value !== listener);
    };
  });
  mocks.publish.mockReturnValue(1);
  mocks.update.mockReturnValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('repository analytics dashboard', () => {
  it('preserves gaps in the time axis and lets the keyboard select a period for commit details', async () => {
    const saved = report();
    saved.periods.push({ date: '2026-10-11', commits: 1, merges: 0, additions: 1, deletions: 0 });
    mocks.cache.mockResolvedValue({ success: true, data: saved });
    await render();
    expect(host.querySelector('.analytics-period-gap')?.getAttribute('style')).toContain('flex: 2');
    const bars = host.querySelectorAll<HTMLButtonElement>('.analytics-bar');
    bars[0].focus();
    await act(async () => bars[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(bars[1]);
    await act(async () => bars[1].click());
    expect(mocks.refresh.mock.calls.at(-1)?.[0].filters).toMatchObject({ since: '2026-10-11', until: '2026-10-11' });
    expect(host.textContent).toContain('Commit history');
  });
  it('shows the saved report immediately, keeps independent project/history filters and opens captured file versions', async () => {
    await render();
    expect(host.textContent).toContain('TypeScript');
    expect(host.textContent).not.toContain('How counts are calculated');
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('3');
    await click('a.ts');
    expect(openFile).toHaveBeenCalledWith('a.ts', 'b'.repeat(40));
    const scope = host.querySelector('.analytics-filters select')! as HTMLSelectElement;
    await act(async () => {
      scope.value = 'HEAD';
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(mocks.refresh.mock.calls.at(-1)?.[0].filters).toMatchObject({ scope: 'HEAD', revision: 'HEAD' });
    expect(readAnalyticsFilters('C:/repo').scope).toBe('HEAD');
    expect(readAnalyticsFilters('C:/another').scope).toBe('all');
  });
  it('does not let late cached or progress results replace the current repository context', async () => {
    const cache = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.cache.mockReturnValueOnce(cache.promise);
    await render();
    const old = listeners[0];
    await act(async () => old({ repoPath: 'C:/repo', requestId: 'test-1', phase: 'aggregation', completed: 5, total: 5, snapshot: report('C:/repo', 5) }));
    await act(async () => cache.resolve({ success: true, data: report('C:/repo', 2) }));
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('5');
    mocks.cache.mockResolvedValue({ success: true, data: report('C:/another', 7) });
    await render('C:/another');
    await act(async () => old({ repoPath: 'C:/repo', requestId: 'test-1', phase: 'aggregation', completed: 1, total: 1, snapshot: report('C:/repo', 99) }));
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('7');
    expect(mocks.cancel).toHaveBeenCalled();
  });
  it.each(['missing', 'failed', 'partial'] as const)('keeps the displayed report stable during a background refresh with a %s cache', async (cacheState) => {
    await render();
    const content = host.querySelector<HTMLDivElement>('.analytics-content')!;
    const languages = [...host.querySelectorAll('tr')].find((row) => row.textContent?.includes('TypeScript'));
    const chartData = host.querySelector<HTMLDetailsElement>('details.analytics-data')!;
    content.scrollTop = 120;
    chartData.open = true;
    const refreshed = report('C:/repo', 4);
    refreshed.id = 'new-refs';
    refreshed.savedAt = 2000;
    refreshed.project.lines = 8;
    refreshed.project.languages[0].lines = 8;
    const partial: RepositoryAnalyticsSnapshot = {
      ...refreshed,
      complete: false,
      sections: ['history', 'comparison'],
      project: { ...refreshed.project, files: 0, lines: 0, languages: [], ownership: [] },
    };
    if (cacheState === 'missing') mocks.cache.mockResolvedValue({ success: true, data: null });
    else if (cacheState === 'failed') mocks.cache.mockRejectedValue(new Error('Cache unavailable'));
    else mocks.cache.mockResolvedValue({ success: true, data: partial });
    const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    await render('C:/repo', false, 1);
    const requestId = mocks.refresh.mock.calls.at(-1)![0].readRequest.requestId;
    await act(async () => listeners[0]({ repoPath: 'C:/repo', requestId, phase: 'aggregation', completed: 4, total: 4, snapshot: partial }));
    const project = { ...refreshed, complete: false, sections: ['history', 'comparison', 'project'] as RepositoryAnalyticsSnapshot['sections'] };
    await act(async () => listeners[0]({ repoPath: 'C:/repo', requestId, phase: 'project', completed: 1, total: 1, snapshot: project }));
    expect([...host.querySelectorAll('.analytics-metrics dd')].map((node) => node.textContent)).toEqual(['3', '1', '1', '0', '1', '1', '3']);
    expect(host.querySelector('.analytics-content')).toBe(content);
    expect([...host.querySelectorAll('tr')].find((row) => row.textContent?.includes('TypeScript'))).toBe(languages);
    expect(content.scrollTop).toBe(120);
    expect(chartData.open).toBe(true);
    await act(async () => refresh.resolve({ success: true, data: refreshed }));
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('4');
    expect(host.querySelectorAll('.analytics-metrics dd')[6].textContent).toBe('8');
    expect(content.scrollTop).toBe(120);
    expect(chartData.open).toBe(true);
    expect([...host.querySelectorAll('tr')].find((row) => row.textContent?.includes('TypeScript'))).toBe(languages);
  });
  it('still shows progressively available sections when no previous report exists', async () => {
    mocks.cache.mockResolvedValue({ success: true, data: null });
    await render();
    const requestId = mocks.refresh.mock.calls.at(-1)![0].readRequest.requestId;
    const snapshot = report('C:/repo', 4);
    const partial: RepositoryAnalyticsSnapshot = {
      ...snapshot,
      complete: false,
      sections: ['history', 'comparison'],
      project: { ...snapshot.project, files: 0, lines: 0, languages: [], ownership: [] },
    };
    await act(async () => listeners[0]({ repoPath: 'C:/repo', requestId, phase: 'aggregation', completed: 4, total: 4, snapshot: partial }));
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('4');
    expect(host.querySelectorAll('.analytics-metrics dd')[5].textContent).toBe('…');
    expect(host.textContent).not.toContain('TypeScript');
    await act(async () => listeners[0]({ repoPath: 'C:/repo', requestId, phase: 'project', completed: 1, total: 1, snapshot }));
    expect(host.textContent).toContain('TypeScript');
    expect(host.querySelectorAll('.analytics-metrics dd')[5].textContent).toBe('1');
  });
  it('does not keep results from a different filter while that context is loading', async () => {
    await render();
    const old = listeners[0];
    const cache = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.cache.mockReturnValueOnce(cache.promise);
    const scope = host.querySelector<HTMLSelectElement>('.analytics-filters select')!;
    await act(async () => {
      scope.value = 'HEAD';
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('.analytics-metrics')).toBeNull();
    await act(async () => old({ repoPath: 'C:/repo', requestId: 'test-1', phase: 'aggregation', completed: 99, total: 99, snapshot: report('C:/repo', 99) }));
    expect(host.querySelector('.analytics-metrics')).toBeNull();
    const filtered = report('C:/repo', 2);
    filtered.filters.scope = 'HEAD';
    await act(async () => cache.resolve({ success: true, data: filtered }));
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('2');
  });
  it('keeps the selected detail page and rows while an updated snapshot loads their replacement', async () => {
    const commit = {
      hash: 'c'.repeat(40),
      parents: [],
      author: { id: 'alice', name: 'Alice', email: 'alice@test.invalid' },
      date: 1000,
      subject: 'Page two',
      files: 1,
      additions: 3,
      deletions: 0,
    };
    mocks.details.mockImplementation(({ offset }) => Promise.resolve({ success: true, data: { items: [commit], total: 101, offset } }));
    await render();
    await click('Commits');
    await click('Next');
    const content = host.querySelector<HTMLDivElement>('.analytics-content')!;
    const table = host.querySelector('.analytics-table');
    const row = host.querySelector('.analytics-table tbody tr');
    content.scrollTop = 80;
    const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    const details = deferred<{ success: true; data: { items: (typeof commit)[]; total: number; offset: number } }>();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    mocks.details.mockReturnValueOnce(details.promise);
    await render('C:/repo', false, 1);
    const updated = { ...report('C:/repo', 4), id: 'new-refs', savedAt: 2000 };
    await act(async () => refresh.resolve({ success: true, data: updated }));
    expect(mocks.details).toHaveBeenLastCalledWith(expect.objectContaining({ snapshotId: 'new-refs', offset: 50 }));
    expect(host.querySelector('.analytics-tabs [aria-current="page"]')?.textContent).toBe('Commits');
    expect(host.querySelector('.analytics-table')).toBe(table);
    expect(host.querySelector('.analytics-table tbody tr')).toBe(row);
    expect(host.querySelector('.analytics-pagination')?.textContent).toContain('51–100 / 101');
    expect(content.scrollTop).toBe(80);
    await act(async () => details.resolve({ success: true, data: { items: [{ ...commit, subject: 'Updated page two' }], total: 102, offset: 50 } }));
    expect(host.querySelector('.analytics-table tbody tr')).toBe(row);
    expect(host.textContent).toContain('Updated page two');
    expect(host.querySelector('.analytics-pagination')?.textContent).toContain('51–100 / 102');
    expect(content.scrollTop).toBe(80);
  });
  it('uses central progress and cancellation, preserves usable results and provides chart tables', async () => {
    await render();
    const request = mocks.refresh.mock.calls[0][0];
    await act(async () => listeners[0]({ repoPath: 'C:/repo', requestId: request.readRequest.requestId, phase: 'blame', completed: 2, total: 4 }));
    expect(mocks.update).toHaveBeenLastCalledWith(1, expect.objectContaining({ kind: 'progress', progress: { value: 50, label: '2 / 4' } }));
    expect(host.querySelector('details.analytics-data summary')?.textContent).toBe('Chart data as table');
    await click('Cancel');
    expect(mocks.cancel).toHaveBeenCalled();
    expect(host.textContent).toContain('TypeScript');
    expect(mocks.update).toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'info', autoHideMs: 3000 }));
    const before = mocks.refresh.mock.calls.length;
    await click('Resume');
    expect(mocks.refresh.mock.calls.length).toBeGreaterThan(before);
  });
  it('pages commit details and opens the existing commit workflow without a checkout', async () => {
    mocks.details.mockResolvedValue({
      success: true,
      data: {
        total: 51,
        offset: 0,
        items: [
          {
            hash: 'c'.repeat(40),
            parents: [],
            author: { name: 'Alice', email: 'alice@test.invalid' },
            date: 1000,
            subject: 'Initial',
            files: 1,
            additions: 3,
            deletions: 0,
          },
        ],
      },
    });
    await render();
    await click('Commits');
    await click('cccccccc Initial');
    expect(openCommit).toHaveBeenCalledWith('c'.repeat(40));
    await click('Next');
    expect(mocks.details).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50, limit: 50 }));
  });
});
