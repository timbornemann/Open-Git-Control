// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsReleaseComparison } from '../AnalyticsReleaseComparison';
import { rememberAnalyticsSnapshot, useAnalyticsWorkspace } from '../analyticsWorkspaceState';
import { analyticsReport, releaseComparison } from './analyticsFixtures';

let host: HTMLDivElement, root: Root;
const onChange = vi.fn();
const saved = (): RepositoryAnalyticsSnapshot => ({
  ...analyticsReport(),
  comparison: releaseComparison(),
  tags: [
    { name: 'v2.0.0', oid: 'b'.repeat(40), date: 2000, version: true },
    { name: 'v1.0.0', oid: 'a'.repeat(40), date: 1000, version: true },
  ],
});
const render = (snapshot: RepositoryAnalyticsSnapshot | null = saved(), filters: AnalyticsFilters = DEFAULT_ANALYTICS_FILTERS, loading = false) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <div className="repository-analytics">
          <AnalyticsReleaseComparison repoPath="C:/repo" snapshot={snapshot} filters={filters} loading={loading} onChange={onChange} />
        </div>
      </I18nProvider>,
    ),
  );
const select = (index: number) => host.querySelectorAll<HTMLSelectElement>('select')[index];
const choose = (field: HTMLSelectElement, value: string) =>
  act(async () => {
    field.value = value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useAnalyticsWorkspace.setState({ filters: {}, snapshots: {} });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('release comparison statistical overview', () => {
  it('shows aggregate metrics and proportional charts without file rows or pagination', async () => {
    await render();
    expect([...host.querySelectorAll('.analytics-comparison-metrics dd')].map((node) => node.textContent)).toEqual(['12', '3', '10', '+800']);
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('.analytics-pagination')).toBeNull();
    expect(host.textContent).not.toContain('do-not-list-me');
    expect(host.querySelector('circle.is-added')?.getAttribute('stroke-dasharray')).toBe('90 100');
    expect(host.querySelector('circle.is-deleted')?.getAttribute('stroke-dasharray')).toBe('10 100');
    expect(
      [...host.querySelectorAll<HTMLElement>('.analytics-comparison-file-bars .analytics-comparison-track > span')].map((node) => node.style.width),
    ).toEqual(['20%', '60%', '10%', '10%']);
    expect(host.querySelector('.analytics-comparison-areas')?.textContent).toContain('Project root');
    expect(host.querySelector('.analytics-comparison-content-types')?.textContent).toContain('9 text files');
  });
  it('offers local tags, HEAD and branches as unambiguous dropdown choices', async () => {
    await render();
    expect(select(0).value).toBe('');
    expect(select(1).value).toBe('HEAD');
    expect([...select(0).querySelectorAll('optgroup[label="Local tags"] option')].map((node) => node.getAttribute('value'))).toEqual([
      'refs/tags/v2.0.0',
      'refs/tags/v1.0.0',
    ]);
    await choose(select(0), 'refs/tags/v1.0.0');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_ANALYTICS_FILTERS, compareFrom: 'refs/tags/v1.0.0' });
    await choose(select(1), 'refs/heads/main');
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_ANALYTICS_FILTERS, compareTo: 'refs/heads/main' });
  });
  it('keeps both selectors and known versions available while the new comparison is loading', async () => {
    const initial = saved();
    rememberAnalyticsSnapshot(initial);
    await render(initial);
    const from = select(0),
      to = select(1);
    await render(null, { ...DEFAULT_ANALYTICS_FILTERS, compareFrom: 'refs/tags/v2.0.0' }, true);
    expect(select(0)).toBe(from);
    expect(select(1)).toBe(to);
    expect(from.value).toBe('refs/tags/v2.0.0');
    expect(host.textContent).toContain('Comparing versions');
    expect(host.querySelector('.analytics-comparison-metrics')).toBeNull();
    expect(from.options.length).toBeGreaterThan(3);
  });
  it('swaps actual versions including the automatically selected release', async () => {
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Swap versions"]')!.click());
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_ANALYTICS_FILTERS, compareFrom: 'HEAD', compareTo: 'refs/tags/v1.0.0' });
  });
  it('retains manual commit ID selection and allows cancelling it without changing the comparison', async () => {
    await render();
    const custom = [...select(0).options].find((option) => option.textContent === 'Other revision…')!.value;
    await choose(select(0), custom);
    const input = host.querySelector<HTMLInputElement>('input')!;
    const oid = 'c'.repeat(40);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, ` ${oid} `);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_ANALYTICS_FILTERS, compareFrom: oid });
    await choose(select(0), custom);
    onChange.mockClear();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Cancel"]')!.click());
    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('input')).toBeNull();
  });
  it('keeps removed or manually entered revisions visible until a new version is chosen', async () => {
    const filters = { ...DEFAULT_ANALYTICS_FILTERS, compareFrom: 'removed-tag', compareTo: 'c'.repeat(40) };
    await render(saved(), filters);
    expect(select(0).value).toBe('removed-tag');
    expect(select(1).value).toBe(filters.compareTo);
  });
  it('groups minor project areas and uses totals beyond the preview, rather than deriving them from file rows', async () => {
    const report = saved();
    report.comparison!.files = 120;
    report.comparison!.summary!.areas = Array.from({ length: 8 }, (_, index) => ({ path: `area-${index}/`, files: 15, additions: 10, deletions: 1 }));
    await render(report);
    expect(host.querySelectorAll('.analytics-comparison-areas li')).toHaveLength(6);
    const last = host.querySelector('.analytics-comparison-areas li:last-child')!;
    expect(last.textContent).toContain('Other areas');
    expect(last.textContent).toContain('45 files');
    expect(last.querySelector<HTMLElement>('.analytics-comparison-track > span')?.style.width).toBe('37.5%');
    expect(host.textContent).not.toContain('do-not-list-me');
  });
  it('explains divergent versions and renders zero-change comparisons with finite chart values', async () => {
    const report = saved();
    report.comparison = {
      ...releaseComparison(),
      ancestor: false,
      commits: 0,
      contributors: 0,
      additions: 0,
      deletions: 0,
      files: 0,
      summary: { fileChanges: { added: 0, modified: 0, deleted: 0, renamed: 0 }, textFiles: 0, nonTextFiles: 0, areas: [] },
    };
    await render(report);
    expect(host.querySelector('[role="note"]')?.textContent).toContain('does not build on the base version');
    expect(host.textContent).toContain('No text line changes');
    expect(host.innerHTML).not.toMatch(/NaN|Infinity/);
    expect([...host.querySelectorAll('.analytics-comparison-metrics dd')].map((node) => node.textContent)).toEqual(['0', '0', '0', '0']);
  });
  it('shows an older cached summary immediately without inventing categories from an incomplete path preview', async () => {
    const report = saved();
    delete report.comparison!.summary;
    await render(report);
    expect(host.querySelector('.analytics-comparison-ring')).toBeTruthy();
    expect(host.querySelector('.analytics-comparison-file-bars')).toBeNull();
    expect(host.querySelector('.analytics-comparison-areas')).toBeNull();
  });
  it('keeps revision choices available without tags or an existing comparison', async () => {
    const report = saved();
    report.tags = [];
    report.comparison = null;
    await render(report);
    expect(host.textContent).toContain('Choose two local tags');
    expect(select(1).value).toBe('HEAD');
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Swap versions"]')?.disabled).toBe(true);
  });
});
