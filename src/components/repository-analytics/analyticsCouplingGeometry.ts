import type { AnalyticsCoupling } from '@/shared/ipc/repositoryAnalytics';

export type CouplingPair = Pick<AnalyticsCoupling, 'first' | 'second'>;
export type CouplingNode = { path: string; x: number; y: number; connections: number };
export type CouplingScene = { nodes: CouplingNode[]; width: number; height: number; left?: number; top?: number };
export const couplingPairKey = ({ first, second }: CouplingPair) => JSON.stringify(first < second ? [first, second] : [second, first]);
const goldenAngle = Math.PI * (3 - Math.sqrt(5));

export function couplingTopology(pairs: CouplingPair[]) {
  const neighbors = new Map<string, Set<string>>();
  for (const { first, second } of pairs) {
    if (!neighbors.has(first)) neighbors.set(first, new Set());
    if (!neighbors.has(second)) neighbors.set(second, new Set());
    if (first !== second) {
      neighbors.get(first)!.add(second);
      neighbors.get(second)!.add(first);
    }
  }
  return neighbors;
}

export function couplingBounds(nodes: CouplingNode[]): CouplingScene {
  if (!nodes.length) return { nodes, width: 700, height: 440, left: 0, top: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  return { nodes, width: Math.max(160, maxX - minX + 160), height: Math.max(100, maxY - minY + 100), left: minX - 80, top: minY - 50 };
}

/** A two-dimensional seed, including disconnected groups and newly loaded neighbors.
 * Coordinates are never clamped to an edge or appended to a fallback row. */
export function buildCouplingScene(pairs: CouplingPair[], previous?: CouplingScene): CouplingScene {
  const neighbors = couplingTopology(pairs);
  const paths = [...neighbors.keys()].sort();
  const nodes = previous?.nodes.filter((node) => neighbors.has(node.path)).map((node) => ({ ...node, connections: neighbors.get(node.path)!.size })) ?? [];
  const known = new Map(nodes.map((node) => [node.path, node]));
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const root of paths) {
    if (visited.has(root)) continue;
    const queue = [root];
    visited.add(root);
    for (let index = 0; index < queue.length; index++)
      for (const peer of [...neighbors.get(queue[index])!].sort()) {
        if (!visited.has(peer)) {
          visited.add(peer);
          queue.push(peer);
        }
      }
    components.push(queue);
  }
  const spread = Math.max(120, Math.sqrt(paths.length / Math.max(1, components.length)) * 70);
  const ordinals = new Map<string, number>();
  components.forEach((component, group) => {
    const center = { x: Math.cos(group * goldenAngle) * spread * Math.sqrt(group), y: Math.sin(group * goldenAngle) * spread * Math.sqrt(group) };
    const ordered = component.sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b));
    for (const [index, path] of ordered.entries()) {
      if (known.has(path)) continue;
      const peers = [...neighbors.get(path)!].map((peer) => known.get(peer)).filter((node): node is CouplingNode => !!node);
      const anchor = peers.length
        ? { x: peers.reduce((sum, node) => sum + node.x, 0) / peers.length, y: peers.reduce((sum, node) => sum + node.y, 0) / peers.length }
        : center;
      const key = peers.length ? JSON.stringify(peers.map((node) => node.path).sort()) : `group:${group}`;
      const ordinal = ordinals.get(key) ?? peers.reduce((max, peer) => Math.max(max, peer.connections), 0);
      ordinals.set(key, ordinal + 1);
      const radius = previous?.nodes.length ? 55 * Math.sqrt(ordinal + 1) : 48 * Math.sqrt(index);
      const angle = (previous?.nodes.length ? ordinal + index : index) * goldenAngle;
      const node = { path, connections: neighbors.get(path)!.size, x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius };
      nodes.push(node);
      known.set(path, node);
    }
  });
  return couplingBounds(nodes.sort((a, b) => a.path.localeCompare(b.path)));
}
