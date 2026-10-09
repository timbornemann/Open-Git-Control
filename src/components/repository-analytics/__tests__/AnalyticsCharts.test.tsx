// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { AnalyticsPeriod } from '@/shared/ipc/repositoryAnalytics';
import { PeriodChart } from '../AnalyticsCharts';

let host: HTMLDivElement, root: Root;
const onSelect = vi.fn();
const period = (date: string, commits: number): AnalyticsPeriod => ({ date, commits, merges: 0, additions: commits * 2, deletions: commits });
const render = (periods: AnalyticsPeriod[], interval: 'day' | 'week' | 'month' = 'day', churn = false) =>
  act(() =>
    root.render(
      <I18nProvider language="en">
        <PeriodChart periods={periods} interval={interval} churn={churn} onSelect={onSelect} />
      </I18nProvider>,
    ),
  );

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onSelect.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('activity chart labels', () => {
  it('shows counts without a duplicate table and labels inactive dates on the same timeline', () => {
    render([period('2026-10-01', 7), period('2026-10-05', 12), period('2026-10-15', 3)]);
    expect(host.querySelector('details')).toBeNull();
    expect([...host.querySelectorAll('.analytics-bar-value')].map((node) => node.textContent)).toEqual(['7', '12', '3']);
    const dates = [...host.querySelectorAll<HTMLElement>('.analytics-period-axis [data-date]')].map((node) => node.dataset.date);
    expect(dates.length).toBeGreaterThan(2);
    expect(dates[0]).toBe('2026-10-01');
    expect(dates.at(-1)).toBe('2026-10-15');
    expect(dates).toContain('2026-10-03');
    const bar = host.querySelectorAll<HTMLButtonElement>('.analytics-bar')[1];
    expect(bar.getAttribute('aria-label')).toContain('2026-10-05: 12 commits');
    act(() => bar.click());
    expect(onSelect).toHaveBeenCalledWith('2026-10-05');
  });
  it('uses week and month boundaries across year changes', () => {
    render([period('2025-12-29', 2), period('2026-01-19', 4)], 'week');
    expect([...host.querySelectorAll<HTMLElement>('[data-date]')].map((node) => node.dataset.date)).toEqual([
      '2025-12-29',
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
    ]);
    render([period('2025-11-01', 2), period('2026-02-01', 4)], 'month');
    expect([...host.querySelectorAll<HTMLElement>('[data-date]')].map((node) => node.dataset.date)).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ]);
  });
  it('adapts date density when resized while keeping every count', () => {
    let resize!: () => void;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render([period('2026-10-01', 7), period('2026-10-15', 3)]);
    const axis = host.querySelector<HTMLElement>('.analytics-period-axis')!;
    Object.defineProperty(axis, 'clientWidth', { configurable: true, value: 400 });
    act(() => resize());
    expect(axis.querySelectorAll('[data-date]')).toHaveLength(4);
    Object.defineProperty(axis, 'clientWidth', { configurable: true, value: 1200 });
    act(() => resize());
    expect(axis.querySelectorAll('[data-date]')).toHaveLength(12);
    expect(host.querySelectorAll('.analytics-bar-value')).toHaveLength(2);
  });
  it('handles a single period and keeps the separate churn table', () => {
    render([period('2026-10-01', 1)]);
    expect(host.querySelectorAll('[data-date]')).toHaveLength(1);
    expect(host.querySelector('[data-date]')?.getAttribute('data-date')).toBe('2026-10-01');
    render([period('2026-10-01', 1)], 'day', true);
    expect(host.querySelector('.analytics-data summary')?.textContent).toBe('Chart data as table');
    expect(host.querySelector('.analytics-bar-value')).toBeNull();
    expect(host.querySelector('.analytics-bar-added')).toBeTruthy();
    expect(host.querySelector('.analytics-bar-deleted')).toBeTruthy();
    render([]);
    expect(host.textContent).toBe('No activity in the selected period.');
  });
});
