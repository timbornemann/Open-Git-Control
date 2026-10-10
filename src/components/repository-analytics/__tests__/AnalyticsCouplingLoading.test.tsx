// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsCoupling, type AnalyticsDetails, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsDetailsView } from '../AnalyticsDetails';
import { clearCouplingSessions } from '../analyticsCouplingSession';

const getDetails = vi.hoisted(() => vi.fn());
vi.mock('@/services/gitClient', () => ({ gitClient: { getRepositoryAnalyticsDetails: getDetails } }));
let host: HTMLDivElement, root: Root;
const onPath = vi.fn();
const pairs = (length = 451): AnalyticsCoupling[] =>
  Array.from({ length }, (_, i) => ({ first: 'src/hub.ts', second: `src/file-${String(i).padStart(4, '0')}.ts`, commits: length + 3 - i, share: 0.5 }));
const saved = (rows = pairs(), id = 'first', filters = DEFAULT_ANALYTICS_FILTERS) =>
  ({ repoPath: 'C:/repo', id, savedAt: 1000, coupling: rows.slice(0, 100), filters }) as RepositoryAnalyticsSnapshot;
const response = (rows: AnalyticsCoupling[], offset: number, limit = 200) => ({
  success: true as const,
  data: { items: rows.slice(offset, offset + limit), total: rows.length, offset },
});
const render = (snapshot = saved()) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <AnalyticsDetailsView
          key={JSON.stringify([snapshot.repoPath, snapshot.filters])}
          snapshot={snapshot}
          kind="coupling"
          onPath={onPath}
          onFile={vi.fn()}
        />
      </I18nProvider>,
    ),
  );
