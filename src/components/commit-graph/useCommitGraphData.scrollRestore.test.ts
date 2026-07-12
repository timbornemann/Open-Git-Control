// @vitest-environment jsdom

import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { useCommitGraphData } from './useCommitGraphData';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useCommitGraphData scroll restoration scheduling', () => {
  it('does not write scrollTop in the graph layout commit and restores it in a deferred frame', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue({ success: true, data: { raw: '', stats: {}, hasMore: false } });
    vi.spyOn(gitClient, 'onCommitStats').mockReturnValue(vi.fn());
    const scrollWrites: number[] = [];
    const refreshWorkingTree = vi.fn().mockResolvedValue(undefined);
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      const logContainerRef = useRef<HTMLDivElement>(null);
      useCommitGraphData({
        repoPath: 'C:/repo',
        showSecondaryHistory: true,
        logContainerRef,
        externalWorkingTreeStatus: null,
        onRefreshWorkingTree: refreshWorkingTree,
      });
      return createElement(
        'div',
        {
          ref: (element: HTMLDivElement | null) => {
            if (!element || Object.prototype.hasOwnProperty.call(element, 'scrollTop')) return;
            Object.defineProperty(element, 'scrollTop', {
              configurable: true,
              get: () => 12,
              set: (value: number) => {
                scrollWrites.push(value);
              },
            });
          },
        },
        createElement('div', { ref: logContainerRef }),
      );
    };

    await act(async () => {
      root.render(createElement(Harness));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(scrollWrites).toEqual([]);
    expect(frames.size).toBe(1);
    act(() => [...frames.values()][0]?.(performance.now()));
    expect(scrollWrites).toEqual([0]);
    act(() => root.unmount());
  });
});
