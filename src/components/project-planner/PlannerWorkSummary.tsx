import { CheckCircle2, GitBranch, Upload } from 'lucide-react';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { activePlannerBranch, plannerWorkReferenceKey } from '@/shared/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerWorkDetails } from '@/types/plannerWork';
import { PlannerWorkPhaseLabel } from './PlannerWorkPhaseLabel';

type SummaryProps = {
  item: PlannerItem;
  details?: PlannerWorkDetails;
  currentBranch: string;
  busy: boolean;
  loading: boolean;
  onSetup(): void;
  onPublish(): void;
  onCreatePr(): void;
};

function WorkActions({ item, details, currentBranch, busy, loading, onSetup, onPublish, onCreatePr }: SummaryProps) {
  const { tr } = useI18n();
  const branch = activePlannerBranch(item);
  const refs = item.references?.pullRequests.filter((entry) => entry.workflowId === branch?.id) || [];
  const openPr = refs.find((ref) =>
    details?.requests.some((entry) => plannerWorkReferenceKey(entry) === plannerWorkReferenceKey(ref) && entry.state === 'open'),
  );
  if (!branch || branch.completedBy)
    return (
      <button type="button" className="planner-btn planner-btn-primary" disabled={busy} onClick={onSetup}>
        {branch ? tr('Neue Bearbeitung starten …', 'Start new work …') : tr('Bearbeitung starten …', 'Start work …')}
      </button>
    );
  if (details?.branchMissing) return null;
  return (
    <>
      {currentBranch !== branch.name && (
        <button type="button" className="planner-btn planner-btn-primary" disabled={busy || loading} onClick={onSetup}>
          {tr('Zum Aufgabenbranch wechseln …', 'Switch to task branch …')}
        </button>
      )}
      <button
        type="button"
        className={`planner-btn ${currentBranch === branch.name && !openPr ? 'planner-btn-primary' : 'planner-btn-secondary'}`}
        disabled={busy || loading}
        onClick={onPublish}
      >
        <Upload size={14} />
        {tr('Branch veröffentlichen …', 'Publish branch …')}
      </button>
      {openPr ? (
        <button type="button" className="planner-btn planner-btn-primary" onClick={() => void appClient.openExternalUrl(openPr.url)}>
          {tr('PR öffnen', 'Open PR')}
        </button>
      ) : (
        <button type="button" className="planner-btn planner-btn-secondary" disabled={busy || !details?.hostingRepository} onClick={onCreatePr}>
          {tr('PR erstellen …', 'Create PR …')}
        </button>
      )}
    </>
  );
}

export function PlannerWorkSummary(props: SummaryProps) {
  const { item, details, currentBranch } = props;
  const { tr } = useI18n();
  const branch = activePlannerBranch(item);
  const linked = item.references?.pullRequests.some((entry) => entry.workflowId === branch?.id);
  const active = Boolean(branch && !details?.branchMissing && currentBranch === branch.name);
  return (
    <div className="planner-work-summary">
      <h4>
        <PlannerWorkPhaseLabel item={item} details={details} />
      </h4>
      {branch ? (
        <>
          <div className="planner-work-branch">
            <GitBranch size={15} />
            <code>{branch.name}</code>
            {active && (
              <span className="planner-work-active">
                <CheckCircle2 size={13} />
                {tr('Hier aktiv', 'Active here')}
              </span>
            )}
          </div>
          <p className="planner-work-muted">
            {tr('Zielbranch:', 'Target branch:')} <code>{branch.baseRef.replace(/^refs\/(heads|remotes)\//, '')}</code>
          </p>
          {!active && !details?.branchMissing && (
            <p>
              {tr('Aktuell ausgecheckt:', 'Currently checked out:')} <code>{currentBranch || tr('kein Branch', 'no branch')}</code>
            </p>
          )}
        </>
      ) : (
        <p>{tr('Lege einen eigenen Branch für diese Aufgabe an.', 'Create a dedicated branch for this task.')}</p>
      )}
      {branch && !branch.completedBy && (
        <p className="planner-work-next">
          {linked
            ? tr(
                'Nächster Schritt: PR-Zustand prüfen. Ein automatischer Abschluss benötigt einen bestätigten Merge aller Änderungen und eine aktive Statusautomatik.',
                'Next: check the PR state. Automatic completion requires a confirmed merge of all changes and enabled status automation.',
              )
            : tr(
                'Änderungen auf dem Aufgabenbranch committen, veröffentlichen und anschließend einen PR erstellen.',
                'Commit changes on the task branch, publish it, then create a PR.',
              )}
        </p>
      )}
      <div className="planner-work-actions">
        <WorkActions {...props} />
      </div>
    </div>
  );
}
