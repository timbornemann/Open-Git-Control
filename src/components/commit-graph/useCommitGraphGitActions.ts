import { useCallback } from 'react';
import type { GitCommandNameDto } from '../../global';
import type { ToastMessage } from '../../types/git';
import {
  isMergeInProgressError,
  resolveConflictPathAfterGitFailure,
} from '../../utils/gitParsing';
import { gitClient } from '../../services/gitClient';

type UseCommitGraphGitActionsParams = {
  onRunGitCommand?: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
  onOpenConflictResolverForPath?: (path: string) => void;
  refreshCommits: () => Promise<void> | void;
  refreshWorkingTreeStatus: () => Promise<void> | void;
  setToast: (toast: ToastMessage | null) => void;
  tr: (deText: string, enText: string) => string;
};

export const useCommitGraphGitActions = ({
  onRunGitCommand,
  onOpenConflictResolverForPath,
  refreshCommits,
  refreshWorkingTreeStatus,
  setToast,
  tr,
}: UseCommitGraphGitActionsParams) => {
  const openConflictResolverFromFailure = useCallback(async (message: string | undefined) => {
    try {
      const statusAfter = await gitClient.getStatusPorcelain();
      const porcelain = statusAfter.success && typeof statusAfter.data === 'string' ? statusAfter.data : null;
      const conflictPath = resolveConflictPathAfterGitFailure(porcelain, message);
      if (conflictPath && onOpenConflictResolverForPath) {
        onOpenConflictResolverForPath(conflictPath);
        return true;
      }
    } catch {
      // fall through to error toast
    }
    return false;
  }, [onOpenConflictResolverForPath]);

  return useCallback(async (args: string[], successMsg: string) => {
    if (!gitClient.isAvailable() || args.length === 0) return;
    if (onRunGitCommand) {
      const success = await onRunGitCommand(args, successMsg);
      if (success) {
        refreshCommits();
        refreshWorkingTreeStatus();
      }
      return;
    }

    try {
      const result = await gitClient.runGitCommand(args[0] as GitCommandNameDto, ...args.slice(1));
      if (result.success) {
        setToast({ msg: successMsg, isError: false });
        refreshCommits();
        refreshWorkingTreeStatus();
        return;
      }

      const mergeInProgress = isMergeInProgressError(result.error);
      refreshCommits();
      void refreshWorkingTreeStatus();
      if (await openConflictResolverFromFailure(result.error)) return;

      if (mergeInProgress) {
        setToast({
          msg: tr(
            'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen.',
            'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
          ),
          isError: true,
        });
        return;
      }
      setToast({ msg: result.error || 'Unbekannter Fehler', isError: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || '');
      const mergeInProgress = isMergeInProgressError(message);
      refreshCommits();
      void refreshWorkingTreeStatus();
      if (await openConflictResolverFromFailure(message)) return;

      if (mergeInProgress) {
        setToast({
          msg: tr(
            'Ein Merge ist bereits aktiv (MERGE_HEAD). Bitte zuerst Merge fortsetzen oder Merge abbrechen.',
            'A merge is already active (MERGE_HEAD). Please continue or abort the current merge first.',
          ),
          isError: true,
        });
        return;
      }
      setToast({ msg: message, isError: true });
    }
  }, [
    onRunGitCommand,
    openConflictResolverFromFailure,
    refreshCommits,
    refreshWorkingTreeStatus,
    setToast,
    tr,
  ]);
};
