import type { CouplingNode } from './analyticsCouplingGeometry';
export { couplingPairKey } from './analyticsCouplingGeometry';
export type { CouplingNode } from './analyticsCouplingGeometry';

type Label = { x: number; y: number; width: number; height: number };
/** Labels are placed in screen coordinates, so zoom never makes selected filenames tiny. */
export function couplingLabelLayout(nodes: CouplingNode[], width: number, height: number, preferred: string[] = [], maxLabels = Infinity, obstacles = nodes) {
  const labels = new Map<string, Label>();
  const priority = (path: string) => (preferred.includes(path) ? preferred.indexOf(path) : preferred.length);
  const ordered = [...nodes].sort((a, b) => priority(a.path) - priority(b.path) || b.connections - a.connections || a.path.localeCompare(b.path));
  const overlaps = (a: Label, b: Label) => a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;
  for (const node of ordered) {
    if (labels.size >= maxLabels) break;
    const name = node.path.slice(node.path.lastIndexOf('/') + 1);
    const labelWidth = Math.min(170, Math.max(50, name.length * 7 + 8), width / 2);
    const candidates: Label[] = [
      { x: node.x - labelWidth / 2, y: node.y + 19, width: labelWidth, height: 18 },
      { x: node.x - labelWidth / 2, y: node.y - 37, width: labelWidth, height: 18 },
      { x: node.x + 21, y: node.y - 9, width: labelWidth, height: 18 },
      { x: node.x - labelWidth - 21, y: node.y - 9, width: labelWidth, height: 18 },
    ];
    const label = candidates.find(
      (candidate) =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x + candidate.width <= width &&
        candidate.y + candidate.height <= height &&
        ![...labels.values()].some((other) => overlaps(candidate, other)) &&
        !obstacles.some((other) => overlaps(candidate, { x: other.x - 13, y: other.y - 13, width: 26, height: 26 })),
    );
    if (label) labels.set(node.path, label);
    else if (preferred.includes(node.path)) {
      const clamped = candidates.map((candidate) => ({
        ...candidate,
        x: Math.max(0, Math.min(width - labelWidth, candidate.x)),
        y: Math.max(0, Math.min(height - 18, candidate.y)),
      }));
      labels.set(node.path, clamped.find((candidate) => ![...labels.values()].some((other) => overlaps(candidate, other))) ?? clamped[0]);
    }
  }
  return labels;
}
