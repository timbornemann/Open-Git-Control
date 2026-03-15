import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { GithubWorkflowRunDto } from '../../../global';
import { useI18n } from '../../../i18n';
import { validateGithubReleaseInput } from '../../../utils/githubReleaseValidation';

type RepoGithubActionsContentProps = Pick<
  AppSidebarProps,
  | 'prOwnerRepo'
  | 'prFilter'
  | 'setPrFilter'
  | 'prLoading'
  | 'pullRequests'
  | 'prCiByNumber'
  | 'onOpenPR'
  | 'onCopyPRUrl'
  | 'onCheckoutPR'
  | 'onMergePR'
  | 'showCreatePR'
  | 'setShowCreatePR'
  | 'currentBranch'
  | 'setNewPRHead'
  | 'newPRTitle'
  | 'setNewPRTitle'
  | 'newPRBody'
  | 'setNewPRBody'
  | 'newPRHead'
  | 'setNewPRHeadInput'
  | 'newPRBase'
  | 'setNewPRBase'
  | 'onCreatePR'
  | 'releaseForm'
  | 'setReleaseForm'
  | 'releaseSubmitting'
  | 'releaseError'
  | 'releaseSuccess'
  | 'onCreateRelease'
>;

const getCiBadgeStyles = (badge: string) => {
  if (badge === 'success') return { color: 'var(--status-success)', backgroundColor: 'var(--status-success-soft)', borderColor: 'var(--status-success-border)', label: 'CI: Success' };
  if (badge === 'failure') return { color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-soft)', borderColor: 'var(--status-danger-border)', label: 'CI: Failed' };
  if (badge === 'pending') return { color: 'var(--status-warning)', backgroundColor: 'var(--status-warning-soft)', borderColor: 'var(--status-warning-border)', label: 'CI: Pending' };
  return { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-dark)', borderColor: 'var(--border-color)', label: 'CI: Unknown' };
};

