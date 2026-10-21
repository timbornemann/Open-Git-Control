import { useCallback, useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { DialogFrame } from '@/components/DialogFrame';
import { HostingCreateChangeRequest } from '@/components/hosting/HostingCreateChangeRequest';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';
import { useGitStore, useUIContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { plannerClient } from '@/services/plannerClient';
import { activePlannerBranch } from '@/shared/plannerWork';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerUpdateWorkRequest, PlannerWorkDetails } from '@/types/plannerWork';
import { requestPlannerWork } from './plannerWorkDialogState';
import { PlannerWorkRequests } from './PlannerWorkRequests';
import { PlannerWorkHistory } from './PlannerWorkHistory';
import { PlannerWorkArchive } from './PlannerWorkArchive';
type WorkAction<T> = T extends unknown ? Omit<T, 'repoPath' | 'itemId' | 'expectedRevision'> : never;

export function PlannerWorkPanel({ repoPath, item, onNavigate }: { repoPath: string; item: PlannerItem; onNavigate(): void }) {
  const { tr } = useI18n();
  const navigate = useGitStore((state) => state.onNavigateToCommit);
  const { setConfirmDialog } = useUIContext();
  const branch = activePlannerBranch(item);
  const [details, setDetails] = useState<PlannerWorkDetails>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createPr, setCreatePr] = useState(false);
  const [replacement, setReplacement] = useState('');
  const read = useCallback(async () => {
    const result = await plannerClient.getWork({ repoPath, itemId: item.id });
    if (result.success) setDetails(result.data);
    else setError(result.error);
  }, [repoPath, item.id]);
  useEffect(() => {
    let current = true;
    const load = () => {
      if (current)
        void read().catch((e: unknown) => {
          if (current) setError(String(e));
        });
    };
    load();
    const unsubscribe = plannerClient.onDataChanged(load);
    return () => {
      current = false;
      unsubscribe();
    };
  }, [read, item.updatedAt]);
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await plannerClient.refreshWork({ repoPath, itemId: item.id });
      if (result.success) setDetails(result.data);
      else setError(result.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const update = async (action: WorkAction<PlannerUpdateWorkRequest>) => {
    setBusy(true);
    setError('');
    try {
      const result = await plannerClient.updateWork({
        ...action,
        repoPath,
        itemId: item.id,
        expectedRevision: details?.revision || '',
      } as PlannerUpdateWorkRequest);
      if (!result.success) setError(result.error);
      else await read();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const refs = item.references?.pullRequests.filter((entry) => entry.workflowId === branch?.id) || [];
  return (
    <section className="planner-work-panel planner-work" aria-label={tr('Aufgabe und Git', 'Task and Git')}>
      <h3>
        <GitBranch size={16} /> {tr('Aufgabe und Git', 'Task and Git')}
      </h3>
      <div className="planner-work-actions">
        <button type="button" disabled={busy} onClick={() => requestPlannerWork(repoPath, item)}>
          {branch && !branch.completedBy ? tr('Bearbeitung fortsetzen', 'Resume work') : tr('Bearbeitung starten', 'Start work')}
        </button>
        {branch && (
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            {tr('Verknüpfungen aktualisieren', 'Refresh references')}
          </button>
        )}
      </div>
      {(error || details?.error) && (
        <p role="status" className="hosting-error">
          {error || details?.error}
        </p>
      )}
      {branch && (
        <>
          <p>
            <code>{branch.name}</code> ← <code>{branch.baseRef.replace(/^refs\/(heads|remotes)\//, '')}</code> · <code>{branch.baseSha.slice(0, 10)}</code>
          </p>
          {details?.branchMissing && (
            <p role="status">
              {tr('Der Branch fehlt lokal. Verlauf und Links bleiben erhalten.', 'The branch is missing locally. History and links are preserved.')}
            </p>
          )}
          {branch.completedBy ? (
            <p>{tr('Durch PR-Merge abgeschlossen.', 'Completed by a PR merge.')}</p>
          ) : (
            <>
              <p>
                {branch.automationPaused
                  ? tr('Statusautomatik pausiert. Manuelle Änderungen haben Vorrang.', 'Status automation is paused. Manual changes take precedence.')
                  : tr('Automatischer Abschluss nach bestätigtem PR-Merge.', 'Automatically complete after a confirmed PR merge.')}
              </p>
              <button
                type="button"
                disabled={busy || !details?.revision}
                onClick={() => void update({ action: 'automation', paused: !branch.automationPaused })}
              >
                {branch.automationPaused ? tr('Automatik fortsetzen', 'Resume automation') : tr('Automatik pausieren', 'Pause automation')}
              </button>
            </>
          )}
          <div className="planner-work-actions">
            <button
              type="button"
              disabled={busy || details?.branchMissing}
              onClick={() => {
                onNavigate();
                requestRemoteTransfer({
                  repoPath,
                  mode: 'push',
                  expectedBranch: branch.name,
                  sourceBranch: branch.name,
                  destinationBranch: branch.name,
                  expectedSourceOid: details?.headSha,
                });
              }}
            >
              {tr('Branch veröffentlichen …', 'Publish branch …')}
            </button>
            <button type="button" disabled={!details?.hostingRepository || busy} onClick={() => setCreatePr(true)}>
              {tr('PR erstellen …', 'Create PR …')}
            </button>
            <button
              type="button"
              disabled={busy || !details?.revision}
              onClick={() =>
                setConfirmDialog({
                  variant: 'confirm',
                  title: tr('Branch-Zuordnung abschließen?', 'Archive branch assignment?'),
                  message: tr(
                    'Der Verlauf bleibt erhalten. Ein neuer Arbeitsbranch kann anschließend angelegt werden.',
                    'History is retained. You can then start a new work branch.',
                  ),
                  contextItems: [{ label: 'Branch', value: branch.name }],
                  irreversible: false,
                  consequences: tr('Die Statusautomatik dieser Zuordnung endet.', 'Status automation ends for this assignment.'),
                  onConfirm: () => update({ action: 'archive' }),
                })
              }
            >
              {tr('Zuordnung archivieren', 'Archive assignment')}
            </button>
          </div>
          {details?.branchMissing && (
            <label>
              {tr('Vorhandenen Ersatzbranch ausdrücklich zuordnen', 'Explicitly assign an existing replacement branch')}
              <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
              <button
                type="button"
                disabled={busy || !replacement.trim()}
                onClick={() => void update({ action: 'assign-branch', branchName: replacement.trim() } as Parameters<typeof update>[0])}
              >
                {tr('Zuordnen und Automatik pausieren', 'Assign and pause automation')}
              </button>
            </label>
          )}
          <PlannerWorkHistory
            details={details}
            onOpen={(sha) => {
              onNavigate();
              navigate(sha);
            }}
          />
          <PlannerWorkRequests
            references={refs}
            details={details}
            busy={busy}
            onAttach={(reference) => void update({ action: 'attach-pr', reference })}
            onDetach={(id) => void update({ action: 'detach-pr', id })}
          />
          {createPr && details?.hostingRepository && (
            <DialogFrame open title={tr('PR erstellen', 'Create PR')} onClose={() => setCreatePr(false)}>
              <HostingCreateChangeRequest
                repository={details.hostingRepository}
                initialDraft={{
                  title: item.title,
                  body: item.description,
                  sourceBranch: branch.name,
                  targetBranch: branch.baseRef.replace(/^refs\/(?:heads\/|remotes\/[^/]+\/)/, ''),
                  target: details.hostingRepository.parent || details.hostingRepository.ref,
                }}
                onCreated={() => {
                  setCreatePr(false);
                  void refresh();
                }}
              />
            </DialogFrame>
          )}
        </>
      )}
      <PlannerWorkArchive
        key={`${repoPath}:${item.id}`}
        item={item}
        repoPath={repoPath}
        activeId={branch?.id}
        onOpen={(sha) => {
          onNavigate();
          navigate(sha);
        }}
      />
    </section>
  );
}
