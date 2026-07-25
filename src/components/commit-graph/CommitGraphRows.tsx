import type { CSSProperties, MouseEvent } from 'react';
import type { CatalogTranslateFn } from '@/i18n';
import type { GitStatusDetailed } from '@/utils/gitParsing';
import type { GraphNode } from '@/utils/graphLayout';
import { getRefKind, resolveHighlightableBranchRef, sortRefs } from './commitGraphRefs';
import { ROW_HEIGHT } from './commitGraphConstants';
import type { WorkingTreeChangeSummary } from './commitGraphWorkingTree';

type CommitGraphRowStyle = CSSProperties & {
  '--branch-focus-color'?: string;
  '--commit-focus-color'?: string;
  '--latest-focus-color'?: string;
  '--path-highlight-color'?: string;
  '--selected-path-color'?: string;
};

type CommitGraphRowsProps = {
  graphWidth: number;
  workingTreeStatus: GitStatusDetailed | null;
  hasWorkingTreeChanges: boolean;
  isWorkingTreeSelected: boolean;
  workingTreeLabel: string;
  workingTreeCount: number;
  workingTreeSummary: WorkingTreeChangeSummary;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  visibleNodes: GraphNode[];
  selectedHash?: string | null;
  showSecondaryHistory: boolean;
  matchedHashSet: Set<string>;
  normalizedSearch: string;
  currentPathHashes: Set<string>;
  selectedPathHashes: Set<string>;
  hasAnyPathHighlight: boolean;
  currentPathColor: string;
  selectedPathColor: string;
  branchTipByRef: Map<string, GraphNode>;
  localBranchNames: ReadonlySet<string>;
  conflictingTags: ReadonlySet<string>;
  activeHighlightedBranch: string | null;
  selectedBranchTarget?: string;
  hasSelectedCommitFocus: boolean;
  headNode: GraphNode;
  reachableFromHead: Set<string>;
  hasPassiveHeadFocus: boolean;
  loadingMore: boolean;
  hasMoreCommits: boolean;
  onLoadMoreCommits: () => Promise<void> | void;
  onSelectCommit?: (hash: string | null) => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, node: GraphNode) => void;
  onToggleBranchHighlight: (branchTarget: string) => void;
  onClearBranchHighlight: () => void;
  formatCommitDate: (dateStr: string) => string;
  formatCommitStats: (files: number, additions: number, deletions: number) => string;
  t: CatalogTranslateFn;
};

const getCommitRowClassName = (params: {
  isSelected: boolean;
  showSecondaryHistory: boolean;
  isSecondary: boolean;
  isOnCurrentPath: boolean;
  isOnSelectedPath: boolean;
  isLatestCommitFocus: boolean;
  isMutedByPathFocus: boolean;
  isHeadCommit: boolean;
}) =>
  [
    'commit-row',
    params.isSelected ? 'selected commit-click-focus' : '',
    params.showSecondaryHistory && params.isSecondary ? 'secondary-history' : '',
    params.isOnCurrentPath ? 'path-highlighted' : '',
    params.isOnSelectedPath ? 'selected-branch-path' : '',
    params.isLatestCommitFocus ? 'latest-focus' : '',
    params.isMutedByPathFocus ? 'path-muted' : '',
    params.isHeadCommit && params.isOnCurrentPath ? 'head-current' : '',
  ]
    .filter(Boolean)
    .join(' ');

