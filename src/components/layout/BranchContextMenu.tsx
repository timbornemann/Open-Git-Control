import React from 'react';
import { GitMergeMode } from '../../types/git';
import { useI18n } from '../../i18n';

type BranchContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

type Props = {
  branchContextMenu: BranchContextMenuState;
  setBranchContextMenu: (value: BranchContextMenuState) => void;
  onCheckout: (branch: string) => void;
  onMerge: (branch: string, mode: GitMergeMode) => void;
  onRename: (branch: string) => void;
  onDelete: (branch: string) => void;
};

export const BranchContextMenu: React.FC<Props> = ({
  branchContextMenu,
  setBranchContextMenu,
  onCheckout,
  onMerge,
  onRename,
  onDelete,
}) => {
  const { tr } = useI18n();

  if (!branchContextMenu) return null;
  const isRemoteBranch = branchContextMenu.branch.startsWith('remotes/');

  return (
    <div
      className="ctx-menu-backdrop"
      onClick={e => {
        e.stopPropagation();
        setBranchContextMenu(null);
      }}
    >
      <div
        className="ctx-menu"
        style={{ left: branchContextMenu.x, top: branchContextMenu.y }}
        onClick={e => e.stopPropagation()}
      >
        <div className="ctx-menu-header">{branchContextMenu.branch}</div>
        {!branchContextMenu.isHead && (
          <button
            className="ctx-menu-item"
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onCheckout(b);
            }}
          >
            <span className="ctx-menu-icon">?</span> {isRemoteBranch
              ? tr('Lokalen Tracking-Branch auschecken', 'Checkout local tracking branch')
              : tr('Checkout', 'Checkout')}
          </button>
        )}
        {!branchContextMenu.isHead && (
          <>
            <button
              className="ctx-menu-item"
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'default');
              }}
            >
              <span className="ctx-menu-icon">?</span> {tr('In aktuellen Branch mergen', 'Merge into current branch')}
            </button>
            <button
              className="ctx-menu-item"
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'noFf');
              }}
            >
              <span className="ctx-menu-icon">?</span> {tr('Mergen (--no-ff)', 'Merge (--no-ff)')}
            </button>
            <button
              className="ctx-menu-item"
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'squash');
              }}
            >
              <span className="ctx-menu-icon">?</span> {tr('Squash-Merge', 'Squash merge')}
            </button>
            <button
              className="ctx-menu-item"
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'ffOnly');
              }}
            >
              <span className="ctx-menu-icon">?</span> {tr('Nur Fast-Forward (--ff-only)', 'Fast-forward only (--ff-only)')}
            </button>
          </>
        )}
        {!branchContextMenu.branch.startsWith('remotes/') && (
          <button
            className="ctx-menu-item"
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onRename(b);
            }}
          >
            <span className="ctx-menu-icon">?</span> {tr('Umbenennen', 'Rename')}
          </button>
        )}
        <div className="ctx-menu-sep" />
        {!branchContextMenu.isHead && !branchContextMenu.branch.startsWith('remotes/') && (
          <button
            className="ctx-menu-item danger"
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onDelete(b);
            }}
          >
            <span className="ctx-menu-icon">?</span> {tr('Branch löschen', 'Delete branch')}
          </button>
        )}
      </div>
    </div>
  );
};
