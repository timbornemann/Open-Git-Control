// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsProgress, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { RepositoryAnalyticsView } from '../RepositoryAnalyticsView';
import { RepositoryAnalyticsToolbar } from '../RepositoryAnalyticsToolbar';
import { readAnalyticsFilters } from '../analyticsPreferences';
import { AnalyticsNavigation } from '../AnalyticsNavigation';
import { RepositoryAnalyticsFilters } from '../AnalyticsFilters';
import { useAnalyticsNavigation } from '../analyticsNavigationState';
import { useAnalyticsWorkspace } from '../analyticsWorkspaceState';
import { clearCouplingSessions } from '../analyticsCouplingSession';
import { analyticsReport as report, releaseComparison } from './analyticsFixtures';

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
const openFile = vi.fn();
const notifications = { publish: mocks.publish, update: mocks.update, dismiss: mocks.dismiss };
const render = (repoPath = 'C:/repo', busy = false, refreshTrigger = 0) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <NotificationProvider value={notifications}>
          <header>
            <span>Statistics &amp; analytics</span>
            <RepositoryAnalyticsToolbar repoPath={repoPath} />
          </header>
          <aside key={repoPath}>
            <AnalyticsNavigation repoPath={repoPath} />
            <RepositoryAnalyticsFilters repoPath={repoPath} />
          </aside>
          <RepositoryAnalyticsView repoPath={repoPath} refreshTrigger={refreshTrigger} busy={busy} onOpenFile={openFile} />
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
  clearCouplingSessions();
  useAnalyticsNavigation.setState({ sections: {} });
  useAnalyticsWorkspace.setState({ filters: {}, snapshots: {} });
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
  it('opens release statistics without fetching or rendering individual file details', async () => {
    const saved = { ...report(), comparison: releaseComparison() };
    mocks.cache.mockResolvedValue({ success: true, data: saved });
    await render();
    await click('Release comparison');
    expect(host.querySelector('.analytics-comparison-ring')).toBeTruthy();
    expect(host.querySelectorAll('.analytics-comparison-picker select')).toHaveLength(2);
    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).not.toContain('do-not-list-me');
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it('preserves gaps in the time axis and lets the keyboard filter contributions by period', async () => {
    const saved = report();
    saved.periods.push({ date: '2026-10-11', commits: 1, merges: 0, additions: 1, deletions: 0 });
    mocks.cache.mockResolvedValue({ success: true, data: saved });
    await render();
    expect(host.querySelector('.analytics-period-gap')?.getAttribute('style')).toContain('grid-column: 2 / span 2');
    const bars = host.querySelectorAll<HTMLButtonElement>('.analytics-bar');
    bars[0].focus();
    await act(async () => bars[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(bars[1]);
    await act(async () => bars[1].click());
    expect(mocks.refresh.mock.calls.at(-1)?.[0].filters).toMatchObject({ since: '2026-10-11', until: '2026-10-11' });
    expect(host.querySelector('.analytics-sidebar-nav [aria-current="page"]')?.textContent).toBe('Contributions');
    expect(host.textContent).not.toContain('Commit history');
  });
  it('shows the saved report immediately, keeps independent project/history filters and opens captured file versions', async () => {
    await render();
    expect(host.textContent).toContain('TypeScript');
    expect(host.textContent).not.toContain('How counts are calculated');
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('3');
    await act(async () => host.querySelector<HTMLButtonElement>('.analytics-heatmap-cell[data-path="a.ts"]')!.click());
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
  it('keeps all common filters in the sidebar and a fixed overview, while detailed reports can scroll', async () => {
    await render();
    const header = host.querySelector('header')!;
    expect(host.querySelector('.analytics-header')).toBeNull();
    expect(host.querySelector('.repository-analytics .analytics-topbar-actions')).toBeNull();
    expect(header.querySelector('.analytics-updated')).toBeTruthy();
    expect(header.querySelector('.analytics-filters')).toBeNull();
    expect(host.querySelector('aside .analytics-filters')).toBeTruthy();
    expect(header.querySelector('nav')).toBeNull();
    expect(host.querySelector('.analytics-sidebar-nav')).toBeTruthy();
    expect(header.querySelector('.analytics-metrics')).toBeNull();
    expect(host.querySelector('.analytics-content .analytics-metrics')).toBeTruthy();
    expect(host.querySelector('.analytics-report-bar')).toBeNull();
    expect(host.querySelector<HTMLSelectElement>('aside .analytics-filters select')?.value).toBe('all');
    expect(host.querySelector('.analytics-content--overview .analytics-overview')).toBeTruthy();
    expect(host.querySelectorAll('aside .analytics-filter-panel select')).toHaveLength(3);
    const requests = mocks.refresh.mock.calls.length;
    await click('Change hotspots');
    expect(mocks.refresh).toHaveBeenCalledTimes(requests);
    expect(host.querySelector('.analytics-content--overview')).toBeNull();
    expect(host.querySelector('.analytics-metrics')).toBeNull();
    expect(host.querySelector('.analytics-content h3')?.textContent).toBe('Change hotspots');
  });
  it('keeps sidebar filters across reports and background refreshes, then resets them together', async () => {
    vi.useFakeTimers();
    mocks.cache.mockImplementation(({ filters }) => Promise.resolve({ success: true, data: { ...report(), filters } }));
    await render();
    const panel = host.querySelector<HTMLElement>('.analytics-filter-panel')!;
    const dates = panel.querySelectorAll<HTMLInputElement>('input[type="date"]');
    const person = panel.querySelectorAll<HTMLSelectElement>('select')[1];
    const path = panel.querySelector<HTMLInputElement>('input[placeholder="All files"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(dates[0], '2026-10-01');
      dates[0].dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      person.value = 'alice';
      person.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(path, 'src/');
      path.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTime(400));
    await click('Contributions');
    expect(readAnalyticsFilters('C:/repo')).toMatchObject({ since: '2026-10-01', author: 'alice', path: 'src/' });
    expect(host.querySelector('.analytics-content .analytics-aggregation')).toBeNull();
    const requests = mocks.refresh.mock.calls.length;
    await render('C:/repo', false, 1);
    expect(host.querySelector('.analytics-filter-panel')).toBe(panel);
    expect(path.value).toBe('src/');
    expect(person.value).toBe('alice');
    expect(mocks.refresh).toHaveBeenCalledTimes(requests + 1);
    await click('Reset');
    expect(path.value).toBe('');
    expect(dates[0].value).toBe('');
    expect(person.value).toBe('');
    expect(readAnalyticsFilters('C:/repo')).toEqual(DEFAULT_ANALYTICS_FILTERS);
  });
  it('keeps filters independent across repositories and rejects stale sidebar metadata', async () => {
    await render();
    const scope = host.querySelector<HTMLSelectElement>('.analytics-filters select')!;
    await act(async () => {
      scope.value = 'HEAD';
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const another = report('C:/another');
    another.authors = [{ id: 'bob', name: 'Bob', email: 'bob@test.invalid' }];
    mocks.cache.mockResolvedValue({ success: true, data: another });
    await render('C:/another');
    expect(host.querySelector<HTMLSelectElement>('.analytics-filters select')?.value).toBe('all');
    expect(host.querySelector('.analytics-filters')?.textContent).toContain('Bob');
    expect(host.querySelector('.analytics-filters')?.textContent).not.toContain('Alice');
    mocks.cache.mockResolvedValue({ success: true, data: report() });
    await render();
    expect(host.querySelector<HTMLSelectElement>('.analytics-filters select')?.value).toBe('HEAD');
    expect(mocks.refresh.mock.calls.at(-1)?.[0].filters.scope).toBe('HEAD');
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
    const languages = host.querySelector('.analytics-language-item');
    expect(languages).toBeTruthy();
    const chart = host.querySelector<HTMLDivElement>('.analytics-chart')!;
    const bar = chart.querySelector<HTMLButtonElement>('.analytics-bar')!;
    content.scrollTop = 120;
    chart.scrollLeft = 40;
    bar.focus();
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
    expect(host.querySelector('.analytics-language-item')).toBe(languages);
    expect(content.scrollTop).toBe(120);
    expect(host.querySelector('.analytics-bar')).toBe(bar);
    expect(document.activeElement).toBe(bar);
    expect(chart.scrollLeft).toBe(40);
    expect(bar.querySelector('.analytics-bar-value')?.textContent).toBe('3');
    await act(async () => refresh.resolve({ success: true, data: refreshed }));
    expect(host.querySelector('.analytics-metrics dd')?.textContent).toBe('4');
    expect(host.querySelectorAll('.analytics-metrics dd')[6].textContent).toBe('8');
    expect(content.scrollTop).toBe(120);
    expect(host.querySelector('.analytics-bar')).toBe(bar);
    expect(document.activeElement).toBe(bar);
    expect(chart.scrollLeft).toBe(40);
    expect(bar.querySelector('.analytics-bar-value')?.textContent).toBe('4');
    expect(host.querySelector('.analytics-language-item')).toBe(languages);
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
  it('keeps the whole coupling network, selection and viewport while an updated snapshot loads its replacement', async () => {
    const pair = { first: 'a.ts', second: 'b.ts', commits: 3, share: 0.5 };
    mocks.details.mockImplementation(({ offset }) => Promise.resolve({ success: true, data: { items: [pair], total: 1, offset } }));
    await render();
    await click('File coupling');
    const content = host.querySelector<HTMLDivElement>('.analytics-content')!;
    const network = host.querySelector('.analytics-coupling-network');
    const node = host.querySelector<HTMLButtonElement>('.analytics-coupling-node')!;
    const connection = host.querySelector('.analytics-coupling-connection');
    act(() => {
      node.click();
      node.focus();
    });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    const transform = host.querySelector<HTMLElement>('.analytics-coupling-scene')!.style.transform;
    content.scrollTop = 80;
    const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    const details = deferred<{ success: true; data: { items: (typeof pair)[]; total: number; offset: number } }>();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    mocks.details.mockReturnValueOnce(details.promise);
    await render('C:/repo', false, 1);
    const updated = { ...report('C:/repo', 4), id: 'new-refs', savedAt: 2000 };
    await act(async () => refresh.resolve({ success: true, data: updated }));
    expect(mocks.details).toHaveBeenLastCalledWith(expect.objectContaining({ snapshotId: 'new-refs', offset: 0, limit: 200 }));
    expect(host.querySelector('.analytics-sidebar-nav [aria-current="page"]')?.textContent).toBe('File coupling');
    expect(host.querySelector('.analytics-coupling-network')).toBe(network);
    expect(host.querySelector('.analytics-coupling-node')).toBe(node);
    expect(host.querySelector('.analytics-coupling-connection')).toBe(connection);
    expect(document.activeElement).toBe(node);
    expect(node.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.analytics-pagination')).toBeNull();
    expect(host.querySelector<HTMLElement>('.analytics-coupling-scene')!.style.transform).toBe(transform);
    expect(content.scrollTop).toBe(80);
    await act(async () => details.resolve({ success: true, data: { items: [{ ...pair, commits: 4 }], total: 1, offset: 0 } }));
    expect(host.querySelector('.analytics-coupling-network')).toBe(network);
    expect(host.querySelector('.analytics-coupling-node')).toBe(node);
    expect(document.activeElement).toBe(node);
    expect(host.querySelector('.analytics-coupling-connection')).toBe(connection);
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe('4');
    expect(host.querySelector('.analytics-pagination')).toBeNull();
    expect(host.querySelector<HTMLElement>('.analytics-coupling-scene')!.style.transform).toBe(transform);
    expect(content.scrollTop).toBe(80);
  });
  it('resumes saved connection details once main recreates an unchanged report after an app restart', async () => {
    const all = Array.from({ length: 251 }, (_, index) => ({ first: 'src/hub.ts', second: `src/file-${index}.ts`, commits: 3, share: 0.5 }));
    const saved = { ...report(), coupling: all.slice(0, 100), couplingVersion: 'unchanged-connections' };
    const ready = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.cache.mockResolvedValue({ success: true, data: saved });
    mocks.refresh.mockReturnValue(ready.promise);
    mocks.details.mockResolvedValue({ success: false, error: 'This analytics snapshot is no longer active. Refresh the dashboard.' });
    await render();
    await click('File coupling');
    expect(host.textContent).toContain('Not all connections could be loaded');
    mocks.details.mockImplementation(({ offset, limit }) =>
      Promise.resolve({ success: true, data: { items: all.slice(offset, offset + limit), total: all.length, offset } }),
    );
    await act(async () => ready.resolve({ success: true, data: { ...saved, savedAt: 2000 } }));
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(251);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
    expect(mocks.details.mock.calls.map(([request]) => request.offset)).toEqual([0, 0, 200]);
  });
  it('shows the session report and cached graph immediately after reopening the main analytics page', async () => {
    const pair = { first: 'a.ts', second: 'b.ts', commits: 3, share: 0.5 };
    mocks.details.mockResolvedValue({ success: true, data: { items: [pair], total: 1, offset: 0 } });
    await render();
    await click('File coupling');
    const details = mocks.details.mock.calls.length,
      cacheReads = mocks.cache.mock.calls.length;
    await act(async () => root.render(null));
    mocks.cache.mockImplementation(() => new Promise(() => {}));
    await render();
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(1);
    expect(host.textContent).not.toContain('Preparing local analysis');
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
    expect(mocks.details).toHaveBeenCalledTimes(details);
    expect(mocks.cache).toHaveBeenCalledTimes(cacheReads);
  });
  it('uses central progress and cancellation and preserves usable results', async () => {
    await render();
    const request = mocks.refresh.mock.calls[0][0];
    await act(async () => listeners[0]({ repoPath: 'C:/repo', requestId: request.readRequest.requestId, phase: 'history', completed: 0, total: 1 }));
    await act(async () => listeners[0]({ repoPath: 'C:/repo', requestId: request.readRequest.requestId, phase: 'blame', completed: 2, total: 4 }));
    expect(mocks.update).toHaveBeenLastCalledWith(1, expect.objectContaining({ kind: 'progress', progress: { value: 50, label: '2 / 4' } }));
    expect(host.querySelector('details.analytics-data')).toBeNull();
    expect(host.querySelector('.analytics-bar-value')?.textContent).toBe('3');
    await click('Cancel');
    expect(mocks.cancel).toHaveBeenCalled();
    expect(host.textContent).toContain('TypeScript');
    expect(mocks.update).toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'info', autoHideMs: 3000 }));
    const before = mocks.refresh.mock.calls.length;
    await click('Resume');
    expect(mocks.refresh.mock.calls.length).toBeGreaterThan(before);
  });
  it('includes proportional last-changed-line shares in Contributions without a separate page', async () => {
    const saved = report();
    saved.project.lines = saved.project.blamedLines = 1000;
    saved.project.ownership = [
      { id: 'alice', name: 'Alice', email: 'alice@test.invalid', lines: 815 },
      { id: 'bob', name: 'Bob', email: 'bob@test.invalid', lines: 185 },
    ];
    mocks.cache.mockResolvedValue({ success: true, data: saved });
    await render();
    expect([...host.querySelectorAll('.analytics-sidebar-nav button')].map((node) => node.textContent)).not.toContain('Last changed lines');
    await click('Contributions');
    expect(host.querySelector('.analytics-calendar')).toBeTruthy();
    expect(host.querySelector('.analytics-contributors')?.textContent).toContain('Last changed lines');
    expect([...host.querySelectorAll<HTMLElement>('.analytics-share > span')].map((node) => node.style.width)).toEqual(['81.5%', '18.5%']);
  });
  it('filters directory analysis without exposing a separate commit history', async () => {
    const saved = report();
    saved.directories = [{ ...saved.hotspots[0], path: 'src/' }];
    mocks.cache.mockImplementation(({ filters }) => Promise.resolve({ success: true, data: { ...saved, filters } }));
    mocks.details.mockImplementation(({ kind }) =>
      Promise.resolve({ success: true, data: { items: kind === 'directories' ? saved.directories : saved.hotspots, total: 1 } }),
    );
    await render();
    expect([...host.querySelectorAll('.analytics-sidebar-nav button')].map((button) => button.textContent)).not.toContain('Commits');
    await click('Change hotspots');
    await click('Directories');
    await act(async () => host.querySelector<HTMLButtonElement>('.analytics-heatmap-cell')!.click());
    expect(readAnalyticsFilters('C:/repo').path).toBe('src/');
    expect(host.querySelector('.analytics-sidebar-nav [aria-current="page"]')?.textContent).toBe('Change hotspots');
    expect(host.textContent).not.toContain('Commit history');
    expect(mocks.details.mock.calls.every(([request]) => request.kind !== 'commits')).toBe(true);
  });
  it('keeps Code Churn active when its labeled period bars filter the report', async () => {
    mocks.cache.mockImplementation(({ filters }) => Promise.resolve({ success: true, data: { ...report(), filters } }));
    await render();
    await click('Code Churn');
    expect(host.querySelector('.analytics-content--churn')).toBeTruthy();
    expect(host.querySelector('table')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.analytics-churn-bar')!.click());
    expect(readAnalyticsFilters('C:/repo')).toMatchObject({ since: '2026-10-08', until: '2026-10-08' });
    expect(host.querySelector('.analytics-sidebar-nav [aria-current="page"]')?.textContent).toBe('Code Churn');
    expect(host.querySelector('.analytics-churn')).toBeTruthy();
  });
  it('refreshes from the shared header and opens coverage notes from the current report', async () => {
    const saved = { ...report(), warnings: ['Shallow repository: local commits only'] };
    mocks.cache.mockResolvedValue({ success: true, data: saved });
    mocks.refresh.mockResolvedValue({ success: true, data: saved });
    await render();
    const header = host.querySelector('header')!;
    expect(header.querySelector('.analytics-refresh-action')?.textContent).toBe('Refresh');
    const requests = mocks.refresh.mock.calls.length;
    await click('Refresh');
    expect(mocks.refresh).toHaveBeenCalledTimes(requests + 1);
    expect(header.querySelector('time')?.dateTime).toBe(new Date(saved.savedAt).toISOString());
    await click('Coverage notes');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Shallow repository');
  });
});
