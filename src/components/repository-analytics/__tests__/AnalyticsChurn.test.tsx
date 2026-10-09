// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsPeriod } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsChurn } from '../AnalyticsChurn';

let host: HTMLDivElement, root: Root;
const onPeriod = vi.fn();
const period = (date: string, additions: number, deletions: number): AnalyticsPeriod => ({ date, additions, deletions, commits: 2, merges: 0 });
function render(
  periods = [period('2025-12-29', 800, 200), period('2026-01-19', 200, 400)],
  language: 'en' | 'de' = 'en',
  aggregation: 'day' | 'week' | 'month' = 'week',
) {
  const snapshot = {
    additions: periods.reduce((sum, row) => sum + row.additions, 0),
    deletions: periods.reduce((sum, row) => sum + row.deletions, 0),
    periods,
    filters: { ...DEFAULT_ANALYTICS_FILTERS, aggregation },
    filteredCommits: periods.reduce((sum, row) => sum + row.commits, 0),
    totals: { commits: 4, merges: 0, contributors: 1, firstActivity: 0, lastActivity: 1000 },
  };
  act(() =>
    root.render(
      <I18nProvider language={language}>
        <AnalyticsChurn snapshot={snapshot} onPeriod={onPeriod} />
      </I18nProvider>,
    ),
  );
}
function press(button: HTMLButtonElement, key: string) {
  act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}
