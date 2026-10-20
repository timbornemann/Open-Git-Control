import type { GitCommit } from './gitParsing';
import { routeGraphEdges } from './graphRouting';

// Brand-aligned lane colors for branch graph readability
export const LANE_COLORS = [
  'var(--graph-lane-1)',
  'var(--graph-lane-2)',
  'var(--graph-lane-3)',
  'var(--graph-lane-4)',
  'var(--graph-lane-5)',
  'var(--graph-lane-6)',
  'var(--graph-lane-7)',
  'var(--graph-lane-8)',
  'var(--graph-lane-9)',
  'var(--graph-lane-10)',
];

export interface GraphEdge {
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  color: string;
  kind: 'primary' | 'merge' | 'truncated';
  parentHash?: string;
  /** Vertical track between turns; omitted when it is the source lane. */
  viaLane?: number;
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

export type GraphLayoutSeed = { anchorHash: string; lanes: number[] };

/** A seed is valid only for an unchanged prefix, never a rewrite or reorder. */
export function graphLayoutSeed(commits: GitCommit[], previous?: GraphLayout): GraphLayoutSeed | undefined {
  if (!previous?.nodes.length || previous.nodes.length > commits.length) return;
  for (let row = 0; row < previous.nodes.length; row++) {
    const old = previous.nodes[row].commit;
    const next = commits[row];
    if (old.hash !== next.hash || old.parentHashes.length !== next.parentHashes.length || old.parentHashes.some((hash, i) => hash !== next.parentHashes[i]))
      return;
  }
  const anchor = previous.nodes.find((node) => node.lane === 0) ?? previous.nodes[0];
  return { anchorHash: anchor.commit.hash, lanes: previous.nodes.map((node) => node.lane) };
}

const LANE_REUSE_COOLDOWN_ROWS = 40;
const DEFAULT_TRUNK_REFS = ['main', 'master', 'origin/main', 'origin/master'];

function refMatchesTarget(ref: string, target: string): boolean {
  const normalizedRef = ref.trim();
  if (!normalizedRef) return false;
  if (normalizedRef === target) return true;

  const headArrowMatch = normalizedRef.match(/^HEAD\s*->\s*(.+)$/);
  if (!headArrowMatch) return false;
  return headArrowMatch[1].trim() === target;
}

function* graphLayoutMetadata(commits: GitCommit[], seed?: GraphLayoutSeed) {
  const visibleHashes = new Set<string>();
  const commitByHash = new Map<string, GitCommit>();
  const refCandidates = new Map<string, GitCommit>();
  let headCommitCandidate: GitCommit | undefined;
  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    visibleHashes.add(commit.hash);
    commitByHash.set(commit.hash, commit);
    if (!headCommitCandidate && commit.refs.some((ref) => ref.startsWith('HEAD ->') || ref === 'HEAD')) headCommitCandidate = commit;
    for (const ref of DEFAULT_TRUNK_REFS) {
      if (!refCandidates.has(ref) && commit.refs.some((candidate) => refMatchesTarget(candidate, ref))) refCandidates.set(ref, commit);
    }
    if (row % 256 === 255) yield;
  }
  const anchorRef = DEFAULT_TRUNK_REFS.find((ref) => refCandidates.has(ref));
  const trunkStartCommit = (seed && commitByHash.get(seed.anchorHash)) || (anchorRef && refCandidates.get(anchorRef)) || headCommitCandidate || commits[0];
  return { visibleHashes, commitByHash, trunkStartCommit };
}

/**
 * Assigns lanes (columns) to commits and computes edges.
 *
 * Goals for readability in complex merge graphs:
 * - Keep the chosen trunk's first-parent chain on lane 0.
 * - Keep first-parent continuity for side branches.
 * - Avoid immediate lane recycling so unrelated branches do not visually "stack".
 */
