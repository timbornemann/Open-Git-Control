import { describe, expect, it, vi } from 'vitest';
import { renderFileTimelineCanvas } from './fileTimelineRenderer';
import { findTimelineNodeAtPoint } from './fileTimelineHitTesting';
import { FileTimelineSpatialIndex } from './fileTimelineSpatialIndex';
import type { FileTimelineLayoutNode } from './types';

const node = (x: number, y: number): FileTimelineLayoutNode => ({
  name: `file-${y}.ts`,
  path: `src/file-${y}.ts`,
  x,
  y,
  type: 'file',
  status: 'unchanged',
  width: 1,
  children: [],
  hasChildren: false,
  isCollapsed: false,
});
function context() {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    bezierCurveTo: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
  };
}
describe('timeline rendering workload', () => {
  it.each([0.1, 0.001, 0.000001])('bounds grid work by screen area at zoom %s instead of the world extent', (scale) => {
    const ctx = context();
    renderFileTimelineCanvas({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dimensions: { width: 800, height: 600 },
      viewport: { scale, translateX: -12000, translateY: 4000 },
      nodes: [],
      devicePixelRatio: 2,
    });
    expect(ctx.arc.mock.calls.length).toBeLessThanOrEqual(Math.ceil(800 / 32) * Math.ceil(600 / 32));
    expect(ctx.fill.mock.calls.length).toBeLessThanOrEqual(6);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
  it('draws only visible nodes of a large tree and retains edges crossing the viewport', () => {
    const nodes = Array.from({ length: 10000 }, (_, index) => node(100, index * 40));
    const parent = node(-1000, 200);
    const child = node(2000, 200);
    parent.children = [child];
    nodes.push(parent, child);
    const ctx = context();
    renderFileTimelineCanvas({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dimensions: { width: 800, height: 600 },
      viewport: { scale: 1, translateX: 0, translateY: 0 },
      nodes,
      spatialIndex: new FileTimelineSpatialIndex(nodes),
      devicePixelRatio: 1,
    });
    expect(ctx.fillText.mock.calls.length).toBeLessThan(30);
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(1);
  });
  it('coalesces overlapping overview dots and links in a twenty-thousand-file tree', () => {
    const nodes = Array.from({ length: 20000 }, (_, index) => node(40000, index * 24));
    const parent = node(1000, 240000);
    parent.children = nodes;
    const ctx = context();
    renderFileTimelineCanvas({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      dimensions: { width: 800, height: 600 },
      viewport: { scale: 0.001, translateX: 20, translateY: 20 },
      nodes: [parent, ...nodes],
      devicePixelRatio: 1,
    });
    expect(ctx.arc.mock.calls.length).toBeLessThan(1000);
    expect(ctx.bezierCurveTo.mock.calls.length).toBeLessThan(300);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
  it('hit-tests indexed nearby rows with the same label font as the renderer', () => {
    const nodes = Array.from({ length: 10000 }, (_, index) => node(100, index * 40));
    const ctx = context();
    const target = nodes[5000];
    const selected = findTimelineNodeAtPoint({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      mouseX: 160,
      mouseY: target.y,
      viewport: { scale: 1, translateX: 0, translateY: 0 },
      nodes,
      spatialIndex: new FileTimelineSpatialIndex(nodes),
    });
    expect(selected).toBe(target);
    expect(ctx.measureText).toHaveBeenCalledTimes(1);
    expect((ctx as unknown as CanvasRenderingContext2D).font).toBe('bold 13px Inter, sans-serif');
  });
});
