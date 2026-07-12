// @vitest-environment jsdom

import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GraphLayout } from '@/utils/graphLayout';
import { useCommitGraphViewport } from './useCommitGraphViewport';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useCommitGraphViewport initial measurement', () => {
  it('accepts ResizeObserver height without a synchronous clientHeight read', () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    let observedElement: Element | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(target: Element) {
          observedElement = target;
        }
        disconnect() {}
      },
    );
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
    const layout: GraphLayout = { nodes: [], edges: [], maxLane: 0 };
    let viewport: ReturnType<typeof useCommitGraphViewport> | null = null;
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      const logContainerRef = useRef<HTMLDivElement>(null);
      viewport = useCommitGraphViewport({
        logContainerRef,
        layout,
        repoPath: 'C:/repo',
        workingTreeStatus: null,
        hasMoreCommits: false,
        loadingMore: false,
        loading: false,
        loadMoreCommits: vi.fn().mockResolvedValue(undefined),
      });
      return createElement('div', null, createElement('div', { ref: logContainerRef }));
    };

    act(() => root.render(createElement(Harness)));
    expect(clientHeight).not.toHaveBeenCalled();
    act(() => {
      resizeCallback?.([{ target: observedElement!, contentRect: { height: 640 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    expect(viewport!.containerHeight).toBe(640);
    act(() => root.unmount());
  });
});
