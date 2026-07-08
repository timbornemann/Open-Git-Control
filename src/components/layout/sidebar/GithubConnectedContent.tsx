import React, { useEffect, useMemo, useState } from 'react';
import {
  Github,
  LogOut,
  DownloadCloud,
  FolderOpen,
  CheckCircle2,
  Plus,
  GitPullRequest,
  GitFork,
  Copy,
  ExternalLink,
  GitBranch,
  Search,
  RefreshCw,
  XCircle,
  Clock3,
} from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';
import { EmptyState } from '../../EmptyState';
import { gitClient } from '../../../services/gitClient';
import { validateGithubReleaseInput } from '../../../utils/githubReleaseValidation';
import { formatDuration, getCiBadgeStyles } from './githubShared';

type GithubConnectedContentProps = Pick<
  AppSidebarProps,
  | 'githubUser'
  | 'githubRepos'
  | 'githubReposHasMore'
  | 'isLoadingGithubRepos'
  | 'isLoadingMoreGithubRepos'
  | 'loadMoreGithubRepos'
  | 'refreshGithubRepos'
  | 'onLogout'
  | 'onClone'
  | 'onCloneByUrl'
  | 'onForkByUrl'
  | 'isCloning'
  | 'openRepos'
  | 'activeRepo'
  | 'onSwitchRepo'
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

