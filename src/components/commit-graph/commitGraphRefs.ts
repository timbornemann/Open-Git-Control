import { mergeTargetFromDecoratedRef, normalizeBranchRefForMerge } from '@/utils/gitParsing';
import type { GraphLayout, GraphNode } from '@/utils/graphLayout';
import { graphEdgeKey } from './CommitGraphSvg';

export type RefKind = 'head' | 'local' | 'remote' | 'tag' | 'head-pointer';

export const getRefKind = (ref: string, localBranchNames?: ReadonlySet<string>): RefKind => {
  if (ref.startsWith('tag:')) return 'tag';
  if (ref.startsWith('HEAD ->')) return 'head';
  if (ref === 'HEAD') return 'head-pointer';
  if (localBranchNames?.has(ref)) return 'local';
  if (ref.includes('/')) return 'remote';
  return 'local';
};

const getRefPriority = (ref: string, localBranchNames?: ReadonlySet<string>) => {
  const kind = getRefKind(ref, localBranchNames);
  if (kind === 'head') return 0;
  if (kind === 'local') return 1;
  if (kind === 'remote') return 2;
  if (kind === 'tag') return 3;
  return 4;
};

export const sortRefs = (refs: string[], localBranchNames?: ReadonlySet<string>) =>
  [...refs].sort((a, b) => {
    const prioDiff = getRefPriority(a, localBranchNames) - getRefPriority(b, localBranchNames);
    return prioDiff !== 0 ? prioDiff : a.localeCompare(b);
  });

export const resolveHighlightableBranchRef = (ref: string): string | null => {
  const target = mergeTargetFromDecoratedRef(ref);
  if (!target) return null;
  const normalized = normalizeBranchRefForMerge(target.trim());
  if (!normalized || normalized.endsWith('/HEAD')) return null;
  return normalized;
};

export const findCommitIndexByNavigationTarget = (nodes: GraphNode[], targetHash: string): number => {
  const normalizedTarget = String(targetHash || '')
    .trim()
    .toLowerCase();
  if (!normalizedTarget) return -1;

  const exactIndex = nodes.findIndex((node) => node.commit.hash.toLowerCase() === normalizedTarget);
  if (exactIndex >= 0) return exactIndex;

  if (normalizedTarget.length < 7) return -1;

  const matchingIndexes: number[] = [];
  nodes.forEach((node, index) => {
    const fullHash = node.commit.hash.toLowerCase();
    const abbrevHash = node.commit.abbrevHash.toLowerCase();
    if (fullHash.startsWith(normalizedTarget) || abbrevHash === normalizedTarget) {
      matchingIndexes.push(index);
    }
  });

  return matchingIndexes.length === 1 ? matchingIndexes[0] : -1;
};

