import { describe, expect, it } from 'vitest';
import { computeGraphLayout, graphLayoutSeed, type GraphLayout } from '../graphLayout';
import type { GitCommit } from '../gitParsing';
import { graphEdgePoints, laneX } from '@/components/commit-graph/commitGraphPaths';

const commit = (hash: string, parentHashes: string[] = [], refs: string[] = []): GitCommit => ({
  hash,
  abbrevHash: hash,
  author: 'Test',
  date: '',
  subject: hash,
  parentHashes,
  refs,
  stats: null,
  statsState: 'missing',
});

function verify(layout: GraphLayout) {
  for (const edge of layout.edges) {
    const points = graphEdgePoints(edge, 0, layout.nodes.length * 44);
    for (const node of layout.nodes) {
      if (node.row === edge.fromRow || node.row === edge.toRow) continue;
      const x = laneX(node.lane),
        y = node.row * 44 + 22;
      for (let i = 1; i < points.length; i++) {
        const [px, py] = points[i - 1],
          [nx, ny] = points[i];
        const hits =
          px === nx ? px === x && y >= Math.min(py, ny) && y <= Math.max(py, ny) : py === ny && py === y && x >= Math.min(px, nx) && x <= Math.max(px, nx);
        if (hits) throw new Error(`${layout.nodes[edge.fromRow].commit.hash} -> ${edge.parentHash} through ${node.commit.hash}`);
      }
    }
    const parent = layout.nodes.find((node) => node.commit.hash === edge.parentHash);
    if (parent) expect([edge.toRow, edge.toLane]).toEqual([parent.row, parent.lane]);
  }
}

describe('commit graph route clearance and page stability', () => {
  it('routes criss-cross merges around unrelated commits', () => {
    const graph = computeGraphLayout([
      commit('left-merge', ['left', 'right'], ['HEAD -> main']),
      commit('right-merge', ['right', 'left'], ['origin/other']),
      commit('left', ['base']),
      commit('right', ['base']),
      commit('base'),
    ]);
    expect(graph.edges).toHaveLength(6);
    verify(graph);
  });

  it('keeps shortcuts to an older ancestor clear even when both endpoints use lane zero', () => {
    const graph = computeGraphLayout([commit('merge', ['middle', 'root'], ['HEAD -> main']), commit('middle', ['root']), commit('root')]);
    const shortcut = graph.edges.find((edge) => edge.kind === 'merge')!;
    expect(shortcut.viaLane).toBeGreaterThan(0);
    verify(graph);
  });

  it('gives unloaded merge parents separate continuing tracks and joins shared missing parents', () => {
    const graph = computeGraphLayout([commit('merge', ['a', 'b', 'c'], ['HEAD -> main']), commit('other', ['b'])]);
    const parents = graph.edges.filter((edge) => edge.fromRow === 0);
    expect(parents.every((edge) => edge.kind === 'truncated')).toBe(true);
    expect(new Set(parents.map((edge) => edge.toLane)).size).toBe(3);
    expect(graph.edges.find((edge) => edge.fromRow === 1)?.toLane).toBe(parents.find((edge) => edge.parentHash === 'b')?.toLane);
    expect(graph.maxLane).toBeGreaterThanOrEqual(Math.max(...parents.map((edge) => edge.toLane)));
    verify(graph);
  });

  it('preserves node lanes and colors when the real trunk is loaded on a later page', () => {
    const rows = [commit('remote-a', ['remote-b'], ['origin/topic']), commit('remote-b', ['base']), commit('main', ['base'], ['HEAD -> main']), commit('base')];
    const before = computeGraphLayout(rows.slice(0, 2));
    const after = computeGraphLayout(rows, graphLayoutSeed(rows, before));
    expect(after.nodes.slice(0, 2).map(({ lane, color }) => [lane, color])).toEqual(before.nodes.map(({ lane, color }) => [lane, color]));
    verify(after);
  });

  it('rejects seeds for reordered or rewritten history', () => {
    const before = computeGraphLayout([commit('a', ['b']), commit('b')]);
    expect(graphLayoutSeed([commit('b'), commit('a', ['b']), commit('c')], before)).toBeUndefined();
    expect(graphLayoutSeed([commit('a', ['c']), commit('b'), commit('c')], before)).toBeUndefined();
  });

  it('keeps every parent and avoids node crossings across deterministic DAGs and page boundaries', () => {
    let state = 1234567;
    const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let round = 0; round < 100; round++) {
      const rows = Array.from({ length: 35 }, (_, row) => {
        const parents = new Set<string>();
        if (row < 34) for (let i = 0; i < 3; i++) if (!i || random() < 0.25) parents.add(String(row + 1 + Math.floor(random() * (34 - row))));
        return commit(String(row), [...parents], row === 28 ? ['HEAD -> main'] : []);
      });
      const before = computeGraphLayout(rows.slice(0, 15));
      const after = computeGraphLayout(rows, graphLayoutSeed(rows, before));
      expect(after.edges.length).toBe(rows.reduce((sum, row) => sum + row.parentHashes.length, 0));
      expect(after.nodes.slice(0, 15).map((node) => node.lane)).toEqual(before.nodes.map((node) => node.lane));
      verify(before);
      verify(after);
    }
  });
});
