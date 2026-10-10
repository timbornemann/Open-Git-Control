// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileTimelineViewport } from './useFileTimelineViewport';
import type { FileTimelineDimensions, FileTimelineLayoutNode } from './types';
import { clearTimelineSessions } from './fileTimelineSession';

let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearTimelineSessions();
  frames = new Map();
  let serial = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++serial, callback);
      return serial;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  );
});
const flushFrame = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });

const dimensions: FileTimelineDimensions = { width: 800, height: 600 };
const wideTimelineNodes: FileTimelineLayoutNode[] = [
  {
    name: 'root',
    path: '',
    type: 'folder',
    status: 'unchanged',
    x: 60,
    y: 0,
    width: 1,
    children: [],
    hasChildren: true,
    isCollapsed: false,
  },
  {
    name: 'nested-file',
    path: 'nested-file',
    type: 'file',
    status: 'unchanged',
    x: 6000,
    y: 0,
    width: 1,
    children: [],
    hasChildren: false,
    isCollapsed: false,
  },
];

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('useFileTimelineViewport zoom limits', () => {
  it('allows zooming back out to the initial full-graph view when it is below 15%', () => {
    let timeline: ReturnType<typeof useFileTimelineViewport> | null = null;
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      timeline = useFileTimelineViewport(wideTimelineNodes, dimensions, 'C:/wide-repository');
      return null;
    };

    act(() => root.render(createElement(Harness)));

    const fullGraphScale = timeline!.viewport.scale;
    expect(fullGraphScale).toBeLessThan(0.15);

    act(() => timeline!.zoomFromCenter(1.25));
    flushFrame();
    expect(timeline!.viewport.scale).toBeGreaterThan(fullGraphScale);

    act(() => timeline!.zoomFromCenter(0.8));
    flushFrame();
    expect(timeline!.viewport.scale).toBeCloseTo(fullGraphScale);

    act(() => timeline!.zoomAt(400, 300, 0.01));
    flushFrame();
    expect(timeline!.viewport.scale).toBeCloseTo(fullGraphScale);

    act(() => root.unmount());
  });
  it('coalesces a burst of camera input into one frame without losing zoom or pan changes and restores the camera on reopening', () => {
    let current!: ReturnType<typeof useFileTimelineViewport>;
    const host = document.createElement('div');
    const root = createRoot(host);
    const Harness = () => {
      current = useFileTimelineViewport(wideTimelineNodes, dimensions, 'camera-session');
      return null;
    };
    act(() => root.render(createElement(Harness)));
    const initial = current.viewport;
    act(() => {
      for (let index = 0; index < 20; index++) {
        current.zoomFromCenter(1.01);
        current.setViewport((camera) => ({ ...camera, translateY: camera.translateY + 2 }));
      }
    });
    expect(frames.size).toBe(1);
    expect(current.viewport).toBe(initial);
    expect(current.viewportRef.current.scale).toBeCloseTo(initial.scale * 1.01 ** 20);
    const expected = current.viewportRef.current;
    flushFrame();
    expect(current.viewport).toEqual(expected);
    act(() => root.render(null));
    act(() => root.render(createElement(Harness)));
    expect(current.viewport).toEqual(expected);
    act(() => {
      current.zoomFromCenter(1.2);
      root.unmount();
    });
    expect(frames.size).toBe(0);
  });
});
