import type { AnalyticsChanges } from '@/shared/ipc/repositoryAnalytics';

type Node = { path: string; weight: number; row?: AnalyticsChanges; children: Map<string, Node> };
export type TreemapRect = { x: number; y: number; width: number; height: number };
export type TreemapTile = TreemapRect & { path: string; row: AnalyticsChanges };
export type TreemapGroup = TreemapRect & { path: string; depth: number; label: boolean };

// Nested directories stay together. Each split follows the longest side and balances
// total change counts, so area represents frequency rather than an arbitrary grid.
export function analyticsTreemapLayout(rows: AnalyticsChanges[], width: number, height: number) {
  const root: Node = { path: '', weight: 0, children: new Map() };
  for (const row of rows) {
    let parent = root;
    const parts = row.path.split('/');
    for (let index = 0; index < parts.length - 1; index++) {
      const name = parts[index];
      if (!parent.children.has(name)) parent.children.set(name, { path: parts.slice(0, index + 1).join('/'), weight: 0, children: new Map() });
      parent = parent.children.get(name)!;
    }
    parent.children.set(`${parts.at(-1)}\0`, { path: row.path, weight: Math.max(1, row.changes), row, children: new Map() });
  }
  const sum = (node: Node): number => {
    if (!node.row) node.weight = [...node.children.values()].reduce((total, child) => total + sum(child), 0);
    return node.weight;
  };
  sum(root);
  const tiles: TreemapTile[] = [],
    groups: TreemapGroup[] = [];
  const visit = (node: Node, rect: TreemapRect, depth: number) => {
    if (node.row) {
      tiles.push({ ...rect, path: node.path, row: node.row });
      return;
    }
    let bounds = rect;
    if (node.path) {
      const label = rect.width >= 90 && rect.height >= 65 && depth <= 2;
      groups.push({ ...rect, path: node.path, depth, label });
      const padding = Math.min(3, rect.width / 12, rect.height / 12);
      bounds = {
        x: rect.x + padding,
        y: rect.y + padding + (label ? 19 : 0),
        width: rect.width - padding * 2,
        height: rect.height - padding * 2 - (label ? 19 : 0),
      };
    }
    split(
      [...node.children.values()].sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path)),
      bounds,
      depth + 1,
    );
  };
  const split = (nodes: Node[], rect: TreemapRect, depth: number) => {
    if (!nodes.length) return;
    if (nodes.length === 1) return visit(nodes[0], rect, depth);
    const total = nodes.reduce((sum, node) => sum + node.weight, 0);
    let index = 1,
      partial = nodes[0].weight;
    while (index < nodes.length - 1 && Math.abs(total / 2 - partial - nodes[index].weight) < Math.abs(total / 2 - partial)) partial += nodes[index++].weight;
    const ratio = partial / total;
    if (rect.width >= rect.height) {
      split(nodes.slice(0, index), { ...rect, width: rect.width * ratio }, depth);
      split(nodes.slice(index), { ...rect, x: rect.x + rect.width * ratio, width: rect.width * (1 - ratio) }, depth);
    } else {
      split(nodes.slice(0, index), { ...rect, height: rect.height * ratio }, depth);
      split(nodes.slice(index), { ...rect, y: rect.y + rect.height * ratio, height: rect.height * (1 - ratio) }, depth);
    }
  };
  visit(root, { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) }, 0);
  // Input order keeps tab order and DOM identities stable across background refreshes.
  const byPath = new Map(tiles.map((tile) => [tile.path, tile]));
  return { tiles: rows.map((row) => byPath.get(row.path)!), groups };
}

export function treemapNeighbor(tiles: TreemapTile[], path: string, direction: string): string | undefined {
  const current = tiles.find((tile) => tile.path === path);
  if (!current) return;
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
  const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
  const center = (tile: TreemapTile) => [tile.x + tile.width / 2, tile.y + tile.height / 2];
  const [x, y] = center(current);
  return tiles
    .filter((tile) => {
      const [tx, ty] = center(tile);
      return tile !== current && (horizontal ? tx - x : ty - y) * sign > 0;
    })
    .sort((a, b) => {
      const distance = (tile: TreemapTile) => {
        const [tx, ty] = center(tile);
        const main = Math.abs(horizontal ? tx - x : ty - y),
          cross = Math.abs(horizontal ? ty - y : tx - x);
        return main + cross * 2;
      };
      return distance(a) - distance(b);
    })[0]?.path;
}
