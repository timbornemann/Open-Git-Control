import React from 'react';
import { GraphEdge, GraphNode } from '../../utils/graphLayout';
import {
  GRAPH_PADDING,
  LANE_WIDTH,
  MERGE_NODE_RADIUS,
  NODE_RADIUS,
  ROW_HEIGHT,
  SECONDARY_GRAPH_ACCENT,
} from './commitGraphConstants';

export const graphEdgeKey = (edge: GraphEdge) => (
  `${edge.fromRow}:${edge.fromLane}->${edge.toRow}:${edge.toLane}:${edge.kind}`
);

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

const laneX = (lane: number) => GRAPH_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;

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
  const buildEdgePath = (edge: GraphEdge): string => {
    const x1 = laneX(edge.fromLane);
    const y1 = (edge.fromRow + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x2 = laneX(edge.toLane);
    const y2 = Math.min((edge.toRow + workingTreeRowOffset) * ROW_HEIGHT + ROW_HEIGHT / 2, totalHeight);

    if (x1 === x2) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    const verticalSpan = Math.max(8, y2 - y1);
    const turnOffset = Math.min(ROW_HEIGHT * 0.8, Math.max(10, verticalSpan * 0.42));
    const rawTurnY = y2 - turnOffset;
    const turnY = Math.max(y1 + 8, Math.min(y2 - 8, rawTurnY));
    const direction = x2 > x1 ? 1 : -1;
    const controlInset = Math.min(14, Math.abs(x2 - x1) * 0.45);

    return `M ${x1} ${y1} L ${x1} ${turnY} C ${x1 + direction * controlInset} ${turnY}, ${x2 - direction * controlInset} ${turnY}, ${x2} ${turnY} L ${x2} ${y2}`;
  };

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
    <svg
      width={graphWidth}
      height={totalHeight}
      className="commit-graph-svg"
    >
      {Array.from({ length: maxLane + 1 }).map((_, lane) => {
        const x = laneX(lane);
        return (
          <line
            key={`lane-${lane}`}
            x1={x}
            y1={0}
            x2={x}
            y2={totalHeight}
            stroke="var(--line-subtle)"
            strokeWidth={1}
          />
        );
      })}
      {hasWorkingTreeChanges && headNode && (
        <>
          <path
            d={`M ${laneX(headNode.lane)} ${ROW_HEIGHT / 2} L ${laneX(headNode.lane)} ${ROW_HEIGHT + ROW_HEIGHT / 2}`}
            stroke={headNode.color}
            strokeWidth={5}
            strokeOpacity={0.1}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M ${laneX(headNode.lane)} ${ROW_HEIGHT / 2} L ${laneX(headNode.lane)} ${ROW_HEIGHT + ROW_HEIGHT / 2}`}
            stroke={headNode.color}
            strokeWidth={2.2}
            strokeOpacity={0.92}
            fill="none"
            strokeLinecap="round"
          />
          <circle
            cx={laneX(headNode.lane)}
            cy={ROW_HEIGHT / 2}
            r={NODE_RADIUS + 2}
            fill="var(--bg-darker)"
            stroke="var(--status-warning)"
            strokeWidth={2.2}
          />
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
          strokeDasharray={edge.kind === 'merge' ? '4 4' : undefined}
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
          strokeDasharray={edge.kind === 'merge' ? '4 4' : undefined}
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
        const pathStroke = isOnSelectedPath
          ? selectedPathColor
          : isOnCurrentPath
            ? currentPathColor
            : fillColor;

        return (
          <g key={node.commit.hash}>
            {isSelected && (
              <circle
                cx={cx}
                cy={cy}
                r={r + 10}
                fill={focusColor}
                opacity={0.22}
              />
            )}
            {isSelected && (
              <circle
                cx={cx}
                cy={cy}
                r={r + 6}
                fill="none"
                stroke={focusColor}
                strokeWidth={2.7}
                opacity={0.9}
              />
            )}
            {isLatestCommitFocus && (
              <circle
                cx={cx}
                cy={cy}
                r={r + 5}
                fill="none"
                stroke={fillColor}
                strokeWidth={1.8}
                opacity={0.68}
              />
            )}
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
