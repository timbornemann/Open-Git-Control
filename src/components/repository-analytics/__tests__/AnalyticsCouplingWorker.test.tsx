// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { AnalyticsCoupling } from '../AnalyticsCoupling';
import { relaxCouplingScene, type CouplingForceRequest, type CouplingForceResult } from '../analyticsCouplingForce';
import type { AnalyticsCoupling as Pair } from '@/shared/ipc/repositoryAnalytics';

class LayoutWorker {
  static tasks: LayoutWorker[] = [];
  onmessage?: (event: MessageEvent<CouplingForceResult>) => void;
  onerror?: () => void;
  request!: CouplingForceRequest;
  terminated = false;
  constructor(
    public url: URL,
    public options: WorkerOptions,
  ) {
    LayoutWorker.tasks.push(this);
  }
  postMessage(request: CouplingForceRequest) {
    this.request = request;
  }
  terminate() {
    this.terminated = true;
  }
  deliver(done = true) {
    this.onmessage?.({
      data: { scene: relaxCouplingScene(this.request.pairs, this.request.seed, this.request.anchors), done },
    } as MessageEvent<CouplingForceResult>);
  }
}
let host: HTMLDivElement, root: Root;
const rows: Pair[] = Array.from({ length: 120 }, (_, index) => ({ first: 'hub.ts', second: `file-${index}.ts`, commits: 4, share: 0.5 }));
const render = (value = rows, loading = false) =>
  act(() =>
    root.render(
      <I18nProvider language="en">
        <AnalyticsCoupling rows={value} maxCommits={4} loading={loading} onPath={vi.fn()} />
      </I18nProvider>,
    ),
  );
const positions = () => [...host.querySelectorAll<HTMLElement>('.analytics-coupling-node')].map((node) => [node.dataset.path, node.style.left, node.style.top]);
const camera = () => host.querySelector<HTMLElement>('.analytics-coupling-scene')!.style.transform;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  LayoutWorker.tasks = [];
  vi.stubGlobal('Worker', LayoutWorker);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('background coupling force layout', () => {
  it('uses a cancellable module worker and freezes the scene after settling without reheating for changed counts', () => {
    render();
    const task = LayoutWorker.tasks[0];
    expect(task.options.type).toBe('module');
    expect(task.request.pairs).toHaveLength(120);
    const seed = positions();
    act(() => task.deliver(false));
    expect(positions()).not.toEqual(seed);
    act(() => task.deliver());
    expect(task.terminated).toBe(true);
    const stable = positions(),
      view = camera();
    render([...rows].reverse().map((pair) => ({ ...pair, commits: 8, share: 0.75 })));
    expect(LayoutWorker.tasks).toHaveLength(1);
    expect(positions()).toEqual(stable);
    expect(camera()).toBe(view);
  });
  it('stops drifting as soon as the user zooms, ignores queued replies, and anchors old nodes when more files arrive', () => {
    render();
    const first = LayoutWorker.tasks[0];
    act(() => first.deliver(false));
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    const stable = positions(),
      view = camera();
    expect(first.terminated).toBe(true);
    act(() => first.deliver());
    expect(positions()).toEqual(stable);
    expect(camera()).toBe(view);
    const next = [...rows, { first: 'hub.ts', second: 'added.ts', commits: 3, share: 0.3 }];
    render(next);
    const second = LayoutWorker.tasks[1];
    expect(second.request.anchors).toHaveLength(121);
    act(() => second.deliver());
    for (const position of stable) expect(positions()).toContainEqual(position);
    expect(camera()).toBe(view);
    expect(host.querySelectorAll('.analytics-coupling-edge')).toHaveLength(121);
  });
  it('terminates old jobs on topology changes and ignores old results after a new job completes', () => {
    render();
    const old = LayoutWorker.tasks[0];
    render([{ first: 'other/a.ts', second: 'other/b.ts', commits: 3, share: 0.4 }]);
    expect(old.terminated).toBe(true);
    act(() => LayoutWorker.tasks[1].deliver());
    const current = positions();
    act(() => old.deliver());
    expect(positions()).toEqual(current);
    expect(current.map(([path]) => path)).toEqual(['other/a.ts', 'other/b.ts']);
  });
  it('relaxes the entire initially loading graph before freezing positions for subsequent background additions', () => {
    render(rows.slice(0, 60), true);
    act(() => LayoutWorker.tasks[0].deliver());
    render(rows, true);
    expect(LayoutWorker.tasks[1].request.anchors).toHaveLength(0);
    act(() => LayoutWorker.tasks[1].deliver());
    render(rows, false);
    expect(LayoutWorker.tasks).toHaveLength(2);
    const stable = positions();
    render([...rows, { first: 'hub.ts', second: 'new.ts', commits: 3, share: 0.2 }], true);
    expect(LayoutWorker.tasks[2].request.anchors).toHaveLength(121);
    act(() => LayoutWorker.tasks[2].deliver());
    for (const position of stable) expect(positions()).toContainEqual(position);
  });
  it('respects reduced motion and cancels active calculations on unmount', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render();
    const task = LayoutWorker.tasks[0],
      seed = positions();
    act(() => task.deliver(false));
    expect(positions()).toEqual(seed);
    act(() => root.unmount());
    expect(task.terminated).toBe(true);
    root = createRoot(host);
  });
  it('retains the complete layout if worker creation is unavailable', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Worker unavailable');
        }
      },
    );
    render();
    expect(positions()).toHaveLength(121);
    expect(host.querySelector('.analytics-coupling-network')?.getAttribute('aria-busy')).toBe('false');
  });
});
