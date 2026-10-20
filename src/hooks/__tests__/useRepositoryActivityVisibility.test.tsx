// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositoryActivityDemand } from '@/data/repositoryActivityDemand';
import { useRepositoryActivityVisibility } from '../useRepositoryActivityVisibility';

class VisibilityObserver {
  static instances: VisibilityObserver[] = [];
  observed = new Set<Element>();
  disconnected = false;
  constructor(private callback: IntersectionObserverCallback) {
    VisibilityObserver.instances.push(this);
  }
  observe = (element: Element) => {
    this.observed.add(element);
  };
  disconnect = () => {
    this.disconnected = true;
  };
  notify(...entries: Array<[Element, number]>) {
    this.callback(
      entries.map(([target, ratio]) => ({ target, isIntersecting: ratio > 0, intersectionRatio: ratio }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}
function Surface({ paths, name = 'list' }: { paths: string[]; name?: string }) {
  const ref = useRepositoryActivityVisibility<HTMLDivElement>(paths);
  return createElement(
    'div',
    { ref, 'data-surface': name },
    paths.map((path) => createElement('div', { key: path, 'data-repository-activity-path': path }, path)),
  );
}

describe('repository viewport demand', () => {
  let root: Root, host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    VisibilityObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', VisibilityObserver);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const render = async (paths: string[]) => act(async () => root.render(createElement(Surface, { paths })));
  const row = (path: string) =>
    [...host.querySelectorAll<HTMLElement>('[data-repository-activity-path]')].find((item) => item.dataset.repositoryActivityPath === path)!;
  const latest = () => VisibilityObserver.instances.at(-1)!;

  it('promotes only rows in the clipped viewport and updates demand when scrolling', async () => {
    await render(['/visible', '/below']);
    expect(repositoryActivityDemand.has('/visible')).toBe(false);
    latest().notify([row('/visible'), 1], [row('/below'), 0]);
    expect(repositoryActivityDemand.has('/visible')).toBe(true);
    expect(repositoryActivityDemand.has('/below')).toBe(false);
    latest().notify([row('/visible'), 0], [row('/below'), 0.8]);
    expect(repositoryActivityDemand.has('/visible')).toBe(false);
    expect(repositoryActivityDemand.has('/below')).toBe(true);
  });

  it('drops filtered and removed rows, ignores old callbacks and clears demand when leaving the view', async () => {
    await render(['/a', '/b']);
    const old = latest(),
      oldRow = row('/a');
    old.notify([oldRow, 1], [row('/b'), 1]);
    await render(['/b']);
    expect(old.disconnected).toBe(true);
    old.notify([oldRow, 1]);
    expect(repositoryActivityDemand.has('/a')).toBe(false);
    latest().notify([row('/b'), 1]);
    expect(repositoryActivityDemand.has('/b')).toBe(true);
    await act(async () => root.render(null));
    expect(repositoryActivityDemand.has('/b')).toBe(false);
  });

  it('keeps another visible surface authoritative when one surface closes', async () => {
    await act(async () =>
      root.render([
        createElement(Surface, { key: 'list', paths: ['/same'], name: 'list' }),
        createElement(Surface, { key: 'rail', paths: ['/same'], name: 'rail' }),
      ]),
    );
    for (const observer of VisibilityObserver.instances) observer.notify([[...observer.observed][0], 1]);
    await act(async () => root.render([createElement(Surface, { key: 'rail', paths: ['/same'], name: 'rail' })]));
    expect(repositoryActivityDemand.has('/same')).toBe(true);
    await act(async () => root.render(null));
    expect(repositoryActivityDemand.has('/same')).toBe(false);
  });

  it('reobserves after StrictMode cleanup and ignores callbacks from the discarded observer', async () => {
    await act(async () => root.render(createElement(StrictMode, {}, createElement(Surface, { paths: ['/strict'] }))));
    const first = VisibilityObserver.instances[0];
    expect(first.disconnected).toBe(true);
    first.notify([row('/strict'), 1]);
    expect(repositoryActivityDemand.has('/strict')).toBe(false);
    latest().notify([row('/strict'), 1]);
    expect(repositoryActivityDemand.has('/strict')).toBe(true);
  });

  it('retains observation across reordering and accepts viewport changes after resize', async () => {
    await render(['/first', '/second']);
    const observer = latest();
    observer.notify([row('/first'), 1]);
    await render(['/second', '/first']);
    expect(latest()).toBe(observer);
    observer.notify([row('/first'), 0], [row('/second'), 1]);
    expect(repositoryActivityDemand.has('/first')).toBe(false);
    expect(repositoryActivityDemand.has('/second')).toBe(true);
  });

  it('falls back to the rendered rows without IntersectionObserver and removes filtered hints', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    await render(['/a', '/b']);
    expect(repositoryActivityDemand.has('/a')).toBe(true);
    expect(repositoryActivityDemand.has('/b')).toBe(true);
    await render(['/b']);
    expect(repositoryActivityDemand.has('/a')).toBe(false);
    expect(repositoryActivityDemand.has('/b')).toBe(true);
  });

  it('reattaches to replaced rows when a canonical path changes spelling', async () => {
    await render(['C:/Work/Repo']);
    const first = latest();
    first.notify([row('C:/Work/Repo'), 1]);
    expect(repositoryActivityDemand.has('c:/work/repo')).toBe(true);
    await render(['c:\\work\\repo']);
    expect(first.disconnected).toBe(true);
    expect(repositoryActivityDemand.has('c:/work/repo')).toBe(false);
    latest().notify([row('c:\\work\\repo'), 1]);
    expect(repositoryActivityDemand.has('C:/Work/Repo')).toBe(true);
  });
});
