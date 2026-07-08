import type { ConfirmDialogState, InputDialogState } from '../layout/layoutTypes';
import type { CatalogTranslateFn } from '../../i18n';
import type { ToastMessage, BranchInfo } from '../../types/git';
import type { GraphLayout, GraphNode } from '../../utils/graphLayout';
import type { MenuAction } from './CommitContextMenu';
import { buildCommitHistoryMenuActions } from './commitGraphHistoryMenuActions';
import { buildCommitRefMenuActions } from './commitGraphRefMenuActions';

type BuildCommitMenuActionsParams = {
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
};

export const buildCommitMenuActions = ({
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
}: BuildCommitMenuActionsParams): MenuAction[] => [
  ...buildCommitRefMenuActions({
    node,
    branches,
    currentBranch,
    runGitAction,
    setConfirmDialog,
    setInputDialog,
    t,
  }),
  ...buildCommitHistoryMenuActions({
    node,
    layout,
    reachableFromHead,
    runGitAction,
    setConfirmDialog,
    setInputDialog,
    setToast,
    refreshCommits,
    refreshWorkingTreeStatus,
  }),
];
