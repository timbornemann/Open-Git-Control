import { describe, expect, it } from 'vitest';
import { buildGraphHighlightData, findCommitIndexByNavigationTarget } from '..';
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
    commit('tip9999', ['merge02'], ['HEAD -> main']),
    commit('merge02', ['main001', 'feature2']),
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

  it('does not expand the selected path when the selected commit is the head commit', () => {
    const layout = computeGraphLayout(commits);
    const highlight = buildGraphHighlightData(layout, 'main', 'tip9999', null);

    expect(highlight.currentPathHashes.size).toBe(0);
    expect(highlight.selectedPathHashes.size).toBe(0);
    expect(highlight.hasAnyPathHighlight).toBe(false);
  });

  it('marks merge edges as part of the selected ancestry highlight', () => {
    const layout = computeGraphLayout(commits);
    const highlight = buildGraphHighlightData(layout, 'main', 'merge02', null);
    const mergeNode = layout.nodes.find((node) => node.commit.hash === 'merge02');
    const mergeEdge = layout.edges.find((edge) => edge.kind === 'merge' && edge.fromRow === mergeNode?.row);

    expect(mergeEdge).toBeDefined();
    expect(highlight.selectedPathEdgeKeys.has(`${mergeEdge!.fromRow}:${mergeEdge!.fromLane}->${mergeEdge!.toRow}:${mergeEdge!.toLane}:${mergeEdge!.kind}`)).toBe(true);
  });
});

describe('findCommitIndexByNavigationTarget', () => {
  it('finds commits by full or unique abbreviated hash', () => {
    const layout = computeGraphLayout([
      commit('abcdef1234567890'),
      commit('1234567890abcdef'),
    ]);

    expect(findCommitIndexByNavigationTarget(layout.nodes, 'abcdef1234567890')).toBe(0);
    expect(findCommitIndexByNavigationTarget(layout.nodes, 'abcdef1')).toBe(0);
  });

  it('does not navigate abbreviated hashes when the target is ambiguous', () => {
    const layout = computeGraphLayout([
      commit('abcdef1234567890'),
      commit('abcdef1987654320'),
    ]);

    expect(findCommitIndexByNavigationTarget(layout.nodes, 'abcdef1')).toBe(-1);
    expect(findCommitIndexByNavigationTarget(layout.nodes, 'abcdef12')).toBe(0);
  });
});
