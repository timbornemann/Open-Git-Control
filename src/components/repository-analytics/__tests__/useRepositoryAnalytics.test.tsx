// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsProgress, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { useRepositoryAnalytics } from '../useRepositoryAnalytics';

const mocks = vi.hoisted(() => ({ cache: vi.fn(), refresh: vi.fn(), subscribe: vi.fn(), publish: vi.fn(), update: vi.fn(), dismiss: vi.fn() }));
vi.mock('@/services/gitClient', () => ({
  gitClient: { getRepositoryAnalyticsSnapshot: mocks.cache, refreshRepositoryAnalytics: mocks.refresh, onRepositoryAnalyticsProgress: mocks.subscribe },
}));
vi.mock('@/data/ipcRead', () => ({
  cancellableRead: (_signal: AbortSignal, _priority: string, run: (request: unknown) => Promise<unknown>) =>
    run({ requestId: `test-${++serial}`, priority: 'speculative' }),
}));
let serial = 0;
let host: HTMLDivElement, root: Root;
let listener: (event: AnalyticsProgress) => void;
const notifications = { publish: mocks.publish, update: mocks.update, dismiss: mocks.dismiss };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function report(repoPath = 'C:/repo'): RepositoryAnalyticsSnapshot {
  return {
    id: 'same-refs',
    repoPath,
    savedAt: 1000,
    complete: true,
    filters: { ...DEFAULT_ANALYTICS_FILTERS },
    sections: ['history', 'project', 'blame', 'comparison'],
    authors: [],
    refs: [],
    tags: [],
    head: 'a'.repeat(40),
    totals: { commits: 3, merges: 0, contributors: 1, firstActivity: 1000, lastActivity: 2000 },
    filteredCommits: 3,
    additions: 3,
    deletions: 0,
    excludedCouplingCommits: 0,
    contributors: [],
    periods: [],
    calendar: [],
    hotspots: [],
    directories: [],
    coupling: [],
    comparison: null,
    warnings: [],
    project: {
      oid: 'a'.repeat(40),
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
function Probe({ repoPath, trigger }: { repoPath: string; trigger: number }) {
  const analytics = useRepositoryAnalytics(repoPath, DEFAULT_ANALYTICS_FILTERS, trigger, false);
  return (
    <>
      <span>{analytics.snapshot?.totals.commits}</span>
      <button onClick={analytics.reload}>Refresh</button>
    </>
  );
}
const render = (trigger = 0, repoPath = 'C:/repo') =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <NotificationProvider value={notifications}>
          <Probe repoPath={repoPath} trigger={trigger} />
        </NotificationProvider>
      </I18nProvider>,
    ),
  );
const emit = (event: Omit<AnalyticsProgress, 'repoPath' | 'requestId'>) =>
  act(async () => {
    const request = mocks.refresh.mock.calls.at(-1)![0];
    listener({ repoPath: request.repoPath, requestId: request.readRequest.requestId, ...event });
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  serial = 0;
  mocks.cache.mockImplementation(({ repoPath }) => Promise.resolve({ success: true, data: report(repoPath) }));
  mocks.refresh.mockImplementation(() => new Promise(() => {}));
  mocks.subscribe.mockImplementation((callback) => {
    listener = callback;
    return () => {};
  });
  mocks.publish.mockReturnValue(1);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('analytics background notifications', () => {
  it('waits for a delayed saved baseline before announcing a fast unchanged calculation', async () => {
    const cache = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.cache.mockReturnValueOnce(cache.promise);
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    await render();
    await emit({ phase: 'history', completed: 0, total: 0 });
    await emit({ phase: 'aggregation', completed: 3, total: 3, snapshot: { ...report(), complete: false, sections: ['history', 'comparison'] } });
    expect(mocks.publish).not.toHaveBeenCalled();
    await act(async () => refresh.resolve({ success: true, data: { ...report(), savedAt: 2000 } }));
    expect(host.querySelector('span')?.textContent).toBe('3');
    expect(mocks.publish).not.toHaveBeenCalled();
    await act(async () => cache.resolve({ success: true, data: report() }));
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('keeps unchanged cached analyses silent, including aggregation and cached blame progress after every sync', async () => {
    await render();
    for (let trigger = 1; trigger <= 2; trigger++) {
      const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
      mocks.refresh.mockReturnValueOnce(refresh.promise);
      await render(trigger);
      await emit({ phase: 'history', completed: 0, total: 0 });
      await emit({ phase: 'aggregation', completed: 3, total: 3, snapshot: { ...report(), complete: false, sections: ['history', 'comparison'] } });
      await emit({ phase: 'project', completed: 0, total: 0 });
      await emit({ phase: 'project', completed: 1, total: 1, snapshot: { ...report(), complete: false, sections: ['history', 'comparison', 'project'] } });
      await emit({ phase: 'blame', completed: 0, total: 1 });
      await emit({ phase: 'blame', completed: 1, total: 1 });
      await act(async () => refresh.resolve({ success: true, data: { ...report(), savedAt: trigger * 2000 } }));
      expect(host.querySelector('span')?.textContent).toBe('3');
    }
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });
  it.each(['history', 'project'] as const)('reports genuinely new %s records and finishes the same notification', async (phase) => {
    await render();
    const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    await render(1);
    await emit({ phase, completed: 0, total: 2 });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'progress', progress: { value: 0, label: '0 / 2' } }));
    await emit({ phase: 'blame', completed: 1, total: 2 });
    expect(mocks.update).toHaveBeenLastCalledWith(1, expect.objectContaining({ progress: { value: 50, label: '1 / 2' } }));
    await act(async () => refresh.resolve({ success: true, data: { ...report(), id: 'new-refs' } }));
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenLastCalledWith(1, expect.objectContaining({ kind: 'success', autoHideMs: 3000 }));
  });
  it('announces changed reports even when existing records suffice and ignores timestamp-only changes', async () => {
    await render();
    mocks.refresh.mockResolvedValueOnce({ success: true, data: { ...report(), totals: { ...report().totals, contributors: 2 } } });
    await render(1);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'success' }));
  });
  it('still shows progress and completion for an explicit refresh with unchanged results', async () => {
    await render();
    const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    await act(async () => host.querySelector('button')!.click());
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'progress', msg: 'Preparing local analysis…' }));
    await act(async () => refresh.resolve({ success: true, data: report() }));
    expect(mocks.update).toHaveBeenLastCalledWith(1, expect.objectContaining({ kind: 'success' }));
  });
  it('quietly retries background preemption but reports actual errors with details and retry', async () => {
    vi.useFakeTimers();
    await render();
    mocks.refresh.mockResolvedValueOnce({ success: false, error: 'Git operation was aborted.' });
    await render(1);
    expect(mocks.publish).not.toHaveBeenCalled();
    mocks.refresh.mockResolvedValueOnce({ success: false, error: 'Missing Git object' });
    await act(async () => vi.advanceTimersByTime(1500));
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error', technicalDetails: 'Missing Git object', actions: [expect.objectContaining({ label: 'Retry' })] }),
    );
  });
  it('ignores delayed progress and completions after switching repositories', async () => {
    const refresh = deferred<{ success: true; data: RepositoryAnalyticsSnapshot }>();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    await render();
    const oldListener = listener;
    await render(0, 'C:/another');
    await act(async () => {
      oldListener({ repoPath: 'C:/repo', requestId: 'test-1', phase: 'history', completed: 0, total: 100 });
      refresh.resolve({ success: true, data: { ...report(), id: 'new-refs' } });
    });
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