const deferred = () => {
  let resolve!: (value: { success: true; data: AnalyticsDetails }) => void;
  const promise = new Promise<{ success: true; data: AnalyticsDetails }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const nodes = () => [...host.querySelectorAll<HTMLButtonElement>('.analytics-coupling-node')];
const scene = () => host.querySelector<HTMLElement>('.analytics-coupling-scene')!;
const click = (name: string) =>
  act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.getAttribute('aria-label') === name || button.textContent?.trim() === name)!
      .click(),
  );
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  clearCouplingSessions();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('complete file coupling network loading', () => {
  it('loads every connection beyond preview and IPC batch limits without exposing pagination', async () => {
    const all = pairs();
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(all, offset, limit)));
    await render(saved(all));
    expect(getDetails.mock.calls.map(([request]) => request.offset)).toEqual([0, 200, 400]);
    expect(getDetails.mock.calls.every(([request]) => request.limit === 200 && request.kind === 'coupling')).toBe(true);
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(451);
    expect(nodes()).toHaveLength(452);
    expect(host.querySelectorAll('option')).toHaveLength(453);
    expect(host.querySelector('.analytics-coupling-toolbar')?.textContent).toContain('451 connections');
    expect(host.querySelector('.analytics-pagination')).toBeNull();
    expect([...host.querySelectorAll('button')].some((button) => ['Previous', 'Next'].includes(button.textContent?.trim() ?? ''))).toBe(false);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
    const last = nodes().find((node) => node.dataset.path === all[450].second)!;
    await act(async () => last.click());
    expect(host.querySelectorAll('.analytics-coupling-connection')).toHaveLength(1);
    await click(`Analyze file: ${all[450].second}`);
    expect(onPath).toHaveBeenCalledWith(all[450].second);
  });
  it('extends the same network on partial batches while preserving focus, selection, zoom and pan', async () => {
    const all = pairs(151),
      second = deferred(),
      third = deferred(),
      fourth = deferred();
    getDetails.mockImplementation(({ offset }) =>
      offset === 0 ? Promise.resolve(response(all, 0, 50)) : offset === 50 ? second.promise : offset === 100 ? third.promise : fourth.promise,
    );
    await render(saved(all));
    const network = host.querySelector<HTMLDivElement>('.analytics-coupling-network')!;
    const node = nodes().find((value) => value.dataset.path === all[45].second)!;
    await act(async () => {
      node.click();
      node.focus();
    });
    await click('Zoom in');
    await act(async () => network.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    const camera = scene().style.transform,
      position = node.getAttribute('style');
    await act(async () => second.resolve(response(all, 50, 50)));
    expect(host.querySelector('.analytics-coupling-network')).toBe(network);
    expect(nodes()).toContain(node);
    expect(node.getAttribute('style')).toBe(position);
    expect(scene().style.transform).toBe(camera);
    expect(node.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(node);
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(100);
    await act(async () => third.resolve(response(all, 100, 50)));
    expect(scene().style.transform).toBe(camera);
    await act(async () => fourth.resolve(response(all, 150, 50)));
    expect(scene().style.transform).toBe(camera);
    expect(node.getAttribute('style')).toBe(position);
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(151);
    expect(getDetails.mock.calls.map(([request]) => request.offset)).toEqual([0, 50, 100, 150]);
  });
  it('keeps a complete old network until all updated batches are ready, then removes obsolete pairs', async () => {
    const original = pairs(251);
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(original, offset, limit)));
    await render(saved(original));
    const chosen = nodes().find((node) => node.dataset.path === original[230].second)!;
    await act(async () => chosen.click());
    await click('Zoom in');
    const camera = scene().style.transform,
      position = chosen.getAttribute('style');
    const next = [
      ...original.slice(20).map((pair) => ({ ...pair, commits: pair.commits + 1 })),
      { first: 'src/hub.ts', second: 'src/new.ts', commits: 3, share: 0.1 },
    ];
    const last = deferred();
    getDetails.mockImplementation(({ offset, limit }) => (offset === 0 ? Promise.resolve(response(next, 0, limit)) : last.promise));
    await render(saved(next, 'updated'));
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(251);
    expect(scene().style.transform).toBe(camera);
    await act(async () => last.resolve(response(next, 200)));
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(232);
    expect(nodes().some((node) => node.dataset.path === original[0].second)).toBe(false);
    expect(nodes().some((node) => node.dataset.path === 'src/new.ts')).toBe(true);
    expect(nodes()).toContain(chosen);
    expect(chosen.getAttribute('style')).toBe(position);
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    expect(scene().style.transform).toBe(camera);
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe(String(original[230].commits + 1));
  });
  it('ignores late responses from the previous filter and stops its batch chain', async () => {
    const old = pairs(120),
      late = deferred();
    getDetails.mockImplementation(({ offset }) => (offset === 0 ? Promise.resolve(response(old, 0, 50)) : late.promise));
    await render(saved(old));
    const current = [{ first: 'other/a.ts', second: 'other/b.ts', commits: 4, share: 0.5 }];
    getDetails.mockResolvedValue(response(current, 0));
    await render(saved(current, 'new-filter', { ...DEFAULT_ANALYTICS_FILTERS, path: 'other/' }));
    const calls = getDetails.mock.calls.length;
    await act(async () => late.resolve(response(old, 50, 50)));
    expect(nodes().map((node) => node.dataset.path)).toEqual(['other/a.ts', 'other/b.ts']);
    expect(getDetails).toHaveBeenCalledTimes(calls);
    expect(host.textContent).not.toContain('src/hub.ts');
  });
  it('retains partial results after an incomplete batch and retries without duplicating connections', async () => {
    const all = pairs(121);
    getDetails.mockImplementation(({ offset }) =>
      Promise.resolve(offset === 0 ? response(all, 0, 50) : { success: true, data: { items: [], total: all.length, offset } }),
    );
    await render(saved(all));
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(50);
    expect(host.textContent).toContain('Not all connections could be loaded');
    expect(getDetails).toHaveBeenCalledTimes(2);
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(all, offset, limit)));
    await click('Retry loading');
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(121);
    expect(nodes()).toHaveLength(122);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
  });
  it('does not reload unchanged complete connections for timestamps or changed refs with the same content version', async () => {
    const all = pairs(451);
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(all, offset, limit)));
    const initial = { ...saved(all), couplingVersion: 'same-connections' };
    await render(initial);
    const network = host.querySelector('.analytics-coupling-network'),
      before = nodes().map((node) => [node.dataset.path, node.style.left, node.style.top]);
    const calls = getDetails.mock.calls.length;
    for (let generation = 1; generation <= 3; generation++) {
      await render({ ...initial, id: `new-refs-${generation}`, savedAt: 1000 + generation });
      expect(getDetails).toHaveBeenCalledTimes(calls);
      expect(host.querySelector('.analytics-coupling-network')).toBe(network);
      expect(nodes().map((node) => [node.dataset.path, node.style.left, node.style.top])).toEqual(before);
      expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
    }
  });
  it('lets an in-flight batch finish through repeated automatic sync timestamps instead of restarting it', async () => {
    const all = pairs(251),
      tail = deferred();
    getDetails.mockImplementation(({ offset, limit }) => (offset === 0 ? Promise.resolve(response(all, offset, limit)) : tail.promise));
    const initial = saved(all);
    await render(initial);
    for (let stamp = 2; stamp <= 4; stamp++) await render({ ...initial, savedAt: stamp * 1000 });
    expect(getDetails.mock.calls.map(([request]) => request.offset)).toEqual([0, 200]);
    await act(async () => tail.resolve(response(all, 200)));
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(251);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
  });
  it('restores all rows, file selection, positions and an off-center camera after reopening without fetching again', async () => {
    const all = pairs(251),
      initial = saved(all);
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(all, offset, limit)));
    await render(initial);
    await act(async () =>
      nodes()
        .find((node) => node.dataset.path === all[230].second)!
        .click(),
    );
    await click('Zoom in');
    const network = host.querySelector<HTMLDivElement>('.analytics-coupling-network')!;
    await act(async () => {
      for (let step = 0; step < 10; step++) network.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const view = scene().style.transform,
      before = nodes().map((node) => [node.dataset.path, node.style.left, node.style.top]);
    const calls = getDetails.mock.calls.length;
    await act(async () => root.render(null));
    await render(initial);
    expect(getDetails).toHaveBeenCalledTimes(calls);
    expect(scene().style.transform).toBe(view);
    expect(nodes().map((node) => [node.dataset.path, node.style.left, node.style.top])).toEqual(before);
    expect(host.querySelector('.analytics-coupling-node[aria-pressed="true"]')?.getAttribute('data-path')).toBe(all[230].second);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
  });
  it('resumes partially loaded rows after reopening and ignores a reply from the cancelled batch', async () => {
    const all = pairs(251),
      late = deferred(),
      initial = saved(all);
    getDetails.mockImplementation(({ offset, limit }) => (offset === 0 ? Promise.resolve(response(all, offset, limit)) : late.promise));
    await render(initial);
    await act(async () => root.render(null));
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(all, offset, limit)));
    await render(initial);
    expect(getDetails.mock.calls.map(([request]) => request.offset)).toEqual([0, 200, 200]);
    const calls = getDetails.mock.calls.length;
    await act(async () => late.resolve(response(all, 200)));
    expect(getDetails).toHaveBeenCalledTimes(calls);
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(251);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
  });
  it('recovers when a previous failed detail response arrives after the refreshed report is already ready', async () => {
    const all = pairs(251),
      initial = saved(all);
    let fail!: (value: { success: false; error: string }) => void;
    const unavailable = new Promise<{ success: false; error: string }>((resolve) => {
      fail = resolve;
    });
    getDetails.mockReturnValueOnce(unavailable);
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(all, offset, limit)));
    await render(initial);
    await render({ ...initial, savedAt: 2000 });
    expect(getDetails).toHaveBeenCalledTimes(1);
    await act(async () => fail({ success: false, error: 'This analytics snapshot is no longer active. Refresh the dashboard.' }));
    expect(getDetails.mock.calls.map(([request]) => request.offset)).toEqual([0, 0, 200]);
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(251);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
  });
  it('recovers a saved snapshot that is initially unavailable in main when the refreshed report becomes ready', async () => {
    const all = pairs(251),
      initial = saved(all);
    getDetails.mockResolvedValue({ success: false, error: 'This analytics snapshot is no longer active. Refresh the dashboard.' });
    await render(initial);
    expect(host.textContent).toContain('Not all connections could be loaded');
    const calls = getDetails.mock.calls.length;
    await render({ ...initial });
    expect(getDetails).toHaveBeenCalledTimes(calls);
    getDetails.mockImplementation(({ offset, limit }) => Promise.resolve(response(all, offset, limit)));
    await render({ ...initial, savedAt: 2000 });
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(251);
    expect(host.querySelector('.analytics-coupling-loading')).toBeNull();
  });
});
