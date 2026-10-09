// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { AnalyticsChanges } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsHotspotHeatmap } from '../AnalyticsHotspotHeatmap';

let host: HTMLDivElement, root: Root;
const onFile = vi.fn(),
  onPath = vi.fn();
const change = (path: string, changes: number, extra: Partial<AnalyticsChanges> = {}): AnalyticsChanges => ({
  path,
  changes,
  additions: 123,
  deletions: 45,
  authors: 2,
  lastChanged: Date.UTC(2026, 9, 8),
  hash: 'a'.repeat(40),
  binary: false,
  ...extra,
});
const rows = () => [change('src/components/Editor.tsx', 40), change('src/theme.css', 20), change('docs/guide.md', 1)];
const render = (items = rows(), props: { directory?: boolean; maxChanges?: number } = {}) =>
  act(() =>
    root.render(
      <I18nProvider language="en">
        <AnalyticsHotspotHeatmap rows={items} {...props} onFile={onFile} onPath={onPath} />
      </I18nProvider>,
    ),
  );
const cells = () => [...host.querySelectorAll<HTMLButtonElement>('.analytics-heatmap-cell')];
const hover = (cell: HTMLElement) => act(() => cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
const key = (cell: HTMLElement, value: string) => act(() => cell.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
const tooltip = () => document.querySelector<HTMLElement>('[role="tooltip"]');

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

describe('change hotspot heatmap', () => {
  it('identifies files on hover and opens their captured versions and history', () => {
    render();
    expect(host.querySelector('table')).toBeNull();
    expect(cells().map((cell) => cell.textContent)).toEqual(['40', '20', '1']);
    hover(cells()[1]);
    const popup = tooltip()!;
    expect(popup.textContent).toContain('src/theme.css');
    expect(popup.textContent).toContain('Changes20');
    expect(popup.textContent).toContain('People2');
    expect(popup.textContent).toContain('+123 / −45');
    expect(popup.textContent).toContain('Last change');
    expect(cells()[1].getAttribute('aria-describedby')).toBe(popup.id);
    expect(host.querySelector('.analytics-heatmap-selection .analytics-link')?.textContent).toBe('src/theme.css');
    act(() => cells()[1].click());
    expect(onFile).toHaveBeenCalledWith('src/theme.css', 'a'.repeat(40));
    expect(tooltip()).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('.analytics-heatmap-selection .ui-button')!.click());
    expect(onPath).toHaveBeenCalledWith('src/theme.css');
  });
  it('uses the report scale on later pages instead of making each page equally hot', () => {
    render([change('first.ts', 40), change('second.ts', 20), change('third.ts', 1)], { maxChanges: 40 });
    expect(cells()[0].classList.contains('analytics-heatmap-level--5')).toBe(true);
    expect(cells()[1].classList.contains('analytics-heatmap-level--3')).toBe(true);
    render([change('later.ts', 8)], { maxChanges: 40 });
    expect(cells()[0].classList.contains('analytics-heatmap-level--1')).toBe(true);
    expect(host.querySelector('.analytics-heatmap-legend')?.getAttribute('aria-label')).toContain('40');
  });
  it('supports grid keyboard navigation, focus tooltips and Escape dismissal', () => {
    render([...rows(), change('README.md', 1)]);
    host.querySelector<HTMLElement>('.analytics-heatmap-grid')!.style.gridTemplateColumns = '54px 54px';
    hover(cells()[1]);
    act(() => cells()[0].focus());
    expect(tooltip()?.textContent).toContain('src/components/Editor.tsx');
    key(cells()[0], 'ArrowDown');
    expect(document.activeElement).toBe(cells()[2]);
    expect(tooltip()?.textContent).toContain('docs/guide.md');
    key(cells()[2], 'ArrowRight');
    expect(document.activeElement).toBe(cells()[3]);
    key(cells()[3], 'Home');
    expect(document.activeElement).toBe(cells()[0]);
    key(cells()[0], 'Escape');
    expect(tooltip()).toBeNull();
    expect(cells()[0].getAttribute('aria-describedby')).toBeNull();
    key(cells()[0], 'End');
    expect(document.activeElement).toBe(cells()[3]);
    expect(tooltip()?.textContent).toContain('README.md');
  });
  it('retains focus and updates the tooltip and captured commit after a background refresh', () => {
    render();
    const cell = cells()[1];
    act(() => cell.focus());
    render([rows()[0], change('src/theme.css', 21, { hash: 'b'.repeat(40) }), rows()[2]]);
    expect(cells()[1]).toBe(cell);
    expect(document.activeElement).toBe(cell);
    expect(tooltip()?.textContent).toContain('Changes21');
    act(() => cell.click());
    expect(onFile).toHaveBeenCalledWith('src/theme.css', 'b'.repeat(40));
  });
  it('explains binary files and previous paths without inventing line counts and normalizes root directory history', () => {
    render([change('assets/new.png', 3, { binary: true, additions: 0, deletions: 0, oldPath: 'assets/old.png' })]);
    hover(cells()[0]);
    expect(tooltip()?.textContent).toContain('Previously: assets/old.png');
    expect(tooltip()?.textContent).toContain('Binary / LFS');
    expect(tooltip()?.textContent).not.toContain('+0');
    render([change('.', 5)], { directory: true });
    hover(cells()[0]);
    expect(tooltip()?.textContent).toContain('Repository root');
    act(() => cells()[0].click());
    expect(onPath).toHaveBeenCalledWith('');
    expect(onFile).not.toHaveBeenCalled();
  });
  it('dismisses detached or scrolled tooltips and handles an empty report', () => {
    render();
    act(() => cells()[0].focus());
    act(() => host.dispatchEvent(new Event('scroll')));
    expect(tooltip()).toBeNull();
    hover(cells()[1]);
    expect(tooltip()).toBeTruthy();
    render([change('other.ts', 2)]);
    expect(tooltip()).toBeNull();
    render([]);
    expect(host.querySelector('.analytics-heatmap')).toBeNull();
    expect(tooltip()).toBeNull();
  });
});
