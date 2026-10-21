import { RefreshCw } from 'lucide-react';
import type { RefObject } from 'react';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { PlannerWorkSummary } from './PlannerWorkSummary';
import { activePlannerBranch } from '@/shared/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';
import { PlannerWorkRequests } from './PlannerWorkRequests';
import { PlannerWorkHistory } from './PlannerWorkHistory';
import { PlannerWorkArchive } from './PlannerWorkArchive';
import { PlannerWorkProgress } from './PlannerWorkProgress';
import { PlannerWorkOptions } from './PlannerWorkOptions';
import { PlannerWorkCompletion } from './PlannerWorkCompletion';
import { PlannerWorkCreatePr } from './PlannerWorkCreatePr';
import { usePlannerWorkDetails } from './usePlannerWorkDetails';

export function PlannerWorkPanel({
  repoPath,
  item,
  currentBranch,
  headingRef,
  creatingPr,
  onCreatePrChange,
  onNavigate,
  onSetup,
  onItemChanged,
}: {
  repoPath: string;
  item: PlannerItem;
  currentBranch: string;
  headingRef?: RefObject<HTMLHeadingElement>;
  creatingPr: boolean;
  onCreatePrChange(value: boolean): void;
  onNavigate(): void;
  onSetup(): void;
  onItemChanged(item: PlannerItem): void;
}) {
  const { tr } = useI18n();
  const navigate = useGitStore((state) => state.onNavigateToCommit);
  const branch = activePlannerBranch(item);
  const { details, busy, loading, error, refresh, update } = usePlannerWorkDetails(repoPath, item, onItemChanged);
  const refs = item.references?.pullRequests.filter((entry) => entry.workflowId === branch?.id) || [];
  const openCommit = (sha: string) => {
    onNavigate();
    navigate(sha);
  };
  const publish = () => {
    if (!branch) return;
    onNavigate();
    requestRemoteTransfer({
      repoPath,
      mode: 'push',
      expectedBranch: branch.name,
      sourceBranch: branch.name,
      destinationBranch: branch.name,
      expectedSourceOid: details?.headSha,
    });
  };
  if (creatingPr && branch && details?.hostingRepository)
    return (
      <PlannerWorkCreatePr
        item={item}
        branch={branch}
        repository={details.hostingRepository}
        headingRef={headingRef}
        onCreated={(completeOnMerge) => {
          onCreatePrChange(false);
          void update({ action: 'automation', paused: !completeOnMerge });
        }}
      />
    );
  return (
    <section className="planner-work planner-work-overview planner-dialog-form" aria-label={tr('Aufgabe und Git', 'Task and Git')} aria-busy={busy || loading}>
      <h3 ref={headingRef} tabIndex={-1} className="planner-work-title">
        {item.title}
      </h3>
      <PlannerWorkProgress item={item} />
      <PlannerWorkSummary
        item={item}
        details={details}
        currentBranch={currentBranch}
        busy={busy}
        loading={loading}
        onSetup={onSetup}
        onPublish={publish}
        onCreatePr={() => onCreatePrChange(true)}
      />
      <PlannerWorkCompletion item={item} details={details} busy={busy} onResume={() => void update({ action: 'automation', paused: false })} />
      {details?.branchMissing && (
        <p className="planner-work-notice" role="status">
          {tr(
            'Der Branch fehlt lokal. Verlauf und Links bleiben erhalten. Einen Ersatzbranch kannst du in den Optionen zuordnen.',
            'The branch is missing locally. History and links are preserved. Assign a replacement in the options.',
          )}
        </p>
      )}
      {(error || details?.error) && (
        <p role="status" className="hosting-error">
          {error || details?.error}
        </p>
      )}
      {loading && <p role="status">{tr('Gespeicherten Verlauf laden …', 'Loading saved history …')}</p>}
      {branch && (
        <>
          <div className="planner-work-refresh">
            <span className="planner-work-muted">
              {details?.checkedAt
                ? tr('Stand:', 'As of:') + ' ' + new Date(details.checkedAt).toLocaleString()
                : tr('Gespeicherte Verknüpfungen', 'Saved references')}
            </span>
            <button type="button" className="planner-btn planner-btn-secondary" disabled={busy} onClick={() => void refresh()}>
              <RefreshCw size={13} />
              {busy ? tr('Aktualisieren …', 'Refreshing …') : tr('Aktualisieren', 'Refresh')}
            </button>
          </div>
          <details className="planner-work-disclosure">
            <summary>
              {tr('Commits und PR-Verknüpfungen', 'Commits and PR links')}{' '}
              <span className="planner-work-muted">
                · {tr('Commits', 'Commits')} ({details?.commits.filter((entry) => entry.state === 'current').length || 0}) · PRs ({refs.length})
              </span>
            </summary>
            <PlannerWorkHistory details={details} onOpen={openCommit} />
            <PlannerWorkRequests
              references={refs}
              details={details}
              busy={busy}
              onAttach={(reference) => void update({ action: 'attach-pr', reference })}
              onDetach={(id) => void update({ action: 'detach-pr', id })}
            />
          </details>
          <PlannerWorkOptions branch={branch} details={details} busy={busy} update={update} />
        </>
      )}
      <PlannerWorkArchive key={`${repoPath}:${item.id}`} item={item} repoPath={repoPath} activeId={branch?.id} onOpen={openCommit} />
    </section>
  );
}