function resizeChart(initialWidth: number, observe = true) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 300 }) as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.stubGlobal(
    'ResizeObserver',
    observe
      ? class {
          constructor(private callback: () => void) {}
          observe() {
            listeners.add(this.callback);
          }
          disconnect() {
            listeners.delete(this.callback);
          }
        }
      : undefined,
  );
  return (nextWidth: number) => {
    width = nextWidth;
    act(() => (observe ? listeners.forEach((listener) => listener()) : window.dispatchEvent(new Event('resize'))));
  };
}
function weeklyHistory() {
  return Array.from({ length: 32 }, (_, index) =>
    period(new Date(Date.UTC(2026, 2, 2 + index * 7)).toISOString().slice(0, 10), index === 18 ? 100500 : 1000 + index, index === 18 ? 60000 : 100 + index),
  ).filter((_, index) => index < 7 || index > 12);
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onPeriod.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Code Churn report', () => {
  it('shows filtered totals and a proportional balance without a duplicate data table', () => {
    render();
    expect([...host.querySelectorAll('dd')].map((node) => node.textContent)).toEqual(['+1,000', '−600', '1,600', '+400']);
    expect(host.querySelector('.analytics-churn-heading')?.textContent).toContain('4 commits in filter');
    expect(host.querySelector('.analytics-churn-balance-track')?.getAttribute('aria-label')).toBe('62.5% added, 37.5% deleted');
    expect(host.querySelector<HTMLElement>('.analytics-churn-balance-added')?.style.width).toBe('62.5%');
    expect(host.querySelector<HTMLElement>('.analytics-churn-balance-deleted')?.style.width).toBe('37.5%');
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('details')).toBeNull();
    expect(host.textContent).not.toContain('Chart data as table');
  });
  it('uses a shared signed scale with exact bar values and preserves inactive weeks across a year boundary', () => {
    render();
    expect([...host.querySelectorAll('.analytics-churn-scale > span')].map((node) => node.textContent)).toEqual(['+800', '+400', '0', '−400', '−800']);
    expect([...host.querySelectorAll<HTMLElement>('.analytics-churn-added')].map((node) => node.style.height)).toEqual(['50%', '12.5%']);
    expect([...host.querySelectorAll<HTMLElement>('.analytics-churn-deleted')].map((node) => node.style.height)).toEqual(['12.5%', '25%']);
    expect([...host.querySelectorAll('.analytics-churn-value')].map((node) => node.textContent)).toEqual(['+800', '−200', '+200', '−400']);
    expect([...host.querySelectorAll<HTMLElement>('.analytics-churn-bar')].map((node) => node.style.gridColumn)).toEqual(['1', '4']);
    expect([...host.querySelectorAll<HTMLElement>('[data-date]')].map((node) => node.dataset.date)).toEqual([
      '2025-12-29',
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
    ]);
    expect(host.querySelector('.analytics-churn-bar')?.getAttribute('aria-label')).toBe('2025-12-29: +800 added, −200 deleted, 2 commits');
  });
  it('keeps deletion-only changes negative and avoids drawing zero-height additions', () => {
    render([period('2026-10-01', 0, 50)], 'en', 'month');
    expect(host.querySelector('dd.analytics-added')?.textContent).toBe('+0');
    expect(host.querySelectorAll('dd')[3].textContent).toBe('−50');
    expect(host.querySelector('.analytics-churn-added')).toBeNull();
    expect(host.querySelector('.analytics-churn-deleted .analytics-churn-value')?.textContent).toBe('−50');
    expect(host.querySelector<HTMLElement>('.analytics-churn-balance-deleted')?.style.width).toBe('100%');
    expect(host.querySelector('h4')?.textContent).toBe('Line changes per month');
    expect(host.querySelectorAll('[data-date]')).toHaveLength(1);
  });
  it('offers keyboard navigation and sends the selected period to the existing filter workflow', () => {
    render();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.analytics-churn-bar')];
    buttons[0].focus();
    press(buttons[0], 'ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(onPeriod).toHaveBeenCalledWith('2026-01-19');
    press(buttons[1], 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    press(buttons[0], 'End');
    expect(document.activeElement).toBe(buttons[1]);
  });
  it('retains period buttons and keyboard focus while new results update the scale and totals', () => {
    render();
    const button = host.querySelector<HTMLButtonElement>('.analytics-churn-bar')!;
    button.focus();
    render([period('2025-12-29', 1500, 200), period('2026-01-19', 200, 400)]);
    expect(host.querySelector('.analytics-churn-bar')).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.querySelector<HTMLElement>('.analytics-churn-added')?.style.height).toBe('46.875%');
    expect(host.querySelector('.analytics-churn-scale > span')?.textContent).toBe('+1,600');
    expect(host.querySelector('dd')?.textContent).toBe('+1,700');
  });
  it('explains missing text changes, including merge-only activity, without misleading ratios', () => {
    render([period('2026-10-01', 0, 0)], 'de');
    expect(host.textContent).toContain('Keine Textzeilenänderungen für diese Auswahl.');
    expect(host.querySelectorAll('.analytics-churn-bar')).toHaveLength(0);
    expect([...host.querySelectorAll('dd')].map((node) => node.textContent)).toEqual(['+0', '−0', '0', '0']);
    expect(host.querySelector('.analytics-churn-balance-track')?.getAttribute('aria-label')).toBe('0% hinzugefügt, 0% gelöscht');
    expect(host.textContent).not.toMatch(/NaN|Infinity/);
    render([]);
    expect(host.textContent).toContain('No text line changes for this selection.');
  });
  it('keeps the shared scale close to a large peak while reserving space for value labels', () => {
    render([period('2026-10-01', 100500, 60000)]);
    expect([...host.querySelectorAll('.analytics-churn-scale > span')].map((node) => node.textContent)).toEqual([
      '+120,000',
      '+60,000',
      '0',
      '−60,000',
      '−120,000',
    ]);
    expect(host.querySelector<HTMLElement>('.analytics-churn-added')?.style.height).toBe('41.875%');
    expect(host.querySelector<HTMLElement>('.analytics-churn-deleted')?.style.height).toBe('25%');
  });
  it('adapts label density while retaining every period, gap, exact value and focused button on narrow screens', () => {
    const resize = resizeChart(2300);
    const history = weeklyHistory();
    render(history);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.analytics-churn-bar')];
    const values = buttons.map((button) => ({ label: button.getAttribute('aria-label'), height: button.firstElementChild?.getAttribute('style') }));
    const totals = [...host.querySelectorAll('dd')].map((node) => node.textContent);
    const wideLabels = host.querySelectorAll('.analytics-churn-bar:not(.is-compact)').length;
    buttons[0].focus();
    press(buttons[0], 'End');
    resize(300);
    const narrowLabels = host.querySelectorAll('.analytics-churn-bar:not(.is-compact)').length;
    expect(narrowLabels).toBeGreaterThan(0);
    expect(narrowLabels).toBeLessThan(wideLabels);
    expect(host.querySelector('.analytics-churn-bar[aria-label^="2026-07-06"]')?.classList.contains('is-compact')).toBe(false);
    expect([...host.querySelectorAll('.analytics-churn-bar')]).toEqual(buttons);
    expect(document.activeElement).toBe(buttons.at(-1));
    expect(buttons.map((button) => ({ label: button.getAttribute('aria-label'), height: button.firstElementChild?.getAttribute('style') }))).toEqual(values);
    expect([...host.querySelectorAll('dd')].map((node) => node.textContent)).toEqual(totals);
    expect(buttons.at(-1)?.style.gridColumn).toBe('32');
    const dates = [...host.querySelectorAll<HTMLElement>('[data-date]')].map((node) => node.dataset.date);
    expect(dates[0]).toBe('2026-03-02');
    expect(dates.at(-1)).toBe('2026-10-05');
    act(() => buttons.at(-1)?.click());
    expect(onPeriod).toHaveBeenCalledWith('2026-10-05');
    resize(2300);
    expect(host.querySelectorAll('.analytics-churn-bar:not(.is-compact)')).toHaveLength(wideLabels);
  });
  it('keeps responsive labels working after an empty result and without ResizeObserver support', () => {
    const resize = resizeChart(280, false);
    render([]);
    render(weeklyHistory());
    const narrowLabels = host.querySelectorAll('.analytics-churn-bar:not(.is-compact)').length;
    resize(2300);
    expect(host.querySelectorAll('.analytics-churn-bar:not(.is-compact)').length).toBeGreaterThan(narrowLabels);
    expect(host.querySelectorAll('.analytics-churn-bar')).toHaveLength(26);
    expect(host.querySelector('.analytics-churn-scale > span')?.textContent).toBe('+120,000');
  });
});
