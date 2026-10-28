import { describe, expect, it } from 'vitest';
import { computeGraphLayout, computeGraphLayoutAsync, graphLayoutSeed } from '../graphLayout';
import { graphEdgePoints, laneX } from '@/components/commit-graph/commitGraphPaths';
import { githubMergeHistory, MERGED_MAIN_HASHES } from './graphMergeFixture';

describe('main-line continuity across GitHub merges and pull', () => {
  it.each([
    ['main', false],
    ['main', true],
    ['master', false],
    ['master', true],
  ] as const)('keeps the %s first-parent line straight (pulled: %s)', (branch, pulled) => {
    const rows = githubMergeHistory(pulled).map((commit) => ({ ...commit, refs: commit.refs.map((ref) => ref.replace(/main/g, branch)) }));
    const graph = computeGraphLayout(rows);
    const main = graph.nodes.filter((node) => MERGED_MAIN_HASHES.includes(node.commit.hash));
    expect(main.map((node) => node.lane)).toEqual(main.map(() => 0));
    expect(new Set(main.map((node) => node.color)).size).toBe(1);
    expect(graph.maxLane).toBe(1);
    for (const node of main.filter((node) => node.commit.parentHashes.length)) {
      const edge = graph.edges.find((edge) => edge.fromRow === node.row && edge.kind === 'primary')!;
      expect(graphEdgePoints(edge, 0, graph.nodes.length * 44).every(([x]) => x === laneX(0))).toBe(true);
    }
    expect(graph.edges.filter((edge) => edge.kind === 'merge')).toHaveLength(4);
  });

  it('discards old lane positions when pull moves main on otherwise unchanged commit rows', () => {
    const before = computeGraphLayout(githubMergeHistory());
    const after = githubMergeHistory(true);
    expect(after.map((commit) => commit.hash)).toEqual(before.nodes.map((node) => node.commit.hash));
    expect(graphLayoutSeed(after, before)).toBeUndefined();
    expect(computeGraphLayout(after, graphLayoutSeed(after, before))).toEqual(computeGraphLayout(after));
  });

  it('keeps valid lane positions when a merged feature ref is deleted or tags are changed', () => {
    const rows = githubMergeHistory(true);
    const before = computeGraphLayout(rows);
    const decorated = rows.map((commit) => ({ ...commit, refs: commit.refs.filter((ref) => ref !== 'test').concat('tag: release') }));
    const seed = graphLayoutSeed(decorated, before);
    expect(seed).toBeDefined();
    expect(computeGraphLayout(decorated, seed).nodes.map((node) => node.lane)).toEqual(before.nodes.map((node) => node.lane));
  });

  it('does not replace the local main line with a diverged remote or a second-parent ancestry', () => {
    const rows = githubMergeHistory();
    rows[0].parentHashes = ['176e33b', 'f0416b1'];
    rows[1].parentHashes = ['0388e63'];
    const graph = computeGraphLayout(rows);
    expect(graph.nodes.find((node) => node.commit.hash === 'f0416b1')?.lane).toBe(0);
    expect(graph.nodes[0].lane).toBeGreaterThan(0);
    expect(graph.edges.find((edge) => edge.fromRow === 0 && edge.parentHash === 'f0416b1')?.kind).toBe('merge');
  });

  it('does not follow an unrelated master ref when main is the chosen primary branch', () => {
    const rows = githubMergeHistory();
    rows[0].refs = ['origin/master'];
    expect(computeGraphLayout(rows).nodes[0].lane).toBeGreaterThan(0);
  });

  it('rebuilds a fallback HEAD line when checkout moves HEAD between existing rows', () => {
    const rows = githubMergeHistory().map((commit) => ({ ...commit, refs: commit.refs.includes('HEAD -> main') ? ['HEAD -> topic'] : [] }));
    const before = computeGraphLayout(rows);
    rows[0] = { ...rows[0], refs: ['HEAD -> topic'] };
    rows[2] = { ...rows[2], refs: [] };
    expect(graphLayoutSeed(rows, before)).toBeUndefined();
  });

  it('uses the same primary line in the cooperative worker fallback', async () => {
    const rows = githubMergeHistory();
    const graph = await computeGraphLayoutAsync(rows);
    expect(graph).toEqual(computeGraphLayout(rows));
    expect(graph.nodes[0].lane).toBe(0);
  });

  it('terminates when a damaged remote history cycles without reaching local main', () => {
    const rows = githubMergeHistory();
    rows[0].parentHashes = ['176e33b'];
    rows[1].parentHashes = ['489f3c9'];
    expect(computeGraphLayout(rows).nodes.find((node) => node.commit.hash === 'f0416b1')?.lane).toBe(0);
  });
});
