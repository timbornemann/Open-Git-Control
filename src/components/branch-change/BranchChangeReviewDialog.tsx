import { useState } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import { useWorkflowStore } from '@/contexts/AppStateContext';
import { branchChangeClient } from '@/services/branchChangeClient';
import type { BranchChangeMode, BranchChangeResult } from '@/shared/ipc/branchChange';
import { BranchChangeFiles } from './BranchChangeFiles';
import { BranchChangeOutcome } from './BranchChangeOutcome';
import { branchChangeText, branchChangeLabels } from './branchChangeText';
import type { ReadyBranchChangeDialog as Dialog } from './branchChangeDialogState';
import { useBranchChangeDialogState } from './branchChangeDialogState';
import { useBranchChangeProgress, BranchChangeProgressView } from './BranchChangeProgress';
import './branch-change.css';

export function BranchChangeReviewDialog({ dialog, onChanged, onWorktree }: { dialog: Dialog; onChanged(): void; onWorktree(path: string): void }) {
  const { tr } = useI18n();
  const openConflict = useWorkflowStore((state) => state.onOpenConflictResolverForPath);
  const [inspection, setInspection] = useState(dialog.inspection);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(inspection.suggestedName.replace(/^Branch switch:/, tr('Branchwechsel:', 'Branch switch:')));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activity = useBranchChangeProgress(inspection.repoPath, dialog.id);
  const [result, setResult] = useState<BranchChangeResult>();
  const finish = () => {
    if (busy) {
      void branchChangeClient.cancelBranchChange(inspection.repoPath);
      return;
    }
    dialog.finish(result || null);
  };
  const run = async (mode: BranchChangeMode) => {
    const decision = { planId: inspection.planId, mode, name, progressId: dialog.id };
    if (dialog.prepare) {
      dialog.finish(decision);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = inspection.session
        ? await branchChangeClient.restoreBranchChange({ repoPath: inspection.repoPath, planId: inspection.planId, progressId: dialog.id })
        : await branchChangeClient.executeBranchChange({ repoPath: inspection.repoPath, ...decision });
      if (useBranchChangeDialogState.getState().pending?.id !== dialog.id) return;
      if (!response.success) setError(response.error);
      else {
        setResult(response.data);
        onChanged();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await branchChangeClient.inspectBranchChange({
        repoPath: inspection.repoPath,
        target: inspection.target,
        sessionId: inspection.session?.id,
        reviewedRecovery: inspection.recoveryReviewed,
        progressId: dialog.id,
      });
      if (response.success) {
        setInspection(response.data);
        setStep(0);
      } else setError(response.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = Boolean(inspection.session);
  const blocked = Boolean(inspection.blocks.length);
  const labels = branchChangeLabels(restore, step, busy, Boolean(result), tr);
  return (
    <DialogFrame
      open
      title={labels.title}
      onClose={finish}
      cancelLabel={labels.cancel}
      onConfirm={result || busy || blocked ? undefined : step === 0 && !restore ? () => setStep(1) : () => void run('carry')}
      confirmLabel={labels.confirm}
      confirmDisabled={busy || blocked || (!restore && step === 1 && !name.trim())}
      onSecondaryAction={!result && !busy && !blocked && step === 1 && !restore ? () => void run('park') : undefined}
      secondaryActionLabel={tr('Parken und wechseln', 'Park and switch')}
    >
      <div className="branch-change" aria-busy={busy}>
        {restore && Boolean(dialog.alternatives && dialog.alternatives.length > 1) && !result && (
          <label>
            {tr('Geparkte Änderungen auswählen', 'Choose parked changes')}
            <select
              disabled={busy}
              value={inspection.session?.id}
              onChange={(event) => {
                setBusy(true);
                setError('');
                void branchChangeClient
                  .inspectBranchChange({ repoPath: inspection.repoPath, sessionId: event.target.value, progressId: dialog.id })
                  .then((response) => {
                    if (response.success) setInspection(response.data);
                    else setError(response.error);
                  })
                  .catch((e: unknown) => setError(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {dialog.alternatives!.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p>
          <code>{inspection.sourceBranch || inspection.sourceHead.slice(0, 10)}</code>
          {inspection.target && (
            <>
              {' '}
              → <code>{inspection.target.kind === 'detached' ? inspection.target.ref : inspection.target.branch}</code>
            </>
          )}
        </p>
        {busy && <BranchChangeProgressView activity={activity} />}
        {error && <p role="alert">{branchChangeText(error, tr)}</p>}
        {inspection.blocks.map((block) => (
          <p role="status" key={block}>
            {branchChangeText(block, tr)}
          </p>
        ))}
        {Boolean(inspection.conflicts?.length) && (
          <button
            type="button"
            onClick={() => {
              dialog.finish(null);
              openConflict?.(inspection.conflicts![0]);
            }}
          >
            {tr('Konflikte lösen', 'Resolve conflicts')}
          </button>
        )}
        {inspection.occupiedWorktree && (
          <p>
            <code>{inspection.occupiedWorktree}</code>{' '}
            <button
              type="button"
              onClick={() => {
                dialog.finish(null);
                onWorktree(inspection.occupiedWorktree!);
              }}
            >
              {tr('Zum Worktree wechseln', 'Switch to worktree')}
            </button>
          </p>
        )}
        {result ? (
          <BranchChangeOutcome
            result={result}
            onConflicts={() => {
              dialog.finish(result);
              openConflict?.(result.conflicts[0]);
            }}
            onRestore={() => {
              setBusy(true);
              setError('');
              setInspection((value) => ({ ...value, target: undefined, session: result.session }));
              setResult(undefined);
              void branchChangeClient
                .inspectBranchChange({ repoPath: inspection.repoPath, sessionId: result.session!.id, progressId: dialog.id })
                .then((response) => {
                  if (response.success) setInspection(response.data);
                  else setError(response.error);
                })
                .catch((error: unknown) => setError(String(error)))
                .finally(() => setBusy(false));
            }}
          />
        ) : (
          <>
            {inspection.session && ['applied', 'applying', 'conflict'].includes(inspection.session.phase) && (
              <label className="branch-change-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(inspection.recoveryReviewed)}
                  disabled={busy}
                  onChange={(event) => {
                    setBusy(true);
                    void branchChangeClient
                      .inspectBranchChange({
                        repoPath: inspection.repoPath,
                        sessionId: inspection.session!.id,
                        reviewedRecovery: event.target.checked,
                        progressId: dialog.id,
                      })
                      .then((response) => {
                        if (response.success) setInspection(response.data);
                        else setError(response.error);
                      })
                      .catch((e: unknown) => setError(String(e)))
                      .finally(() => setBusy(false));
                  }}
                />
                {tr('Arbeitsstand geprüft; erneute Wiederherstellung ausdrücklich erlauben', 'Working state reviewed; explicitly allow another restoration')}
              </label>
            )}
            {step === 0 || restore ? (
              <BranchChangeFiles key={inspection.planId} inspection={inspection} />
            ) : (
              <>
                <label>
                  {tr('Stash-Name', 'Stash name')}
                  <input value={name} maxLength={500} onChange={(event) => setName(event.target.value)} disabled={busy} />
                </label>
                <p>
                  {tr(
                    'Mitnehmen stellt alle Änderungen im Zielbranch wieder her. Parken lässt den Stash für die spätere Rückkehr gespeichert.',
                    'Carry restores all changes on the target branch. Park keeps the stash for your return.',
                  )}
                </p>
                <button type="button" disabled={busy} onClick={() => setStep(0)}>
                  {tr('Zurück zur Prüfung', 'Back to review')}
                </button>
              </>
            )}
            <p className="branch-change-muted">
              {tr(
                'Gestagte, ungestagte und neue Dateien werden gemeinsam gesichert. Ignorierte Dateien bleiben ausgeschlossen.',
                'Staged, unstaged and new files are saved together. Ignored files are excluded.',
              )}
            </p>
            <button type="button" disabled={busy} onClick={() => void review()}>
              {tr('Erneut prüfen', 'Review again')}
            </button>
          </>
        )}
      </div>
    </DialogFrame>
  );
}
