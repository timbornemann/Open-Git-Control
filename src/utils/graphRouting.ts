import type { GraphEdge, GraphNode } from './graphLayout';

function hasIntermediateNode(rows: number[], from: number, to: number): boolean {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle] <= from) low = middle + 1;
    else high = middle;
  }
  return low < rows.length && rows[low] < to;
}

/** Sweep edges in row order. Each lane has at most one live target; joins to
 * the same parent may share a track, unrelated connections may not. */
export function* routeGraphEdges(nodes: GraphNode[], edges: GraphEdge[]): Generator<void, number> {
  const laneRows = new Map<number, number[]>();
  let maxLane = 0;
  for (const node of nodes) {
    const rows = laneRows.get(node.lane) ?? [];
    rows.push(node.row);
    laneRows.set(node.lane, rows);
    maxLane = Math.max(maxLane, node.lane);
    if (node.row % 256 === 255) yield;
  }
  const tracks = new Map<number, { target: string; end: number }>();
  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index];
    if (edge.toRow <= edge.fromRow) continue; // Damaged/cyclic input still terminates.
    const target = edge.parentHash ?? `${edge.toRow}:${edge.toLane}`;
    const available = (lane: number) => {
      if (hasIntermediateNode(laneRows.get(lane) ?? [], edge.fromRow, edge.toRow)) return false;
      const track = tracks.get(lane);
      return !track || track.end <= edge.fromRow || track.target === target;
    };
    // Merge parents split near the child, while first-parent continuations
    // stay on the child's lane and join near their parent where possible.
    const preferred = edge.kind === 'merge' ? [edge.toLane, edge.fromLane] : [edge.fromLane, edge.toLane];
    let lane = preferred.find(available);
    if (lane === undefined) {
      lane = 1;
      while (!available(lane)) lane++;
    }
    tracks.set(lane, { target, end: edge.toRow });
    if (lane !== edge.fromLane) edge.viaLane = lane;
    maxLane = Math.max(maxLane, lane, edge.toLane);
    if (index % 256 === 255) yield;
  }
  return maxLane;
}
