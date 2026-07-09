import React, { useState } from 'react';
import { CheckCircle2, Clock3, Copy, ExternalLink, GitBranch, GitPullRequest, Plus, RefreshCw, XCircle } from 'lucide-react';
import type { PullRequestCiDto, PullRequestDto } from '@/global';
import { useI18n } from '@/i18n';
import { EmptyState } from '@/components/EmptyState';
import { formatDuration, getCiBadgeStyles } from './githubShared';

type PullRequestPanelProps = {
  ownerRepo: { owner: string; repo: string };
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

export const PullRequestPanel: React.FC<PullRequestPanelProps> = ({
  ownerRepo,
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

  return (
    <>
      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 0 6px',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-secondary)',
          }}
        >
          {t('generated.components.layout.sidebar.githubconnectedcontent.pull_requests_b5324949')} ({ownerRepo.owner}/{ownerRepo.repo})
        </span>
        <button
          className="icon-btn"
          style={{ padding: '2px' }}
          onClick={() => {
            setShowCreatePR(true);
            setNewPRHead(currentBranch);
          }}
          title={t('generated.components.layout.sidebar.githubconnectedcontent.create_new_pr_e147bebb')}
        >
          <Plus size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {(['open', 'closed', 'all'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setPrFilter(filter)}
            style={{
              flex: 1,
              padding: '3px 6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              backgroundColor: prFilter === filter ? 'var(--accent-primary)' : 'var(--bg-dark)',
              color: prFilter === filter ? 'var(--on-accent)' : 'var(--text-secondary)',
              border: `1px solid ${prFilter === filter ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {filter === 'open'
              ? t('generated.components.layout.sidebar.githubconnectedcontent.open_3213d9d8')
              : filter === 'closed'
                ? t('generated.components.layout.sidebar.githubconnectedcontent.closed_ec5c60af')
                : t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff')}
          </button>
        ))}
      </div>

      {showCreatePR && (
        <div
          style={{
            padding: '8px',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginBottom: '6px',
          }}
        >
          <input
            type="text"
            placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.pr_title_67e768c0')}
            value={newPRTitle}
            onChange={(e) => setNewPRTitle(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
            }}
          />
          <textarea
            placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.description_optional_30003d39')}
            value={newPRBody}
            onChange={(e) => setNewPRBody(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.head_branch_f25163c0')}
              value={newPRHead}
              onChange={(e) => setNewPRHeadInput(e.target.value)}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)',
                fontSize: '0.78rem',
              }}
            />
            <span style={{ color: 'var(--text-secondary)', alignSelf: 'center', fontSize: '0.8rem' }}>{'->'}</span>
            <input
              type="text"
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.base_branch_e03dac14')}
              value={newPRBase}
              onChange={(e) => setNewPRBase(e.target.value)}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)',
                fontSize: '0.78rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowCreatePR(false)}
              style={{
                padding: '5px 10px',
                backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.78rem',
              }}
            >
              {t('generated.components.confirm.cancel_035b7526')}
            </button>
            <button
              onClick={onCreatePR}
              disabled={!newPRTitle.trim()}
              style={{
                padding: '5px 10px',
                backgroundColor: newPRTitle.trim() ? 'var(--accent-primary)' : 'var(--bg-dark)',
                color: newPRTitle.trim() ? 'var(--on-accent)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                cursor: newPRTitle.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              {t('generated.components.layout.sidebar.githubconnectedcontent.create_d28c742c')}
            </button>
          </div>
        </div>
      )}

      {prLoading && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 0' }}>
          {t('generated.components.layout.sidebar.githubconnectedcontent.loading_pull_requests_f64f6445')}
        </div>
      )}

      {!prLoading &&
        pullRequests.map((pr) => {
          const ci = prCiByNumber[pr.number];
          const badgeStyles = getCiBadgeStyles(ci?.badge || 'unknown', t);
          return (
            <div
              key={pr.number}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '8px',
                backgroundColor: 'var(--bg-panel)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <GitPullRequest
                  size={14}
                  style={{
                    color: pr.merged ? 'var(--status-merged)' : pr.state === 'open' ? 'var(--status-success)' : 'var(--status-danger)',
                    marginTop: '2px',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pr.title}
                    {pr.draft && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>Draft</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    #{pr.number} | {pr.head} {'->'} {pr.base} | {pr.user}
                  </div>
                  <button
                    onClick={() => setSelectedPrNumber(selectedPrNumber === pr.number ? null : pr.number)}
                    style={{
                      marginTop: '6px',
                      borderRadius: '999px',
                      border: `1px solid ${badgeStyles.borderColor}`,
                      backgroundColor: badgeStyles.backgroundColor,
                      color: badgeStyles.color,
                      padding: '2px 8px',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title={ci?.summary || t('generated.components.layout.sidebar.githubconnectedcontent.loading_ci_status_107de62f')}
                  >
                    {ci?.badge === 'success' && <CheckCircle2 size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                    {ci?.badge === 'failure' && <XCircle size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                    {ci?.badge === 'pending' && <RefreshCw size={11} className="spin" style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                    {badgeStyles.label}
                  </button>
                </div>
              </div>

              {selectedPrNumber === pr.number && ci && (
                <div
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px',
                    backgroundColor: 'var(--bg-dark)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {(ci.workflowRuns || []).slice(0, 5).map((run) => (
                    <div
                      key={run.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: '4px 10px',
                        alignItems: 'center',
                        fontSize: '0.72rem',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {run.workflowName || run.name}
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          <Clock3 size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />
                          Trigger: {run.event} | Duration: {formatDuration(run.startedAt, run.updatedAt)}
                        </div>
                      </div>
                      <button
                        className="staging-btn-sm"
                        onClick={() => onOpenPR(run.htmlUrl)}
                        title={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_c818b475')}
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  ))}
                  {ci.workflowRuns?.length === 0 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {t('generated.components.layout.sidebar.githubconnectedcontent.no_workflows_found_for_this_pr_head_684a655a')}
                    </div>
                  )}
                </div>
              )}

              {mergingPrNumber === pr.number && pr.state === 'open' && (
                <div
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px',
                    backgroundColor: 'var(--bg-dark)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                    {t('generated.components.layout.sidebar.githubconnectedcontent.choose_merge_method_b987ff1a')}
                  </div>
                  {(['merge', 'squash', 'rebase'] as const).map((method) => (
                    <button
                      key={method}
                      className="staging-btn-sm"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '5px 8px', width: '100%' }}
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
                      <span style={{ fontWeight: 600, marginRight: '4px' }}>{method === 'merge' ? 'Merge' : method === 'squash' ? 'Squash' : 'Rebase'}</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>
                        {method === 'merge'
                          ? t('generated.components.layout.sidebar.githubconnectedcontent.create_merge_commit_db6ca958')
                          : method === 'squash'
                            ? t('generated.components.layout.sidebar.githubconnectedcontent.squash_into_one_commit_3a17a5cc')
                            : t('generated.components.layout.sidebar.githubconnectedcontent.rebase_commits_onto_base_19f6a769')}
                      </span>
                    </button>
                  ))}
                  <button className="staging-btn-sm" style={{ width: '100%', marginTop: '2px', opacity: 0.7 }} onClick={() => setMergingPrNumber(null)}>
                    {t('generated.components.confirm.cancel_035b7526')}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {pr.state === 'open' && mergingPrNumber !== pr.number && (
                  <button
                    className="staging-btn-sm"
                    onClick={() => setMergingPrNumber(pr.number)}
                    title={t('generated.components.layout.sidebar.githubconnectedcontent.merge_pr_4b999c62')}
                    style={{ gap: '4px' }}
                  >
                    <GitPullRequest size={11} />
                    {t('generated.components.layout.sidebar.githubconnectedcontent.merge_6b8e7542')}
                  </button>
                )}
                <button
                  className="staging-btn-sm"
                  onClick={() => onOpenPR(pr.htmlUrl)}
                  title={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_f9d00322')}
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  className="staging-btn-sm"
                  onClick={() => onCopyPRUrl(pr.htmlUrl)}
                  title={t('generated.components.layout.sidebar.githubconnectedcontent.copy_url_f6f31ab4')}
                >
                  <Copy size={12} />
                </button>
                <button
                  className="staging-btn-sm"
                  onClick={() => void onCheckoutPR(pr.number, pr.head)}
                  title={t('generated.components.layout.sidebar.githubconnectedcontent.checkout_pr_branch_88da3791')}
                >
                  <GitBranch size={12} />
                </button>
              </div>
            </div>
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
