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
  // Quick lookup: hash -> row index
  const hashToRow = new Map<string, number>();

  // Build set of all hashes in the visible window for quick membership checks
  const visibleHashes = new Set(commits.map(c => c.hash));

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    hashToRow.set(commit.hash, row);

    // 1. Find which lane this commit belongs to
    let myLane = activeLanes.indexOf(commit.hash);
    if (myLane === -1) {
      // Not expected in any lane — find the first free lane
      myLane = activeLanes.indexOf(null);
      if (myLane === -1) {
        myLane = activeLanes.length;
        activeLanes.push(null);
      }
    }

    // Place this commit
    activeLanes[myLane] = null; // free the lane (we'll re-assign below if needed)
    const color = LANE_COLORS[myLane % LANE_COLORS.length];
    const isMerge = commit.parentHashes.length > 1;

    nodes.push({ commit, row, lane: myLane, color, isMerge });

    // 2. Process parents
    const parents = commit.parentHashes.filter(h => h.length > 0);

    for (let pi = 0; pi < parents.length; pi++) {
      const parentHash = parents[pi];

      // Find if this parent is already expected in a lane
      let parentLane = activeLanes.indexOf(parentHash);

      if (parentLane === -1) {
        // Parent not yet tracked — assign a lane
        if (pi === 0) {
          // First parent (main line): reuse current lane
          parentLane = myLane;
        } else {
          // Secondary parent (merge source): find a free lane
          parentLane = activeLanes.indexOf(null);
          if (parentLane === -1) {
            parentLane = activeLanes.length;
            activeLanes.push(null);
          }
        }
        activeLanes[parentLane] = parentHash;
      }

      // Draw an edge from this commit to where the parent will appear
      // The actual parent row is not known yet if it's below, so we store edges
      // We'll need the parent's row later — for now store parentHash
      const parentRow = hashToRow.get(parentHash);
      if (parentRow !== undefined) {
        // Parent already placed (shouldn't happen in top-down but handle it)
        const parentNode = nodes.find(n => n.commit.hash === parentHash);
        edges.push({
          fromRow: row,
          fromLane: myLane,
          toRow: parentRow,
          toLane: parentNode ? parentNode.lane : parentLane,
          color: pi === 0 ? color : LANE_COLORS[parentLane % LANE_COLORS.length],
        });
      }
    }

    // Clean up: trim trailing null lanes
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }
  }

  // Second pass: now that all nodes are placed, build edges from each commit to its parents
  // (overwriting the partial edges from above)
  edges.length = 0;
  for (const node of nodes) {
    const parents = node.commit.parentHashes.filter(h => h.length > 0);
    for (let pi = 0; pi < parents.length; pi++) {
      const parentHash = parents[pi];
      const parentNode = nodes.find(n => n.commit.hash === parentHash);
      if (parentNode) {
        edges.push({
          fromRow: node.row,
          fromLane: node.lane,
          toRow: parentNode.row,
          toLane: parentNode.lane,
          color: pi === 0 ? node.color : parentNode.color,
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
        });
      }
    }
  }

  const maxLane = nodes.reduce((max, n) => Math.max(max, n.lane), 0);
  return { nodes, edges, maxLane };
}
