import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus, RefreshCw, Search, XCircle } from 'lucide-react';
import type { AppSidebarProps } from './AppSidebar.types';
import type { GithubWorkflowRunDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';
import { githubClient } from '@/services/githubClient';
import { formatDateTime } from '@/utils/dateTime';
import { RepoCard, RepoCardContent, RepoCardHeader, RepoCardStatus, RepoCardToolbar } from '@/components/sidebar/RepoCard';
import { formatDuration } from './githubShared';
import { PullRequestPanel } from './PullRequestPanel';

type RepoGithubActionsContentProps = Pick<
  AppSidebarProps,
  | 'prOwnerRepo'
  | 'prFilter'
  | 'setPrFilter'
  | 'prLoading'
  | 'prHasLoaded'
  | 'prError'
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
  const { t, locale } = useI18n();
  const [isPrCollapsed, setIsPrCollapsed] = useState(false);
  const [isWorkflowCollapsed, setIsWorkflowCollapsed] = useState(false);
  const [workflowRuns, setWorkflowRuns] = useState<GithubWorkflowRunDto[]>([]);
  const [isLoadingWorkflowRuns, setIsLoadingWorkflowRuns] = useState(false);
  const [workflowRunsError, setWorkflowRunsError] = useState<string | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState('');
  const ownerRepoKey = props.prOwnerRepo ? `${props.prOwnerRepo.owner}/${props.prOwnerRepo.repo}` : '';
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
  }, [ownerRepoKey, props.currentBranch, props.prOwnerRepo, props.refreshTrigger, t]);

  const filteredWorkflowRuns = useMemo(() => {
    const normalized = workflowQuery.trim().toLowerCase();
    if (!normalized) return workflowRuns;
    return workflowRuns.filter((run) => {
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

  const ownerRepo = props.prOwnerRepo;

  return (
    <>
      <RepoCard>
        <RepoCardHeader
          title={`${t('generated.components.layout.sidebar.githubconnectedcontent.pull_requests_b5324949')} (${props.prOwnerRepo.owner}/${props.prOwnerRepo.repo})`}
          collapsed={isPrCollapsed}
          onToggleCollapsed={() => setIsPrCollapsed((prev) => !prev)}
          toggleTitle={
            isPrCollapsed
              ? t('generated.components.layout.sidebar.repogithubactionscontent.show_pull_requests_ce686a2d')
              : t('generated.components.layout.sidebar.repogithubactionscontent.collapse_pull_requests_73f1857d')
          }
          actions={
            <>
              <span
                className={`repo-refresh-indicator ${props.prLoading ? '' : 'repo-refresh-indicator--idle'}`}
                title={props.prLoading ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_pull_requests_49129472') : undefined}
                aria-label={props.prLoading ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_pull_requests_5b1ab8b6') : undefined}
                aria-hidden={!props.prLoading}
              >
                <RefreshCw size={12} className={props.prLoading ? 'spin' : ''} />
              </span>
              <button
                className="icon-btn sidebar-row-action-icon"
                onClick={() => {
                  props.setShowCreatePR(true);
                  props.setNewPRHead(props.currentBranch);
                }}
                title={t('generated.components.layout.sidebar.githubconnectedcontent.create_new_pr_e147bebb')}
              >
                <Plus size={13} />
              </button>
            </>
          }
        />

        {!isPrCollapsed && (
          <RepoCardContent className="repo-card-scroll repo-scroll-lg">
            <PullRequestPanel
              ownerRepo={ownerRepo}
              showDivider={false}
              showHeader={false}
              prFilter={props.prFilter}
              setPrFilter={props.setPrFilter}
              prLoading={props.prLoading}
              prHasLoaded={props.prHasLoaded}
              prError={props.prError}
              pullRequests={props.pullRequests}
              prCiByNumber={props.prCiByNumber}
              showCreatePR={props.showCreatePR}
              setShowCreatePR={props.setShowCreatePR}
              currentBranch={props.currentBranch}
              setNewPRHead={props.setNewPRHead}
              newPRTitle={props.newPRTitle}
              setNewPRTitle={props.setNewPRTitle}
              newPRBody={props.newPRBody}
              setNewPRBody={props.setNewPRBody}
              newPRHead={props.newPRHead}
              setNewPRHeadInput={props.setNewPRHeadInput}
              newPRBase={props.newPRBase}
              setNewPRBase={props.setNewPRBase}
              onCreatePR={props.onCreatePR}
              onOpenPR={props.onOpenPR}
              onCopyPRUrl={props.onCopyPRUrl}
              onCheckoutPR={props.onCheckoutPR}
              onMergePR={props.onMergePR}
            />
          </RepoCardContent>
        )}
      </RepoCard>

      <RepoCard>
        <RepoCardHeader
          title={t('generated.components.layout.sidebar.repogithubactionscontent.actions_workflows_c98cbdd5')}
          collapsed={isWorkflowCollapsed}
          onToggleCollapsed={() => setIsWorkflowCollapsed((prev) => !prev)}
          toggleTitle={
            isWorkflowCollapsed
              ? t('generated.components.layout.sidebar.repogithubactionscontent.show_workflows_ca27063c')
              : t('generated.components.layout.sidebar.repogithubactionscontent.collapse_workflows_03ec37bf')
          }
          actions={
            <span
              className={`repo-refresh-indicator ${isLoadingWorkflowRuns || workflowRunsError ? '' : 'repo-refresh-indicator--idle'}`}
              title={
                isLoadingWorkflowRuns
                  ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_workflow_runs_376d1885')
                  : workflowRunsError || undefined
              }
              aria-label={
                isLoadingWorkflowRuns
                  ? t('generated.components.layout.sidebar.repogithubactionscontent.refreshing_workflow_runs_d0840fdc')
                  : workflowRunsError || undefined
              }
              aria-hidden={!isLoadingWorkflowRuns && !workflowRunsError}
            >
              {workflowRunsError && !isLoadingWorkflowRuns ? (
                <XCircle size={12} className="repo-refresh-indicator-error" />
              ) : (
                <RefreshCw size={12} className={isLoadingWorkflowRuns ? 'spin' : ''} />
              )}
            </span>
          }
        />

        {!isWorkflowCollapsed && (
          <>
            <RepoCardToolbar>
              <div className="sidebar-search-wrap workflow-search-wrap">
                <Search size={12} className="sidebar-search-icon" />
                <input
                  className="repo-filter-input sidebar-filter-input"
                  value={workflowQuery}
                  onChange={(event) => setWorkflowQuery(event.target.value)}
                  placeholder={t('generated.components.layout.sidebar.repogithubactionscontent.filter_workflows_79ab952b')}
                />
              </div>
            </RepoCardToolbar>

            <RepoCardContent className="repo-card-scroll repo-scroll-md">
              {isLoadingWorkflowRuns && workflowRuns.length === 0 && (
                <div className="repo-state-text">{t('generated.components.layout.sidebar.repogithubactionscontent.loading_workflow_runs_f20efa79')}</div>
              )}
              {workflowRunsError && workflowRuns.length === 0 && <div className="repo-state-text repo-state-text--danger">{workflowRunsError}</div>}
              {!isLoadingWorkflowRuns && !workflowRunsError && filteredWorkflowRuns.length === 0 && (
                <div className="repo-state-text">
                  {workflowQuery.trim()
                    ? t('generated.components.layout.sidebar.repogithubactionscontent.no_matches_for_this_filter_c66c3d48')
                    : t('generated.components.layout.sidebar.repogithubactionscontent.no_workflow_runs_found_87510581')}
                </div>
              )}

              {filteredWorkflowRuns.length > 0 && (
                <div className="sidebar-panel-stack">
                  {filteredWorkflowRuns.map((run) => (
                    <div key={run.id} className="repo-workflow-card">
                      <div className="repo-workflow-card__copy">
                        <div className="repo-workflow-card__title">{run.workflowName || run.name}</div>
                        <div className="repo-workflow-card__meta">
                          {run.status}
                          {run.conclusion ? ` | ${run.conclusion}` : ''} | {run.event}
                        </div>
                        <div className="repo-workflow-card__time">
                          {formatDateTime(run.createdAt, locale)} | {formatDuration(run.startedAt, run.updatedAt)}
                        </div>
                      </div>
                      <button
                        className="staging-btn-sm"
                        onClick={() => props.onOpenPR(run.htmlUrl)}
                        title={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_c818b475')}
                      >
                        <ExternalLink size={12} />
                      </button>
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
