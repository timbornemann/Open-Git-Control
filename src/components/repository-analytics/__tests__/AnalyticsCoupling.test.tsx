// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { AnalyticsCoupling as Pair } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsCoupling } from '../AnalyticsCoupling';

let host: HTMLDivElement, root: Root;
const onPath = vi.fn();
const pairs: Pair[] = [
  { first: 'src/api.ts', second: 'src/view.ts', commits: 20, share: 0.5 },
  { first: 'src/api.ts', second: 'tests/api.test.ts', commits: 10, share: 0.25 },
  { first: 'docs/guide.md', second: 'README.md', commits: 3, share: 0.1 },
];
const render = (rows = pairs, maxCommits = 20) =>
  act(() =>
    root.render(
      <I18nProvider language="en">
        <AnalyticsCoupling rows={rows} maxCommits={maxCommits} onPath={onPath} />
      </I18nProvider>,
    ),
  );
const nodes = () => [...host.querySelectorAll<HTMLButtonElement>('.analytics-coupling-node')];
const connections = () => [...host.querySelectorAll<HTMLButtonElement>('.analytics-coupling-connection')];
const file = (path: string) => nodes().find((node) => node.dataset.path === path)!;
const key = (node: HTMLElement, value: string) => act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
const camera = () => host.querySelector<HTMLElement>('.analytics-coupling-scene')!.style.transform;
const control = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const pointer = (type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'isPrimary', { value: true });
  return event;
};

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

