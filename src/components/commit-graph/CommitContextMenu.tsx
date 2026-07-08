import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GraphNode } from '../../utils/graphLayout';

export type ContextMenuState = {
  x: number;
  y: number;
  node: GraphNode;
};

export type ContextMenuPlacement = {
  left: number;
  top: number;
  maxHeight: number;
  ready: boolean;
};

export type MenuAction = {
  label: string;
  icon: string;
  danger?: boolean;
  separator?: boolean;
  action: () => void;
};

export type MergeContextPayload = {
  hash: string;
  shortHash: string;
  refsHere: string[];
  branchExtras: Array<{
    raw: string;
    label: string;
    scope: string;
  }>;
};

type CommitContextMenuProps = {
  contextMenu: ContextMenuState;
  contextMenuRef: React.RefObject<HTMLDivElement>;
  contextMenuPlacement: ContextMenuPlacement | null;
  menuActions: MenuAction[];
  mergeContextPayload: MergeContextPayload | null;
  canMergeBranches: boolean;
  mergeCtxExpanded: boolean;
  onToggleMergeExpanded: () => void;
  onClose: () => void;
  onRunMenuAction: (action: MenuAction) => void;
  onMergeCommit: (hash: string, shortHash: string) => void;
  onMergeBranchRef: (branchRef: string) => void;
  tr: (deText: string, enText: string) => string;
};

export const CommitContextMenu: React.FC<CommitContextMenuProps> = ({
  contextMenu,
  contextMenuRef,
  contextMenuPlacement,
  menuActions,
  mergeContextPayload,
  canMergeBranches,
  mergeCtxExpanded,
  onToggleMergeExpanded,
  onClose,
  onRunMenuAction,
  onMergeCommit,
  onMergeBranchRef,
  tr,
}) => {
  const primaryMenu = menuActions.slice(0, 4);
  const tailMenu = menuActions.slice(4);
  const showMergePanel = Boolean(mergeContextPayload && canMergeBranches);

  const renderMenuRow = (item: MenuAction, idx: number) => {
    if (item.separator) {
      return <div key={`sep-${idx}`} className="ctx-menu-sep" />;
    }
    return (
      <button
        key={`act-${idx}`}
        type="button"
        className={`ctx-menu-item ${item.danger ? 'danger' : ''}`}
        onClick={() => onRunMenuAction(item)}
      >
        <span className="ctx-menu-icon">{item.icon}</span>
        {item.label}
      </button>
    );
  };

  return (
    <div
      className="ctx-menu-backdrop"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={contextMenuRef}
        className="ctx-menu"
        style={{
          left: contextMenuPlacement?.left ?? contextMenu.x,
          top: contextMenuPlacement?.top ?? contextMenu.y,
          maxHeight: contextMenuPlacement?.maxHeight,
          overflowY: 'auto',
          visibility: contextMenuPlacement?.ready ? 'visible' : 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ctx-menu-header">
          {contextMenu.node.commit.abbrevHash} - {contextMenu.node.commit.subject.slice(0, 30)}{contextMenu.node.commit.subject.length > 30 ? '...' : ''}
        </div>
        {primaryMenu.map(renderMenuRow)}
        {showMergePanel && mergeContextPayload && (
          <div className="ctx-menu-merge-wrap">
            <button
              type="button"
              className="ctx-menu-merge-toggle"
              onClick={(event) => {
                event.stopPropagation();
                onToggleMergeExpanded();
              }}
            >
              {mergeCtxExpanded
                ? <ChevronDown size={14} className="ctx-menu-merge-chevron" />
                : <ChevronRight size={14} className="ctx-menu-merge-chevron" />}
              {tr('In aktuellen Branch mergen', 'Merge into current branch')}
            </button>
            {mergeCtxExpanded && (
              <div className="ctx-menu-merge-body">
                <div className="ctx-menu-merge-group">
                  <div className="ctx-menu-merge-group-label">{tr('Dieser Commit', 'This commit')}</div>
                  <button
                    type="button"
                    className="ctx-menu-merge-item"
                    onClick={() => onMergeCommit(mergeContextPayload.hash, mergeContextPayload.shortHash)}
                  >
                    {tr('Merge', 'Merge')} {mergeContextPayload.shortHash}
                    <span className="ctx-menu-merge-item-hint">
                      {tr('git merge (Commit-Hash)', 'git merge (commit hash)')}
                    </span>
                  </button>
                </div>
                {mergeContextPayload.refsHere.length > 0 && (
                  <div className="ctx-menu-merge-group">
                    <div className="ctx-menu-merge-group-label">{tr('Refs auf diesem Commit', 'Refs at this commit')}</div>
                    {mergeContextPayload.refsHere.map(ref => (
                      <button
                        key={ref}
                        type="button"
                        className="ctx-menu-merge-item"
                        onClick={() => onMergeBranchRef(ref)}
                      >
                        {ref}
                        <span className="ctx-menu-merge-item-hint">
                          {tr('Branch-Ref mergen', 'Merge branch ref')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {mergeContextPayload.branchExtras.length > 0 && (
                  <div className="ctx-menu-merge-group">
                    <div className="ctx-menu-merge-group-label">{tr('Weitere Branches', 'More branches')}</div>
                    {mergeContextPayload.branchExtras.map(row => (
                      <button
                        key={row.raw}
                        type="button"
                        className="ctx-menu-merge-item"
                        onClick={() => onMergeBranchRef(row.raw)}
                      >
                        {row.label}
                        <span className="ctx-menu-merge-item-hint">
                          {row.scope === 'remote' ? tr('Remote-Tracking', 'Remote-tracking') : tr('Lokal', 'Local')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {tailMenu.map(renderMenuRow)}
      </div>
    </div>
  );
};
