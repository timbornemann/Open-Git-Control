// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { AnalyticsPeriod } from '@/shared/ipc/repositoryAnalytics';
import { ActivityCalendar } from '../AnalyticsCharts';

let host: HTMLDivElement, root: Root;
const onSelect = vi.fn();
const period = (date: string, commits: number): AnalyticsPeriod => ({ date, commits, merges: 0, additions: 0, deletions: 0 });
const render = (periods: AnalyticsPeriod[], language: 'de' | 'en' = 'en') =>
  act(() =>
    root.render(
      <I18nProvider language={language}>
        <ActivityCalendar periods={periods} onSelect={onSelect} />
      </I18nProvider>,
    ),
  );
const day = (date: string) => host.querySelector<HTMLButtonElement>(`.analytics-day[aria-label^="${date}:"]`)!;
const press = (button: HTMLButtonElement, key: string) => act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

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
});

describe('activity calendar', () => {
  it('shows each day and its count without a duplicate table, with month and weekday labels', () => {
    render([period('2026-10-08', 8), period('2026-10-09', 2)]);
    expect(host.querySelectorAll('.analytics-day')).toHaveLength(365);
    expect(host.querySelector('details')).toBeNull();
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelectorAll('.analytics-calendar-months span')).toHaveLength(12);
    expect(host.querySelector('.analytics-calendar-weekdays')?.textContent).toBe('MonWedFri');
    expect(day('2026-10-08').title).toBe('2026-10-08: 8 commits');
    expect(day('2026-10-08').classList.contains('analytics-day--4')).toBe(true);
    expect(day('2026-10-09').classList.contains('analytics-day--1')).toBe(true);
    expect(day('2026-01-01').title).toBe('2026-01-01: 0 commits');
    act(() => day('2026-10-08').click());
    expect(onSelect).toHaveBeenCalledWith('2026-10-08');
  });
  it('keeps leap days and partial boundary weeks in their correct weekdays, including 54-week years', () => {
    render([period('2012-02-29', 3)]);
    expect(host.querySelectorAll('.analytics-day')).toHaveLength(366);
    expect(host.querySelector<HTMLElement>('.analytics-calendar')?.style.gridTemplateColumns).toBe('repeat(54, minmax(0, 1fr))');
    expect(day('2012-01-01').style.gridRow).toBe('7');
    expect(day('2012-01-01').style.gridColumn).toBe('1');
    expect(day('2012-02-29').style.gridRow).toBe('3');
    expect(day('2012-12-31').style.gridColumn).toBe('54');
    expect(day('2012-12-31').style.gridRow).toBe('1');
  });
  it('retains the selected year and day buttons during background report updates', () => {
    const periods = [period('2026-10-09', 2), period('2024-02-29', 3)];
    render(periods);
    const picker = host.querySelector<HTMLSelectElement>('select')!;
    act(() => {
      picker.value = '2024';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const selected = day('2024-02-29');
    selected.focus();
    render([...periods, period('2024-03-01', 1)]);
    expect(picker.value).toBe('2024');
    expect(day('2024-02-29')).toBe(selected);
    expect(document.activeElement).toBe(selected);
    expect(host.querySelectorAll('.analytics-day')).toHaveLength(366);
  });
  it('navigates spatially by day vertically and by week horizontally', () => {
    render([period('2026-01-08', 1)]);
    day('2026-01-08').focus();
    press(day('2026-01-08'), 'ArrowRight');
    expect(document.activeElement).toBe(day('2026-01-15'));
    press(day('2026-01-15'), 'ArrowDown');
    expect(document.activeElement).toBe(day('2026-01-16'));
    press(day('2026-01-16'), 'ArrowUp');
    expect(document.activeElement).toBe(day('2026-01-15'));
    press(day('2026-01-15'), 'ArrowLeft');
    expect(document.activeElement).toBe(day('2026-01-08'));
    press(day('2026-01-08'), 'End');
    expect(document.activeElement).toBe(day('2026-12-31'));
    press(day('2026-12-31'), 'Home');
    expect(document.activeElement).toBe(day('2026-01-01'));
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('shows a complete empty current year and uses the app language for calendar labels', () => {
    render([], 'de');
    const year = new Date().getFullYear();
    expect(host.querySelector('h3')?.textContent).toBe('Aktivitätskalender');
    expect(host.querySelector('.analytics-calendar-months')?.textContent).toContain('Mai');
    expect(host.querySelector('.analytics-calendar-weekdays')?.textContent).toContain('Mi');
    expect(day(`${year}-01-01`).classList.contains('analytics-day--0')).toBe(true);
    expect(day(`${year}-12-31`)).toBeTruthy();
  });
});
