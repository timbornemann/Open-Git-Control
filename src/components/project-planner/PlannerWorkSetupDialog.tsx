import { useEffect, useState } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { useI18n } from '@/i18n';
import { plannerClient } from '@/services/plannerClient';
import type { PlannerWorkInspection, PlannerStartWorkResult } from '@/types/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerWorkDialogTarget } from './plannerWorkDialogState';
import { PlannerWorkProgress } from './PlannerWorkProgress';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import '@/styles/project-planner.css';

function startDisabled(inspection: PlannerWorkInspection | undefined, name: string, base: string, occupied: boolean, acceptChanges: boolean) {
  return !inspection || !name.trim() || (!inspection.existing && !base) || occupied || (inspection.changes.length > 0 && !acceptChanges);
}

export function PlannerWorkSetupDialog({
  target,
  currentBranch,
  onChanged,
  onComplete,
  onClose,
}: {
  target: PlannerWorkDialogTarget;
  currentBranch: string;
  onChanged(): void;
  onComplete(item?: PlannerItem, branchName?: string): void;
  onClose(): void;
}) {
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

  const occupied = inspection?.worktrees.find((tree) => tree.branch === name && normalizeRepoPathKey(tree.path) !== normalizeRepoPathKey(target.repoPath));
  const existing = inspection?.existing;
  const alreadyActive = Boolean(existing && currentBranch === name && !partial);
  const complete = async (item?: PlannerItem) => {
    await refresh();
    onChanged();
    onComplete(item, name);
  };
  const start = async () => {
    if (!inspection || busy || alreadyActive) return;
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
      await complete(result.data.item);
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
      await complete(result.data);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      open
      title={existing ? tr('Zum Aufgabenbranch wechseln', 'Switch to task branch') : tr('Bearbeitung starten', 'Start work')}
      onClose={() => {
        if (!busy) onClose();
      }}
      cancelLabel={existing ? tr('Zur Übersicht', 'Back to overview') : tr('Abbrechen', 'Cancel')}
      onConfirm={alreadyActive ? undefined : partial ? () => void recover() : () => void start()}
      confirmLabel={
        partial
          ? tr('Zuordnung wiederherstellen', 'Recover assignment')
          : existing
            ? tr('Branch wechseln', 'Switch branch')
            : tr('Branch erstellen und starten', 'Create branch and start')
      }
      confirmDisabled={busy || (!partial && startDisabled(inspection, name, base, Boolean(occupied), acceptChanges))}
    >
      <div className="planner-dialog-form planner-work">
        <h3>{target.item.title}</h3>
        <PlannerWorkProgress item={inspection?.item || target.item} phase={existing ? undefined : 0} />
        {busy && <p role="status">{tr('Arbeitsstand wird geprüft …', 'Checking working state …')}</p>}
        {error && (
          <p role="alert" className="hosting-error">
            {error}
          </p>
        )}
        {alreadyActive ? (
          <p role="status" className="planner-work-notice">
            {tr('Dieser Aufgabenbranch ist hier bereits aktiv.', 'This task branch is already active here.')}
          </p>
        ) : partial ? (
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
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy || Boolean(existing)} maxLength={80} />
            </label>
            {!existing && (
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
            {!inspection?.defaultBase && !existing && (
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
                    target.onNavigate?.();
                    onClose();
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
