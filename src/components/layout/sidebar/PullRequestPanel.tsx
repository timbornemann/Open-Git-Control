import React, { useState } from 'react';
import { CheckCircle2, Clock3, Copy, ExternalLink, GitBranch, GitPullRequest, Plus, RefreshCw, XCircle } from 'lucide-react';
import type { PullRequestCiDto, PullRequestDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';
import { EmptyState } from '@/components/EmptyState';
import { Button, IconButton, Panel, SegmentedControl, StatusBadge, TextField, Toolbar, cx } from '@/components/ui';
import { formatDuration, getCiBadgeStyles } from './githubShared';

type PullRequestPanelProps = {
  ownerRepo: { owner: string; repo: string };
  showDivider?: boolean;
  showHeader?: boolean;
  prFilter: 'open' | 'closed' | 'all';
  setPrFilter: (value: 'open' | 'closed' | 'all') => void;
  prLoading: boolean;
  pullRequests: PullRequestDto[];
  prCiByNumber: Record<number, PullRequestCiDto>;
  showCreatePR: boolean;
  setShowCreatePR: (value: boolean) => void;
  currentBranch: string;
  setNewPRHead: (value: string) => void;
  newPRTitle: string;
  setNewPRTitle: (value: string) => void;
  newPRBody: string;
  setNewPRBody: (value: string) => void;
  newPRHead: string;
  setNewPRHeadInput: (value: string) => void;
  newPRBase: string;
  setNewPRBase: (value: string) => void;
  onCreatePR: () => void;
  onOpenPR: (url: string) => void;
  onCopyPRUrl: (url: string) => void;
  onCheckoutPR: (prNumber: number, headRef: string) => Promise<void>;
  onMergePR: (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<void>;
};

type PullRequestFilter = PullRequestPanelProps['prFilter'];
type CiBadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

const ciBadgeToneFor = (badge?: string): CiBadgeTone => {
  if (badge === 'success') return 'success';
  if (badge === 'failure') return 'danger';
  if (badge === 'pending') return 'warning';
  return 'neutral';
};

const ciBadgeIconFor = (badge?: string) => {
  if (badge === 'success') return <CheckCircle2 size={11} />;
  if (badge === 'failure') return <XCircle size={11} />;
  if (badge === 'pending') return <RefreshCw size={11} className="spin" />;
  return null;
};

const prIconToneFor = (pr: PullRequestDto) => {
  if (pr.merged) return 'merged';
  return pr.state === 'open' ? 'open' : 'closed';
};

export const PullRequestPanel: React.FC<PullRequestPanelProps> = ({
  ownerRepo,
  showDivider = true,
  showHeader = true,
  prFilter,
  setPrFilter,
  prLoading,
  pullRequests,
  prCiByNumber,
  showCreatePR,
  setShowCreatePR,
  currentBranch,
  setNewPRHead,
  newPRTitle,
  setNewPRTitle,
  newPRBody,
  setNewPRBody,
  newPRHead,
  setNewPRHeadInput,
  newPRBase,
  setNewPRBase,
  onCreatePR,
  onOpenPR,
  onCopyPRUrl,
  onCheckoutPR,
  onMergePR,
}) => {
  const { t } = useI18n();
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const [mergingPrNumber, setMergingPrNumber] = useState<number | null>(null);

  const prFilterOptions: Array<{ label: string; value: PullRequestFilter }> = [
    { value: 'open', label: t('generated.components.layout.sidebar.githubconnectedcontent.open_3213d9d8') },
    { value: 'closed', label: t('generated.components.layout.sidebar.githubconnectedcontent.closed_ec5c60af') },
    { value: 'all', label: t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff') },
  ];

  return (
    <>
      {showDivider && <div className="github-panel-divider" />}
      {showHeader && (
        <div className="github-panel-section-header">
          <span className="github-panel-section-title">
            {t('generated.components.layout.sidebar.githubconnectedcontent.pull_requests_b5324949')} ({ownerRepo.owner}/{ownerRepo.repo})
          </span>
          <IconButton
            aria-label={t('generated.components.layout.sidebar.githubconnectedcontent.create_new_pr_e147bebb')}
            icon={<Plus size={13} />}
            size="xs"
            onClick={() => {
              setShowCreatePR(true);
              setNewPRHead(currentBranch);
            }}
          />
        </div>
      )}

      <SegmentedControl
        ariaLabel={t('generated.components.layout.sidebar.githubconnectedcontent.pull_requests_b5324949')}
        className="pr-panel__filter"
        options={prFilterOptions}
        size="xs"
        value={prFilter}
        onChange={setPrFilter}
      />

      {showCreatePR && (
        <Panel className="pr-panel__create-form">
          <TextField
            type="text"
            placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.pr_title_67e768c0')}
            value={newPRTitle}
            onChange={(e) => setNewPRTitle(e.target.value)}
          />
          <TextField
            as="textarea"
            placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.description_optional_30003d39')}
            value={newPRBody}
            onChange={(e) => setNewPRBody(e.target.value)}
            rows={2}
          />
          <div className="pr-panel__branch-row">
            <TextField
              type="text"
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.head_branch_f25163c0')}
              value={newPRHead}
              onChange={(e) => setNewPRHeadInput(e.target.value)}
            />
            <span className="pr-panel__branch-arrow">{'->'}</span>
            <TextField
              type="text"
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.base_branch_e03dac14')}
              value={newPRBase}
              onChange={(e) => setNewPRBase(e.target.value)}
            />
          </div>
          <Toolbar align="end">
            <Button variant="secondary" onClick={() => setShowCreatePR(false)}>
              {t('generated.components.confirm.cancel_035b7526')}
            </Button>
            <Button variant="primary" onClick={onCreatePR} disabled={!newPRTitle.trim()}>
              {t('generated.components.layout.sidebar.githubconnectedcontent.create_d28c742c')}
            </Button>
          </Toolbar>
        </Panel>
      )}

      {prLoading && (
        <div className="github-panel-loading">{t('generated.components.layout.sidebar.githubconnectedcontent.loading_pull_requests_f64f6445')}</div>
      )}

      {!prLoading &&
        pullRequests.map((pr) => {
          const ci = prCiByNumber[pr.number];
          const badge = ci?.badge || 'unknown';
          const badgeStyles = getCiBadgeStyles(badge, t);
          return (
            <Panel key={pr.number} className="pr-card">
              <div className="pr-card__summary">
                <GitPullRequest size={14} className={cx('pr-card__icon', `pr-card__icon--${prIconToneFor(pr)}`)} />
                <div className="pr-card__body">
                  <div className="pr-card__title">
                    {pr.title}
                    {pr.draft && <span className="pr-card__draft">Draft</span>}
                  </div>
                  <div className="pr-card__meta">
                    #{pr.number} | {pr.head} {'->'} {pr.base} | {pr.user}
                  </div>
                  <button
                    type="button"
                    className="pr-card__ci-button"
                    onClick={() => setSelectedPrNumber(selectedPrNumber === pr.number ? null : pr.number)}
                    title={ci?.summary || t('generated.components.layout.sidebar.githubconnectedcontent.loading_ci_status_107de62f')}
                  >
                    <StatusBadge tone={ciBadgeToneFor(badge)} icon={ciBadgeIconFor(badge)}>
                      {badgeStyles.label}
                    </StatusBadge>
                  </button>
                </div>
              </div>

              {selectedPrNumber === pr.number && ci && (
                <Panel className="pr-card__details" padding="sm" tone="muted">
                  {(ci.workflowRuns || []).slice(0, 5).map((run) => (
                    <div key={run.id} className="pr-card__workflow-row">
                      <div>
                        <div className="pr-card__workflow-name">{run.workflowName || run.name}</div>
                        <div className="pr-card__workflow-meta">
                          <Clock3 size={11} />
                          Trigger: {run.event} | Duration: {formatDuration(run.startedAt, run.updatedAt)}
                        </div>
                      </div>
                      <IconButton
                        aria-label={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_c818b475')}
                        icon={<ExternalLink size={12} />}
                        size="xs"
                        onClick={() => onOpenPR(run.htmlUrl)}
                      />
                    </div>
                  ))}
                  {ci.workflowRuns?.length === 0 && (
                    <div className="pr-card__empty-detail">
                      {t('generated.components.layout.sidebar.githubconnectedcontent.no_workflows_found_for_this_pr_head_684a655a')}
                    </div>
                  )}
                </Panel>
              )}

              {mergingPrNumber === pr.number && pr.state === 'open' && (
                <Panel className="pr-merge-panel" padding="sm" tone="muted">
                  <div className="pr-merge-panel__title">{t('generated.components.layout.sidebar.githubconnectedcontent.choose_merge_method_b987ff1a')}</div>
                  {(['merge', 'squash', 'rebase'] as const).map((method) => (
                    <Button
                      key={method}
                      className="pr-merge-panel__method"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        void onMergePR(pr.number, method);
                        setMergingPrNumber(null);
                      }}
                      title={
                        method === 'merge'
                          ? t('generated.components.layout.sidebar.githubconnectedcontent.create_a_merge_commit_6773d040')
                          : method === 'squash'
                            ? t('generated.components.layout.sidebar.githubconnectedcontent.squash_all_commits_into_one_3be4d005')
                            : t('generated.components.layout.sidebar.githubconnectedcontent.rebase_commits_onto_base_8ff66a8d')
                      }
                    >
                      <span className="pr-merge-panel__method-name">{method === 'merge' ? 'Merge' : method === 'squash' ? 'Squash' : 'Rebase'}</span>
                      <span className="pr-merge-panel__method-description">
                        {method === 'merge'
                          ? t('generated.components.layout.sidebar.githubconnectedcontent.create_merge_commit_db6ca958')
                          : method === 'squash'
                            ? t('generated.components.layout.sidebar.githubconnectedcontent.squash_into_one_commit_3a17a5cc')
                            : t('generated.components.layout.sidebar.githubconnectedcontent.rebase_commits_onto_base_19f6a769')}
                      </span>
                    </Button>
                  ))}
                  <Button className="pr-merge-panel__cancel" variant="ghost" size="xs" onClick={() => setMergingPrNumber(null)}>
                    {t('generated.components.confirm.cancel_035b7526')}
                  </Button>
                </Panel>
              )}

              <div className="pr-card__actions">
                {pr.state === 'open' && mergingPrNumber !== pr.number && (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<GitPullRequest size={11} />}
                    onClick={() => setMergingPrNumber(pr.number)}
                    title={t('generated.components.layout.sidebar.githubconnectedcontent.merge_pr_4b999c62')}
                  >
                    {t('generated.components.layout.sidebar.githubconnectedcontent.merge_6b8e7542')}
                  </Button>
                )}
                <IconButton
                  aria-label={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_f9d00322')}
                  icon={<ExternalLink size={12} />}
                  size="xs"
                  onClick={() => onOpenPR(pr.htmlUrl)}
                />
                <IconButton
                  aria-label={t('generated.components.layout.sidebar.githubconnectedcontent.copy_url_f6f31ab4')}
                  icon={<Copy size={12} />}
                  size="xs"
                  onClick={() => onCopyPRUrl(pr.htmlUrl)}
                />
                <IconButton
                  aria-label={t('generated.components.layout.sidebar.githubconnectedcontent.checkout_pr_branch_88da3791')}
                  icon={<GitBranch size={12} />}
                  size="xs"
                  onClick={() => void onCheckoutPR(pr.number, pr.head)}
                />
              </div>
            </Panel>
          );
        })}

      {!prLoading && pullRequests.length === 0 && (
        <EmptyState
          icon={<GitPullRequest size={32} />}
          title={t('generated.components.layout.sidebar.githubconnectedcontent.no_pull_requests_4e17ae83')}
          description={t('generated.components.layout.sidebar.githubconnectedcontent.there_are_no_open_prs_for_this_repository_5defac0a')}
        />
      )}
    </>
  );
};
