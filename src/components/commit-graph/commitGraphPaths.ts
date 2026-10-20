import type { GraphEdge } from '@/utils/graphLayout';
import { GRAPH_PADDING, LANE_WIDTH, ROW_HEIGHT } from './commitGraphConstants';

type Point = readonly [number, number];
export const laneX = (lane: number) => GRAPH_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;

export function graphEdgePoints(edge: GraphEdge, rowOffset: number, totalHeight: number): Point[] {
  const x1 = laneX(edge.fromLane),
    x2 = laneX(edge.toLane),
    track = laneX(edge.viaLane ?? edge.fromLane);
  const y1 = (edge.fromRow + rowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
  const y2 = Math.min((edge.toRow + rowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2, totalHeight);
  if (y2 <= y1)
    return [
      [x1, y1],
      [x2, y2],
    ];
  const inset = Math.min(ROW_HEIGHT * 0.35, (y2 - y1) / 3);
  const points: Point[] = [
    [x1, y1],
    [x1, y1 + inset],
    [track, y1 + inset],
    [track, y2 - inset],
    [x2, y2 - inset],
    [x2, y2],
  ];
  return points.filter((point, i) => !i || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]);
}

export function buildGraphEdgePath(edge: GraphEdge, rowOffset: number, totalHeight: number): string {
  const points = graphEdgePoints(edge, rowOffset, totalHeight);
  let result = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i],
      [px, py] = points[i - 1],
      [nx, ny] = points[i + 1];
    const before = Math.hypot(x - px, y - py),
      after = Math.hypot(nx - x, ny - y);
    if ((x === px && x === nx) || (y === py && y === ny)) continue;
    const radius = Math.min(6, before / 2, after / 2);
    result += ` L ${x - ((x - px) / before) * radius} ${y - ((y - py) / before) * radius} Q ${x} ${y} ${x + ((nx - x) / after) * radius} ${y + ((ny - y) / after) * radius}`;
  }
  const last = points[points.length - 1];
  return `${result} L ${last[0]} ${last[1]}`;
}

/** The left gutter stays clear even when newer remote commits precede HEAD. */
export const workingTreeLane = (headRow: number, headLane: number) => (headRow > 0 ? -0.75 : headLane);
