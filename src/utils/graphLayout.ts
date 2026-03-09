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

/**
 * Assigns lanes (columns) to commits and computes edges.
 * 
 * Algorithm: walk commits top-down (newest first).
 * Maintain a set of "active lanes" — each lane tracks
 * which commit hash it is currently waiting to encounter.
 * 
 * - If a commit's hash is expected in an existing lane, place it there.
 * - If not expected anywhere, assign the first free lane.
 * - For each parent of the current commit:
 *   - If the parent is already expected in a lane, draw an edge to that lane.
 *   - Otherwise, reserve a lane for that parent.
 * - After placing a commit, release lanes that are no longer needed.
 */
export function computeGraphLayout(commits: GitCommit[]): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // activeLanes[i] = hash that lane i is waiting for, or null if free
  const activeLanes: (string | null)[] = [];
  // Build set of all hashes in the visible window for quick membership checks
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
    }
  };

  const clearDuplicateReservations = (hash: string, keepLane: number) => {
    for (let lane = 0; lane < activeLanes.length; lane++) {
      if (lane !== keepLane && activeLanes[lane] === hash) {
        activeLanes[lane] = null;
      }
    }
  };

  const findFreeSideLane = () => {
    for (let lane = 1; lane < activeLanes.length; lane++) {
      if (activeLanes[lane] === null) return lane;
    }
    activeLanes.push(null);
    return activeLanes.length - 1;
  };

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    const commitOnTrunk = trunkHashes.has(commit.hash);

    // 1. Find which lane this commit belongs to
    let myLane = commitOnTrunk ? 0 : -1;

    if (!commitOnTrunk) {
      for (let lane = 1; lane < activeLanes.length; lane++) {
        if (activeLanes[lane] === commit.hash) {
          myLane = lane;
          break;
        }
      }
    }

    if (myLane === -1) {
      // Not expected in any lane — find a free side lane
      myLane = commitOnTrunk ? 0 : findFreeSideLane();
    }

    ensureLaneExists(myLane);
    clearDuplicateReservations(commit.hash, myLane);

    // Place this commit
    activeLanes[myLane] = null; // free the lane (we'll re-assign below if needed)
    const color = LANE_COLORS[myLane % LANE_COLORS.length];
    const isMerge = commit.parentHashes.length > 1;

    nodes.push({ commit, row, lane: myLane, color, isMerge });

    // 2. Process parents
    const parents = commit.parentHashes.filter(h => h.length > 0);

    for (let pi = 0; pi < parents.length; pi++) {
      const parentHash = parents[pi];
      const parentOnTrunk = trunkHashes.has(parentHash);

      let parentLane = activeLanes.indexOf(parentHash);

      if (parentOnTrunk) {
        parentLane = 0;
        ensureLaneExists(parentLane);
        clearDuplicateReservations(parentHash, parentLane);
        activeLanes[parentLane] = parentHash;
      } else if (parentLane !== -1) {
        if (pi === 0 && parentLane !== myLane) {
          activeLanes[parentLane] = null;
          activeLanes[myLane] = parentHash;
          parentLane = myLane;
        }
      } else {
        if (pi === 0 && !commitOnTrunk) {
          parentLane = myLane;
        } else {
          parentLane = findFreeSideLane();
        }
        activeLanes[parentLane] = parentHash;
      }

    }

    // Clean up: trim trailing null lanes
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }
  }

  // Second pass: now that all nodes are placed, build edges from each commit to its parents
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
      } else if (visibleHashes.has(parentHash)) {
        // Parent is visible but hasn't been found (should not happen)
      } else {
        // Parent is outside the visible window — draw edge going down to last row
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

  const maxLane = nodes.reduce((max, n) => Math.max(max, n.lane), 0);
  return { nodes, edges, maxLane };
}
