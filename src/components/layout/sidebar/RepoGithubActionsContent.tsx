import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { githubClient } from '../../../services/githubClient';
import { formatDateTime } from '../../../utils/dateTime';
import { RepoCard, RepoCardContent, RepoCardHeader, RepoCardStatus, RepoCardToolbar } from '../../sidebar/RepoCard';
import { formatDuration, getCiBadgeStyles } from './githubShared';

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
> & {
  refreshTrigger: number;
};

export const RepoGithubActionsContent: React.FC<RepoGithubActionsContentProps> = (props) => {
  const { t, tr, locale } = useI18n();
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const [isPrCollapsed, setIsPrCollapsed] = useState(false);
  const [isWorkflowCollapsed, setIsWorkflowCollapsed] = useState(false);
  const [workflowRuns, setWorkflowRuns] = useState<GithubWorkflowRunDto[]>([]);
  const [isLoadingWorkflowRuns, setIsLoadingWorkflowRuns] = useState(false);
  const [workflowRunsError, setWorkflowRunsError] = useState<string | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState('');
  const ownerRepoKey = props.prOwnerRepo
    ? `${props.prOwnerRepo.owner}/${props.prOwnerRepo.repo}`
    : '';
  const workflowScopeRef = useRef('');

  useEffect(() => {
    const ownerRepo = props.prOwnerRepo;
    if (!ownerRepo || !githubClient.isAvailable()) {
      workflowScopeRef.current = '';
      setWorkflowRuns([]);
      setWorkflowRunsError(null);
      return;
    }

    const workflowScope = `${ownerRepoKey}:${props.currentBranch || ''}`;
    if (workflowScopeRef.current !== workflowScope) {
      workflowScopeRef.current = workflowScope;
      setWorkflowRuns([]);
    }

    let active = true;
    const loadWorkflowRuns = async () => {
      setIsLoadingWorkflowRuns(true);
      setWorkflowRunsError(null);
      try {
        const result = await githubClient.getWorkflowRuns({
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          branch: props.currentBranch || undefined,
          perPage: 20,
        });

        if (!active) return;
        if (!result.success) {
          setWorkflowRunsError(result.error || t('generated.components.layout.sidebar.repogithubactionscontent.could_not_load_workflows_bf2c858f'));
          return;
        }
        setWorkflowRuns(result.data || []);
      } catch (error: any) {
        if (!active) return;
        setWorkflowRunsError(error?.message || t('generated.components.layout.sidebar.repogithubactionscontent.could_not_load_workflows_bf2c858f'));
      } finally {
        if (active) setIsLoadingWorkflowRuns(false);
      }
    };

    void loadWorkflowRuns();
    return () => {
      active = false;
    };
  }, [ownerRepoKey, props.currentBranch, props.refreshTrigger, tr]);

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
            title={t('generated.components.layout.sidebar.repogithubactionscontent.no_github_remote_mapping_found_for_this_repo_e974f728')}
          />
        </RepoCardContent>
      </RepoCard>
    );
  }

  return (
    <>
      <RepoCard>
        <RepoCardHeader
          title={`${t('generated.components.layout.sidebar.githubconnectedcontent.pull_requests_b5324949')} (${props.prOwnerRepo.owner}/${props.prOwnerRepo.repo})`}
          collapsed={isPrCollapsed}
          onToggleCollapsed={() => setIsPrCollapsed((prev) => !prev)}
          toggleTitle={isPrCollapsed ? t('generated.components.layout.sidebar.repogithubactionscontent.show_pull_requests_ce686a2d') : t('generated.components.layout.sidebar.repogithubactionscontent.collapse_pull_requests_73f1857d')}
          actions={(
            <>
              <span
                className={`repo-refresh-indicator ${props.prLoading && props.pullRequests.length > 0 ? '' : 'repo-refresh-indicator--idle'}`}
                title={props.prLoading ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_pull_requests_49129472') : undefined}
                aria-label={props.prLoading ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_pull_requests_5b1ab8b6') : undefined}
                aria-hidden={!props.prLoading}
              >
                <RefreshCw size={12} className={props.prLoading ? 'spin' : ''} />
              </span>
              <button className="icon-btn sidebar-row-action-icon" onClick={() => { props.setShowCreatePR(true); props.setNewPRHead(props.currentBranch); }} title={t('generated.components.layout.sidebar.githubconnectedcontent.create_new_pr_e147bebb')}>
                <Plus size={13} />
              </button>
            </>
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
                  {filter === 'open' ? t('generated.components.layout.sidebar.githubconnectedcontent.open_3213d9d8') : filter === 'closed' ? t('generated.components.layout.sidebar.githubconnectedcontent.closed_ec5c60af') : t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff')}
                </button>
              ))}
            </RepoCardToolbar>

            {props.showCreatePR && (
              <RepoCardContent className="repo-form-stack" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                <input className="repo-filter-input" type="text" placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.pr_title_67e768c0')} value={props.newPRTitle} onChange={e => props.setNewPRTitle(e.target.value)} />
                <textarea className="repo-filter-input" placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.description_optional_30003d39')} value={props.newPRBody} onChange={e => props.setNewPRBody(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
                <div className="repo-inline-fields">
                  <input className="repo-filter-input" type="text" placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.head_branch_f25163c0')} value={props.newPRHead} onChange={e => props.setNewPRHeadInput(e.target.value)} />
                  <input className="repo-filter-input" type="text" placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.base_branch_e03dac14')} value={props.newPRBase} onChange={e => props.setNewPRBase(e.target.value)} />
                </div>
                <div className="sidebar-row-actions">
                  <button className="staging-tool-btn" onClick={() => props.setShowCreatePR(false)}>{t('generated.components.confirm.cancel_035b7526')}</button>
                  <button className="staging-tool-btn" onClick={props.onCreatePR} disabled={!props.newPRTitle.trim()}>{t('generated.components.layout.sidebar.githubconnectedcontent.create_d28c742c')}</button>
                </div>
              </RepoCardContent>
            )}

            <RepoCardContent className="repo-card-scroll repo-scroll-lg">
              {props.prLoading && props.pullRequests.length === 0 && <div className="repo-state-text">{t('generated.components.layout.sidebar.githubconnectedcontent.loading_pull_requests_f64f6445')}</div>}

              {!props.prLoading && props.pullRequests.length === 0 && <div className="repo-state-text">{t('generated.components.layout.sidebar.githubconnectedcontent.no_pull_requests_4e17ae83')}</div>}

              {props.pullRequests.length > 0 && (
                <div className="sidebar-panel-stack">
                  {props.pullRequests.map(pr => (
                    <div key={pr.number} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', backgroundColor: 'var(--bg-panel)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <GitPullRequest size={14} style={{ color: pr.merged ? 'var(--status-merged)' : pr.state === 'open' ? 'var(--status-success)' : 'var(--status-danger)', marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pr.title}{pr.draft && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>{t('generated.components.layout.sidebar.repogithubactionscontent.draft_4fc4eecc')}</span>}
                          </div>
                          <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '2px' }}>#{pr.number} | {pr.head} {'->'} {pr.base} | {pr.user}</div>
                          {(() => {
                            const ci = props.prCiByNumber[pr.number];
                            const badgeStyles = getCiBadgeStyles(ci?.badge || 'unknown', t);
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
                              <button className="staging-btn-sm" onClick={() => props.onOpenPR(run.htmlUrl)} title={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_c818b475')}><ExternalLink size={12} /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="sidebar-row-actions">
                        {pr.state === 'open' && (
                          <>
                            <button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'merge')}>{t('generated.components.layout.main.mainprimarypane.merge_83b759bf')}</button>
                            <button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'squash')}>{t('generated.components.layout.sidebar.repogithubactionscontent.squash_52bce1bb')}</button>
                            <button className="staging-btn-sm" onClick={() => props.onMergePR(pr.number, 'rebase')}>{t('generated.components.layout.main.mainprimarypane.rebase_26c8effa')}</button>
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
          title={t('generated.components.layout.sidebar.repogithubactionscontent.actions_workflows_c98cbdd5')}
          collapsed={isWorkflowCollapsed}
          onToggleCollapsed={() => setIsWorkflowCollapsed((prev) => !prev)}
          toggleTitle={isWorkflowCollapsed ? t('generated.components.layout.sidebar.repogithubactionscontent.show_workflows_ca27063c') : t('generated.components.layout.sidebar.repogithubactionscontent.collapse_workflows_03ec37bf')}
          actions={(
            <span
              className={`repo-refresh-indicator ${isLoadingWorkflowRuns || workflowRunsError ? '' : 'repo-refresh-indicator--idle'}`}
              title={isLoadingWorkflowRuns
                ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_workflow_runs_376d1885')
                : workflowRunsError || undefined}
              aria-label={isLoadingWorkflowRuns
                ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_workflow_runs_d0840fdc')
                : workflowRunsError || undefined}
              aria-hidden={!isLoadingWorkflowRuns && !workflowRunsError}
            >
              {workflowRunsError && !isLoadingWorkflowRuns
                ? <XCircle size={12} className="repo-refresh-indicator-error" />
                : <RefreshCw size={12} className={isLoadingWorkflowRuns ? 'spin' : ''} />}
            </span>
          )}
        />

        {!isWorkflowCollapsed && (
          <>
            <RepoCardToolbar>
              <div className="sidebar-search-wrap workflow-search-wrap">
                <Search size={12} className="sidebar-search-icon" />
                <input className="repo-filter-input sidebar-filter-input" value={workflowQuery} onChange={(event) => setWorkflowQuery(event.target.value)} placeholder={t('generated.components.layout.sidebar.repogithubactionscontent.filter_workflows_79ab952b')} />
              </div>
            </RepoCardToolbar>

            <RepoCardContent className="repo-card-scroll repo-scroll-md">
              {isLoadingWorkflowRuns && workflowRuns.length === 0 && <div className="repo-state-text">{t('generated.components.layout.sidebar.repogithubactionscontent.loading_workflow_runs_f20efa79')}</div>}
              {workflowRunsError && workflowRuns.length === 0 && <div className="repo-state-text" style={{ color: 'var(--status-danger)' }}>{workflowRunsError}</div>}
              {!isLoadingWorkflowRuns && !workflowRunsError && filteredWorkflowRuns.length === 0 && <div className="repo-state-text">{workflowQuery.trim() ? t('generated.components.layout.sidebar.repogithubactionscontent.no_matches_for_this_filter_c66c3d48') : t('generated.components.layout.sidebar.repogithubactionscontent.no_workflow_runs_found_87510581')}</div>}

              {filteredWorkflowRuns.length > 0 && (
                <div className="sidebar-panel-stack">
                  {filteredWorkflowRuns.map((run) => (
                    <div key={run.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-panel)', padding: '6px 8px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 8px', alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.workflowName || run.name}</div>
                        <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>{run.status}{run.conclusion ? ` | ${run.conclusion}` : ''} | {run.event}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{formatDateTime(run.createdAt, locale)} | {formatDuration(run.startedAt, run.updatedAt)}</div>
                      </div>
                      <button className="staging-btn-sm" onClick={() => props.onOpenPR(run.htmlUrl)} title={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_c818b475')}><ExternalLink size={12} /></button>
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
