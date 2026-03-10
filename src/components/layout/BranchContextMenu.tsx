import React from 'react';

type BranchContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

type Props = {
  branchContextMenu: BranchContextMenuState;
  setBranchContextMenu: (value: BranchContextMenuState) => void;
  onCheckout: (branch: string) => void;
  onMerge: (branch: string) => void;
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
  if (!branchContextMenu) return null;

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
            <span className="ctx-menu-icon">?</span> Checkout
          </button>
        )}
        {!branchContextMenu.isHead && !branchContextMenu.branch.startsWith('remotes/') && (
          <button
            className="ctx-menu-item"
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onMerge(b);
            }}
          >
            <span className="ctx-menu-icon">?</span> In aktuellen Branch mergen
          </button>
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
            <span className="ctx-menu-icon">?</span> Umbenennen
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
            <span className="ctx-menu-icon">?</span> Branch löschen
          </button>
        )}
      </div>
    </div>
  );
};
