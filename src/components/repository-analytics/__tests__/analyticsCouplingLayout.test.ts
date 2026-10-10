import { describe, expect, it } from 'vitest';
import { buildCouplingScene, type CouplingPair } from '../analyticsCouplingGeometry';
import { relaxCouplingScene } from '../analyticsCouplingForce';
import { couplingLabelLayout, couplingPairKey } from '../analyticsCouplingLayout';

const pairs = [
  { first: 'src/api.ts', second: 'src/view.ts' },
  { first: 'src/api.ts', second: 'tests/api.test.ts' },
  { first: 'docs/guide.md', second: 'README.md' },
];
const fan = (length: number): CouplingPair[] =>
  Array.from({ length }, (_, index) => ({ first: 'hub.ts', second: `src/peer-${String(index).padStart(4, '0')}.ts` }));
describe('organic coupling layout', () => {
  it('deduplicates paths and links, does not mutate input, and is deterministic regardless of ordering and metrics', () => {
    const input = pairs.map((pair) => Object.freeze({ ...pair }));
    const value = relaxCouplingScene(input);
    expect(value.nodes).toHaveLength(5);
    expect(value.nodes.find((node) => node.path === 'src/api.ts')?.connections).toBe(2);
    expect(relaxCouplingScene([...input].reverse())).toEqual(value);
    expect(relaxCouplingScene([...input, { first: 'src/view.ts', second: 'src/api.ts' }])).toEqual(value);
    expect(relaxCouplingScene(input.map((pair) => ({ ...pair, commits: 90, share: 0.8 })))).toEqual(value);
    expect(input).toEqual(pairs);
  });
  it('spreads thousands of files into a cloud instead of an edge row or a rigid grid', () => {
    const rows = fan(1200);
    const scene = relaxCouplingScene(rows);
    expect(scene.nodes).toHaveLength(1201);
    expect(scene.width / scene.height).toBeGreaterThan(0.5);
    expect(scene.width / scene.height).toBeLessThan(2);
    const hub = scene.nodes.find((node) => node.path === 'hub.ts')!;
    const quadrants = new Set(scene.nodes.filter((node) => node !== hub).map((node) => `${node.x > hub.x},${node.y > hub.y}`));
    expect(quadrants.size).toBe(4);
    expect(new Set(scene.nodes.map((node) => Math.round(node.y / 20))).size).toBeGreaterThan(30);
    expect(scene.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  }, 30000);
  it('keeps old files anchored while hundreds of newly loaded partners settle on every side', () => {
    const old = relaxCouplingScene(fan(90));
    const rows = fan(600);
    const seed = buildCouplingScene(rows, old);
    const value = relaxCouplingScene(rows, seed, old.nodes);
    for (const node of old.nodes) expect(value.nodes.find((next) => next.path === node.path)).toMatchObject({ x: node.x, y: node.y });
    const added = value.nodes.filter((node) => !old.nodes.some((previous) => previous.path === node.path));
    expect(new Set(added.map((node) => Math.round(node.y / 20))).size).toBeGreaterThan(25);
    expect(value.width / value.height).toBeLessThan(2);
    expect(value.nodes).toHaveLength(601);
  }, 30000);
  it('separates connected file groups and prevents overlapping file targets', () => {
    const links: CouplingPair[] = [];
    for (let group = 0; group < 4; group++)
      for (let index = 0; index < 18; index++) links.push({ first: `module-${group}/index.ts`, second: `module-${group}/file-${index}.ts` });
    for (let group = 0; group < 3; group++) links.push({ first: `module-${group}/index.ts`, second: `module-${group + 1}/index.ts` });
    const scene = relaxCouplingScene(links);
    for (let a = 0; a < scene.nodes.length; a++)
      for (let b = a + 1; b < scene.nodes.length; b++)
        expect(Math.hypot(scene.nodes[a].x - scene.nodes[b].x, scene.nodes[a].y - scene.nodes[b].y)).toBeGreaterThan(42);
    const centers = Array.from({ length: 4 }, (_, group) => scene.nodes.find((node) => node.path === `module-${group}/index.ts`)!);
    for (const center of centers) {
      const own = scene.nodes.filter((node) => node.path.startsWith(center.path.split('/')[0] + '/') && node !== center);
      expect(own.reduce((sum, node) => sum + Math.hypot(node.x - center.x, node.y - center.y), 0) / own.length).toBeLessThan(400);
    }
  });
  it('handles disconnected groups and unusual full paths without omitting any file', () => {
    const rows = Array.from({ length: 220 }, (_, index) => ({ first: `dir ${index}/same \"\n.ts`, second: `tests ${index}/same \"\n.ts` }));
    const scene = relaxCouplingScene(rows);
    expect(scene.nodes).toHaveLength(440);
    expect(scene.width / scene.height).toBeLessThan(2);
    expect(scene.width / scene.height).toBeGreaterThan(0.5);
    const pair = rows[0];
    expect(couplingPairKey(pair)).toBe(couplingPairKey({ first: pair.second, second: pair.first }));
    expect(couplingPairKey(pair)).not.toBe(couplingPairKey({ first: `${pair.first}\0${pair.second}`, second: '' }));
    expect(relaxCouplingScene([]).nodes).toEqual([]);
  });
});

describe('coupling screen labels', () => {
  it('keeps screen-sized labels readable and avoids overlaps with labels and file dots', () => {
    const nodes = [
      { path: 'one.ts', x: 80, y: 60, connections: 3 },
      { path: 'two.ts', x: 300, y: 120, connections: 2 },
      { path: 'three.ts', x: 200, y: 230, connections: 1 },
    ];
    const labels = couplingLabelLayout(nodes, 600, 360);
    expect(labels.size).toBe(nodes.length);
    for (const [path, label] of labels) {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(600);
      expect(label.y).toBeGreaterThanOrEqual(0);
      expect(label.y + label.height).toBeLessThanOrEqual(360);
      for (const [otherPath, other] of labels)
        if (otherPath !== path)
          expect(
            label.x >= other.x + other.width || label.x + label.width <= other.x || label.y >= other.y + other.height || label.y + label.height <= other.y,
          ).toBe(true);
      for (const node of nodes)
        expect(label.x >= node.x + 13 || label.x + label.width <= node.x - 13 || label.y >= node.y + 13 || label.y + label.height <= node.y - 13).toBe(true);
    }
  });
  it('limits clutter while ensuring the hovered or selected file gets an on-screen label', () => {
    const nodes = Array.from({ length: 500 }, (_, index) => ({
      path: `file-${index}.ts`,
      x: (index % 25) * 15,
      y: Math.floor(index / 25) * 15,
      connections: index,
    }));
    const labels = couplingLabelLayout(nodes, 400, 300, ['file-0.ts'], 20);
    expect(labels.size).toBeLessThanOrEqual(20);
    expect(labels.has('file-0.ts')).toBe(true);
    expect(labels.get('file-0.ts')!.x).toBeGreaterThanOrEqual(0);
    expect(labels.get('file-0.ts')!.y).toBeGreaterThanOrEqual(0);
  });
  it('keeps selected pair labels apart even inside a dense cloud at a distant zoom', () => {
    const nodes = Array.from({ length: 120 }, (_, index) => ({
      path: `file-${index}.ts`,
      x: 240 + (index % 12) * 3,
      y: 140 + Math.floor(index / 12) * 3,
      connections: 1,
    }));
    const labels = couplingLabelLayout(nodes, 600, 360, ['file-0.ts', 'file-1.ts'], 2);
    const first = labels.get('file-0.ts')!,
      second = labels.get('file-1.ts')!;
    expect(
      first.x >= second.x + second.width || first.x + first.width <= second.x || first.y >= second.y + second.height || first.y + first.height <= second.y,
    ).toBe(true);
  });
});
