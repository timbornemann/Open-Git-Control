import type { FileTimelineLayoutNode } from './types';

export type TimelineBounds = { left: number; right: number; top: number; bottom: number };
const lowerBound = (nodes: FileTimelineLayoutNode[], y: number) => {
  let low = 0;
  let high = nodes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (nodes[middle].y < y) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** Tree columns are immutable between layout changes; camera movement only queries visible rows. */
export class FileTimelineSpatialIndex {
  private columns = new Map<number, FileTimelineLayoutNode[]>();
  readonly connections: { parent: FileTimelineLayoutNode; child: FileTimelineLayoutNode }[] = [];
  constructor(nodes: FileTimelineLayoutNode[]) {
    for (const node of nodes) {
      const column = this.columns.get(node.x) ?? [];
      column.push(node);
      this.columns.set(node.x, column);
      for (const child of node.children) this.connections.push({ parent: node, child });
    }
    for (const column of this.columns.values()) column.sort((first, second) => first.y - second.y);
  }
  query(bounds: TimelineBounds): FileTimelineLayoutNode[] {
    const visible: FileTimelineLayoutNode[] = [];
    for (const [x, column] of this.columns) {
      if (x < bounds.left || x > bounds.right) continue;
      for (let index = lowerBound(column, bounds.top); index < column.length && column[index].y <= bounds.bottom; index++) visible.push(column[index]);
    }
    return visible;
  }
}
