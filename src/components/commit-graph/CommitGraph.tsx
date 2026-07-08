import React, { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  mergeableDecoratedRefs,
  normalizeBranchRefForMerge,
  type GitStatusDetailed,
} from '../../utils/gitParsing';
import { GraphNode, GraphEdge } from '../../utils/graphLayout';
import { useToastQueue } from '../../hooks/useToastQueue';
import { ActionToastViewport } from '../ActionToastViewport';
import { DiffRequest } from '../../types/diff';
import { useI18n } from '../../i18n';
import { formatDate, formatRelativeTime, formatTime } from '../../utils/dateTime';
import { BranchInfo, GitMergeMode } from '../../types/git';
import { useCommitGraphData } from './useCommitGraphData';
import { CommitGraphSvg } from './CommitGraphSvg';
import { ForensicSearchPanel, type ForensicSearchType } from './ForensicSearchPanel';
import { GRAPH_PADDING, LANE_WIDTH, ROW_HEIGHT } from './commitGraphConstants';
import { EmptyState } from '../EmptyState';
import {
  buildGraphHighlightData,
  getRefKind,
  resolveHighlightableBranchRef,
  sortRefs,
} from './commitGraphRefs';
import { useCommitGraphDialogs } from './useCommitGraphDialogs';
import { useCommitGraphSearch } from './useCommitGraphSearch';
import { useForensicSearch } from './useForensicSearch';
import { CommitSearchToolbar } from './CommitSearchToolbar';
import {
  CommitContextMenu,
  type ContextMenuPlacement,
  type ContextMenuState,
  type MenuAction,
  type MergeContextPayload,
} from './CommitContextMenu';
import { useCommitGraphViewport } from './useCommitGraphViewport';
import { buildCommitMenuActions } from './commitGraphMenuActions';
import { useCommitGraphGitActions } from './useCommitGraphGitActions';

export {
  buildGraphHighlightData,
  findCommitIndexByNavigationTarget,
} from './commitGraphRefs';

interface CommitGraphProps {
  repoPath: string | null;
  onSelectCommit?: (hash: string | null) => void;
  selectedHash?: string | null;
  navigationRequest?: { hash: string; requestId: number } | null;
  refreshTrigger?: number;
  commitRefreshTrigger?: number;
  showSecondaryHistory?: boolean;
  onOpenDiff?: (request: DiffRequest) => void;
  showRecoveryCenter?: boolean;
  onToggleRecoveryCenter?: () => void;
  currentBranch?: string;
  branches?: BranchInfo[];
  onMergeBranch?: (branchName: string, mode: GitMergeMode) => void;
  onRunGitCommand?: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
  /** Wenn ein Git-Befehl hier direkt fehlschlaegt (Fallback ohne zentralen Runner), Konflikt-Resolver oeffnen */
  onOpenConflictResolverForPath?: (path: string) => void;
  workingTreeStatus?: GitStatusDetailed | null;
  onRefreshWorkingTree?: () => Promise<void>;
}

