import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import { gitClient } from '@/services/gitClient';
import type { GitMergeMode } from '@/types/git';
import type { GraphNode } from '@/utils/graphLayout';
import { CommitContextMenu, type ContextMenuPlacement, type ContextMenuState, type MenuAction, type MergeContextPayload } from './CommitContextMenu';

type TranslateFn = (key: string) => string;
type TranslateFallbackFn = (deText: string, enText: string) => string;

type CommitGraphContextMenuLayerProps = {
  contextMenu: ContextMenuState | null;
  contextMenuRef: React.RefObject<HTMLDivElement>;
  contextMenuPlacement: ContextMenuPlacement | null;
  getMenuActions: (node: GraphNode) => MenuAction[];
  mergeContextPayload: MergeContextPayload | null;
  canMergeBranches: boolean;
  mergeCtxExpanded: boolean;
  onToggleMergeExpanded: () => void;
  onClose: () => void;
  runGitAction: (args: string[], successMsg: string) => Promise<void> | void;
  setConfirmDialog: (value: ConfirmDialogState | null) => void;
  onMergeBranch?: (branchName: string, mode: GitMergeMode) => void;
  t: TranslateFn;
  tr: TranslateFallbackFn;
};

export const CommitGraphContextMenuLayer = ({
  contextMenu,
  contextMenuRef,
  contextMenuPlacement,
  getMenuActions,
  mergeContextPayload,
  canMergeBranches,
  mergeCtxExpanded,
  onToggleMergeExpanded,
  onClose,
  runGitAction,
  setConfirmDialog,
  onMergeBranch,
  t,
  tr,
}: CommitGraphContextMenuLayerProps) => {
  if (!contextMenu) return null;

  return (
    <CommitContextMenu
      contextMenu={contextMenu}
      contextMenuRef={contextMenuRef}
      contextMenuPlacement={contextMenuPlacement}
      menuActions={getMenuActions(contextMenu.node)}
      mergeContextPayload={mergeContextPayload}
      canMergeBranches={canMergeBranches}
      mergeCtxExpanded={mergeCtxExpanded}
      onToggleMergeExpanded={onToggleMergeExpanded}
      onClose={onClose}
      onRunMenuAction={(item) => {
        onClose();
        item.action();
      }}
      onMergeCommit={(hash, shortHash) => {
        onClose();
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
            await runGitAction(gitClient.buildMergeBranchArgs(hash), tr(`Merge von ${shortHash} abgeschlossen.`, `Merge of ${shortHash} completed.`));
          },
        });
      }}
      onMergeBranchRef={(branchRef) => {
        onClose();
        onMergeBranch?.(branchRef, 'default');
      }}
      t={t}
    />
  );
};
