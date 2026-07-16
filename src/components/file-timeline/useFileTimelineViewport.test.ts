// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useFileTimelineViewport } from './useFileTimelineViewport';
import type { FileTimelineDimensions, FileTimelineLayoutNode } from './types';

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
    expect(timeline!.viewport.scale).toBeGreaterThan(fullGraphScale);

    act(() => timeline!.zoomFromCenter(0.8));
    expect(timeline!.viewport.scale).toBeCloseTo(fullGraphScale);

    act(() => timeline!.zoomAt(400, 300, 0.01));
    expect(timeline!.viewport.scale).toBeCloseTo(fullGraphScale);

    act(() => root.unmount());
  });
});