export const CommitGraph: React.FC<CommitGraphProps> = ({
  repoPath,
  onSelectCommit,
  selectedHash,
  navigationRequest,
  refreshTrigger,
  commitRefreshTrigger,
  showSecondaryHistory = true,
  onOpenDiff,
  showRecoveryCenter = false,
  onToggleRecoveryCenter,
  currentBranch = '',
  branches = [],
  onMergeBranch,
  onRunGitCommand,
  onOpenConflictResolverForPath,
  workingTreeStatus: externalWorkingTreeStatus,
  onRefreshWorkingTree,
}) => {
  const { t, locale, tr } = useI18n();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuPlacement, setContextMenuPlacement] = useState<ContextMenuPlacement | null>(null);
  const [mergeCtxExpanded, setMergeCtxExpanded] = useState(false);
  const { toasts, setToast, dismiss } = useToastQueue(4000);
  const {
    setConfirmDialog,
    setInputDialog,
  } = useCommitGraphDialogs();
  const [highlightedBranchRef, setHighlightedBranchRef] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const didRunInitialBranchEffectRef = useRef(false);
  const resetForensicStateRef = useRef<() => void>(() => {});

  const forensicSearchTypeLabels = useMemo<Record<ForensicSearchType, string>>(() => ({
    string: t('generated.components.commit_graph.commitgraph.s_string_0380d62c'),
    regex: t('generated.components.commit_graph.commitgraph.g_regex_45e4b70c'),
    line: t('generated.components.commit_graph.commitgraph.l_line_range_a736c2f1'),
  }), [tr]);

  const handleRepoCleared = useCallback(() => {
    resetForensicStateRef.current();
  }, []);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const {
    layout,
    workingTreeStatus,
    loading,
    loadingMore,
    hasMoreCommits,
    refreshCommits,
    loadMoreCommits,
    refreshWorkingTreeStatus,
    requestCommitStats,
  } = useCommitGraphData({
    repoPath,
    showSecondaryHistory,
    refreshTrigger,
    commitRefreshTrigger,
    logContainerRef,
    onRepoCleared: handleRepoCleared,
    externalWorkingTreeStatus,
    onRefreshWorkingTree,
  });
  const {
    scrollTop,
    containerHeight,
  } = useCommitGraphViewport({
    logContainerRef,
    layout,
    repoPath,
    navigationRequest,
    workingTreeStatus,
    hasMoreCommits,
    loadingMore,
    loading,
    loadMoreCommits,
  });

  const {
    searchQuery,
    setSearchQuery,
    searchScope,
    setSearchScope,
    activeSearchPanel,
    setActiveSearchPanel,
    searchScopeLabels,
    normalizedSearch,
    matchedNodes,
    matchedHashSet,
    jumpToMatch,
  } = useCommitGraphSearch({
    layout,
    selectedHash,
    onSelectCommit,
    t,
  });
  const {
    forensicType,
    setForensicType,
    forensicPath,
    setForensicPath,
    forensicValue,
    setForensicValue,
    forensicStartLine,
    setForensicStartLine,
    forensicEndLine,
    setForensicEndLine,
    forensicLoading,
    forensicError,
    setForensicError,
    forensicResults,
    forensicPathSuggestions,
    runForensicSearch,
    resetForensicState,
  } = useForensicSearch({
    repoPath,
    workingTreeStatus,
    t,
  });
  resetForensicStateRef.current = resetForensicState;
  const runGitAction = useCommitGraphGitActions({
    onRunGitCommand,
    onOpenConflictResolverForPath,
    refreshCommits,
    refreshWorkingTreeStatus,
    setToast,
    t,
  });

  useEffect(() => {
    if (!selectedHash) return;
    void requestCommitStats([selectedHash], 'selected');
  }, [requestCommitStats, selectedHash]);

  useEffect(() => {
    if (!layout) return;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 20);
    const end = Math.min(
      layout.nodes.length,
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + 20,
    );
    const hashes = layout.nodes
      .slice(start, end)
      .filter((node) => node.commit.statsState === 'missing' || node.commit.statsState === 'error')
      .map((node) => node.commit.hash);
    if (hashes.length > 0) void requestCommitStats(hashes, 'visible');
  }, [containerHeight, layout, requestCommitStats, scrollTop]);

  useEffect(() => {
    setHighlightedBranchRef(null);
  }, [repoPath, currentBranch]);

  useEffect(() => {
    if (!repoPath) {
      didRunInitialBranchEffectRef.current = false;
      return;
    }
    if (!didRunInitialBranchEffectRef.current) {
      didRunInitialBranchEffectRef.current = true;
      return;
    }
    void refreshCommits('sync');
    void refreshWorkingTreeStatus();
  }, [currentBranch, refreshCommits, refreshWorkingTreeStatus, repoPath]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const updateContextMenuPlacement = useCallback(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const margin = 8;
    const menu = contextMenuRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = Math.max(160, viewportHeight - margin * 2);
    const menuWidth = menu.offsetWidth;
    const fullMenuHeight = Math.max(menu.scrollHeight, menu.offsetHeight);
    const visibleMenuHeight = Math.min(fullMenuHeight, maxHeight);

    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - visibleMenuHeight - margin);
    const left = Math.min(Math.max(margin, contextMenu.x), maxLeft);
    const top = Math.min(Math.max(margin, contextMenu.y), maxTop);

    setContextMenuPlacement((current) => {
      if (
        current
        && current.left === left
        && current.top === top
        && current.maxHeight === maxHeight
        && current.ready
      ) {
        return current;
      }
      return { left, top, maxHeight, ready: true };
    });
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setContextMenuPlacement(null);
      return;
    }

    updateContextMenuPlacement();
    const frame = window.requestAnimationFrame(updateContextMenuPlacement);
    return () => window.cancelAnimationFrame(frame);
  }, [contextMenu, mergeCtxExpanded, updateContextMenuPlacement]);

  useEffect(() => {
    if (!contextMenu) return;
    window.addEventListener('resize', updateContextMenuPlacement);
    return () => window.removeEventListener('resize', updateContextMenuPlacement);
  }, [contextMenu, updateContextMenuPlacement]);

  const handleContextMenu = (e: React.MouseEvent, node: GraphNode) => {
    e.preventDefault();
    e.stopPropagation();
    setMergeCtxExpanded(false);
    setContextMenuPlacement({
      left: e.clientX,
      top: e.clientY,
      maxHeight: Math.max(160, window.innerHeight - 16),
      ready: false,
    });
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const mergeContextPayload = useMemo<MergeContextPayload | null>(() => {
    if (!contextMenu || !currentBranch || !onMergeBranch) return null;
    const node = contextMenu.node;
    const refsHere = mergeableDecoratedRefs(node.commit.refs, currentBranch);
    const seen = new Set<string>(refsHere);
    const branchExtras = branches
      .filter(b => !(b.scope === 'local' && b.name === currentBranch))
      .filter(b => !seen.has(normalizeBranchRefForMerge(b.name)))
      .map(b => ({ raw: b.name, label: normalizeBranchRefForMerge(b.name), scope: b.scope }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      hash: node.commit.hash,
      shortHash: node.commit.abbrevHash,
      refsHere,
      branchExtras,
    };
  }, [branches, contextMenu, currentBranch, onMergeBranch]);

  const formatCommitDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return formatTime(d, locale, { hour: '2-digit', minute: '2-digit' });
      }
      if (diffDays < 7) return formatRelativeTime(d, locale, now);
      return formatDate(d, locale, { day: '2-digit', month: 'short' });
    } catch { return ''; }
  };

  const formatCommitStats = (files: number, additions: number, deletions: number) => {
    if (files === 0 && additions === 0 && deletions === 0) {
      return '0f +0 -0';
    }
    return `${files}f +${additions} -${deletions}`;
  };

  const hasWorkingTreeChanges = Boolean(
    workingTreeStatus &&
    (workingTreeStatus.staged.length > 0 || workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0)
  );
  const workingTreeRowOffset = hasWorkingTreeChanges ? 1 : 0;
  const visibleWindow = useMemo(() => {
    if (!layout) {
      return {
        visibleStartIdx: 0,
        visibleEndIdx: 0,
        visibleNodes: [] as GraphNode[],
        visibleEdges: [] as GraphEdge[],
      };
    }

    const overscan = 8;
    const visibleStartIdx = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT - workingTreeRowOffset) - overscan,
    );
    const visibleEndIdx = Math.min(
      layout.nodes.length,
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT - workingTreeRowOffset) + overscan,
    );
    return {
      visibleStartIdx,
      visibleEndIdx,
      visibleNodes: layout.nodes.slice(visibleStartIdx, visibleEndIdx),
      visibleEdges: layout.edges.filter(
        (edge) => (
          Math.min(edge.fromRow, edge.toRow) <= visibleEndIdx &&
          Math.max(edge.fromRow, edge.toRow) >= visibleStartIdx
        ),
      ),
    };
  }, [containerHeight, layout, scrollTop, workingTreeRowOffset]);
  const highlightData = useMemo(
    () => buildGraphHighlightData(layout, currentBranch, selectedHash, highlightedBranchRef),
    [currentBranch, highlightedBranchRef, layout, selectedHash],
  );
  const {
    visibleStartIdx,
    visibleEndIdx,
    visibleNodes,
    visibleEdges,
  } = visibleWindow;
  const {
    headNode: memoizedHeadNode,
    reachableFromHead,
    branchTipByRef,
    activeHighlightedBranch,
    selectedBranchTarget,
    hasSelectedCommitFocus,
    currentPathHashes,
    selectedPathHashes,
    hasAnyPathHighlight,
    currentPathColor,
    selectedPathColor,
    currentPathEdgeKeys,
    selectedPathEdgeKeys,
  } = highlightData;
  const getMenuActions = useCallback((node: GraphNode): MenuAction[] => buildCommitMenuActions({
    node,
    branches,
    currentBranch,
    layout,
    reachableFromHead,
    runGitAction,
    setConfirmDialog,
    setInputDialog,
    setToast,
    refreshCommits,
    refreshWorkingTreeStatus,
    t,
  }), [
    branches,
    currentBranch,
    layout,
    reachableFromHead,
    refreshCommits,
    refreshWorkingTreeStatus,
    runGitAction,
    setConfirmDialog,
    setInputDialog,
    setToast,
    t,
  ]);

  if (!repoPath) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>{t('generated.components.commit_graph.commitgraph.please_select_a_repository_to_view_the_graph_3653ac88')}</div>;
  }
  if (loading) {
    return (
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 1 - i * 0.09 }}>
            <div className="skeleton-circle" style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0 }} />
            <div className="skeleton-line" style={{ height: 10, width: `${45 + (i % 3) * 15}%`, borderRadius: 4 }} />
            <div className="skeleton-line" style={{ height: 10, width: 70, borderRadius: 4, marginLeft: 'auto', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    );
  }
  if (!layout || layout.nodes.length === 0) {
    return (
      <EmptyState
        title={t('generated.components.commit_graph.commitgraph.no_commits_found_c43024aa')}
        description={t('generated.components.commit_graph.commitgraph.create_your_first_commit_in_the_staging_area_6d149098')}
      />
    );
  }

  const headNode = memoizedHeadNode as GraphNode;
  const graphWidth = Math.max((layout.maxLane + 1) * LANE_WIDTH + GRAPH_PADDING * 2, 60);
  const totalHeight = (layout.nodes.length + workingTreeRowOffset) * ROW_HEIGHT;
  const topSpacerHeight = visibleStartIdx * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (layout.nodes.length - visibleEndIdx) * ROW_HEIGHT);
  const workingTreeLabel = !workingTreeStatus ? ''
    : workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0
      ? 'Uncommitted Changes'
      : 'Staged Changes';
  const workingTreeCount = !workingTreeStatus ? 0
    : workingTreeStatus.staged.length + workingTreeStatus.unstaged.length + workingTreeStatus.untracked.length;
  const isWorkingTreeSelected = hasWorkingTreeChanges && selectedHash === null;
  const hasPassiveHeadFocus = !hasWorkingTreeChanges && !selectedHash && !hasAnyPathHighlight;

  const isSecondaryCommit = (hash: string) => !reachableFromHead.has(hash);

  return (
    <>
      <CommitSearchToolbar
        activeSearchPanel={activeSearchPanel}
        onActiveSearchPanelChange={(mode) => {
          setActiveSearchPanel(mode);
          if (mode === 'forensic') setForensicError(null);
        }}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        searchScopeLabels={searchScopeLabels}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        showRecoveryCenter={showRecoveryCenter}
        onToggleRecoveryCenter={onToggleRecoveryCenter}
        normalizedSearch={normalizedSearch}
        matchCount={matchedNodes.length}
        onJumpToPreviousMatch={() => jumpToMatch(-1)}
        onJumpToNextMatch={() => jumpToMatch(1)}
        t={t}
      />


      <ForensicSearchPanel
        activeSearchPanel={activeSearchPanel}
        setActiveSearchPanel={(mode) => {
          setActiveSearchPanel(mode);
          if (mode === 'forensic') setForensicError(null);
        }}
        forensicType={forensicType}
        setForensicType={(type) => {
          setForensicType(type);
          setForensicError(null);
        }}
        forensicSearchTypeLabels={forensicSearchTypeLabels}
        forensicPath={forensicPath}
        setForensicPath={setForensicPath}
        forensicPathSuggestions={forensicPathSuggestions}
        forensicValue={forensicValue}
        setForensicValue={setForensicValue}
        forensicStartLine={forensicStartLine}
        setForensicStartLine={setForensicStartLine}
        forensicEndLine={forensicEndLine}
        setForensicEndLine={setForensicEndLine}
        forensicLoading={forensicLoading}
        forensicError={forensicError}
        forensicResults={forensicResults}
        runForensicSearch={runForensicSearch}
        onSelectCommit={onSelectCommit}
        onOpenDiff={onOpenDiff}
        t={t}
      />

      <div ref={logContainerRef} className="commit-graph-container">
        <CommitGraphSvg
          maxLane={layout.maxLane}
          graphWidth={graphWidth}
          totalHeight={totalHeight}
          workingTreeRowOffset={workingTreeRowOffset}
          visibleEdges={visibleEdges}
          visibleNodes={visibleNodes}
          allNodes={layout.nodes}
          headNode={headNode}
          hasWorkingTreeChanges={hasWorkingTreeChanges}
          selectedHash={selectedHash}
          showSecondaryHistory={showSecondaryHistory}
          reachableFromHead={reachableFromHead}
          currentPathHashes={currentPathHashes}
          selectedPathHashes={selectedPathHashes}
          hasAnyPathHighlight={hasAnyPathHighlight}
          currentPathColor={currentPathColor}
          selectedPathColor={selectedPathColor}
          currentPathEdgeKeys={currentPathEdgeKeys}
          selectedPathEdgeKeys={selectedPathEdgeKeys}
          hasPassiveHeadFocus={hasPassiveHeadFocus}
        />

        {hasWorkingTreeChanges && (
          <div
            className={`commit-row working-tree-row ${isWorkingTreeSelected ? 'selected' : ''}`}
            onClick={() => onSelectCommit && onSelectCommit(null)}
            style={{
              height: ROW_HEIGHT,
              paddingLeft: graphWidth,
              ...(isWorkingTreeSelected ? ({ ['--commit-focus-color' as any]: 'var(--status-warning)' } as React.CSSProperties) : {}),
            }}
          >
            <div className="commit-info">
              <span className="commit-hash">WORKDIR</span>
              <div className="commit-main">
                <div className="commit-refs">
                  {workingTreeStatus!.staged.length > 0 && (
                    <span className="branch-label tag">
                      {workingTreeStatus!.staged.length} staged
                    </span>
                  )}
                  {workingTreeStatus!.unstaged.length > 0 && (
                    <span className="branch-label working-tree">
                      {workingTreeStatus!.unstaged.length} unstaged
                    </span>
                  )}
                  {workingTreeStatus!.untracked.length > 0 && (
                    <span className="branch-label remote">
                      {workingTreeStatus!.untracked.length} untracked
                    </span>
                  )}
                </div>
                <div className="commit-subject-row">
                  <span className="commit-subject">{workingTreeLabel}</span>
                  <span className="commit-meta">
                    <span className="commit-author">{t('generated.components.commit_graph.commitgraph.click_to_stage_commit_ed989f59')}</span>
                    <span className="commit-date">{workingTreeCount}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} aria-hidden="true" />}
        {visibleNodes.map((node) => {
          const isSelected = selectedHash === node.commit.hash;
          const isSecondary = isSecondaryCommit(node.commit.hash);
          const isSearchMatch = normalizedSearch ? matchedHashSet.has(node.commit.hash) : false;
          const isOnCurrentPath = currentPathHashes.has(node.commit.hash);
          const isOnSelectedPath = selectedPathHashes.has(node.commit.hash);
          const isHeadCommit = node.commit.refs.some(ref => ref.startsWith('HEAD ->') || ref === 'HEAD');
          const resetsToDefaultFocus = node.commit.hash === headNode.commit.hash;
          const isLatestCommitFocus = hasPassiveHeadFocus && node.commit.hash === headNode.commit.hash;
          const isMutedByPathFocus = hasAnyPathHighlight && !isOnCurrentPath && !isOnSelectedPath && !isSelected;
          const sortedRefs = sortRefs(node.commit.refs);
          const rowStyle: React.CSSProperties = {
            height: ROW_HEIGHT,
            paddingLeft: graphWidth,
            ...(isSearchMatch ? { boxShadow: 'inset 0 0 0 1px var(--accent-primary-strong)' } : {}),
            ...(isOnCurrentPath ? ({ ['--path-highlight-color' as any]: currentPathColor } as React.CSSProperties) : {}),
            ...(isOnSelectedPath ? ({ ['--selected-path-color' as any]: selectedPathColor } as React.CSSProperties) : {}),
            ...(isSelected ? ({ ['--commit-focus-color' as any]: selectedPathColor } as React.CSSProperties) : {}),
            ...(isLatestCommitFocus ? ({ ['--latest-focus-color' as any]: node.color } as React.CSSProperties) : {}),
          };
          return (
            <div
              key={node.commit.hash}
              className={`commit-row ${isSelected ? 'selected commit-click-focus' : ''} ${showSecondaryHistory && isSecondary ? 'secondary-history' : ''} ${isOnCurrentPath ? 'path-highlighted' : ''} ${isOnSelectedPath ? 'selected-branch-path' : ''} ${isLatestCommitFocus ? 'latest-focus' : ''} ${isMutedByPathFocus ? 'path-muted' : ''} ${isHeadCommit && isOnCurrentPath ? 'head-current' : ''}`}
              onClick={() => {
                if (!onSelectCommit) return;
                if (resetsToDefaultFocus) {
                  setHighlightedBranchRef(null);
                }
                onSelectCommit(node.commit.hash);
              }}
              onContextMenu={(e) => handleContextMenu(e, node)}
              style={rowStyle}
              data-commit-hash={node.commit.hash}
            >
              <div className="commit-info">
                <span className="commit-hash">{node.commit.abbrevHash}</span>
                <div className="commit-main">
                  {sortedRefs.length > 0 && (
                    <div className="commit-refs">
                      {sortedRefs.map((ref, ri) => {
                        const branchTarget = resolveHighlightableBranchRef(ref);
                        const isActiveBranchRef = Boolean(
                          branchTarget && (
                            hasSelectedCommitFocus
                              ? selectedBranchTarget === branchTarget
                              : activeHighlightedBranch === branchTarget
                          ),
                        );
                        const branchFocusColor = branchTarget ? (branchTipByRef.get(branchTarget)?.color ?? 'var(--text-accent)') : 'var(--text-accent)';

                        if (!branchTarget) {
                          return (
                            <span key={ri} className={`branch-label ${getRefKind(ref)}`}>
                              {ref}
                            </span>
                          );
                        }

                        return (
                          <button
                            key={ri}
                            type="button"
                            className={`branch-label ${getRefKind(ref)} branch-toggle ${isActiveBranchRef ? 'active' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setHighlightedBranchRef((previous) => (previous === branchTarget ? null : branchTarget));
                            }}
                            style={isActiveBranchRef ? ({ ['--branch-focus-color' as any]: branchFocusColor } as React.CSSProperties) : undefined}
                            title={t('generated.components.commit_graph.commitgraph.highlight_branch_path_d8128078')}
                          >
                            {ref}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="commit-subject-row">
                    <span className="commit-subject">{node.commit.subject}</span>
                    <span className="commit-meta">
                      <span className="commit-author">{node.commit.author}</span>
                      <span
                        className="commit-stats"
                        title={node.commit.stats
                          ? `${node.commit.stats.files} files changed, ${node.commit.stats.additions} additions, ${node.commit.stats.deletions} deletions`
                          : t('generated.components.commit_graph.commitgraph.commit_statistics_are_loading_in_the_background_e5b6b683')}
                      >
                        {node.commit.stats
                          ? formatCommitStats(node.commit.stats.files, node.commit.stats.additions, node.commit.stats.deletions)
                          : '...'}
                      </span>
                      <span className="commit-date">{formatCommitDate(node.commit.date)}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />}
        {(loadingMore || hasMoreCommits) && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 18px', paddingLeft: graphWidth }}>
            <button
              type="button"
              onClick={() => loadMoreCommits()}
              disabled={loadingMore}
              style={{
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.78rem',
                cursor: loadingMore ? 'default' : 'pointer',
                opacity: loadingMore ? 0.7 : 1,
              }}
            >
              {loadingMore ? 'Lade weitere Commits...' : 'Mehr laden'}
            </button>
          </div>
        )}
      </div>

      {contextMenu && (
        <CommitContextMenu
          contextMenu={contextMenu}
          contextMenuRef={contextMenuRef}
          contextMenuPlacement={contextMenuPlacement}
          menuActions={getMenuActions(contextMenu.node)}
          mergeContextPayload={mergeContextPayload}
          canMergeBranches={Boolean(onMergeBranch && currentBranch)}
          mergeCtxExpanded={mergeCtxExpanded}
          onToggleMergeExpanded={() => setMergeCtxExpanded(v => !v)}
          onClose={() => setContextMenu(null)}
          onRunMenuAction={(item) => {
            setContextMenu(null);
            item.action();
          }}
          onMergeCommit={(hash, shortHash) => {
            setContextMenu(null);
            setConfirmDialog({
              variant: 'confirm',
              title: t('generated.components.commit_graph.commitgraph.merge_commit_29707783'),
              message: t('generated.components.commit_graph.commitgraph.git_merge_merges_this_commit_into_the_current_branch_may_a39118f2'),
              contextItems: [
                { label: t('generated.components.commit_graph.commitgraph.commit_b9ec78bd'), value: shortHash },
                { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: `git merge ${hash}` },
              ],
              irreversible: false,
              consequences: t('generated.components.commit_graph.commitgraph.if_conflicts_occur_resolve_them_in_the_working_tree_and_54357bae'),
              confirmLabel: t('generated.components.commit_graph.commitgraph.start_merge_516b5e37'),
              onConfirm: async () => {
                await runGitAction(
                  ['merge', hash],
                  tr(`Merge von ${shortHash} abgeschlossen.`, `Merge of ${shortHash} completed.`),
                );
              },
            });
          }}
          onMergeBranchRef={(branchRef) => {
            setContextMenu(null);
            onMergeBranch?.(branchRef, 'default');
          }}
          t={t}
        />
      )}

      <ActionToastViewport toasts={toasts} onDismiss={dismiss} />
    </>
  );
};
