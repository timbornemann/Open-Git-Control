// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { AnalyticsChanges, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsDetailsView } from '../AnalyticsDetails';

const getDetails = vi.hoisted(() => vi.fn());
vi.mock('@/services/gitClient', () => ({ gitClient: { getRepositoryAnalyticsDetails: getDetails } }));
let host: HTMLDivElement, root: Root;
const onFile = vi.fn(),
  onPath = vi.fn();
const row = (path: string, changes: number): AnalyticsChanges => ({
  path,
  changes,
  authors: 1,
  additions: 1,
  deletions: 0,
  lastChanged: 1000,
  hash: 'a'.repeat(40),
  binary: false,
});
const snapshot = (): RepositoryAnalyticsSnapshot =>
  ({ repoPath: 'C:/repo', id: 'snapshot', savedAt: 1000, hotspots: [row('a.ts', 100)], directories: [row('.', 100)] }) as RepositoryAnalyticsSnapshot;
const render = (saved = snapshot(), kind: 'hotspots' | 'directories' = 'hotspots') =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <AnalyticsDetailsView snapshot={saved} kind={kind} onFile={onFile} onPath={onPath} />
      </I18nProvider>,
    ),
  );
const click = (text: string) =>
  act(async () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === text || button.querySelector('span')?.textContent === text)!.click(),
  );

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('paginated hotspot heatmaps', () => {
  it('loads detail pages with a consistent heat scale and opens the chosen historical file', async () => {
    getDetails.mockImplementation(({ offset }) =>
      Promise.resolve({ success: true, data: { items: [row(offset ? 'later.ts' : 'a.ts', offset ? 8 : 100)], total: 51, offset } }),
    );
    await render();
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('.analytics-heatmap-cell')?.classList.contains('analytics-heatmap-level--5')).toBe(true);
    await click('Next');
    expect(getDetails).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'hotspots', snapshotId: 'snapshot', offset: 50, limit: 50 }));
    expect(host.querySelector('.analytics-pagination')?.textContent).toContain('51–51 / 51');
    expect(host.querySelector('.analytics-heatmap-cell')?.classList.contains('analytics-heatmap-level--1')).toBe(true);
    await click('8');
    expect(onFile).toHaveBeenCalledWith('later.ts', 'a'.repeat(40));
  });
  it('shows cached tiles during background loading and ignores late results from the previous snapshot', async () => {
    let resolveOld!: (value: unknown) => void;
    const old = new Promise((resolve) => {
      resolveOld = resolve;
    });
    getDetails.mockReturnValueOnce(old);
    await render();
    const cell = host.querySelector<HTMLButtonElement>('.analytics-heatmap-cell')!;
    await act(async () => cell.focus());
    getDetails.mockResolvedValueOnce({ success: true, data: { items: [row('a.ts', 101)], total: 1, offset: 0 } });
    await render({ ...snapshot(), id: 'updated', savedAt: 2000 });
    expect(host.querySelector('.analytics-heatmap-cell')).toBe(cell);
    expect(document.activeElement).toBe(cell);
    expect(cell.querySelector('span')?.textContent).toBe('101');
    await act(async () => resolveOld({ success: true, data: { items: [row('wrong.ts', 1)], total: 1, offset: 0 } }));
    expect(cell.querySelector('span')?.textContent).toBe('101');
    expect(host.textContent).not.toContain('wrong.ts');
  });
  it('uses the same map for directories and routes their actions to path analysis', async () => {
    getDetails.mockResolvedValue({ success: true, data: { items: [row('.', 100), row('src/components', 40)], total: 2, offset: 0 } });
    await render(snapshot(), 'directories');
    expect(host.querySelector('table')).toBeNull();
    expect(getDetails).toHaveBeenCalledWith(expect.objectContaining({ kind: 'directories' }));
    await click('100');
    expect(onPath).toHaveBeenCalledWith('');
    await click('40');
    expect(onPath).toHaveBeenCalledWith('src/components');
    expect(onFile).not.toHaveBeenCalled();
  });
});
