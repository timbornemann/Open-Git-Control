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

type MenuLabelProps = {
  label: React.ReactNode;
  help: React.ReactNode;
};

const MenuLabel: React.FC<MenuLabelProps> = ({ label, help }) => (
  <span className="ctx-menu-label">
    <span>{label}</span>
    <span className="ctx-menu-help">{help}</span>
  </span>
);

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
            title={isRemoteBranch
              ? tr('Erstellt oder oeffnet einen lokalen Tracking-Branch fuer diesen Remote-Branch.', 'Creates or opens a local tracking branch for this remote branch.')
              : tr('Wechselt auf diesen lokalen Branch.', 'Switches to this local branch.')}
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onCheckout(b);
            }}
          >
            <span className="ctx-menu-icon">CO</span>
            <MenuLabel
              label={isRemoteBranch
                ? tr('Tracking-Branch auschecken', 'Checkout tracking branch')
                : tr('Checkout', 'Checkout')}
              help={isRemoteBranch
                ? tr('Legt bei Bedarf einen lokalen Branch an und verbindet ihn mit dem Remote.', 'Creates a local branch when needed and tracks the remote.')
                : tr('Wechselt deinen Working Tree auf diesen Branch.', 'Switches your working tree to this branch.')}
            />
          </button>
        )}
        {!branchContextMenu.isHead && (
          <>
            <button
              className="ctx-menu-item"
              title={tr('Fuegt diesen Branch in den aktuell ausgecheckten Branch ein.', 'Merges this branch into the currently checked out branch.')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'default');
              }}
            >
              <span className="ctx-menu-icon">MG</span>
              <MenuLabel
                label={tr('In aktuellen Branch mergen', 'Merge into current branch')}
                help={tr('Standard-Merge: Git entscheidet Fast-Forward oder Merge-Commit.', 'Default merge: Git decides fast-forward or merge commit.')}
              />
            </button>
            <button
              className="ctx-menu-item"
              title={tr('Erzwingt einen Merge-Commit, auch wenn Fast-Forward moeglich waere.', 'Forces a merge commit even when fast-forward would be possible.')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'noFf');
              }}
            >
              <span className="ctx-menu-icon">NF</span>
              <MenuLabel
                label={tr('Mergen (--no-ff)', 'Merge (--no-ff)')}
                help={tr('Erstellt bewusst einen Merge-Commit fuer sichtbare Historie.', 'Creates a merge commit intentionally for visible history.')}
              />
            </button>
            <button
              className="ctx-menu-item"
              title={tr('Fasst die Aenderungen dieses Branches zu einem neuen Commit zusammen.', 'Squashes this branch into one new commit.')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'squash');
              }}
            >
              <span className="ctx-menu-icon">SQ</span>
              <MenuLabel
                label={tr('Squash-Merge', 'Squash merge')}
                help={tr('Uebernimmt die Aenderungen als einen neuen Commit ohne Branch-Historie.', 'Applies the changes as one new commit without branch history.')}
              />
            </button>
            <button
              className="ctx-menu-item"
              title={tr('Fuehrt nur aus, wenn der aktuelle Branch ohne Merge-Commit vorgezogen werden kann.', 'Runs only if the current branch can be fast-forwarded without a merge commit.')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'ffOnly');
              }}
            >
              <span className="ctx-menu-icon">FF</span>
              <MenuLabel
                label={tr('Nur Fast-Forward (--ff-only)', 'Fast-forward only (--ff-only)')}
                help={tr('Bricht ab, wenn ein echter Merge notwendig waere.', 'Stops if a real merge would be required.')}
              />
            </button>
          </>
        )}
        {!branchContextMenu.branch.startsWith('remotes/') && (
          <button
            className="ctx-menu-item"
            title={tr('Benennt diesen lokalen Branch um.', 'Renames this local branch.')}
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onRename(b);
            }}
          >
            <span className="ctx-menu-icon">RN</span>
            <MenuLabel
              label={tr('Umbenennen', 'Rename')}
              help={tr('Aendert nur den lokalen Branch-Namen.', 'Changes only the local branch name.')}
            />
          </button>
        )}
        <div className="ctx-menu-sep" />
        {!branchContextMenu.isHead && !branchContextMenu.branch.startsWith('remotes/') && (
          <button
            className="ctx-menu-item danger"
            title={tr('Loescht diesen lokalen Branch.', 'Deletes this local branch.')}
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onDelete(b);
            }}
          >
            <span className="ctx-menu-icon">DEL</span>
            <MenuLabel
              label={tr('Branch loeschen', 'Delete branch')}
              help={tr('Entfernt den lokalen Branch. Remote-Branches bleiben unberuehrt.', 'Removes the local branch. Remote branches are untouched.')}
            />
          </button>
        )}
      </div>
    </div>
  );
};
