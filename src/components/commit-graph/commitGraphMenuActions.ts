import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import type { CatalogTranslateFn, TranslateFn } from '@/i18n';
import type { ToastMessage, BranchInfo } from '@/types/git';
import type { GraphLayout, GraphNode } from '@/utils/graphLayout';
import type { MenuAction } from './CommitContextMenu';
import { buildCommitHistoryMenuActions } from './commitGraphHistoryMenuActions';
import { buildCommitRefMenuActions } from './commitGraphRefMenuActions';

type BuildCommitMenuActionsParams = {
  repoPath: string | null;
  node: GraphNode;
  branches: BranchInfo[];
  currentBranch: string;
  layout: GraphLayout | null;
  reachableFromHead: Set<string>;
  runGitAction: (args: string[], successMsg: string) => Promise<void> | void;
  setConfirmDialog: (value: ConfirmDialogState | null) => void;
  setInputDialog: (value: InputDialogState | null) => void;
  setToast: (toast: ToastMessage | null) => void;
  refreshCommits: () => Promise<void> | void;
  refreshWorkingTreeStatus: () => Promise<void> | void;
  t: CatalogTranslateFn;
  tr: TranslateFn;
};

export const buildCommitMenuActions = ({
  repoPath,
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
}: BuildCommitMenuActionsParams): MenuAction[] => [
  ...buildCommitRefMenuActions({
    node,
    branches,
    currentBranch,
    runGitAction,
    setConfirmDialog,
    setInputDialog,
    t,
    tr,
  }),
  ...buildCommitHistoryMenuActions({
    repoPath,
    node,
    layout,
    reachableFromHead,
    runGitAction,
    setConfirmDialog,
    setInputDialog,
    setToast,
    refreshCommits,
    refreshWorkingTreeStatus,
    tr,
  }),
];