export const buildGraphHighlightData = (
  layout: GraphLayout | null,
  _currentBranch: string,
  selectedHash: string | null | undefined,
  highlightedBranchRef: string | null,
) => {
  const nodes = layout?.nodes || [];
  const nodeByHash = new Map(nodes.map((node) => [node.commit.hash, node]));
  const headNode = nodes.find((node) => node.commit.refs.some((ref) => ref.startsWith('HEAD ->') || ref === 'HEAD')) ?? nodes[0];
  const reachableFromHead = new Set<string>();

  if (headNode) {
    const stack = [headNode.commit.hash];
    while (stack.length > 0) {
      const hash = stack.pop();
      if (!hash || reachableFromHead.has(hash)) continue;
      reachableFromHead.add(hash);
      const currentNode = nodeByHash.get(hash);
      if (!currentNode) continue;
      currentNode.commit.parentHashes.forEach((parentHash) => {
        if (nodeByHash.has(parentHash) && !reachableFromHead.has(parentHash)) {
          stack.push(parentHash);
        }
      });
    }
  }

  const branchTipByRef = new Map<string, GraphNode>();
  for (const node of nodes) {
    for (const ref of node.commit.refs) {
      const target = resolveHighlightableBranchRef(ref);
      if (!target || branchTipByRef.has(target)) continue;
      branchTipByRef.set(target, node);
    }
  }

  const buildAncestorPath = (startNode: GraphNode | undefined) => {
    const path = new Set<string>();
    const stack = startNode ? [startNode] : [];
    while (stack.length > 0) {
      const cursor = stack.pop();
      if (!cursor || path.has(cursor.commit.hash)) continue;
      path.add(cursor.commit.hash);
      for (const parentHash of cursor.commit.parentHashes) {
        const parent = nodeByHash.get(parentHash);
        if (parent && !path.has(parent.commit.hash)) {
          stack.push(parent);
        }
      }
    }
    return path;
  };

  const manualHighlightedBranch = highlightedBranchRef && branchTipByRef.has(highlightedBranchRef) ? highlightedBranchRef : null;
  const activeHighlightedBranch = manualHighlightedBranch;
  const requestedSelectedNode = selectedHash ? nodeByHash.get(selectedHash) : undefined;
  const selectedNode = requestedSelectedNode?.commit.hash === headNode?.commit.hash ? undefined : requestedSelectedNode;
  const hasSelectedCommitFocus = Boolean(selectedNode);
  const currentPathStartNode = activeHighlightedBranch ? branchTipByRef.get(activeHighlightedBranch) : undefined;
  const currentPathHashes =
    !hasSelectedCommitFocus && manualHighlightedBranch && currentPathStartNode ? buildAncestorPath(currentPathStartNode) : new Set<string>();
  const selectedBranchTarget = selectedNode
    ? sortRefs(selectedNode.commit.refs)
        .map(resolveHighlightableBranchRef)
        .find((target): target is string => Boolean(target && branchTipByRef.has(target)))
    : undefined;
  const selectedPathStartNode = selectedNode;
  const selectedPathHashes = buildAncestorPath(selectedPathStartNode);
  const hasCurrentPathHighlight = currentPathHashes.size > 0;
  const hasSelectedPathHighlight = selectedPathHashes.size > 0;
  const currentPathColor =
    headNode && hasCurrentPathHighlight
      ? (branchTipByRef.get(activeHighlightedBranch || '')?.color ?? headNode.color)
      : (headNode?.color ?? 'var(--accent-primary)');
  const selectedPathColor = hasSelectedPathHighlight ? (selectedPathStartNode?.color ?? currentPathColor) : currentPathColor;
  const buildPathEdgeKeys = (pathHashes: Set<string>) => {
    const keys = new Set<string>();
    if (!layout || pathHashes.size === 0) return keys;
    for (const edge of layout.edges) {
      if (edge.toRow < 0 || edge.toRow >= nodes.length) continue;
      const fromNode = nodes[edge.fromRow];
      const toNode = nodes[edge.toRow];
      if (!fromNode || !toNode) continue;
      if (!pathHashes.has(fromNode.commit.hash) || !pathHashes.has(toNode.commit.hash)) continue;
      if (!fromNode.commit.parentHashes.includes(toNode.commit.hash)) continue;
      keys.add(graphEdgeKey(edge));
    }
    return keys;
  };

  return {
    nodeByHash,
    headNode,
    reachableFromHead,
    branchTipByRef,
    activeHighlightedBranch,
    selectedBranchTarget,
    hasSelectedCommitFocus,
    currentPathHashes,
    selectedPathHashes,
    hasCurrentPathHighlight,
    hasSelectedPathHighlight,
    hasAnyPathHighlight: hasCurrentPathHighlight || hasSelectedPathHighlight,
    currentPathColor,
    selectedPathColor,
    currentPathEdgeKeys: buildPathEdgeKeys(currentPathHashes),
    selectedPathEdgeKeys: buildPathEdgeKeys(selectedPathHashes),
  };
};
