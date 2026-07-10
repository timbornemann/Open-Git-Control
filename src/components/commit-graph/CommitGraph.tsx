import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { GitStatusDetailed } from '@/utils/gitParsing';
import type { GraphNode, GraphEdge } from '@/utils/graphLayout';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import type { DiffRequest } from '@/types/diff';
import { useI18n } from '@/i18n';
import type { BranchInfo, GitMergeMode } from '@/types/git';
import { useCommitGraphData } from './useCommitGraphData';
import { CommitGraphSvg } from './CommitGraphSvg';
import { ForensicSearchPanel, type ForensicSearchType } from './ForensicSearchPanel';
import { GRAPH_PADDING, LANE_WIDTH, ROW_HEIGHT } from './commitGraphConstants';
import { EmptyState } from '@/components/EmptyState';
import { buildGraphHighlightData } from './commitGraphRefs';
import { useCommitGraphDialogs } from './useCommitGraphDialogs';
import { useCommitGraphSearch } from './useCommitGraphSearch';
import { useForensicSearch } from './useForensicSearch';
import { CommitSearchToolbar } from './CommitSearchToolbar';
import type { MenuAction } from './CommitContextMenu';
import { useCommitGraphViewport } from './useCommitGraphViewport';
import { buildCommitMenuActions } from './commitGraphMenuActions';
import { useCommitGraphGitActions } from './useCommitGraphGitActions';
import { useCommitGraphContextMenu } from './useCommitGraphContextMenu';
import { CommitGraphContextMenuLayer } from './CommitGraphContextMenuLayer';
import { CommitGraphRows } from './CommitGraphRows';
import { formatCommitDate, formatCommitStats } from './commitGraphFormatters';
import '@/styles/commit-graph.css';

