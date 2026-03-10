import { GitCommit } from './gitParsing';

// Colors for branch lanes (GitKraken-inspired palette)
export const LANE_COLORS = [
  '#00b4d8', // cyan
  '#e040fb', // magenta
  '#3fb950', // green
  '#d29922', // orange
  '#f78166', // coral
  '#a371f7', // purple
  '#58a6ff', // blue
  '#f85149', // red
  '#7ee787', // light green
  '#d2a8ff', // light purple
];

export interface GraphEdge {
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  color: string;
  kind: 'primary' | 'merge' | 'truncated';
}

export interface GraphNode {
  commit: GitCommit;
  row: number;
  lane: number;
  color: string;
  isMerge: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxLane: number;
}

const LANE_REUSE_COOLDOWN_ROWS = 2;

/**
 * Assigns lanes (columns) to commits and computes edges.
 *
 * Goals for readability in complex merge graphs:
 * - Keep the active first-parent chain on lane 0.
 * - Keep first-parent continuity for side branches.
 * - Avoid immediate lane recycling so unrelated branches do not visually "stack".
 */
export function computeGraphLayout(commits: GitCommit[]): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const activeLanes: (string | null)[] = [];
  const laneFreedAtRow: number[] = [];
  const visibleHashes = new Set(commits.map(c => c.hash));
  const commitByHash = new Map(commits.map(commit => [commit.hash, commit]));

  const headCommit = commits.find(commit => (
    commit.refs.some(ref => ref.startsWith('HEAD ->') || ref === 'HEAD')
  )) ?? commits[0];

  const trunkHashes = new Set<string>();
  for (let current = headCommit; current; ) {
    trunkHashes.add(current.hash);
    const firstParent = current.parentHashes[0];
    if (!firstParent || !visibleHashes.has(firstParent)) break;
    const nextCommit = commitByHash.get(firstParent);
    if (!nextCommit) break;
    current = nextCommit;
  }

  const ensureLaneExists = (lane: number) => {
    while (activeLanes.length <= lane) {
      activeLanes.push(null);
      laneFreedAtRow.push(-9999);
    }
  };

  const freeLane = (lane: number, row: number) => {
    ensureLaneExists(lane);
    activeLanes[lane] = null;
    laneFreedAtRow[lane] = row;
  };

  const clearDuplicateReservations = (hash: string, keepLane: number, row: number) => {
    for (let lane = 0; lane < activeLanes.length; lane++) {
      if (lane !== keepLane && activeLanes[lane] === hash) {
        freeLane(lane, row);
      }
    }
  };

  const findFreeLane = (startLane: number, row: number) => {
    for (let lane = startLane; lane < activeLanes.length; lane++) {
      if (activeLanes[lane] !== null) continue;
      const recentlyFreed = row - (laneFreedAtRow[lane] ?? -9999) <= LANE_REUSE_COOLDOWN_ROWS;
      if (!recentlyFreed) {
        return lane;
      }
    }

    for (let lane = startLane; lane < activeLanes.length; lane++) {
      if (activeLanes[lane] === null) return lane;
    }

    activeLanes.push(null);
    laneFreedAtRow.push(-9999);
    return activeLanes.length - 1;
  };

  const reserveHashInLane = (hash: string, preferredLane: number, startLane: number, row: number) => {
    const existingLane = activeLanes.indexOf(hash);
    if (existingLane !== -1) {
      if (preferredLane >= 0 && existingLane !== preferredLane) {
        ensureLaneExists(preferredLane);
        if (activeLanes[preferredLane] === null || activeLanes[preferredLane] === hash) {
          freeLane(existingLane, row);
          activeLanes[preferredLane] = hash;
          clearDuplicateReservations(hash, preferredLane, row);
          return preferredLane;
        }
      }
      return existingLane;
    }

    let lane = preferredLane;
    ensureLaneExists(Math.max(lane, startLane));
    if (lane < startLane || activeLanes[lane] !== null) {
      lane = findFreeLane(startLane, row);
    }

    activeLanes[lane] = hash;
    clearDuplicateReservations(hash, lane, row);
    return lane;
  };

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    const commitOnTrunk = trunkHashes.has(commit.hash);

    let myLane = commitOnTrunk ? 0 : activeLanes.indexOf(commit.hash);
    if (myLane === -1) {
      myLane = findFreeLane(1, row);
    }

    ensureLaneExists(myLane);
    clearDuplicateReservations(commit.hash, myLane, row);
    freeLane(myLane, row);

    const color = LANE_COLORS[myLane % LANE_COLORS.length];
    const isMerge = commit.parentHashes.length > 1;
    nodes.push({ commit, row, lane: myLane, color, isMerge });

    const parents = commit.parentHashes.filter(h => h.length > 0);
    if (parents.length > 0) {
      const primaryLane = commitOnTrunk ? 0 : myLane;
      reserveHashInLane(parents[0], primaryLane, primaryLane, row);
    }

    for (let pi = 1; pi < parents.length; pi++) {
      const parentHash = parents[pi];
      const preferred = trunkHashes.has(parentHash) ? 0 : -1;
      const startLane = preferred === 0 ? 0 : 1;
      reserveHashInLane(parentHash, preferred, startLane, row);
    }

    while (activeLanes.length > 1 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
      laneFreedAtRow.pop();
    }
  }

  const nodeByHash = new Map(nodes.map(node => [node.commit.hash, node]));
  for (const node of nodes) {
    const parents = node.commit.parentHashes.filter(h => h.length > 0);
    for (let pi = 0; pi < parents.length; pi++) {
      const parentHash = parents[pi];
      const parentNode = nodeByHash.get(parentHash);
      if (parentNode) {
        edges.push({
          fromRow: node.row,
          fromLane: node.lane,
          toRow: parentNode.row,
          toLane: parentNode.lane,
          color: pi === 0 ? node.color : parentNode.color,
          kind: pi === 0 ? 'primary' : 'merge',
        });
      } else if (!visibleHashes.has(parentHash)) {
        edges.push({
          fromRow: node.row,
          fromLane: node.lane,
          toRow: commits.length,
          toLane: node.lane,
          color: node.color,
          kind: 'truncated',
        });
      }
    }
  }

  const maxLane = nodes.reduce((max, node) => Math.max(max, node.lane), 0);
  return { nodes, edges, maxLane };
}