const toRepoIdentity = (remoteUrl: string): string | null => {
  const trimmed = (remoteUrl || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/i);
  if (sshMatch) {
    return `${sshMatch[1].toLowerCase()}/${sshMatch[2].replace(/^\/+/, '').toLowerCase()}`;
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.host.toLowerCase()}/${parsed.pathname.replace(/^\/+/, '').toLowerCase()}`;
  } catch {
    return null;
  }
};

export const GithubConnectedContent: React.FC<GithubConnectedContentProps> = ({
  githubUser,
  githubRepos,
  githubReposHasMore,
  isLoadingGithubRepos,
  isLoadingMoreGithubRepos,
  loadMoreGithubRepos,
  refreshGithubRepos,
  onLogout,
  onClone,
  onCloneByUrl,
  onForkByUrl,
  isCloning,
  openRepos,
  activeRepo,
  onSwitchRepo,
  prOwnerRepo,
  prFilter,
  setPrFilter,
  prLoading,
  pullRequests,
  prCiByNumber,
  onOpenPR,
  onCopyPRUrl,
  onCheckoutPR,
  onMergePR,
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
  releaseForm,
  setReleaseForm,
  releaseSubmitting,
  releaseError,
  releaseSuccess,
  onCreateRelease,
}) => {
  const { t } = useI18n();
  const [repoOriginByPath, setRepoOriginByPath] = useState<Record<string, string | null>>({});
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const [mergingPrNumber, setMergingPrNumber] = useState<number | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const hasMountedSearchRef = React.useRef(false);
  const refreshGithubReposRef = React.useRef(refreshGithubRepos);

  const releaseValidation = validateGithubReleaseInput({
    tagName: releaseForm.tagName || '',
    releaseName: releaseForm.releaseName || '',
  });
  const releaseSubmitDisabled = !prOwnerRepo || releaseSubmitting || !releaseValidation.valid;

  useEffect(() => {
    refreshGithubReposRef.current = refreshGithubRepos;
  }, [refreshGithubRepos]);

  useEffect(() => {
    if (!hasMountedSearchRef.current) {
      hasMountedSearchRef.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      refreshGithubReposRef.current(repoSearch);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [repoSearch]);

  useEffect(() => {
    let active = true;

    const loadOrigins = async () => {
      if (!gitClient.isAvailable() || openRepos.length === 0) {
        if (active) setRepoOriginByPath({});
        return;
      }

      const entries = await Promise.all(
        openRepos.map(async (repoPath) => {
          try {
            const result = await gitClient.getRepoOriginUrl(repoPath);
            if (!result.success) return [repoPath, null] as const;
            return [repoPath, toRepoIdentity(result.data || '')] as const;
          } catch {
            return [repoPath, null] as const;
          }
        }),
      );

      if (!active) return;
      const next: Record<string, string | null> = {};
      for (const [repoPath, identity] of entries) {
        next[repoPath] = identity;
      }
      setRepoOriginByPath(next);
    };

    void loadOrigins();
    return () => {
      active = false;
    };
  }, [openRepos]);

  const localRepoByIdentity = useMemo(() => {
    const map = new Map<string, string>();
    for (const repoPath of openRepos) {
      const identity = repoOriginByPath[repoPath];
      if (identity) map.set(identity, repoPath);
    }
    return map;
  }, [openRepos, repoOriginByPath]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
          backgroundColor: 'var(--bg-panel)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Github size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{githubUser || t('generated.components.layout.sidebar.githubconnectedcontent.connected_64357a97')}</span>
        </div>
        <button onClick={onLogout} className="icon-btn" style={{ padding: '4px' }} title={t('generated.components.layout.sidebar.githubconnectedcontent.sign_out_2e3efcd4')}>
          <LogOut size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={repoSearch}
            onChange={e => setRepoSearch(e.target.value)}
            placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.search_github_repositories_6886fc19')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px 8px 6px 28px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
            }}
          />
        </div>
        <button className="icon-btn" style={{ padding: '6px' }} onClick={() => refreshGithubRepos(repoSearch)} title={t('generated.components.layout.sidebar.githubconnectedcontent.refresh_list_4d33cd9b')}>
          <RefreshCw size={14} className={isLoadingGithubRepos ? 'spin' : ''} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button className="staging-btn-sm" onClick={onCloneByUrl} title={t('generated.components.layout.sidebar.githubconnectedcontent.clone_any_repository_via_http_ssh_url_a4c092a4')}>
          <DownloadCloud size={12} /> {t('generated.components.layout.sidebar.githubconnectedcontent.clone_via_url_2a8ca14d')}
        </button>
        <button className="staging-btn-sm" onClick={onForkByUrl} title={t('generated.components.layout.sidebar.githubconnectedcontent.fork_and_clone_a_github_repository_from_url_6d14f3d1')}>
          <GitFork size={12} /> {t('generated.components.layout.sidebar.githubconnectedcontent.fork_via_url_37240822')}
        </button>
      </div>

      {isLoadingGithubRepos && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {t('generated.components.layout.sidebar.githubconnectedcontent.loading_repositories_c7b4fd01')}
        </div>
      )}

      {!isLoadingGithubRepos && githubRepos.map(repo => {
        const repoIdentity = toRepoIdentity(repo.cloneUrl);
        const localRepoPath = repoIdentity ? localRepoByIdentity.get(repoIdentity) : undefined;
        const isLocallyAvailable = Boolean(localRepoPath);
        const isActiveLocalRepo = Boolean(localRepoPath && localRepoPath === activeRepo);

        return (
          <div
            key={repo.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px',
              backgroundColor: 'var(--bg-panel)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontSize: '0.85rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}
              title={repo.fullName}
            >
              {repo.fullName}
            </span>

            {isLocallyAvailable ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--status-success)',
                    backgroundColor: 'var(--status-success-soft)',
                    border: '1px solid var(--status-success-border)',
                    borderRadius: '999px',
                    padding: '2px 8px',
                  }}
                  title={t('generated.components.layout.sidebar.githubconnectedcontent.already_available_locally_e6f1b562')}
                >
                  <CheckCircle2 size={12} /> {t('generated.components.layout.sidebar.githubconnectedcontent.local_0a3c619d')}
                </span>
                <button
                  onClick={() => localRepoPath && onSwitchRepo(localRepoPath)}
                  className="icon-btn"
                  style={{ padding: '4px', opacity: isActiveLocalRepo ? 0.55 : 1 }}
                  title={isActiveLocalRepo ? t('generated.components.layout.sidebar.githubconnectedcontent.already_active_27e8dc92') : t('generated.components.layout.sidebar.githubconnectedcontent.open_local_repository_a84c251c')}
                  disabled={!localRepoPath || isActiveLocalRepo}
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onClone(repo.cloneUrl, repo.name)}
                disabled={isCloning}
                className="icon-btn"
                style={{ padding: '4px' }}
                title={t('generated.components.layout.cloneprogressmodal.clone_repository_25099131')}
              >
                <DownloadCloud size={14} />
              </button>
            )}
          </div>
        );
      })}

      {!isLoadingGithubRepos && githubRepos.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {t('generated.components.layout.sidebar.githubconnectedcontent.no_repositories_found_fb34108a')}
        </div>
      )}

      {githubReposHasMore && (
        <button
          className="staging-tool-btn"
          onClick={loadMoreGithubRepos}
          disabled={isLoadingMoreGithubRepos}
          style={{ alignSelf: 'center' }}
        >
          {isLoadingMoreGithubRepos ? t('generated.components.layout.sidebar.githubconnectedcontent.loading_more_b6e2cbcf') : t('generated.components.layout.sidebar.githubconnectedcontent.load_more_74d5e677')}
        </button>
      )}

      {prOwnerRepo && (
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
              {t('generated.components.layout.sidebar.githubconnectedcontent.pull_requests_b5324949')} ({prOwnerRepo.owner}/{prOwnerRepo.repo})
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
            {(['open', 'closed', 'all'] as const).map(filter => (
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
                {filter === 'open' ? t('generated.components.layout.sidebar.githubconnectedcontent.open_3213d9d8') : filter === 'closed' ? t('generated.components.layout.sidebar.githubconnectedcontent.closed_ec5c60af') : t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff')}
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
                onChange={e => setNewPRTitle(e.target.value)}
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
                onChange={e => setNewPRBody(e.target.value)}
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
                  onChange={e => setNewPRHeadInput(e.target.value)}
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
                <span style={{ color: 'var(--text-secondary)', alignSelf: 'center', fontSize: '0.8rem' }}>
                  {'->'}
                </span>
                <input
                  type="text"
                  placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.base_branch_e03dac14')}
                  value={newPRBase}
                  onChange={e => setNewPRBase(e.target.value)}
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
              opacity: prOwnerRepo ? 1 : 0.6,
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              {t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}
            </div>
            <input
              type="text"
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.tag_name_required_f52acebf')}
              value={releaseForm.tagName || ''}
              onChange={e => setReleaseForm(prev => ({ ...prev, tagName: e.target.value }))}
              disabled={!prOwnerRepo || releaseSubmitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
            <input
              type="text"
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.release_name_required_cbead0c8')}
              value={releaseForm.releaseName || ''}
              onChange={e => setReleaseForm(prev => ({ ...prev, releaseName: e.target.value }))}
              disabled={!prOwnerRepo || releaseSubmitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
            <input
              type="text"
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.target_branch_or_commit_optional_3500df18')}
              value={releaseForm.targetCommitish || ''}
              onChange={e => setReleaseForm(prev => ({ ...prev, targetCommitish: e.target.value }))}
              disabled={!prOwnerRepo || releaseSubmitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
            <textarea
              placeholder={t('generated.components.layout.sidebar.githubconnectedcontent.release_notes_optional_4d1c1433')}
              value={releaseForm.body || ''}
              onChange={e => setReleaseForm(prev => ({ ...prev, body: e.target.value }))}
              rows={3}
              disabled={!prOwnerRepo || releaseSubmitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(releaseForm.draft)}
                  onChange={e => setReleaseForm(prev => ({ ...prev, draft: e.target.checked }))}
                  disabled={!prOwnerRepo || releaseSubmitting}
                />
                {t('generated.components.layout.sidebar.githubconnectedcontent.draft_03fcb5d9')}
              </label>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(releaseForm.prerelease)}
                  onChange={e => setReleaseForm(prev => ({ ...prev, prerelease: e.target.checked }))}
                  disabled={!prOwnerRepo || releaseSubmitting}
                />
                {t('generated.components.layout.sidebar.githubconnectedcontent.pre_release_4bb763f1')}
              </label>
            </div>

            {!releaseValidation.valid && (
              <div style={{ fontSize: '0.74rem', color: 'var(--status-warning)' }}>
                {!releaseForm.tagName.trim()
                  ? t('generated.components.layout.sidebar.githubconnectedcontent.tag_cannot_be_empty_70283101')
                  : releaseValidation.errors.tagName
                    ? t('generated.components.layout.sidebar.githubconnectedcontent.tag_contains_invalid_chars_whitespace_4fdbc358')
                    : releaseValidation.errors.releaseName === 'release.validation.nameRequired'
                      ? t('generated.components.layout.sidebar.githubconnectedcontent.release_name_must_not_be_empty_453809c9')
                      : t('generated.components.layout.sidebar.githubconnectedcontent.release_name_must_be_at_least_3_characters_d621812f')}
              </div>
            )}

            {releaseError && (
              <div style={{ fontSize: '0.74rem', color: 'var(--status-danger)', lineHeight: 1.35 }}>
                {releaseError}
                {(releaseError.toLowerCase().includes('tag') || releaseError.toLowerCase().includes('already')) && (
                  <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
                    {t('generated.components.layout.sidebar.githubconnectedcontent.action_choose_a_different_tag_57f2abcc')}
                  </div>
                )}
              </div>
            )}

            {releaseSuccess && (
              <div style={{ fontSize: '0.74rem', color: 'var(--status-success)', lineHeight: 1.35 }}>
                {t('generated.components.layout.sidebar.githubconnectedcontent.release_created_successfully_3bde93c8')} {' '}
                <a href={releaseSuccess.htmlUrl} onClick={(e) => { e.preventDefault(); onOpenPR(releaseSuccess.htmlUrl); }} style={{ color: 'inherit', textDecoration: 'underline' }}>
                  {t('generated.components.layout.sidebar.githubconnectedcontent.open_release_76771d25')}
                </a>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { void onCreateRelease(); }}
                disabled={releaseSubmitDisabled}
                style={{
                  padding: '5px 10px',
                  backgroundColor: releaseSubmitDisabled ? 'var(--bg-dark)' : 'var(--accent-primary)',
                  color: releaseSubmitDisabled ? 'var(--text-secondary)' : 'var(--on-accent)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: releaseSubmitDisabled ? 'not-allowed' : 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                {releaseSubmitting ? t('generated.components.layout.sidebar.githubconnectedcontent.creating_95b39ce8') : t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}
              </button>
            </div>
          </div>

          {prLoading && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 0' }}>
              {t('generated.components.layout.sidebar.githubconnectedcontent.loading_pull_requests_f64f6445')}
            </div>
          )}

          {!prLoading &&
            pullRequests.map(pr => (
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
                      {pr.draft && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                          Draft
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      #{pr.number} | {pr.head} {'->'} {pr.base} | {pr.user}
                    </div>
                    {(() => {
                      const ci = prCiByNumber[pr.number];
                            const badgeStyles = getCiBadgeStyles(ci?.badge || 'unknown', t);
                      return (
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
                      );
                    })()}
                  </div>
                </div>

                {selectedPrNumber === pr.number && prCiByNumber[pr.number] && (
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
                    {(prCiByNumber[pr.number]?.workflowRuns || []).slice(0, 5).map(run => (
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
                            <Clock3 size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Trigger: {run.event} • Duration: {formatDuration(run.startedAt, run.updatedAt, '—')}
                          </div>
                        </div>
                        <button className="staging-btn-sm" onClick={() => onOpenPR(run.htmlUrl)} title={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_c818b475')}>
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    ))}
                    {prCiByNumber[pr.number]?.workflowRuns?.length === 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {t('generated.components.layout.sidebar.githubconnectedcontent.no_workflows_found_for_this_pr_head_684a655a')}
                      </div>
                    )}
                  </div>
                )}

                {mergingPrNumber === pr.number && pr.state === 'open' && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', backgroundColor: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      {t('generated.components.layout.sidebar.githubconnectedcontent.choose_merge_method_b987ff1a')}
                    </div>
                    <button
                      className="staging-btn-sm"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '5px 8px', width: '100%' }}
                      onClick={() => { onMergePR(pr.number, 'merge'); setMergingPrNumber(null); }}
                      title={t('generated.components.layout.sidebar.githubconnectedcontent.create_a_merge_commit_6773d040')}
                    >
                      <span style={{ fontWeight: 600, marginRight: '4px' }}>Merge</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>{t('generated.components.layout.sidebar.githubconnectedcontent.create_merge_commit_db6ca958')}</span>
                    </button>
                    <button
                      className="staging-btn-sm"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '5px 8px', width: '100%' }}
                      onClick={() => { onMergePR(pr.number, 'squash'); setMergingPrNumber(null); }}
                      title={t('generated.components.layout.sidebar.githubconnectedcontent.squash_all_commits_into_one_3be4d005')}
                    >
                      <span style={{ fontWeight: 600, marginRight: '4px' }}>Squash</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>{t('generated.components.layout.sidebar.githubconnectedcontent.squash_into_one_commit_3a17a5cc')}</span>
                    </button>
                    <button
                      className="staging-btn-sm"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '5px 8px', width: '100%' }}
                      onClick={() => { onMergePR(pr.number, 'rebase'); setMergingPrNumber(null); }}
                      title={t('generated.components.layout.sidebar.githubconnectedcontent.rebase_commits_onto_base_8ff66a8d')}
                    >
                      <span style={{ fontWeight: 600, marginRight: '4px' }}>Rebase</span>
                      <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>{t('generated.components.layout.sidebar.githubconnectedcontent.rebase_commits_onto_base_19f6a769')}</span>
                    </button>
                    <button
                      className="staging-btn-sm"
                      style={{ width: '100%', marginTop: '2px', opacity: 0.7 }}
                      onClick={() => setMergingPrNumber(null)}
                    >
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
                  <button className="staging-btn-sm" onClick={() => onOpenPR(pr.htmlUrl)} title={t('generated.components.layout.sidebar.githubconnectedcontent.open_in_browser_f9d00322')}>
                    <ExternalLink size={12} />
                  </button>
                  <button className="staging-btn-sm" onClick={() => onCopyPRUrl(pr.htmlUrl)} title={t('generated.components.layout.sidebar.githubconnectedcontent.copy_url_f6f31ab4')}>
                    <Copy size={12} />
                  </button>
                  <button className="staging-btn-sm" onClick={() => onCheckoutPR(pr.number, pr.head)} title={t('generated.components.layout.sidebar.githubconnectedcontent.checkout_pr_branch_88da3791')}>
                    <GitBranch size={12} />
                  </button>
                </div>
              </div>
            ))}

          {!prLoading && pullRequests.length === 0 && (
            <EmptyState
              icon={<GitPullRequest size={32} />}
              title={t('generated.components.layout.sidebar.githubconnectedcontent.no_pull_requests_4e17ae83')}
              description={t('generated.components.layout.sidebar.githubconnectedcontent.there_are_no_open_prs_for_this_repository_5defac0a')}
            />
          )}
        </>
      )}
    </div>
  );
};