export { buildGraphHighlightData, findCommitIndexByNavigationTarget } from './commitGraphRefs';

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
  const { toasts, setToast, dismiss } = useToastQueue(4000);
  const { setConfirmDialog, setInputDialog } = useCommitGraphDialogs();
  const [highlightedBranchRef, setHighlightedBranchRef] = useState<string | null>(null);
  const didRunInitialBranchEffectRef = useRef(false);
  const resetForensicStateRef = useRef<() => void>(() => {});
  const { contextMenu, contextMenuRef, contextMenuPlacement, mergeCtxExpanded, mergeContextPayload, closeContextMenu, handleContextMenu, toggleMergeContext } =
    useCommitGraphContextMenu({ branches, currentBranch, onMergeBranch });

  const forensicSearchTypeLabels = useMemo<Record<ForensicSearchType, string>>(
    () => ({
      string: t('generated.components.commit_graph.commitgraph.s_string_0380d62c'),
      regex: t('generated.components.commit_graph.commitgraph.g_regex_45e4b70c'),
      line: t('generated.components.commit_graph.commitgraph.l_line_range_a736c2f1'),
    }),
    [t],
  );

  const handleRepoCleared = useCallback(() => {
    resetForensicStateRef.current();
  }, []);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const { layout, workingTreeStatus, loading, loadingMore, hasMoreCommits, refreshCommits, loadMoreCommits, refreshWorkingTreeStatus, requestCommitStats } =
    useCommitGraphData({
      repoPath,
      showSecondaryHistory,
      refreshTrigger,
      commitRefreshTrigger,
      logContainerRef,
      onRepoCleared: handleRepoCleared,
      externalWorkingTreeStatus,
      onRefreshWorkingTree,
    });
  const { scrollTop, containerHeight } = useCommitGraphViewport({
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
    const end = Math.min(layout.nodes.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + 20);
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

  const hasWorkingTreeChanges = Boolean(
    workingTreeStatus && (workingTreeStatus.staged.length > 0 || workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0),
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
    const visibleStartIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT - workingTreeRowOffset) - overscan);
    const visibleEndIdx = Math.min(layout.nodes.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT - workingTreeRowOffset) + overscan);
    return {
      visibleStartIdx,
      visibleEndIdx,
      visibleNodes: layout.nodes.slice(visibleStartIdx, visibleEndIdx),
      visibleEdges: layout.edges.filter((edge) => Math.min(edge.fromRow, edge.toRow) <= visibleEndIdx && Math.max(edge.fromRow, edge.toRow) >= visibleStartIdx),
    };
  }, [containerHeight, layout, scrollTop, workingTreeRowOffset]);
  const highlightData = useMemo(
    () => buildGraphHighlightData(layout, currentBranch, selectedHash, highlightedBranchRef),
    [currentBranch, highlightedBranchRef, layout, selectedHash],
  );
  const { visibleStartIdx, visibleEndIdx, visibleNodes, visibleEdges } = visibleWindow;
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
  const getMenuActions = useCallback(
    (node: GraphNode): MenuAction[] =>
      buildCommitMenuActions({
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
        tr,
      }),
    [
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
      tr,
    ],
  );

  if (!repoPath) {
    return (
      <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>
        {t('generated.components.commit_graph.commitgraph.please_select_a_repository_to_view_the_graph_3653ac88')}
      </div>
    );
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
  const workingTreeLabel = !workingTreeStatus
    ? ''
    : workingTreeStatus.unstaged.length > 0 || workingTreeStatus.untracked.length > 0
      ? 'Uncommitted Changes'
      : 'Staged Changes';
  const workingTreeCount = !workingTreeStatus ? 0 : workingTreeStatus.staged.length + workingTreeStatus.unstaged.length + workingTreeStatus.untracked.length;
  const isWorkingTreeSelected = hasWorkingTreeChanges && selectedHash === null;
  const hasPassiveHeadFocus = !hasWorkingTreeChanges && !selectedHash && !hasAnyPathHighlight;

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

        <CommitGraphRows
          graphWidth={graphWidth}
          workingTreeStatus={workingTreeStatus}
          hasWorkingTreeChanges={hasWorkingTreeChanges}
          isWorkingTreeSelected={isWorkingTreeSelected}
          workingTreeLabel={workingTreeLabel}
          workingTreeCount={workingTreeCount}
          topSpacerHeight={topSpacerHeight}
          bottomSpacerHeight={bottomSpacerHeight}
          visibleNodes={visibleNodes}
          selectedHash={selectedHash}
          showSecondaryHistory={showSecondaryHistory}
          matchedHashSet={matchedHashSet}
          normalizedSearch={normalizedSearch}
          currentPathHashes={currentPathHashes}
          selectedPathHashes={selectedPathHashes}
          hasAnyPathHighlight={hasAnyPathHighlight}
          currentPathColor={currentPathColor}
          selectedPathColor={selectedPathColor}
          branchTipByRef={branchTipByRef}
          activeHighlightedBranch={activeHighlightedBranch}
          selectedBranchTarget={selectedBranchTarget}
          hasSelectedCommitFocus={hasSelectedCommitFocus}
          headNode={headNode}
          reachableFromHead={reachableFromHead}
          hasPassiveHeadFocus={hasPassiveHeadFocus}
          loadingMore={loadingMore}
          hasMoreCommits={hasMoreCommits}
          onLoadMoreCommits={loadMoreCommits}
          onSelectCommit={onSelectCommit}
          onContextMenu={handleContextMenu}
          onToggleBranchHighlight={(branchTarget) => setHighlightedBranchRef((previous) => (previous === branchTarget ? null : branchTarget))}
          onClearBranchHighlight={() => setHighlightedBranchRef(null)}
          formatCommitDate={(dateStr) => formatCommitDate(dateStr, locale)}
          formatCommitStats={formatCommitStats}
          t={t}
        />
      </div>

      <CommitGraphContextMenuLayer
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        contextMenuPlacement={contextMenuPlacement}
        getMenuActions={getMenuActions}
        mergeContextPayload={mergeContextPayload}
        canMergeBranches={Boolean(onMergeBranch && currentBranch)}
        mergeCtxExpanded={mergeCtxExpanded}
        onToggleMergeExpanded={toggleMergeContext}
        onClose={closeContextMenu}
        runGitAction={runGitAction}
        setConfirmDialog={setConfirmDialog}
        onMergeBranch={onMergeBranch}
        t={t}
        tr={tr}
      />

      <ActionToastViewport toasts={toasts} onDismiss={dismiss} />
    </>
  );
};
