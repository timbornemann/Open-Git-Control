import React from 'react';
import type { GraphEdge, GraphNode } from '@/utils/graphLayout';
import { MERGE_NODE_RADIUS, NODE_RADIUS, ROW_HEIGHT, SECONDARY_GRAPH_ACCENT } from './commitGraphConstants';
import { buildGraphEdgePath, laneX, workingTreeLane } from './commitGraphPaths';

export const graphEdgeKey = (edge: GraphEdge) => `${edge.fromRow}:${edge.fromLane}->${edge.toRow}:${edge.toLane}:${edge.kind}`;

type CommitGraphSvgProps = {
  maxLane: number;
  graphWidth: number;
  totalHeight: number;
  workingTreeRowOffset: number;
  visibleEdges: GraphEdge[];
  visibleNodes: GraphNode[];
  allNodes: GraphNode[];
  headNode: GraphNode;
  hasWorkingTreeChanges: boolean;
  selectedHash?: string | null;
  showSecondaryHistory: boolean;
  reachableFromHead: Set<string>;
  currentPathHashes: Set<string>;
  selectedPathHashes: Set<string>;
  hasAnyPathHighlight: boolean;
  currentPathColor: string;
  selectedPathColor: string;
  currentPathEdgeKeys: Set<string>;
  selectedPathEdgeKeys: Set<string>;
  hasPassiveHeadFocus: boolean;
};

