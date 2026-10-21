import { useEffect, useRef } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import type { BranchChangeDialog as Dialog, ReadyBranchChangeDialog } from './branchChangeDialogState';
import { BranchChangeReviewDialog } from './BranchChangeReviewDialog';
import { BranchChangeProgressView, useBranchChangeProgress, branchChangeOperations } from './BranchChangeProgress';
import { branchChangeText } from './branchChangeText';
import './branch-change.css';

function BranchChangePreparation({ dialog, onChanged }: { dialog: Dialog; onChanged(): void }) {
  const { tr } = useI18n();
  const activity = useBranchChangeProgress(
    dialog.repoPath,
    dialog.id,
    dialog.preparation === 'execute' ? branchChangeOperations.execute : branchChangeOperations.inspect,
  );
  const refreshed = useRef(false);
  useEffect(() => {
    if (!dialog.refreshNeeded) {
      refreshed.current = false;
      return;
    }
    if (dialog.refreshNeeded && !refreshed.current) {
      refreshed.current = true;
      onChanged();
    }
  }, [dialog.refreshNeeded, onChanged]);
  const failed = dialog.preparation === 'failed';
  const title = dialog.sessionId ? tr('Wiederherstellung vorbereiten', 'Preparing restoration') : tr('Branchwechsel vorbereiten', 'Preparing branch change');
  const target = dialog.target?.kind === 'detached' ? dialog.target.ref : dialog.target?.branch;
  return (
    <DialogFrame
      open
      title={title}
      onClose={failed ? () => dialog.finish(null) : dialog.cancel}
      cancelLabel={failed ? tr('Schließen', 'Close') : tr('Abbrechen', 'Cancel')}
      onConfirm={failed ? dialog.retry : undefined}
      confirmLabel={tr('Erneut prüfen', 'Review again')}
      closeOnBackdrop={false}
    >
      <div className="branch-change" aria-busy={!failed}>
        {target && (
          <p>
            {tr('Zielbranch:', 'Target branch:')} <code>{target}</code>
          </p>
        )}
        {failed ? (
          <p role="alert">{branchChangeText(dialog.error || '', tr)}</p>
        ) : (
          <BranchChangeProgressView
            activity={activity || (dialog.preparation === 'execute' ? { message: 'Switching branch' } : undefined)}
            cancelling={dialog.cancelling}
          />
        )}
        {!failed && (
          <p className="branch-change-muted">
            {tr('Repository, offene Änderungen und Wechselziel werden geprüft.', 'Checking repository, uncommitted changes and checkout target.')}
          </p>
        )}
      </div>
    </DialogFrame>
  );
}

export function BranchChangeDialog(props: { dialog: Dialog; onChanged(): void; onWorktree(path: string): void }) {
  if (props.dialog.inspection && !props.dialog.preparation) return <BranchChangeReviewDialog {...props} dialog={props.dialog as ReadyBranchChangeDialog} />;
  return <BranchChangePreparation dialog={props.dialog} onChanged={props.onChanged} />;
}