const formatDuration = (startedAt?: string | null, finishedAt?: string | null): string => {
  if (!startedAt || !finishedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '-';
  const totalSec = Math.round((end - start) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${String(sec).padStart(2, '0')}s`;
};

export const RepoGithubActionsContent: React.FC<RepoGithubActionsContentProps> = (props) => {
  const { tr } = useI18n();
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<GithubWorkflowRunDto[]>([]);
  const [isLoadingWorkflowRuns, setIsLoadingWorkflowRuns] = useState(false);
  const [workflowRunsError, setWorkflowRunsError] = useState<string | null>(null);

  const releaseValidation = validateGithubReleaseInput({
    tagName: props.releaseForm.tagName || '',
    releaseName: props.releaseForm.releaseName || '',
  });
  const releaseSubmitDisabled = !props.prOwnerRepo || props.releaseSubmitting || !releaseValidation.valid;

  useEffect(() => {
    if (!props.prOwnerRepo || !window.electronAPI) {
      setWorkflowRuns([]);
      setWorkflowRunsError(null);
      return;
    }

    let active = true;
    const loadWorkflowRuns = async () => {
      setIsLoadingWorkflowRuns(true);
      setWorkflowRunsError(null);
      try {
        const result = await window.electronAPI.githubGetWorkflowRuns({
          owner: props.prOwnerRepo!.owner,
          repo: props.prOwnerRepo!.repo,
          branch: props.currentBranch || undefined,
          perPage: 20,
        });

        if (!active) return;
        if (!result.success) {
          setWorkflowRuns([]);
          setWorkflowRunsError(result.error || tr('Workflows konnten nicht geladen werden.', 'Could not load workflows.'));
          return;
        }
        setWorkflowRuns(result.data || []);
      } catch (error: any) {
        if (!active) return;
        setWorkflowRuns([]);
        setWorkflowRunsError(error?.message || tr('Workflows konnten nicht geladen werden.', 'Could not load workflows.'));
      } finally {
        if (active) setIsLoadingWorkflowRuns(false);
      }
    };

    void loadWorkflowRuns();
    return () => {
      active = false;
    };
  }, [props.prOwnerRepo, props.currentBranch, tr]);

  if (!props.prOwnerRepo) {
    return (
      <div style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {tr('Keine GitHub-Remote-Zuordnung fuer dieses Repo gefunden.', 'No GitHub remote mapping found for this repo.')}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 6px' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
          {tr('Pull Requests', 'Pull Requests')} ({props.prOwnerRepo.owner}/{props.prOwnerRepo.repo})
        </span>
        <button className="icon-btn" style={{ padding: '2px' }} onClick={() => { props.setShowCreatePR(true); props.setNewPRHead(props.currentBranch); }} title={tr('Neuen PR erstellen', 'Create new PR')}>
          <Plus size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {(['open', 'closed', 'all'] as const).map(filter => (
          <button
            key={filter}
            onClick={() => props.setPrFilter(filter)}
            style={{ flex: 1, padding: '3px 6px', fontSize: '0.72rem', fontWeight: 600, backgroundColor: props.prFilter === filter ? 'var(--accent-primary)' : 'var(--bg-dark)', color: props.prFilter === filter ? 'var(--on-accent)' : 'var(--text-secondary)', border: `1px solid ${props.prFilter === filter ? 'var(--accent-primary)' : 'var(--border-color)'}`, borderRadius: '4px', cursor: 'pointer', textTransform: 'capitalize' }}
          >
            {filter === 'open' ? tr('Offen', 'Open') : filter === 'closed' ? tr('Geschlossen', 'Closed') : tr('Alle', 'All')}
          </button>
        ))}
      </div>

      {props.showCreatePR && (
        <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
          <input type="text" placeholder={tr('PR Titel', 'PR title')} value={props.newPRTitle} onChange={e => props.setNewPRTitle(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <textarea placeholder={tr('Beschreibung (optional)', 'Description (optional)')} value={props.newPRBody} onChange={e => props.setNewPRBody(e.target.value)} rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="text" placeholder={tr('Head Branch', 'Head branch')} value={props.newPRHead} onChange={e => props.setNewPRHeadInput(e.target.value)} style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem' }} />
            <span style={{ color: 'var(--text-secondary)', alignSelf: 'center', fontSize: '0.8rem' }}>{'->'}</span>
            <input type="text" placeholder={tr('Base Branch', 'Base branch')} value={props.newPRBase} onChange={e => props.setNewPRBase(e.target.value)} style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.78rem' }} />
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button onClick={() => props.setShowCreatePR(false)} style={{ padding: '5px 10px', backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>{tr('Abbrechen', 'Cancel')}</button>
            <button onClick={props.onCreatePR} disabled={!props.newPRTitle.trim()} style={{ padding: '5px 10px', backgroundColor: props.newPRTitle.trim() ? 'var(--accent-primary)' : 'var(--bg-dark)', color: props.newPRTitle.trim() ? 'var(--on-accent)' : 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: props.newPRTitle.trim() ? 'pointer' : 'not-allowed', fontSize: '0.78rem', fontWeight: 600 }}>{tr('Erstellen', 'Create')}</button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{tr('Release erstellen', 'Create release')}</div>
        <input type="text" placeholder={tr('Tag-Name (Pflicht)', 'Tag name (required)')} value={props.releaseForm.tagName || ''} onChange={e => props.setReleaseForm(prev => ({ ...prev, tagName: e.target.value }))} disabled={!props.prOwnerRepo || props.releaseSubmitting} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
        <input type="text" placeholder={tr('Release-Name (Pflicht)', 'Release name (required)')} value={props.releaseForm.releaseName || ''} onChange={e => props.setReleaseForm(prev => ({ ...prev, releaseName: e.target.value }))} disabled={!props.prOwnerRepo || props.releaseSubmitting} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
        <input type="text" placeholder={tr('Ziel-Branch oder Commit (optional)', 'Target branch or commit (optional)')} value={props.releaseForm.targetCommitish || ''} onChange={e => props.setReleaseForm(prev => ({ ...prev, targetCommitish: e.target.value }))} disabled={!props.prOwnerRepo || props.releaseSubmitting} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
        <textarea placeholder={tr('Release Notes (optional)', 'Release notes (optional)')} value={props.releaseForm.body || ''} onChange={e => props.setReleaseForm(prev => ({ ...prev, body: e.target.value }))} rows={3} disabled={!props.prOwnerRepo || props.releaseSubmitting} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={Boolean(props.releaseForm.draft)} onChange={e => props.setReleaseForm(prev => ({ ...prev, draft: e.target.checked }))} disabled={!props.prOwnerRepo || props.releaseSubmitting} />{tr('Entwurf (Draft)', 'Draft')}</label>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><input type="checkbox" checked={Boolean(props.releaseForm.prerelease)} onChange={e => props.setReleaseForm(prev => ({ ...prev, prerelease: e.target.checked }))} disabled={!props.prOwnerRepo || props.releaseSubmitting} />{tr('Pre-Release', 'Pre-release')}</label>
        </div>
        {!releaseValidation.valid && <div style={{ fontSize: '0.74rem', color: 'var(--status-warning)' }}>{tr('Bitte gueltigen Tag und Release-Namen angeben.', 'Please provide valid tag and release name.')}</div>}
        {props.releaseError && <div style={{ fontSize: '0.74rem', color: 'var(--status-danger)', lineHeight: 1.35 }}>{props.releaseError}</div>}
        {props.releaseSuccess && <div style={{ fontSize: '0.74rem', color: 'var(--status-success)', lineHeight: 1.35 }}>{tr('Release erfolgreich erstellt.', 'Release created successfully.')} <a href={props.releaseSuccess.htmlUrl} onClick={(e) => { e.preventDefault(); props.onOpenPR(props.releaseSuccess!.htmlUrl); }} style={{ color: 'inherit', textDecoration: 'underline' }}>{tr('Release oeffnen', 'Open release')}</a></div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { void props.onCreateRelease(); }} disabled={releaseSubmitDisabled} style={{ padding: '5px 10px', backgroundColor: releaseSubmitDisabled ? 'var(--bg-dark)' : 'var(--accent-primary)', color: releaseSubmitDisabled ? 'var(--text-secondary)' : 'var(--on-accent)', border: 'none', borderRadius: '4px', cursor: releaseSubmitDisabled ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>{props.releaseSubmitting ? tr('Erstelle...', 'Creating...') : tr('Release erstellen', 'Create release')}</button>
        </div>
      </div>

      <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{tr('Actions Workflows', 'Actions workflows')}</div>
        {isLoadingWorkflowRuns && <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{tr('Lade Workflow-Runs...', 'Loading workflow runs...')}</div>}
        {workflowRunsError && <div style={{ fontSize: '0.74rem', color: 'var(--status-danger)' }}>{workflowRunsError}</div>}
        {!isLoadingWorkflowRuns && !workflowRunsError && workflowRuns.length === 0 && <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{tr('Keine Workflow-Runs gefunden.', 'No workflow runs found.')}</div>}
        {!isLoadingWorkflowRuns && !workflowRunsError && workflowRuns.map((run) => (
          <div key={run.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-dark)', padding: '6px 8px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 8px', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.workflowName || run.name}</div>
              <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>{run.status}{run.conclusion ? ` • ${run.conclusion}` : ''} • {run.event}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(run.createdAt).toLocaleString()} • {formatDuration(run.startedAt, run.updatedAt)}</div>
            </div>
            <button className="staging-btn-sm" onClick={() => props.onOpenPR(run.htmlUrl)} title={tr('Im Browser oeffnen', 'Open in browser')}><ExternalLink size={12} /></button>
          </div>
        ))}
      </div>

      {props.prLoading && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 0' }}>{tr('Lade Pull Requests...', 'Loading pull requests...')}</div>}

      {!props.prLoading && props.pullRequests.map(pr => (
        <div key={pr.number} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', backgroundColor: 'var(--bg-panel)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <GitPullRequest size={14} style={{ color: pr.merged ? 'var(--status-merged)' : pr.state === 'open' ? 'var(--status-success)' : 'var(--status-danger)', marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.title}{pr.draft && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>Draft</span>}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>#{pr.number} | {pr.head} {'->'} {pr.base} | {pr.user}</div>
              {(() => {
                const ci = props.prCiByNumber[pr.number];
                const badgeStyles = getCiBadgeStyles(ci?.badge || 'unknown');
                return (
                  <button onClick={() => setSelectedPrNumber(selectedPrNumber === pr.number ? null : pr.number)} style={{ marginTop: '6px', borderRadius: '999px', border: `1px solid ${badgeStyles.borderColor}`, backgroundColor: badgeStyles.backgroundColor, color: badgeStyles.color, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }} title={ci?.summary || tr('CI-Status laden...', 'Loading CI status...')}>
                    {ci?.badge === 'success' && <CheckCircle2 size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                    {ci?.badge === 'failure' && <XCircle size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                    {ci?.badge === 'pending' && <RefreshCw size={11} className="spin" style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                    {badgeStyles.label}
                  </button>
                );
              })()}
            </div>
          </div>
          {selectedPrNumber === pr.number && props.prCiByNumber[pr.number] && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', backgroundColor: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(props.prCiByNumber[pr.number]?.workflowRuns || []).slice(0, 5).map(run => (
                <div key={run.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 10px', alignItems: 'center', fontSize: '0.72rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.workflowName || run.name}</div>
                    <div style={{ color: 'var(--text-secondary)' }}><Clock3 size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Trigger: {run.event} • Duration: {formatDuration(run.startedAt, run.updatedAt)}</div>
                  </div>
                  <button className="staging-btn-sm" onClick={() => props.onOpenPR(run.htmlUrl)} title={tr('Im Browser oeffnen', 'Open in browser')}><ExternalLink size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {pr.state === 'open' && (<><button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'merge')}>Merge</button><button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'squash')}>Squash</button><button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'rebase')}>Rebase</button></>)}
            <button className="staging-btn-sm" onClick={() => props.onOpenPR(pr.htmlUrl)}><ExternalLink size={12} /></button>
            <button className="staging-btn-sm" onClick={() => props.onCopyPRUrl(pr.htmlUrl)}><Copy size={12} /></button>
            <button className="staging-btn-sm" onClick={() => props.onCheckoutPR(pr.number, pr.head)}><GitBranch size={12} /></button>
          </div>
        </div>
      ))}

      {!props.prLoading && props.pullRequests.length === 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 0', textAlign: 'center' }}>
          {tr('Keine Pull Requests.', 'No pull requests.')}
        </div>
      )}
    </>
  );
};

