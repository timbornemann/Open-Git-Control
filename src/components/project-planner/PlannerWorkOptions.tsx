import { useState } from 'react';
import { useI18n } from '@/i18n';
import type { PlannerBranchReference } from '@/types/projectPlanner';
import type { PlannerWorkDetails } from '@/types/plannerWork';
import type { PlannerWorkAction } from './usePlannerWorkDetails';

export function PlannerWorkOptions({
  branch,
  details,
  busy,
  update,
}: {
  branch: PlannerBranchReference;
  details?: PlannerWorkDetails;
  busy: boolean;
  update(action: PlannerWorkAction): Promise<void>;
}) {
  const { tr } = useI18n();
  const [replacement, setReplacement] = useState('');
  const [archive, setArchive] = useState(false);
  return (
    <details className="planner-work-disclosure" open={details?.branchMissing || undefined}>
      <summary>{tr('Workflow-Optionen', 'Workflow options')}</summary>
      <div className="planner-work-options">
        {!branch.completedBy && (
          <div>
            <p>{tr('Statusautomatik', 'Status automation')}</p>
            <small>
              {tr(
                'Ein bestätigter PR-Merge setzt die Aufgabe auf „Erledigt“. Manuelle Statusänderungen pausieren die Automatik.',
                'A confirmed PR merge moves the task to “Done”. Manual status changes pause automation.',
              )}
            </small>
            <button type="button" disabled={busy || !details?.revision} onClick={() => void update({ action: 'automation', paused: !branch.automationPaused })}>
              {branch.automationPaused ? tr('Automatik fortsetzen', 'Resume automation') : tr('Automatik pausieren', 'Pause automation')}
            </button>
          </div>
        )}
        {details?.branchMissing && (
          <label>
            {tr('Vorhandenen Ersatzbranch zuordnen', 'Assign an existing replacement branch')}
            <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
            <button
              type="button"
              disabled={busy || !replacement.trim() || !details?.revision}
              onClick={() => void update({ action: 'assign-branch', branchName: replacement.trim() })}
            >
              {tr('Zuordnen und Automatik pausieren', 'Assign and pause automation')}
            </button>
          </label>
        )}
        {archive ? (
          <div className="planner-work-notice" role="group" aria-label={tr('Archivieren bestätigen', 'Confirm archive')}>
            <p>{tr('Zuordnung archivieren?', 'Archive assignment?')}</p>
            <small>
              {tr(
                'Der Verlauf bleibt erhalten. Die Statusautomatik endet; danach kannst du einen neuen Arbeitsbranch anlegen.',
                'History is retained. Status automation ends; you can then start a new work branch.',
              )}
            </small>
            <div className="planner-work-actions">
              <button type="button" disabled={busy} onClick={() => setArchive(false)}>
                {tr('Abbrechen', 'Cancel')}
              </button>
              <button type="button" disabled={busy || !details?.revision} onClick={() => void update({ action: 'archive' })}>
                {tr('Jetzt archivieren', 'Archive now')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy || !details?.revision} onClick={() => setArchive(true)}>
            {tr('Zuordnung archivieren …', 'Archive assignment …')}
          </button>
        )}
      </div>
    </details>
  );
}