describe('file coupling network', () => {
  it('shows shared files once, graph connections and exact strongest-pair values without a table', () => {
    render();
    expect(host.querySelector('table')).toBeNull();
    expect(nodes()).toHaveLength(5);
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(3);
    expect(connections()).toHaveLength(3);
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe('20');
    expect(host.querySelector('.analytics-coupling-metrics')?.textContent).toContain('50%');
    expect(host.querySelector('.analytics-coupling-selection')?.textContent).toContain('at least one of these two files');
  });
  it('selects a file and highlights only its connections while retaining direct analysis for either path', () => {
    render();
    act(() => file('src/api.ts').click());
    expect(file('src/api.ts').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelectorAll('.analytics-coupling-edge.is-active')).toHaveLength(2);
    expect(file('docs/guide.md').classList.contains('is-muted')).toBe(true);
    expect(connections()).toHaveLength(2);
    act(() => connections()[1].click());
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe('10');
    const actions = [...host.querySelectorAll<HTMLButtonElement>('.analytics-coupling-files button')];
    act(() => actions[0].click());
    act(() => actions[1].click());
    expect(onPath.mock.calls).toEqual([['src/api.ts'], ['tests/api.test.ts']]);
    const select = host.querySelector<HTMLSelectElement>('select')!;
    act(() => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(connections()).toHaveLength(3);
  });
  it('exposes every pair to keyboard selection and supports file focus navigation and clearing a selection', () => {
    render();
    act(() => nodes()[0].focus());
    key(nodes()[0], 'ArrowRight');
    expect(document.activeElement).toBe(nodes()[1]);
    key(nodes()[1], 'End');
    expect(document.activeElement).toBe(nodes().at(-1));
    act(() => file('src/api.ts').click());
    key(file('src/api.ts'), 'Escape');
    expect(connections()).toHaveLength(3);
    act(() => connections()[0].focus());
    key(connections()[0], 'ArrowDown');
    expect(document.activeElement).toBe(connections()[1]);
    act(() => connections()[1].click());
    expect(connections()[1].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe('10');
  });
  it('preserves graph coordinates, focused elements and selection when counts change in the background', () => {
    render();
    const node = file('src/api.ts');
    act(() => {
      node.click();
      node.focus();
      connections()[1].click();
    });
    const position = node.getAttribute('style');
    const connection = connections()[1];
    render([{ ...pairs[0], commits: 22 }, { ...pairs[1], commits: 12, share: 0.3 }, pairs[2]]);
    expect(file('src/api.ts')).toBe(node);
    expect(document.activeElement).toBe(node);
    expect(node.getAttribute('style')).toBe(position);
    expect(connections()[1]).toBe(connection);
    expect(connection.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe('12');
    expect(host.querySelector('.analytics-coupling-metrics')?.textContent).toContain('30%');
  });
  it('clears removed selections and keeps the report scale for weaker connections and an empty report', () => {
    render();
    act(() => file('src/api.ts').click());
    render([pairs[2]]);
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('');
    expect(nodes()).toHaveLength(2);
    expect(connections()).toHaveLength(1);
    expect(host.querySelector<HTMLElement>('.analytics-coupling-connection-bar i')?.style.width).toBe('15%');
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe('3');
    render([]);
    expect(nodes()).toHaveLength(0);
    expect(connections()).toHaveLength(0);
    expect(host.textContent).toContain('No files changed together in at least three commits');
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.disabled).toBe(true);
  });
  it('keeps identical basenames distinct and exact unusual paths in selectors and analysis actions', () => {
    const first = 'src/with spaces/same "file.ts',
      second = 'tests/with spaces/same "file.ts';
    render([{ first, second, commits: 5, share: 1 }]);
    expect(nodes().map((node) => node.dataset.path)).toEqual([first, second]);
    expect([...host.querySelectorAll('option')].map((option) => option.value)).toEqual(['', first, second]);
    expect(host.querySelector('.analytics-coupling-metrics')?.textContent).toContain('100%');
    act(() => host.querySelector<HTMLButtonElement>('.analytics-coupling-files button')!.click());
    expect(onPath).toHaveBeenCalledWith(first);
  });
  it('supports buttons, mouse-wheel zoom and keyboard panning, and fits the complete network again', () => {
    render();
    const network = host.querySelector<HTMLDivElement>('.analytics-coupling-network')!;
    const initial = camera();
    act(() => control('Zoom in').click());
    expect(camera()).not.toBe(initial);
    const zoomed = camera();
    key(network, 'ArrowRight');
    expect(camera()).not.toBe(zoomed);
    const panned = camera();
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -80, clientX: 120, clientY: 80 });
    act(() => network.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(true);
    expect(camera()).not.toBe(panned);
    act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Show entire network')!.click());
    expect(camera()).toBe(initial);
    key(network, '+');
    expect(camera()).not.toBe(initial);
    key(network, 'Home');
    expect(camera()).toBe(initial);
  });
  it('pans by pointer dragging without selecting an edge or losing an existing file selection', () => {
    render();
    act(() => file('src/api.ts').click());
    const network = host.querySelector<HTMLDivElement>('.analytics-coupling-network')!;
    const start = camera();
    act(() => network.dispatchEvent(pointer('pointerdown', 100, 100)));
    act(() => network.dispatchEvent(pointer('pointermove', 150, 130)));
    expect(camera()).not.toBe(start);
    expect(network.classList.contains('is-dragging')).toBe(true);
    act(() => network.dispatchEvent(pointer('pointerup', 150, 130)));
    expect(network.classList.contains('is-dragging')).toBe(false);
    const countBefore = host.querySelector('.analytics-coupling-count')?.textContent;
    act(() => host.querySelector('.analytics-coupling-edge-hit')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(host.querySelector('.analytics-coupling-count')?.textContent).toBe(countBefore);
    expect(file('src/api.ts').getAttribute('aria-pressed')).toBe('true');
    const after = camera();
    render(pairs.map((pair) => ({ ...pair, commits: pair.commits + 1 })));
    expect(camera()).toBe(after);
  });
  it('fits narrow measured windows and keeps world coordinates and zoom when the window resizes', () => {
    let width = 350,
      height = 340,
      resize!: () => void;
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.classList.contains('analytics-coupling-network') ? new DOMRect(0, 0, width, height) : new DOMRect();
    });
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
    try {
      render();
      const positions = nodes().map((node) => node.getAttribute('style'));
      act(() => control('Zoom in').click());
      const before = camera();
      const scale = before.match(/scale\(([^)]+)\)/)![1];
      width = 550;
      height = 440;
      act(() => resize());
      expect(camera()).toContain(`scale(${scale})`);
      expect(nodes().map((node) => node.getAttribute('style'))).toEqual(positions);
      expect(camera()).not.toBe(before);
    } finally {
      bounds.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
