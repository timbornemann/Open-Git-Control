import { describe, expect, it } from 'vitest';
import { buildCouplingScene } from '../analyticsCouplingScene';
import { fitCouplingCamera, zoomCouplingCamera } from '../useCouplingViewport';

const pairs = (count: number) => Array.from({ length: count }, (_, i) => ({ first: 'hub.ts', second: `file-${i}.ts` }));
describe('unbounded coupling scene and camera', () => {
  it('retains every edge endpoint in large graphs without a force-layout or file-count cap', () => {
    const scene = buildCouplingScene(pairs(2000));
    expect(scene.nodes).toHaveLength(2001);
    expect(scene.nodes.find((node) => node.path === 'hub.ts')?.connections).toBe(2000);
    expect(new Set(scene.nodes.map((node) => `${node.x},${node.y}`)).size).toBe(2001);
    expect(scene.nodes.every((node) => node.x >= 0 && node.x <= scene.width && node.y >= 0 && node.y <= scene.height)).toBe(true);
  });
  it('preserves existing positions when batches add peers, when edges change, and when rows reorder', () => {
    const initial = buildCouplingScene(pairs(80));
    const extended = buildCouplingScene(pairs(450), initial);
    for (const node of initial.nodes) expect(extended.nodes.find((value) => value.path === node.path)).toMatchObject({ x: node.x, y: node.y });
    const updated = buildCouplingScene([...pairs(450)].reverse().slice(0, 400), extended);
    expect(updated.nodes).toHaveLength(401);
    for (const node of updated.nodes) expect(extended.nodes.find((value) => value.path === node.path)).toMatchObject({ x: node.x, y: node.y });
    expect(initial.nodes.find((node) => node.path === 'hub.ts')?.connections).toBe(80);
    expect(extended.nodes.find((node) => node.path === 'hub.ts')?.connections).toBe(450);
  });
  it('fits the complete scene in narrow viewports, even when its required scale is below normal zoom limits', () => {
    const scene = { nodes: [], width: 100000, height: 60000 };
    for (const [width, height] of [
      [350, 340],
      [800, 500],
      [140, 100],
    ]) {
      const camera = fitCouplingCamera(scene, width, height);
      expect(camera.scale).toBeGreaterThan(0);
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.x + scene.width * camera.scale).toBeLessThanOrEqual(width);
      expect(camera.y + scene.height * camera.scale).toBeLessThanOrEqual(height);
    }
  });
  it('zooms around the pointer without changing the world point underneath it', () => {
    const camera = { x: -30, y: 80, scale: 0.5 },
      point = { x: 220, y: 150 };
    const zoomed = zoomCouplingCamera(camera, 1.6, point, 0.01);
    expect(zoomed.scale).toBeCloseTo(0.8);
    expect((point.x - zoomed.x) / zoomed.scale).toBeCloseTo((point.x - camera.x) / camera.scale);
    expect((point.y - zoomed.y) / zoomed.scale).toBeCloseTo((point.y - camera.y) / camera.scale);
    expect(zoomCouplingCamera(camera, 1000, point, 0.01).scale).toBe(8);
  });
});
