import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommitGraphSvg } from './CommitGraphSvg';
import { computeGraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { buildGraphHighlightData } from './commitGraphRefs';
import { laneX } from './commitGraphPaths';

const commit = (hash: string, parents: string[] = [], refs: string[] = []): GitCommit => ({
  hash,
  abbrevHash: hash,
  author: '',
  subject: hash,
  date: '',
  parentHashes: parents,
  refs,
  stats: null,
  statsState: 'missing',
});
function render(rows: GitCommit[], working = true) {
  const layout = computeGraphLayout(rows);
  return renderToStaticMarkup(
    <CommitGraphSvg
      maxLane={layout.maxLane}
      graphWidth={(layout.maxLane + 1) * 28 + 32}
      totalHeight={(rows.length + Number(working)) * 44}
      workingTreeRowOffset={Number(working)}
      visibleEdges={layout.edges}
      visibleNodes={layout.nodes}
      allNodes={layout.nodes}
      hasWorkingTreeChanges={working}
      showSecondaryHistory={true}
      hasPassiveHeadFocus={false}
      {...buildGraphHighlightData(layout, 'main', undefined, null)}
    />,
  );
}
describe('commit graph SVG connections', () => {
  it('connects the working tree to HEAD below newer remote commits using a clear gutter', () => {
    const rows = [commit('new', ['old'], ['origin/main']), commit('old', ['local']), commit('local', ['root'], ['HEAD -> main']), commit('root')];
    const layout = computeGraphLayout(rows);
    const head = layout.nodes[2];
    const paths = [...render(rows).matchAll(/<path[^>]* d="([^"]+)"/g)].map((match) => match[1]);
    expect(paths[0]).toBe(paths[1]);
    expect(paths[0]).toMatch(/^M 9 22 /);
    expect(paths[0]).toMatch(new RegExp(`L ${laneX(head.lane)} 154$`));
  });
  it('keeps the working tree aligned with a first-row HEAD', () => {
    expect(render([commit('head', [], ['HEAD -> main'])])).toContain('d="M 30 22 L 30 66"');
  });
  it('does not invent a HEAD connection while HEAD is outside the loaded page', () => {
    const svg = render([commit('remote', ['missing'], ['origin/topic'])]);
    expect(svg).not.toMatch(/<path[^>]*d="M [^"]+ 22 /);
  });
  it('distinguishes continuing history from real merge edges', () => {
    const svg = render([commit('merge', ['a', 'b', 'c'], ['HEAD -> main'])], false);
    expect([...svg.matchAll(/stroke-dasharray="2 4"/g)]).toHaveLength(6);
    const paths = [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(paths).size).toBe(3);
  });
});
