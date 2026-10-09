import { describe, expect, it } from 'vitest';
import { analyticsCouplingLayout, couplingLabelLayout, couplingPairKey } from '../analyticsCouplingLayout';

const pairs = [
  { first: 'src/api.ts', second: 'src/view.ts' },
  { first: 'src/api.ts', second: 'tests/api.test.ts' },
  { first: 'docs/guide.md', second: 'README.md' },
];

describe('file coupling layout', () => {
  it('uses one node per full path and counts distinct connections without modifying input', () => {
    const input = pairs.map((pair) => Object.freeze({ ...pair }));
    const nodes = analyticsCouplingLayout([...input, { first: 'src/view.ts', second: 'src/api.ts' }], 800, 450);
    expect(nodes).toHaveLength(5);
    expect(nodes.find((node) => node.path === 'src/api.ts')?.connections).toBe(2);
    expect(input).toEqual(pairs);
  });
  it('keeps positions deterministic across response ordering and changing counts', () => {
    const original = analyticsCouplingLayout(pairs, 800, 450);
    expect(analyticsCouplingLayout([...pairs].reverse(), 800, 450)).toEqual(original);
    const updated = pairs.map((pair) => ({ ...pair, commits: 99, share: 0.8 }));
    expect(analyticsCouplingLayout(updated, 800, 450)).toEqual(original);
  });
  it('keeps dense and disconnected networks within the available viewport at every size', () => {
    const dense = Array.from({ length: 50 }, (_, i) => ({ first: `src/file-${i}.ts`, second: `tests/file-${i}.ts` }));
    for (const [width, height] of [
      [1000, 650],
      [300, 340],
      [160, 140],
      [1, 1],
    ]) {
      const nodes = analyticsCouplingLayout(dense, width, height);
      expect(nodes).toHaveLength(100);
      for (const node of nodes) {
        expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x).toBeLessThanOrEqual(width);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeLessThanOrEqual(height);
      }
    }
  });
  it('distinguishes equal basenames and unusual paths with collision-free unordered pair keys', () => {
    const pair = { first: 'a/file "\n.ts', second: 'b/file "\n.ts' };
    expect(couplingPairKey(pair)).toBe(couplingPairKey({ first: pair.second, second: pair.first }));
    expect(couplingPairKey(pair)).not.toBe(couplingPairKey({ first: `${pair.first}\0${pair.second}`, second: '' }));
    expect(analyticsCouplingLayout([pair], 400, 300).map((node) => node.path)).toEqual([pair.first, pair.second]);
    expect(analyticsCouplingLayout([], 400, 300)).toEqual([]);
  });
  it('keeps relaxed clusters apart after fitting instead of piling files onto viewport edges', () => {
    const cluster = Array.from({ length: 15 }, (_, index) => ({ first: `file-${Math.floor(index / 5)}.ts`, second: `linked-${index}.ts` }));
    const nodes = analyticsCouplingLayout(cluster, 640, 414);
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        expect(Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)).toBeGreaterThan(40);
      }
    }
  });
  it('places readable labels inside the viewport without overlapping other labels or file targets', () => {
    const nodes = analyticsCouplingLayout(pairs, 600, 360);
    const labels = couplingLabelLayout(nodes, 600, 360);
    expect(labels.size).toBe(nodes.length);
    for (const [path, label] of labels) {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(600);
      expect(label.y).toBeGreaterThanOrEqual(0);
      expect(label.y + label.height).toBeLessThanOrEqual(360);
      for (const [otherPath, other] of labels) {
        if (otherPath === path) continue;
        expect(
          label.x >= other.x + other.width || label.x + label.width <= other.x || label.y >= other.y + other.height || label.y + label.height <= other.y,
        ).toBe(true);
      }
      for (const node of nodes) {
        expect(label.x >= node.x + 17 || label.x + label.width <= node.x - 17 || label.y >= node.y + 17 || label.y + label.height <= node.y - 17).toBe(true);
      }
    }
  });
});
