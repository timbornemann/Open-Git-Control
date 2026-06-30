import { describe, expect, it } from 'vitest';
import { buildGraphHighlightData } from '../../CommitGraph';
import { computeGraphLayout } from '../../../utils/graphLayout';
import type { GitCommit } from '../../../utils/gitParsing';

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

describe('buildGraphHighlightData', () => {
  const commits = [
    commit('merge02', ['main001', 'feature2'], ['HEAD -> main']),
    commit('main001', ['base000']),
    commit('feature2', ['feature1'], ['feature/demo']),
    commit('feature1', ['base000']),
    commit('base000', []),
  ];

  it('does not highlight a branch path by default', () => {
    const layout = computeGraphLayout(commits);
    const highlight = buildGraphHighlightData(layout, 'main', undefined, null);

    expect(highlight.currentPathHashes.size).toBe(0);
    expect(highlight.selectedPathHashes.size).toBe(0);
    expect(highlight.hasAnyPathHighlight).toBe(false);
  });

  it('highlights a manually selected branch path with its visible ancestry', () => {
    const layout = computeGraphLayout(commits);
    const highlight = buildGraphHighlightData(layout, 'main', undefined, 'feature/demo');

    expect(highlight.currentPathHashes).toEqual(new Set([
      'feature2',
      'feature1',
      'base000',
    ]));
    expect(highlight.selectedPathHashes.size).toBe(0);
  });

  it('uses the selected commit as the only focus and includes all visible ancestors', () => {
    const layout = computeGraphLayout(commits);
    const highlight = buildGraphHighlightData(layout, 'main', 'merge02', null);

    expect(highlight.currentPathHashes.size).toBe(0);
    expect(highlight.selectedPathHashes).toEqual(new Set([
      'merge02',
      'main001',
      'feature2',
      'feature1',
      'base000',
    ]));
  });

  it('marks merge edges as part of the selected ancestry highlight', () => {
    const layout = computeGraphLayout(commits);
    const highlight = buildGraphHighlightData(layout, 'main', 'merge02', null);
    const mergeEdge = layout.edges.find((edge) => edge.kind === 'merge' && edge.fromRow === 0);

    expect(mergeEdge).toBeDefined();
    expect(highlight.selectedPathEdgeKeys.has(`${mergeEdge!.fromRow}:${mergeEdge!.fromLane}->${mergeEdge!.toRow}:${mergeEdge!.toLane}:${mergeEdge!.kind}`)).toBe(true);
  });
});