export const CommitGraphSvg: React.FC<CommitGraphSvgProps> = ({
  maxLane,
  graphWidth,
  totalHeight,
  workingTreeRowOffset,
  visibleEdges,
  visibleNodes,
  allNodes,
  headNode,
  hasWorkingTreeChanges,
  selectedHash,
  showSecondaryHistory,
  reachableFromHead,
  currentPathHashes,
  selectedPathHashes,
  hasAnyPathHighlight,
  currentPathColor,
  selectedPathColor,
  currentPathEdgeKeys,
  selectedPathEdgeKeys,
  hasPassiveHeadFocus,
}) => {
  const buildEdgePath = (edge: GraphEdge) => buildGraphEdgePath(edge, workingTreeRowOffset, totalHeight);
  const hasVisibleHead = headNode?.commit.refs.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD ->'));
  const workLane = workingTreeLane(headNode.row, headNode.lane);
  const workingTreePath = hasVisibleHead
    ? buildEdgePath({ fromRow: -1, fromLane: workLane, toRow: headNode.row, toLane: headNode.lane, color: headNode.color, kind: 'primary' })
    : undefined;

  const isSecondaryCommit = (hash: string) => !reachableFromHead.has(hash);
  const isEdgeOnCurrentPath = (edge: GraphEdge) => currentPathEdgeKeys.has(graphEdgeKey(edge));
  const isEdgeOnSelectedPath = (edge: GraphEdge) => selectedPathEdgeKeys.has(graphEdgeKey(edge));

  const getBaseEdgeStroke = (edge: GraphEdge) => {
    const fromNode = allNodes[edge.fromRow];
    if (!fromNode) return edge.color;
    if (!showSecondaryHistory || !isSecondaryCommit(fromNode.commit.hash)) {
      return edge.color;
    }
    return edge.kind === 'merge' ? SECONDARY_GRAPH_ACCENT : edge.color;
  };

  const getEdgeStroke = (edge: GraphEdge) => {
    const onSelectedPath = isEdgeOnSelectedPath(edge);
    const onCurrentPath = isEdgeOnCurrentPath(edge);
    if (onSelectedPath) return selectedPathColor;
    if (onCurrentPath) return currentPathColor;
    return getBaseEdgeStroke(edge);
  };

  const getEdgeOpacity = (edge: GraphEdge, layer: 'glow' | 'core') => {
    const onSelectedPath = isEdgeOnSelectedPath(edge);
    const onCurrentPath = isEdgeOnCurrentPath(edge);
    if (layer === 'glow') {
      if (onSelectedPath) return 0.18;
      if (onCurrentPath) return 0.14;
      if (hasAnyPathHighlight) return 0.02;
      return 0.08;
    }

    if (onSelectedPath) return 0.88;
    if (onCurrentPath) return 0.8;
    if (hasAnyPathHighlight) return edge.kind === 'merge' ? 0.24 : 0.34;
    return edge.kind === 'merge' ? 0.78 : 0.9;
  };

  const getEdgeWidth = (edge: GraphEdge, layer: 'glow' | 'core') => {
    const onSelectedPath = isEdgeOnSelectedPath(edge);
    const onCurrentPath = isEdgeOnCurrentPath(edge);
    if (layer === 'glow') {
      if (onSelectedPath) return edge.kind === 'merge' ? 3.1 : 3.8;
      if (onCurrentPath) return edge.kind === 'merge' ? 2.8 : 3.5;
      if (hasAnyPathHighlight) return edge.kind === 'merge' ? 1.5 : 1.9;
      return edge.kind === 'merge' ? 2.4 : 2.8;
    }

    if (onSelectedPath) return edge.kind === 'merge' ? 1.9 : 2.5;
    if (onCurrentPath) return edge.kind === 'merge' ? 1.7 : 2.2;
    if (hasAnyPathHighlight) return edge.kind === 'merge' ? 0.9 : 1.2;
    return edge.kind === 'merge' ? 1.25 : 1.7;
  };

  return (
    <svg width={graphWidth} height={totalHeight} className="commit-graph-svg">
      {Array.from({ length: maxLane + 1 }).map((_, lane) => {
        const x = laneX(lane);
        return <line key={`lane-${lane}`} x1={x} y1={0} x2={x} y2={totalHeight} stroke="var(--line-subtle)" strokeWidth={1} />;
      })}
      {hasWorkingTreeChanges && headNode && (
        <>
          <path d={workingTreePath} stroke={headNode.color} strokeWidth={5} strokeOpacity={0.1} fill="none" strokeLinecap="round" />
          <path d={workingTreePath} stroke={headNode.color} strokeWidth={2.2} strokeOpacity={0.92} fill="none" strokeLinecap="round" />
          <circle cx={laneX(workLane)} cy={ROW_HEIGHT / 2} r={NODE_RADIUS + 2} fill="var(--bg-darker)" stroke="var(--status-warning)" strokeWidth={2.2} />
        </>
      )}
      {visibleEdges.map((edge, i) => (
        <path
          key={`eg${i}`}
          d={buildEdgePath(edge)}
          stroke={getEdgeStroke(edge)}
          strokeWidth={getEdgeWidth(edge, 'glow')}
          strokeOpacity={getEdgeOpacity(edge, 'glow')}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={edge.kind === 'truncated' ? '2 4' : edge.kind === 'merge' ? '4 4' : undefined}
        />
      ))}
      {visibleEdges.map((edge, i) => (
        <path
          key={`em${i}`}
          d={buildEdgePath(edge)}
          stroke={getEdgeStroke(edge)}
          strokeWidth={getEdgeWidth(edge, 'core')}
          strokeOpacity={getEdgeOpacity(edge, 'core')}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={edge.kind === 'truncated' ? '2 4' : edge.kind === 'merge' ? '4 4' : undefined}
        />
      ))}
      {visibleNodes.map((node) => {
        const cx = laneX(node.lane);
        const cy = (node.row + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
        const isSelected = selectedHash === node.commit.hash;
        const isOnCurrentPath = currentPathHashes.has(node.commit.hash);
        const isOnSelectedPath = selectedPathHashes.has(node.commit.hash);
        const isOnAnyFocusedPath = isOnCurrentPath || isOnSelectedPath;
        const isLatestCommitFocus = hasPassiveHeadFocus && node.commit.hash === headNode.commit.hash;
        const r = node.isMerge ? MERGE_NODE_RADIUS : NODE_RADIUS;
        const fillColor = node.color;
        const focusColor = isSelected ? selectedPathColor : fillColor;
        const baseOpacity = hasAnyPathHighlight && !isOnAnyFocusedPath && !isSelected ? 0.72 : 1;
        const pathStroke = isOnSelectedPath ? selectedPathColor : isOnCurrentPath ? currentPathColor : fillColor;

        return (
          <g key={node.commit.hash}>
            {isSelected && <circle cx={cx} cy={cy} r={r + 10} fill={focusColor} opacity={0.22} />}
            {isSelected && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={focusColor} strokeWidth={2.7} opacity={0.9} />}
            {isLatestCommitFocus && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={fillColor} strokeWidth={1.8} opacity={0.68} />}
            {isOnAnyFocusedPath && !isSelected && (
              <circle
                cx={cx}
                cy={cy}
                r={isOnSelectedPath ? r + 4 : r + 3}
                fill="none"
                stroke={pathStroke}
                strokeWidth={isOnSelectedPath ? 1.6 : 1.4}
                opacity={isOnSelectedPath ? 0.66 : 0.58}
              />
            )}
            {node.isMerge && (
              <>
                <rect
                  x={cx - r}
                  y={cy - r}
                  width={r * 2}
                  height={r * 2}
                  transform={`rotate(45 ${cx} ${cy})`}
                  fill={fillColor}
                  fillOpacity={baseOpacity}
                  stroke="var(--bg-darker)"
                  strokeWidth={2.5}
                  strokeOpacity={baseOpacity}
                  rx={1.5}
                />
                <circle cx={cx} cy={cy} r={r * 0.34} fill="var(--bg-darker)" fillOpacity={baseOpacity} />
              </>
            )}
            {!node.isMerge && (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={fillColor}
                fillOpacity={baseOpacity}
                stroke="var(--bg-darker)"
                strokeWidth={2.5}
                strokeOpacity={baseOpacity}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};