function* graphLayoutSteps(commits: GitCommit[], seed?: GraphLayoutSeed): Generator<void, GraphLayout> {
  if (commits.length === 0) {
    return { nodes: [], edges: [], maxLane: 0 };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const activeLanes: (string | null)[] = [];
  const laneFreedAtRow: number[] = [];
  const { visibleHashes, commitByHash, trunkStartCommit } = yield* graphLayoutMetadata(commits, seed);

  const trunkHashes = new Set<string>();
  for (let current = trunkStartCommit; current && !trunkHashes.has(current.hash);) {
    trunkHashes.add(current.hash);
    if (trunkHashes.size % 256 === 0) yield;
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

  const findFreeLane = (startLane: number, row: number, allowRecentlyFreed = false) => {
    ensureLaneExists(startLane);

    for (let lane = startLane; lane < activeLanes.length; lane++) {
      if (activeLanes[lane] !== null) continue;
      const recentlyFreed = row - (laneFreedAtRow[lane] ?? -9999) <= LANE_REUSE_COOLDOWN_ROWS;
      if (allowRecentlyFreed || !recentlyFreed) {
        return lane;
      }
    }

    activeLanes.push(null);
    laneFreedAtRow.push(-9999);
    return activeLanes.length - 1;
  };

  const reserveHashInLane = (hash: string, preferredLane: number, startLane: number, row: number, allowRecentlyFreed = false) => {
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
      lane = findFreeLane(startLane, row, allowRecentlyFreed);
    }

    activeLanes[lane] = hash;
    clearDuplicateReservations(hash, lane, row);
    return lane;
  };

  for (let row = 0; row < commits.length; row++) {
    if (row % 256 === 255) yield;
    const commit = commits[row];
    const commitOnTrunk = trunkHashes.has(commit.hash);

    let myLane = seed?.lanes[row] ?? (commitOnTrunk ? 0 : activeLanes.indexOf(commit.hash));
    if (myLane === -1) {
      myLane = findFreeLane(1, row);
    }

    ensureLaneExists(myLane);
    clearDuplicateReservations(commit.hash, myLane, row);
    freeLane(myLane, row);

    const color = LANE_COLORS[myLane % LANE_COLORS.length];
    const isMerge = commit.parentHashes.length > 1;
    nodes.push({ commit, row, lane: myLane, color, isMerge });

    const parents = commit.parentHashes.filter((h) => h.length > 0);
    if (parents.length > 0) {
      const primaryLane = commitOnTrunk ? 0 : myLane;
      reserveHashInLane(parents[0], primaryLane, primaryLane, row);
    }

    for (let pi = 1; pi < parents.length; pi++) {
      const parentHash = parents[pi];
      const parentOnTrunk = trunkHashes.has(parentHash);
      const preferred = parentOnTrunk ? 0 : -1;
      const startLane = preferred === 0 ? 0 : 1;
      // Sequential, already-merged short-lived branches can reuse the closest side lane
      // without visual collisions, keeping the graph compact instead of stair-stepped.
      const allowImmediateSideLaneReuse = commitOnTrunk && !parentOnTrunk;
      reserveHashInLane(parentHash, preferred, startLane, row, allowImmediateSideLaneReuse);
    }

    while (activeLanes.length > 1 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
      laneFreedAtRow.pop();
    }
  }

  const nodeByHash = new Map<string, GraphNode>();
  for (const node of nodes) {
    nodeByHash.set(node.commit.hash, node);
    if (node.row % 256 === 255) yield;
  }
  for (const node of nodes) {
    if (node.row % 256 === 255) yield;
    const parents = node.commit.parentHashes.filter((h) => h.length > 0);
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
          parentHash,
        });
      } else if (!visibleHashes.has(parentHash)) {
        edges.push({
          fromRow: node.row,
          fromLane: node.lane,
          toRow: commits.length,
          toLane: Math.max(0, activeLanes.indexOf(parentHash)),
          color: LANE_COLORS[Math.max(0, activeLanes.indexOf(parentHash)) % LANE_COLORS.length],
          kind: 'truncated',
          parentHash,
        });
      }
    }
  }

  const maxLane = yield* routeGraphEdges(nodes, edges);
  return { nodes, edges, maxLane };
}

export function computeGraphLayout(commits: GitCommit[], seed?: GraphLayoutSeed): GraphLayout {
  const steps = graphLayoutSteps(commits, seed);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Worker fallback: let input and paint events run between slices of a large graph. */
export async function computeGraphLayoutAsync(commits: GitCommit[], signal?: AbortSignal, seed?: GraphLayoutSeed): Promise<GraphLayout> {
  const steps = graphLayoutSteps(commits, seed);
  let sliceStarted = performance.now();
  for (;;) {
    signal?.throwIfAborted();
    const step = steps.next();
    if (step.done) return step.value;
    if (performance.now() - sliceStarted >= 8) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      sliceStarted = performance.now();
    }
  }
}
