import { useEffect, useState } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { useI18n } from '@/i18n';
import { plannerClient } from '@/services/plannerClient';
import type { PlannerWorkInspection, PlannerStartWorkResult } from '@/types/plannerWork';
import { usePlannerWorkDialogState } from './plannerWorkDialogState';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import '@/styles/project-planner.css';

export function PlannerWorkDialog({ activeRepo, onChanged }: { activeRepo: string | null; onChanged(): void }) {
  const { target, close } = usePlannerWorkDialogState();
  const { activateRepositoryProject, refresh } = useProjectPlanner();
  const { tr } = useI18n();
  const [inspection, setInspection] = useState<PlannerWorkInspection>();
  const [name, setName] = useState('');
  const [base, setBase] = useState('');
  const [acceptChanges, setAcceptChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState<PlannerStartWorkResult>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (target && normalizeRepoPathKey(activeRepo || '') !== normalizeRepoPathKey(target.repoPath)) close();
  }, [activeRepo, close, target]);
  useEffect(() => {
    if (!target) return;
    let current = true;
    setInspection(undefined);
    setError('');
    setPartial(undefined);
    setAcceptChanges(false);
    setBusy(true);
    void plannerClient
      .inspectWork({ repoPath: target.repoPath, itemId: target.item.id })
      .then((result) => {
        if (!current) return;
        if (!result.success) {
          setError(result.error);
          return;
        }
        setInspection(result.data);
        if (result.data.recoveryId) setPartial({ branch: result.data.suggestedName, recoveryId: result.data.recoveryId });
        setName(result.data.suggestedName);
        setBase(result.data.defaultBase);
      })
      .catch((e: unknown) => {
        if (current) setError(String(e));
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [target, revision]);

  if (!target) return null;
  const occupied = inspection?.worktrees.find((tree) => tree.branch === name && normalizeRepoPathKey(tree.path) !== normalizeRepoPathKey(target.repoPath));
  const complete = async () => {
    await refresh();
    onChanged();
    close();
  };
  const start = async () => {
    if (!inspection || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await plannerClient.startWork({
        repoPath: target.repoPath,
        itemId: target.item.id,
        planId: inspection.planId,
        branchName: name,
        baseRef: base,
        acceptChanges,
      });
      if (!result.success) {
        setError(result.error);
        setInspection(undefined);
        return;
      }
      if (result.data.recoveryId) {
        setPartial(result.data);
        setError(result.data.error || '');
        onChanged();
        return;
      }
      await complete();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    if (!partial?.recoveryId) return;
    setBusy(true);
    try {
      const details = await plannerClient.getWork({ repoPath: target.repoPath, itemId: target.item.id });
      const result = await plannerClient.updateWork({
        repoPath: target.repoPath,
        itemId: target.item.id,
        expectedRevision: details.success ? details.data.revision || '' : '',
        action: 'recover',
        recoveryId: partial.recoveryId,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await complete();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      open
      title={inspection?.existing ? tr('Bearbeitung fortsetzen', 'Resume work') : tr('Bearbeitung starten', 'Start work')}
      onClose={() => {
        if (!busy) close();
      }}
      onConfirm={partial ? () => void recover() : () => void start()}
      confirmLabel={
        partial
          ? tr('Zuordnung wiederherstellen', 'Recover assignment')
          : inspection?.existing
            ? tr('Auschecken und fortsetzen', 'Check out and resume')
            : tr('Branch erstellen und starten', 'Create branch and start')
      }
      confirmDisabled={
        busy ||
        (!partial && (!inspection || !name.trim() || (!inspection.existing && !base) || Boolean(occupied) || (inspection.changes.length > 0 && !acceptChanges)))
      }
    >
      <div className="planner-dialog-form planner-work">
        <h3>{target.item.title}</h3>
        {busy && <p role="status">{tr('Arbeitsstand wird geprüft …', 'Checking working state …')}</p>}
        {error && (
          <p role="alert" className="hosting-error">
            {error}
          </p>
        )}
        {partial ? (
          <p>
            {tr(
              'Der Branch wurde ausgecheckt. Die Zuordnung kann erneut gespeichert werden. Vorhandene Arbeit bleibt erhalten.',
              'The branch was checked out. Retry saving the assignment; existing work is preserved.',
            )}
          </p>
        ) : (
          <>
            <label>
              {tr('Arbeitsbranch', 'Work branch')}
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy || Boolean(inspection?.existing)} maxLength={80} />
            </label>
            {!inspection?.existing && (
              <label>
                {tr('Ausgangsbasis', 'Base branch')}
                <select value={base} onChange={(e) => setBase(e.target.value)} disabled={busy}>
                  <option value="">{tr('Basis ausdrücklich auswählen', 'Choose a base explicitly')}</option>
                  {inspection?.bases.map((entry) => (
                    <option key={entry.ref} value={entry.ref}>
                      {entry.ref.replace(/^refs\/(heads|remotes)\//, '')} · {entry.sha.slice(0, 10)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!inspection?.defaultBase && !inspection?.existing && (
              <p>
                {tr(
                  'Standardbranch unbekannt oder lokale und Remote-Historie divergieren. Es wird kein Fetch ausgeführt.',
                  'The default branch is unknown or local and remote histories diverge. No fetch is performed.',
                )}
              </p>
            )}
            {occupied && (
              <div role="status">
                <p>
                  {tr('Dieser Branch ist in einem Worktree belegt:', 'This branch is checked out in a worktree:')} <code>{occupied.path}</code>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void activateRepositoryProject(occupied.path);
                  }}
                >
                  {tr('Zum Worktree wechseln', 'Switch to worktree')}
                </button>
              </div>
            )}
            {Boolean(inspection?.changes.length) && (
              <>
                <p>{tr('Nicht committete Änderungen:', 'Uncommitted changes:')}</p>
                <ul className="planner-work-list">
                  {inspection?.changes.map((file) => (
                    <li key={file}>
                      <code>{file}</code>
                    </li>
                  ))}
                </ul>
                <label className="planner-work-checkbox">
                  <input type="checkbox" checked={acceptChanges} onChange={(e) => setAcceptChanges(e.target.checked)} disabled={busy} />
                  {tr('Diese Änderungen ausdrücklich mitnehmen', 'Explicitly carry these changes')}
                </label>
              </>
            )}
            <p>
              {tr(
                'Nach erfolgreichem Checkout wird die Aufgabe auf „In Arbeit“ gesetzt. Checkout-Konflikte brechen den Vorgang ab.',
                'After a successful checkout, the task moves to “In progress”. Checkout conflicts abort the operation.',
              )}
            </p>
            <button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>
              {tr('Erneut prüfen', 'Review again')}
            </button>
          </>
        )}
      </div>
    </DialogFrame>
  );
}
