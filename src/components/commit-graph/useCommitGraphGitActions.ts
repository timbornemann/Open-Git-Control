import { useCallback } from 'react';
import type { GitCommandNameDto } from '@/types/gitDtos';
import type { CatalogTranslateFn } from '@/i18n';
import type { ToastMessage } from '@/types/git';
import { isCherryPickInProgressError, isMergeInProgressError, resolveConflictPathAfterGitFailure } from '@/utils/gitParsing';
import { gitClient } from '@/services/gitClient';
import type { RunGitCommandOptions } from '@/app/state/contracts';

type UseCommitGraphGitActionsParams = {
  repoPath: string | null;
  onRunGitCommand?: (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;
  onOpenConflictResolverForPath?: (path: string) => void;
  refreshCommits: () => Promise<void> | void;
  refreshWorkingTreeStatus: () => Promise<void> | void;
  setToast: (toast: ToastMessage | null) => void;
  t: CatalogTranslateFn;
};

export const useCommitGraphGitActions = ({
  repoPath,
  onRunGitCommand,
  onOpenConflictResolverForPath,
  refreshCommits,
  refreshWorkingTreeStatus,
  setToast,
  t,
}: UseCommitGraphGitActionsParams) => {
  const openConflictResolverFromFailure = useCallback(
    async (message: string | undefined) => {
      try {
        if (!repoPath) return false;
        const statusAfter = await gitClient.runGitCommandForRepo(repoPath, 'statusPorcelain');
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
    },
    [onOpenConflictResolverForPath, repoPath],
  );

  return useCallback(
    async (args: string[], successMsg: string) => {
      if (!gitClient.isAvailable() || !repoPath || args.length === 0) return;
      if (onRunGitCommand) {
        const success = await onRunGitCommand(args, successMsg, undefined, { expectedRepoPath: repoPath });
        if (success) {
          refreshCommits();
          refreshWorkingTreeStatus();
        }
        return;
      }

      try {
        const result = await gitClient.runGitCommandForRepo(repoPath, args[0] as GitCommandNameDto, ...args.slice(1));
        if (result.success) {
          setToast({ msg: successMsg, isError: false });
          refreshCommits();
          refreshWorkingTreeStatus();
          return;
        }

        const mergeInProgress = isMergeInProgressError(result.error);
        const cherryPickInProgress = isCherryPickInProgressError(result.error);
        refreshCommits();
        void refreshWorkingTreeStatus();
        if (await openConflictResolverFromFailure(result.error)) return;

        if (mergeInProgress) {
          setToast({
            msg: t('commitGraph.gitActions.mergeAlreadyActive'),
            isError: true,
          });
          return;
        }
        if (cherryPickInProgress) {
          setToast({
            msg: t('commitGraph.gitActions.cherryPickAlreadyActive'),
            isError: true,
          });
          return;
        }
        setToast({ msg: result.error || 'Unbekannter Fehler', isError: true });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error || '');
        const mergeInProgress = isMergeInProgressError(message);
        const cherryPickInProgress = isCherryPickInProgressError(message);
        refreshCommits();
        void refreshWorkingTreeStatus();
        if (await openConflictResolverFromFailure(message)) return;

        if (mergeInProgress) {
          setToast({
            msg: t('commitGraph.gitActions.mergeAlreadyActive'),
            isError: true,
          });
          return;
        }
        if (cherryPickInProgress) {
          setToast({
            msg: t('commitGraph.gitActions.cherryPickAlreadyActive'),
            isError: true,
          });
          return;
        }
        setToast({ msg: message, isError: true });
      }
    },
    [onRunGitCommand, openConflictResolverFromFailure, refreshCommits, refreshWorkingTreeStatus, repoPath, setToast, t],
  );
};