export const CommitGraphRows = ({
  graphWidth,
  workingTreeStatus,
  hasWorkingTreeChanges,
  isWorkingTreeSelected,
  workingTreeLabel,
  workingTreeCount,
  workingTreeSummary,
  topSpacerHeight,
  bottomSpacerHeight,
  visibleNodes,
  selectedHash,
  showSecondaryHistory,
  matchedHashSet,
  normalizedSearch,
  currentPathHashes,
  selectedPathHashes,
  hasAnyPathHighlight,
  currentPathColor,
  selectedPathColor,
  branchTipByRef,
  localBranchNames,
  conflictingTags,
  activeHighlightedBranch,
  selectedBranchTarget,
  hasSelectedCommitFocus,
  headNode,
  reachableFromHead,
  hasPassiveHeadFocus,
  loadingMore,
  hasMoreCommits,
  onLoadMoreCommits,
  onSelectCommit,
  onContextMenu,
  onToggleBranchHighlight,
  onClearBranchHighlight,
  formatCommitDate,
  formatCommitStats,
  t,
}: CommitGraphRowsProps) => (
  <>
    {hasWorkingTreeChanges && workingTreeStatus && (
      <div
        className={`commit-row working-tree-row ${isWorkingTreeSelected ? 'selected' : ''}`}
        onClick={() => onSelectCommit?.(null)}
        style={{
          height: ROW_HEIGHT,
          paddingLeft: graphWidth,
          ...(isWorkingTreeSelected ? ({ '--commit-focus-color': 'var(--status-warning)' } satisfies CommitGraphRowStyle) : {}),
        }}
      >
        <div className="commit-info">
          <span className="commit-hash">WORKDIR</span>
          <div className="commit-main">
            <div className="commit-refs">
              {workingTreeSummary.conflicts > 0 && <span className="branch-label working-tree">{workingTreeSummary.conflicts} conflicts</span>}
              {workingTreeSummary.staged > 0 && <span className="branch-label tag">{workingTreeSummary.staged} staged</span>}
              {workingTreeSummary.unstaged > 0 && <span className="branch-label working-tree">{workingTreeSummary.unstaged} unstaged</span>}
              {workingTreeSummary.untracked > 0 && <span className="branch-label remote">{workingTreeSummary.untracked} untracked</span>}
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
      const isSecondary = !reachableFromHead.has(node.commit.hash);
      const isSearchMatch = normalizedSearch ? matchedHashSet.has(node.commit.hash) : false;
      const isOnCurrentPath = currentPathHashes.has(node.commit.hash);
      const isOnSelectedPath = selectedPathHashes.has(node.commit.hash);
      const isHeadCommit = node.commit.refs.some((ref) => ref.startsWith('HEAD ->') || ref === 'HEAD');
      const resetsToDefaultFocus = node.commit.hash === headNode.commit.hash;
      const isLatestCommitFocus = hasPassiveHeadFocus && resetsToDefaultFocus;
      const isMutedByPathFocus = hasAnyPathHighlight && !isOnCurrentPath && !isOnSelectedPath && !isSelected;
      const sortedRefs = sortRefs(node.commit.refs, localBranchNames);
      const rowStyle: CommitGraphRowStyle = {
        height: ROW_HEIGHT,
        paddingLeft: graphWidth,
        ...(isSearchMatch ? { boxShadow: 'inset 0 0 0 1px var(--accent-primary-strong)' } : {}),
        ...(isOnCurrentPath ? { '--path-highlight-color': currentPathColor } : {}),
        ...(isOnSelectedPath ? { '--selected-path-color': selectedPathColor } : {}),
        ...(isSelected ? { '--commit-focus-color': selectedPathColor } : {}),
        ...(isLatestCommitFocus ? { '--latest-focus-color': node.color } : {}),
      };

      return (
        <div
          key={node.commit.hash}
          className={getCommitRowClassName({
            isSelected,
            showSecondaryHistory,
            isSecondary,
            isOnCurrentPath,
            isOnSelectedPath,
            isLatestCommitFocus,
            isMutedByPathFocus,
            isHeadCommit,
          })}
          onClick={() => {
            if (!onSelectCommit) return;
            if (resetsToDefaultFocus) {
              onClearBranchHighlight();
            }
            onSelectCommit(node.commit.hash);
          }}
          onContextMenu={(event) => onContextMenu(event, node)}
          style={rowStyle}
          data-commit-hash={node.commit.hash}
        >
          <div className="commit-info">
            <span className="commit-hash">{node.commit.abbrevHash}</span>
            <div className="commit-main">
              {sortedRefs.length > 0 && (
                <div className="commit-refs">
                  {sortedRefs.map((ref, index) => {
                    const branchTarget = resolveHighlightableBranchRef(ref);
                    const hasTagConflict = ref.startsWith('tag:') && conflictingTags.has(ref.slice('tag:'.length).trim());
                    const isActiveBranchRef = Boolean(
                      branchTarget && (hasSelectedCommitFocus ? selectedBranchTarget === branchTarget : activeHighlightedBranch === branchTarget),
                    );
                    const branchFocusColor = branchTarget ? (branchTipByRef.get(branchTarget)?.color ?? 'var(--text-accent)') : 'var(--text-accent)';

                    if (!branchTarget) {
                      return (
                        <span
                          key={index}
                          className={`branch-label ${getRefKind(ref, localBranchNames)}${hasTagConflict ? ' tag-conflict' : ''}`}
                          title={hasTagConflict ? 'Tag-Konflikt: Lokaler und Remote-Tag zeigen auf unterschiedliche Commits.' : undefined}
                        >
                          {ref}
                        </span>
                      );
                    }

                    return (
                      <button
                        key={index}
                        type="button"
                        className={`branch-label ${getRefKind(ref, localBranchNames)} branch-toggle ${isActiveBranchRef ? 'active' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleBranchHighlight(branchTarget);
                        }}
                        style={isActiveBranchRef ? ({ '--branch-focus-color': branchFocusColor } as CommitGraphRowStyle) : undefined}
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
                    title={
                      node.commit.stats
                        ? `${node.commit.stats.files} files changed, ${node.commit.stats.additions} additions, ${node.commit.stats.deletions} deletions`
                        : t('generated.components.commit_graph.commitgraph.commit_statistics_are_loading_in_the_background_e5b6b683')
                    }
                  >
                    {node.commit.stats ? formatCommitStats(node.commit.stats.files, node.commit.stats.additions, node.commit.stats.deletions) : '...'}
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
          onClick={() => onLoadMoreCommits()}
          disabled={loadingMore}
          className="commit-graph-load-more"
          style={{
            cursor: loadingMore ? 'default' : 'pointer',
            opacity: loadingMore ? 0.7 : 1,
          }}
        >
          {loadingMore ? 'Lade weitere Commits...' : 'Mehr laden'}
        </button>
      </div>
    )}
  </>
);
