import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { GithubWorkflowRunDto } from '../../../global';
import { useI18n } from '../../../i18n';
import { RepoCard, RepoCardContent, RepoCardHeader, RepoCardStatus, RepoCardToolbar } from '../../sidebar/RepoCard';

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
  const [isPrCollapsed, setIsPrCollapsed] = useState(false);
  const [isWorkflowCollapsed, setIsWorkflowCollapsed] = useState(false);
  const [workflowRuns, setWorkflowRuns] = useState<GithubWorkflowRunDto[]>([]);
  const [isLoadingWorkflowRuns, setIsLoadingWorkflowRuns] = useState(false);
  const [workflowRunsError, setWorkflowRunsError] = useState<string | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState('');

  useEffect(() => {
    const ownerRepo = props.prOwnerRepo;
    if (!ownerRepo || !window.electronAPI) {
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
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
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

  const filteredWorkflowRuns = useMemo(() => {
    const normalized = workflowQuery.trim().toLowerCase();
    if (!normalized) return workflowRuns;
    return workflowRuns.filter(run => {
      const haystack = `${run.workflowName || ''} ${run.name || ''} ${run.event || ''} ${run.status || ''} ${run.conclusion || ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [workflowQuery, workflowRuns]);

  if (!props.prOwnerRepo) {
    return (
      <RepoCard>
        <RepoCardContent>
          <RepoCardStatus
            variant="warning"
            title={tr('Keine GitHub-Remote-Zuordnung fuer dieses Repo gefunden.', 'No GitHub remote mapping found for this repo.')}
          />
        </RepoCardContent>
      </RepoCard>
    );
  }

  return (
    <>
      <RepoCard>
        <RepoCardHeader
          title={`${tr('Pull Requests', 'Pull Requests')} (${props.prOwnerRepo.owner}/${props.prOwnerRepo.repo})`}
          collapsed={isPrCollapsed}
          onToggleCollapsed={() => setIsPrCollapsed((prev) => !prev)}
          toggleTitle={isPrCollapsed ? tr('Pull Requests anzeigen', 'Show pull requests') : tr('Pull Requests einklappen', 'Collapse pull requests')}
          actions={(
            <button className="icon-btn" style={{ padding: '2px' }} onClick={() => { props.setShowCreatePR(true); props.setNewPRHead(props.currentBranch); }} title={tr('Neuen PR erstellen', 'Create new PR')}>
              <Plus size={13} />
            </button>
          )}
        />

        {!isPrCollapsed && (
          <>
            <RepoCardToolbar>
              {(['open', 'closed', 'all'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => props.setPrFilter(filter)}
                  className={`repo-filter-chip ${props.prFilter === filter ? 'active' : ''}`}
                >
                  {filter === 'open' ? tr('Offen', 'Open') : filter === 'closed' ? tr('Geschlossen', 'Closed') : tr('Alle', 'All')}
                </button>
              ))}
            </RepoCardToolbar>

            {props.showCreatePR && (
              <RepoCardContent className="repo-form-stack" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                <input className="repo-filter-input" type="text" placeholder={tr('PR Titel', 'PR title')} value={props.newPRTitle} onChange={e => props.setNewPRTitle(e.target.value)} />
                <textarea className="repo-filter-input" placeholder={tr('Beschreibung (optional)', 'Description (optional)')} value={props.newPRBody} onChange={e => props.setNewPRBody(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
                <div className="repo-inline-fields">
                  <input className="repo-filter-input" type="text" placeholder={tr('Head Branch', 'Head branch')} value={props.newPRHead} onChange={e => props.setNewPRHeadInput(e.target.value)} />
                  <input className="repo-filter-input" type="text" placeholder={tr('Base Branch', 'Base branch')} value={props.newPRBase} onChange={e => props.setNewPRBase(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button className="staging-tool-btn" onClick={() => props.setShowCreatePR(false)}>{tr('Abbrechen', 'Cancel')}</button>
                  <button className="staging-tool-btn" onClick={props.onCreatePR} disabled={!props.newPRTitle.trim()}>{tr('Erstellen', 'Create')}</button>
                </div>
              </RepoCardContent>
            )}

            <RepoCardContent className="repo-card-scroll repo-scroll-lg">
              {props.prLoading && <div className="repo-state-text">{tr('Lade Pull Requests...', 'Loading pull requests...')}</div>}

              {!props.prLoading && props.pullRequests.length === 0 && <div className="repo-state-text">{tr('Keine Pull Requests.', 'No pull requests.')}</div>}

              {!props.prLoading && props.pullRequests.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {props.pullRequests.map(pr => (
                    <div key={pr.number} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', backgroundColor: 'var(--bg-panel)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <GitPullRequest size={14} style={{ color: pr.merged ? 'var(--status-merged)' : pr.state === 'open' ? 'var(--status-success)' : 'var(--status-danger)', marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pr.title}{pr.draft && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>Draft</span>}
                          </div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '2px' }}>#{pr.number} | {pr.head} {'->'} {pr.base} | {pr.user}</div>
                          {(() => {
                            const ci = props.prCiByNumber[pr.number];
                            const badgeStyles = getCiBadgeStyles(ci?.badge || 'unknown');
                            return (
                              <button onClick={() => setSelectedPrNumber(selectedPrNumber === pr.number ? null : pr.number)} className="repo-pill-btn" style={{ marginTop: '6px', borderColor: badgeStyles.borderColor, backgroundColor: badgeStyles.backgroundColor, color: badgeStyles.color }}>
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
                                <div style={{ color: 'var(--text-secondary)' }}><Clock3 size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />{run.event} | {formatDuration(run.startedAt, run.updatedAt)}</div>
                              </div>
                              <button className="staging-btn-sm" onClick={() => props.onOpenPR(run.htmlUrl)} title={tr('Im Browser oeffnen', 'Open in browser')}><ExternalLink size={12} /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {pr.state === 'open' && (
                          <>
                            <button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'merge')}>Merge</button>
                            <button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'squash')}>Squash</button>
                            <button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'rebase')}>Rebase</button>
                          </>
                        )}
                        <button className="staging-btn-sm" onClick={() => props.onOpenPR(pr.htmlUrl)}><ExternalLink size={12} /></button>
                        <button className="staging-btn-sm" onClick={() => props.onCopyPRUrl(pr.htmlUrl)}><Copy size={12} /></button>
                        <button className="staging-btn-sm" onClick={() => props.onCheckoutPR(pr.number, pr.head)}><GitBranch size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </RepoCardContent>
          </>
        )}
      </RepoCard>

      <RepoCard>
        <RepoCardHeader
          title={tr('Actions Workflows', 'Actions workflows')}
          collapsed={isWorkflowCollapsed}
          onToggleCollapsed={() => setIsWorkflowCollapsed((prev) => !prev)}
          toggleTitle={isWorkflowCollapsed ? tr('Workflows anzeigen', 'Show workflows') : tr('Workflows einklappen', 'Collapse workflows')}
        />

        {!isWorkflowCollapsed && (
          <>
            <RepoCardToolbar>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input className="repo-filter-input" value={workflowQuery} onChange={(event) => setWorkflowQuery(event.target.value)} placeholder={tr('Workflows filtern...', 'Filter workflows...')} style={{ paddingLeft: '26px' }} />
              </div>
            </RepoCardToolbar>

            <RepoCardContent className="repo-card-scroll repo-scroll-md">
              {isLoadingWorkflowRuns && <div className="repo-state-text">{tr('Lade Workflow-Runs...', 'Loading workflow runs...')}</div>}
              {workflowRunsError && <div className="repo-state-text" style={{ color: 'var(--status-danger)' }}>{workflowRunsError}</div>}
              {!isLoadingWorkflowRuns && !workflowRunsError && filteredWorkflowRuns.length === 0 && <div className="repo-state-text">{workflowQuery.trim() ? tr('Keine Treffer fuer den Filter.', 'No matches for this filter.') : tr('Keine Workflow-Runs gefunden.', 'No workflow runs found.')}</div>}

              {!isLoadingWorkflowRuns && !workflowRunsError && filteredWorkflowRuns.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filteredWorkflowRuns.map((run) => (
                    <div key={run.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-panel)', padding: '6px 8px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 8px', alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.workflowName || run.name}</div>
                        <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>{run.status}{run.conclusion ? ` | ${run.conclusion}` : ''} | {run.event}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(run.createdAt).toLocaleString()} | {formatDuration(run.startedAt, run.updatedAt)}</div>
                      </div>
                      <button className="staging-btn-sm" onClick={() => props.onOpenPR(run.htmlUrl)} title={tr('Im Browser oeffnen', 'Open in browser')}><ExternalLink size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </RepoCardContent>
          </>
        )}
      </RepoCard>
    </>
  );
};
