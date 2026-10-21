import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { BranchChangeProgress } from '@/shared/ipc/branchChange';
import { branchChangeText } from './branchChangeText';

type Activity = { message: string; progress?: BranchChangeProgress; operation?: string };
export const branchChangeOperations = { inspect: 'git:inspectBranchChange', execute: 'git:executeBranchChange', restore: 'git:restoreBranchChange' } as const;
const operations = new Set<string>(Object.values(branchChangeOperations));

export function useBranchChangeProgress(repo: string, id: string, operation?: string) {
  const [activity, setActivity] = useState<Activity>();
  useEffect(() => {
    if (!gitClient.isAvailable()) return;
    return gitClient.onJobEvent((event) => {
      if (
        event.details?.repoPath === repo &&
        event.details.branchChangeId === id &&
        operations.has(event.operation) &&
        event.status === 'progress' &&
        event.message
      )
        setActivity({ message: event.message, progress: event.details.branchChange, operation: event.operation });
    });
  }, [repo, id]);
  return operation && activity?.operation !== operation ? undefined : activity;
}

export function BranchChangeProgressView({ activity, cancelling = false }: { activity?: Activity; cancelling?: boolean }) {
  const { tr } = useI18n();
  const progress = activity?.progress;
  const total = progress?.totalFiles;
  const completed = progress?.processedFiles;
  const counted = typeof total === 'number' && total > 0 && typeof completed === 'number';
  const message = cancelling
    ? tr('Abbruch wird abgeschlossen …', 'Finishing cancellation …')
    : branchChangeText(activity?.message || 'Reading repository and worktrees', tr);
  return (
    <div className="branch-change-progress" role="status" aria-live="polite">
      <div className="branch-change-progress-heading">
        <Loader2 className="branch-change-progress-spinner" size={18} aria-hidden="true" />
        <strong>{message}</strong>
      </div>
      {counted ? (
        <>
          <progress aria-label={tr('Dateiinhalte prüfen', 'Checking file contents')} value={completed} max={total} />
          <span>{tr(`Datei ${completed} von ${total} geprüft`, `Checked ${completed} of ${total} files`)}</span>
        </>
      ) : (
        <progress aria-label={message} />
      )}
      {progress?.path && <code className="branch-change-progress-path">{progress.path}</code>}
    </div>
  );
}
