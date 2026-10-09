import type { AnalyticsCoupling } from '@/shared/ipc/repositoryAnalytics';

type Pair = Pick<AnalyticsCoupling, 'first' | 'second'>;
export type CouplingNode = { path: string; x: number; y: number; connections: number };
export const couplingPairKey = ({ first, second }: Pair) => JSON.stringify(first < second ? [first, second] : [second, first]);

/** A deterministic, bounded layout. Counts affect line widths, never node positions. */
export function analyticsCouplingLayout(pairs: Pair[], width: number, height: number): CouplingNode[] {
  const paths = [...new Set(pairs.flatMap(({ first, second }) => [first, second]))].sort();
  if (!paths.length) return [];
  const w = Math.max(1, width),
    h = Math.max(1, height);
  const marginX = Math.min(80, w / 5),
    marginY = Math.min(46, h / 5);
  const usableW = w - 2 * marginX,
    usableH = h - 2 * marginY;
  const indices = new Map(paths.map((path, index) => [path, index]));
  const links = [...new Map(pairs.map((pair) => [couplingPairKey(pair), pair])).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, pair]) => [indices.get(pair.first)!, indices.get(pair.second)!]);
  const nodes = paths.map((path, index) => {
    const angle = (index * Math.PI * 2) / paths.length - Math.PI / 2;
    return { path, x: w / 2 + Math.cos(angle) * usableW * 0.4, y: h / 2 + Math.sin(angle) * usableH * 0.4, connections: 0 };
  });
  for (const [a, b] of links) {
    nodes[a].connections++;
    nodes[b].connections++;
  }
  const spacing = Math.sqrt((usableW * usableH) / paths.length) * 0.8;
  for (let iteration = 0; iteration < 90; iteration++) {
    const forces = nodes.map((node) => ({ x: (w / 2 - node.x) * 0.025, y: (h / 2 - node.y) * 0.025 }));
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const dx = nodes[a].x - nodes[b].x,
          dy = nodes[a].y - nodes[b].y;
        const distance = Math.max(0.1, Math.hypot(dx, dy));
        const strength = (spacing * spacing) / distance;
        const x = (dx / distance) * strength,
          y = (dy / distance) * strength;
        forces[a].x += x;
        forces[a].y += y;
        forces[b].x -= x;
        forces[b].y -= y;
      }
    }
    for (const [a, b] of links) {
      const dx = nodes[a].x - nodes[b].x,
        dy = nodes[a].y - nodes[b].y;
      const distance = Math.max(0.1, Math.hypot(dx, dy));
      const strength = (distance * distance) / Math.max(1, spacing);
      const x = (dx / distance) * strength * 0.65,
        y = (dy / distance) * strength * 0.65;
      forces[a].x -= x;
      forces[a].y -= y;
      forces[b].x += x;
      forces[b].y += y;
    }
    const temperature = Math.min(usableW, usableH) * 0.1 * (1 - iteration / 90);
    nodes.forEach((node, index) => {
      const { x, y } = forces[index],
        distance = Math.max(0.1, Math.hypot(x, y));
      node.x += (x / distance) * Math.min(distance, temperature);
      node.y += (y / distance) * Math.min(distance, temperature);
    });
  }
  // Fit after relaxation. Clamping on each step piles disconnected groups onto viewport edges.
  const minX = Math.min(...nodes.map((node) => node.x)),
    maxX = Math.max(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y)),
    maxY = Math.max(...nodes.map((node) => node.y));
  const fitted = nodes.map((node) => ({
    ...node,
    x: Math.round((maxX > minX ? marginX + ((node.x - minX) / (maxX - minX)) * usableW : w / 2) * 100) / 100,
    y: Math.round((maxY > minY ? marginY + ((node.y - minY) / (maxY - minY)) * usableH : h / 2) * 100) / 100,
  }));
  const separation = Math.min(60, Math.sqrt((usableW * usableH) / paths.length) * 0.7);
  for (let pass = 0; pass < 70; pass++) {
    for (let a = 0; a < fitted.length; a++) {
      for (let b = a + 1; b < fitted.length; b++) {
        const dx = fitted[b].x - fitted[a].x,
          dy = fitted[b].y - fitted[a].y;
        const distance = Math.max(0.01, Math.hypot(dx, dy));
        if (distance >= separation) continue;
        const shift = (separation - distance) * 0.5;
        const x = (dx / distance) * shift,
          y = (dy / distance) * shift;
        fitted[a].x = Math.max(marginX, Math.min(w - marginX, fitted[a].x - x));
        fitted[a].y = Math.max(marginY, Math.min(h - marginY, fitted[a].y - y));
        fitted[b].x = Math.max(marginX, Math.min(w - marginX, fitted[b].x + x));
        fitted[b].y = Math.max(marginY, Math.min(h - marginY, fitted[b].y + y));
      }
    }
  }
  return fitted;
}

type Label = { x: number; y: number; width: number; height: number };
export function couplingLabelLayout(nodes: CouplingNode[], width: number, height: number, preferred: string[] = []) {
  const labels = new Map<string, Label>();
  const priority = (path: string) => (preferred.includes(path) ? preferred.indexOf(path) : preferred.length);
  const ordered = [...nodes].sort((a, b) => priority(a.path) - priority(b.path) || b.connections - a.connections || a.path.localeCompare(b.path));
  const overlaps = (a: Label, b: Label) => a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;
  for (const node of ordered) {
    const name = node.path.slice(node.path.lastIndexOf('/') + 1);
    const labelWidth = Math.min(150, Math.max(50, name.length * 8 + 8), width / 3);
    const candidates: Label[] = [
      { x: node.x - labelWidth / 2, y: node.y + 22, width: labelWidth, height: 18 },
      { x: node.x - labelWidth / 2, y: node.y - 40, width: labelWidth, height: 18 },
      { x: node.x + 24, y: node.y - 9, width: labelWidth, height: 18 },
      { x: node.x - labelWidth - 24, y: node.y - 9, width: labelWidth, height: 18 },
    ];
    const label = candidates.find(
      (candidate) =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x + candidate.width <= width &&
        candidate.y + candidate.height <= height &&
        ![...labels.values()].some((other) => overlaps(candidate, other)) &&
        !nodes.some((other) => overlaps(candidate, { x: other.x - 17, y: other.y - 17, width: 34, height: 34 })),
    );
    if (label) labels.set(node.path, label);
    else if (preferred.includes(node.path)) labels.set(node.path, candidates[0]);
  }
  return labels;
}
