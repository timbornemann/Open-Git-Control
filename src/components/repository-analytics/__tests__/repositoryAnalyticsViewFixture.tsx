import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters, type AnalyticsProgress, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { RepositoryAnalyticsView } from '../RepositoryAnalyticsView';
import { RepositoryAnalyticsToolbar } from '../RepositoryAnalyticsToolbar';
import { AnalyticsNavigation } from '../AnalyticsNavigation';
import { RepositoryAnalyticsFilters } from '../AnalyticsFilters';
import { useAnalyticsNavigation } from '../analyticsNavigationState';
import { useAnalyticsWorkspace } from '../analyticsWorkspaceState';
import { clearAnalyticsTimelines } from '../analyticsTimelineData';
import { clearTimelineSessions } from '@/components/file-timeline/fileTimelineSession';
import { clearCouplingSessions } from '../analyticsCouplingSession';
import { analyticsReport as report, releaseComparison } from './analyticsFixtures';

const clientMocks = vi.hoisted(() => ({
  timeline: vi.fn(),
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
    getFileTimelineData: clientMocks.timeline,
    getRepositoryAnalyticsSnapshot: clientMocks.cache,
    refreshRepositoryAnalytics: clientMocks.refresh,
    getRepositoryAnalyticsDetails: clientMocks.details,
    onRepositoryAnalyticsProgress: clientMocks.subscribe,
  },
}));
vi.mock('@/data/ipcRead', () => ({
  cancellableRead: async (signal: AbortSignal, _priority: string, run: (request: unknown) => Promise<unknown>) => {
    signal.addEventListener('abort', clientMocks.cancel);
    return run({ requestId: `test-${++serial}`, priority: 'speculative' });
  },
}));
export const mocks = clientMocks;
let serial = 0;
export let host: HTMLDivElement, root: Root;
export let listeners: ((event: AnalyticsProgress) => void)[];
export const openFile = vi.fn();
const notifications = { publish: mocks.publish, update: mocks.update, dismiss: mocks.dismiss };
export const render = (repoPath = 'C:/repo', busy = false, refreshTrigger = 0) =>
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
export const click = async (text: string) => {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
};
export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
export const comparisonReport = (filters: AnalyticsFilters = DEFAULT_ANALYTICS_FILTERS): RepositoryAnalyticsSnapshot => ({
  ...report(),
  filters,
  comparison: { ...releaseComparison(), from: filters.compareFrom || 'v1.0.0', to: filters.compareTo },
  tags: [
    { name: 'v2.0.0', oid: 'b'.repeat(40), date: 2000, version: true },
    { name: 'v1.0.0', oid: 'a'.repeat(40), date: 1000, version: true },
  ],
});
export const chooseVersion = (index: number, value: string) =>
  act(async () => {
    const select = host.querySelectorAll<HTMLSelectElement>('.analytics-comparison-picker select')[index];
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  clearCouplingSessions();
  clearAnalyticsTimelines();
  clearTimelineSessions();
  useAnalyticsNavigation.setState({ sections: {} });
  useAnalyticsWorkspace.setState({ filters: {}, snapshots: {} });
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  listeners = [];
  serial = 0;
  mocks.timeline.mockResolvedValue({ success: true, data: [] });
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
