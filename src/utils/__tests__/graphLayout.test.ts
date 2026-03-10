import { describe, expect, it } from 'vitest';
import { computeGraphLayout } from '../graphLayout';
import type { GitCommit } from '../gitParsing';

function commit(hash: string, parentHashes: string[] = [], refs: string[] = []): GitCommit {
  return {
    hash,
    abbrevHash: hash.slice(0, 7),
    author: 'tester',
    date: '2026-03-10 00:00:00 +0000',
    subject: hash,
    parentHashes,
    refs,
    stats: {
      files: 0,
      additions: 0,
      deletions: 0,
    },
  };
}

describe('computeGraphLayout', () => {
  it('returns an empty graph for no commits', () => {
    expect(computeGraphLayout([])).toEqual({ nodes: [], edges: [], maxLane: 0 });
  });

  it('keeps first-parent trunk on lane 0', () => {
    const commits = [
      commit('aaaaaaa', ['bbbbbbb'], ['HEAD -> main']),
      commit('bbbbbbb', ['ccccccc']),
      commit('ccccccc', []),
    ];

    const graph = computeGraphLayout(commits);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.map(node => node.lane)).toEqual([0, 0, 0]);
    expect(graph.edges).toEqual([
      {
        fromRow: 0,
        fromLane: 0,
        toRow: 1,
        toLane: 0,
        color: graph.nodes[0].color,
        kind: 'primary',
      },
      {
        fromRow: 1,
        fromLane: 0,
        toRow: 2,
        toLane: 0,
        color: graph.nodes[1].color,
        kind: 'primary',
      },
    ]);
    expect(graph.maxLane).toBe(0);
  });

  it('builds merge edges and side lanes for non-trunk parents', () => {
    const commits = [
      commit('aaaaaaa', ['bbbbbbb', 'ccccccc'], ['HEAD -> main']),
      commit('bbbbbbb', ['ddddddd']),
      commit('ccccccc', ['ddddddd']),
      commit('ddddddd', []),
    ];

    const graph = computeGraphLayout(commits);
    const nodeByHash = new Map(graph.nodes.map(node => [node.commit.hash, node]));

    expect(nodeByHash.get('aaaaaaa')?.isMerge).toBe(true);
    expect(nodeByHash.get('bbbbbbb')?.lane).toBe(0);
    expect((nodeByHash.get('ccccccc')?.lane ?? 0)).toBeGreaterThan(0);

    const mergeEdge = graph.edges.find(edge => edge.fromRow === 0 && edge.kind === 'merge');
    expect(mergeEdge).toBeDefined();
    expect(mergeEdge?.toRow).toBe(2);
  });

  it('creates truncated edges when parent commits are not visible', () => {
    const commits = [
      commit('aaaaaaa', ['missing-parent'], ['HEAD']),
      commit('bbbbbbb', []),
    ];

    const graph = computeGraphLayout(commits);
    const truncated = graph.edges.find(edge => edge.kind === 'truncated');

    expect(truncated).toBeDefined();
    expect(truncated).toMatchObject({
      fromRow: 0,
      toRow: commits.length,
    });
  });

  it('falls back to first commit as head when explicit HEAD ref is absent', () => {
    const commits = [
      commit('aaaaaaa', ['bbbbbbb']),
      commit('bbbbbbb', ['ccccccc']),
      commit('ccccccc', []),
    ];

    const graph = computeGraphLayout(commits);

    expect(graph.nodes.map(node => node.lane)).toEqual([0, 0, 0]);
  });

  it('reuses a recently freed middle lane when no better lane exists', () => {
    const commits = [
      commit('head001', ['trunk01', 'side01', 'side02'], ['HEAD -> main']),
      commit('side01', []),
      commit('orphan1', []),
      commit('trunk01', []),
      commit('side02', []),
    ];

    const graph = computeGraphLayout(commits);
    const sideOne = graph.nodes.find(node => node.commit.hash === 'side01');
    const orphan = graph.nodes.find(node => node.commit.hash === 'orphan1');

    expect(sideOne?.lane).toBe(1);
    expect(orphan?.lane).toBe(1);
  });

  it('handles duplicate parent hashes without duplicating lane reservations', () => {
    const commits = [
      commit('aaaaaaa', ['bbbbbbb', 'bbbbbbb'], ['HEAD -> main']),
      commit('bbbbbbb', []),
    ];

    const graph = computeGraphLayout(commits);
    expect(graph.nodes.map(node => node.lane)).toEqual([0, 0]);

    const parentEdges = graph.edges.filter(edge => edge.toRow === 1);
    expect(parentEdges).toHaveLength(2);
    expect(parentEdges.map(edge => edge.kind).sort()).toEqual(['merge', 'primary']);
  });
});