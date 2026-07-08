import React from 'react';
import type { GitMergeMode } from '@/types/git';
import { useI18n } from '@/i18n';

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

export const BranchContextMenu: React.FC<Props> = ({ branchContextMenu, setBranchContextMenu, onCheckout, onMerge, onRename, onDelete }) => {
  const { t } = useI18n();

  if (!branchContextMenu) return null;
  const isRemoteBranch = branchContextMenu.branch.startsWith('remotes/');

  return (
    <div
      className="ctx-menu-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        setBranchContextMenu(null);
      }}
    >
      <div className="ctx-menu" style={{ left: branchContextMenu.x, top: branchContextMenu.y }} onClick={(e) => e.stopPropagation()}>
        <div className="ctx-menu-header">{branchContextMenu.branch}</div>
        {!branchContextMenu.isHead && (
          <button
            className="ctx-menu-item"
            title={
              isRemoteBranch
                ? t('generated.components.layout.branchcontextmenu.creates_or_opens_a_local_tracking_branch_for_this_remote_fb70f9fa')
                : t('generated.components.layout.branchcontextmenu.switches_to_this_local_branch_ad1a868d')
            }
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onCheckout(b);
            }}
          >
            <span className="ctx-menu-icon">CO</span>
            <MenuLabel
              label={
                isRemoteBranch
                  ? t('generated.components.layout.branchcontextmenu.checkout_tracking_branch_72fd20f4')
                  : t('generated.components.layout.branchcontextmenu.checkout_d9bc41ee')
              }
              help={
                isRemoteBranch
                  ? t('generated.components.layout.branchcontextmenu.creates_a_local_branch_when_needed_and_tracks_the_remote_926cdb5d')
                  : t('generated.components.layout.branchcontextmenu.switches_your_working_tree_to_this_branch_447f4c22')
              }
            />
          </button>
        )}
        {!branchContextMenu.isHead && (
          <>
            <button
              className="ctx-menu-item"
              title={t('generated.components.layout.branchcontextmenu.merges_this_branch_into_the_currently_checked_out_branch_88f4ab90')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'default');
              }}
            >
              <span className="ctx-menu-icon">MG</span>
              <MenuLabel
                label={t('generated.components.layout.branchcontextmenu.merge_into_current_branch_07cabe72')}
                help={t('generated.components.layout.branchcontextmenu.default_merge_git_decides_fast_forward_or_merge_commit_7a51dc34')}
              />
            </button>
            <button
              className="ctx-menu-item"
              title={t('generated.components.layout.branchcontextmenu.forces_a_merge_commit_even_when_fast_forward_would_be_po_06b29673')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'noFf');
              }}
            >
              <span className="ctx-menu-icon">NF</span>
              <MenuLabel
                label={t('generated.components.layout.branchcontextmenu.merge_no_ff_67561214')}
                help={t('generated.components.layout.branchcontextmenu.creates_a_merge_commit_intentionally_for_visible_history_3f43a889')}
              />
            </button>
            <button
              className="ctx-menu-item"
              title={t('generated.components.layout.branchcontextmenu.squashes_this_branch_into_one_new_commit_d95843c2')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'squash');
              }}
            >
              <span className="ctx-menu-icon">SQ</span>
              <MenuLabel
                label={t('generated.components.layout.branchcontextmenu.squash_merge_1e4db720')}
                help={t('generated.components.layout.branchcontextmenu.applies_the_changes_as_one_new_commit_without_branch_his_e7f8d104')}
              />
            </button>
            <button
              className="ctx-menu-item"
              title={t('generated.components.layout.branchcontextmenu.runs_only_if_the_current_branch_can_be_fast_forwarded_wi_06ba4fc6')}
              onClick={() => {
                const b = branchContextMenu.branch;
                setBranchContextMenu(null);
                onMerge(b, 'ffOnly');
              }}
            >
              <span className="ctx-menu-icon">FF</span>
              <MenuLabel
                label={t('generated.components.layout.branchcontextmenu.fast_forward_only_ff_only_247cf7fb')}
                help={t('generated.components.layout.branchcontextmenu.stops_if_a_real_merge_would_be_required_afb862e2')}
              />
            </button>
          </>
        )}
        {!branchContextMenu.branch.startsWith('remotes/') && (
          <button
            className="ctx-menu-item"
            title={t('generated.components.layout.branchcontextmenu.renames_this_local_branch_1c165d74')}
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onRename(b);
            }}
          >
            <span className="ctx-menu-icon">RN</span>
            <MenuLabel
              label={t('generated.components.layout.branchcontextmenu.rename_cd5280ff')}
              help={t('generated.components.layout.branchcontextmenu.changes_only_the_local_branch_name_73e31be2')}
            />
          </button>
        )}
        <div className="ctx-menu-sep" />
        {!branchContextMenu.isHead && !branchContextMenu.branch.startsWith('remotes/') && (
          <button
            className="ctx-menu-item danger"
            title={t('generated.components.layout.branchcontextmenu.deletes_this_local_branch_04f13ca4')}
            onClick={() => {
              const b = branchContextMenu.branch;
              setBranchContextMenu(null);
              onDelete(b);
            }}
          >
            <span className="ctx-menu-icon">DEL</span>
            <MenuLabel
              label={t('generated.components.layout.branchcontextmenu.delete_branch_a5055577')}
              help={t('generated.components.layout.branchcontextmenu.removes_the_local_branch_remote_branches_are_untouched_e5d04caa')}
            />
          </button>
        )}
      </div>
    </div>
  );
};
