import { useLayoutEffect, useMemo, useRef } from 'react';
import type { AnalyticsCoupling } from '@/shared/ipc/repositoryAnalytics';
import { analyticsCouplingLayout, couplingPairKey, type CouplingNode } from './analyticsCouplingLayout';

type Pair = Pick<AnalyticsCoupling, 'first' | 'second'>;
export type CouplingScene = { nodes: CouplingNode[]; width: number; height: number };

function topology(pairs: Pair[]) {
  const neighbors = new Map<string, Set<string>>();
  for (const { first, second } of pairs) {
    if (!neighbors.has(first)) neighbors.set(first, new Set());
    if (!neighbors.has(second)) neighbors.set(second, new Set());
    neighbors.get(first)!.add(second);
    neighbors.get(second)!.add(first);
  }
  return neighbors;
}

/** World coordinates are independent of viewport size, counts and batch boundaries. */
export function buildCouplingScene(pairs: Pair[], previous?: CouplingScene): CouplingScene {
  const neighbors = topology(pairs);
  const paths = [...neighbors.keys()].sort();
  const width = Math.max(700, Math.ceil(Math.sqrt(paths.length * 1.6)) * 110);
  const height = Math.max(440, Math.ceil(paths.length / Math.max(1, Math.floor(width / 110))) * 90 + 92);
  if (!previous?.nodes.length) {
    if (paths.length <= 180) return { nodes: analyticsCouplingLayout(pairs, width, height), width, height };
    // Large initial reports use breadth-first placement instead of quadratic force simulation.
    const visited = new Set<string>(),
      ordered: string[] = [];
    for (const root of paths) {
      if (visited.has(root)) continue;
      const queue = [root];
      visited.add(root);
      for (let i = 0; i < queue.length; i++) {
        const path = queue[i];
        ordered.push(path);
        for (const next of [...neighbors.get(path)!].sort())
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
      }
    }
    const columns = Math.max(1, Math.floor((width - 160) / 110));
    const nodes = ordered.map((path, index) => ({
      path,
      x: 80 + (index % columns) * 110,
      y: 46 + Math.floor(index / columns) * 90,
      connections: neighbors.get(path)!.size,
    }));
    return { nodes: nodes.sort((a, b) => a.path.localeCompare(b.path)), width, height: Math.max(height, 92 + Math.ceil(nodes.length / columns) * 90) };
  }
  const nodes = previous.nodes.filter((node) => neighbors.has(node.path)).map((node) => ({ ...node, connections: neighbors.get(node.path)!.size }));
  const known = new Map(nodes.map((node) => [node.path, node]));
  const cells = new Map<string, CouplingNode[]>();
  const bucket = (x: number, y: number) => `${Math.floor(x / 70)},${Math.floor(y / 70)}`;
  const put = (node: CouplingNode) => {
    const key = bucket(node.x, node.y);
    cells.set(key, [...(cells.get(key) ?? []), node]);
  };
  nodes.forEach(put);
  const free = (x: number, y: number) => {
    const col = Math.floor(x / 70),
      row = Math.floor(y / 70);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (cells.get(`${col + dx},${row + dy}`)?.some((node) => Math.hypot(node.x - x, node.y - y) < 70)) return false;
    return true;
  };
  const added = new Map<string, number>();
  let farX = nodes.reduce((max, node) => Math.max(max, node.x), 80);
  for (const path of paths) {
    if (known.has(path)) continue;
    const anchor = [...neighbors.get(path)!].map((peer) => known.get(peer)).find(Boolean);
    const seed = anchor?.path ?? '';
    const ordinal = added.get(seed) ?? 0;
    added.set(seed, ordinal + 1);
    let x = farX + 110,
      y = 90;
    if (anchor) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const angle = (ordinal + attempt) * 2.399963229728653;
        const radius = 95 * Math.sqrt(1 + ordinal + attempt);
        x = Math.max(80, anchor.x + Math.cos(angle) * radius);
        y = Math.max(46, anchor.y + Math.sin(angle) * radius);
        if (free(x, y)) break;
      }
    }
    if (!free(x, y)) {
      x = farX + 110;
      y = 90;
    }
    const node = { path, x, y, connections: neighbors.get(path)!.size };
    nodes.push(node);
    known.set(path, node);
    put(node);
    farX = Math.max(farX, x);
  }
  return {
    nodes: nodes.sort((a, b) => a.path.localeCompare(b.path)),
    width: nodes.reduce((max, node) => Math.max(max, node.x + 80), 160),
    height: nodes.reduce((max, node) => Math.max(max, node.y + 46), 92),
  };
}

export function useCouplingScene(rows: AnalyticsCoupling[]) {
  const previous = useRef<CouplingScene>();
  const structure = JSON.stringify([...new Set(rows.map(couplingPairKey))].sort());
  const scene = useMemo(
    () =>
      buildCouplingScene(
        (JSON.parse(structure) as string[]).map((key) => {
          const [first, second] = JSON.parse(key) as [string, string];
          return { first, second };
        }),
        previous.current,
      ),
    [structure],
  );
  useLayoutEffect(() => {
    previous.current = scene;
  }, [scene]);
  return scene;
}
