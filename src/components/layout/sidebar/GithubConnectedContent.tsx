import React, { useEffect, useMemo, useState } from 'react';
import {
  Github,
  LogOut,
  DownloadCloud,
  FolderOpen,
  CheckCircle2,
  Plus,
  GitPullRequest,
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
import { validateGithubReleaseInput } from '../../../utils/githubReleaseValidation';

type GithubConnectedContentProps = Pick<
  AppSidebarProps,
  | 'githubUser'
  | 'githubRepos'
  | 'githubRepoSearch'
  | 'setGithubRepoSearch'
  | 'githubReposHasMore'
  | 'isLoadingGithubRepos'
  | 'isLoadingMoreGithubRepos'
  | 'loadMoreGithubRepos'
  | 'refreshGithubRepos'
  | 'onLogout'
  | 'onClone'
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


const getCiBadgeStyles = (badge: string) => {
  if (badge === 'success') {
    return { color: 'var(--status-success)', backgroundColor: 'var(--status-success-soft)', borderColor: 'var(--status-success-border)', label: 'CI: Success' };
  }
  if (badge === 'failure') {
    return { color: 'var(--status-danger)', backgroundColor: 'var(--status-danger-soft)', borderColor: 'var(--status-danger-border)', label: 'CI: Failed' };
  }
  if (badge === 'pending') {
    return { color: 'var(--status-warning)', backgroundColor: 'var(--status-warning-soft)', borderColor: 'var(--status-warning-border)', label: 'CI: Pending' };
  }
  return { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-dark)', borderColor: 'var(--border-color)', label: 'CI: Unknown' };
};

const formatDuration = (startedAt?: string | null, finishedAt?: string | null): string => {
  if (!startedAt || !finishedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '—';
  const totalSec = Math.round((end - start) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${String(sec).padStart(2, '0')}s`;
};

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
  githubRepoSearch,
  setGithubRepoSearch,
  githubReposHasMore,
  isLoadingGithubRepos,
  isLoadingMoreGithubRepos,
  loadMoreGithubRepos,
  refreshGithubRepos,
  onLogout,
  onClone,
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
  const { tr } = useI18n();
  const [repoOriginByPath, setRepoOriginByPath] = useState<Record<string, string | null>>({});
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);

  const releaseValidation = validateGithubReleaseInput({
    tagName: releaseForm.tagName || '',
    releaseName: releaseForm.releaseName || '',
  });
  const releaseSubmitDisabled = !prOwnerRepo || releaseSubmitting || !releaseValidation.valid;

  useEffect(() => {
    let active = true;

    const loadOrigins = async () => {
      if (!window.electronAPI || openRepos.length === 0) {
        if (active) setRepoOriginByPath({});
        return;
      }

      const entries = await Promise.all(
        openRepos.map(async (repoPath) => {
          try {
            const result = await window.electronAPI.getRepoOriginUrl(repoPath);
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
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{githubUser || tr('Verbunden', 'Connected')}</span>
        </div>
        <button onClick={onLogout} className="icon-btn" style={{ padding: '4px' }} title={tr('Abmelden', 'Sign out')}>
          <LogOut size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={githubRepoSearch}
            onChange={e => setGithubRepoSearch(e.target.value)}
            placeholder={tr('GitHub-Repositories suchen...', 'Search GitHub repositories...')}
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
        <button className="icon-btn" style={{ padding: '6px' }} onClick={refreshGithubRepos} title={tr('Liste aktualisieren', 'Refresh list')}>
          <RefreshCw size={14} className={isLoadingGithubRepos ? 'spin' : ''} />
        </button>
      </div>

      {isLoadingGithubRepos && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {tr('Lade Repositories...', 'Loading repositories...')}
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
                  title={tr('Bereits lokal vorhanden', 'Already available locally')}
                >
                  <CheckCircle2 size={12} /> {tr('Lokal', 'Local')}
                </span>
                <button
                  onClick={() => localRepoPath && onSwitchRepo(localRepoPath)}
                  className="icon-btn"
                  style={{ padding: '4px', opacity: isActiveLocalRepo ? 0.55 : 1 }}
                  title={isActiveLocalRepo ? tr('Bereits aktiv', 'Already active') : tr('Lokales Repository oeffnen', 'Open local repository')}
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
                title={tr('Repository klonen', 'Clone repository')}
              >
                <DownloadCloud size={14} />
              </button>
            )}
          </div>
        );
      })}

      {!isLoadingGithubRepos && githubRepos.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {tr('Keine Repositories gefunden.', 'No repositories found.')}
        </div>
      )}

      {githubReposHasMore && (
        <button
          className="staging-tool-btn"
          onClick={loadMoreGithubRepos}
          disabled={isLoadingMoreGithubRepos}
          style={{ alignSelf: 'center' }}
        >
          {isLoadingMoreGithubRepos ? tr('Lade mehr...', 'Loading more...') : tr('Mehr laden', 'Load more')}
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
              {tr('Pull Requests', 'Pull Requests')} ({prOwnerRepo.owner}/{prOwnerRepo.repo})
            </span>
            <button
              className="icon-btn"
              style={{ padding: '2px' }}
              onClick={() => {
                setShowCreatePR(true);
                setNewPRHead(currentBranch);
              }}
              title={tr('Neuen PR erstellen', 'Create new PR')}
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
                {filter === 'open' ? tr('Offen', 'Open') : filter === 'closed' ? tr('Geschlossen', 'Closed') : tr('Alle', 'All')}
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
                placeholder={tr('PR Titel', 'PR title')}
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
                placeholder={tr('Beschreibung (optional)', 'Description (optional)')}
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
                  placeholder={tr('Head Branch', 'Head branch')}
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
                  placeholder={tr('Base Branch', 'Base branch')}
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
                  {tr('Abbrechen', 'Cancel')}
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
                  {tr('Erstellen', 'Create')}
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
              {tr('Release erstellen', 'Create release')}
            </div>
            <input
              type="text"
              placeholder={tr('Tag-Name (Pflicht)', 'Tag name (required)')}
              value={releaseForm.tagName || ''}
              onChange={e => setReleaseForm(prev => ({ ...prev, tagName: e.target.value }))}
              disabled={!prOwnerRepo || releaseSubmitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
            <input
              type="text"
              placeholder={tr('Release-Name (Pflicht)', 'Release name (required)')}
              value={releaseForm.releaseName || ''}
              onChange={e => setReleaseForm(prev => ({ ...prev, releaseName: e.target.value }))}
              disabled={!prOwnerRepo || releaseSubmitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
            <input
              type="text"
              placeholder={tr('Ziel-Branch oder Commit (optional)', 'Target branch or commit (optional)')}
              value={releaseForm.targetCommitish || ''}
              onChange={e => setReleaseForm(prev => ({ ...prev, targetCommitish: e.target.value }))}
              disabled={!prOwnerRepo || releaseSubmitting}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
            <textarea
              placeholder={tr('Release Notes (optional)', 'Release notes (optional)')}
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
                {tr('Entwurf (Draft)', 'Draft')}
              </label>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(releaseForm.prerelease)}
                  onChange={e => setReleaseForm(prev => ({ ...prev, prerelease: e.target.checked }))}
                  disabled={!prOwnerRepo || releaseSubmitting}
                />
                {tr('Pre-Release', 'Pre-release')}
              </label>
            </div>

            {!releaseValidation.valid && (
              <div style={{ fontSize: '0.74rem', color: 'var(--status-warning)' }}>
                {!releaseForm.tagName.trim()
                  ? tr('Tag darf nicht leer sein.', 'Tag cannot be empty.')
                  : releaseValidation.errors.tagName
                    ? tr('Tag enthält ungültige Zeichen/Leerzeichen.', 'Tag contains invalid chars/whitespace.')
                    : releaseValidation.errors.releaseName === 'release.validation.nameRequired'
                      ? tr('Release-Name darf nicht leer sein.', 'Release name must not be empty.')
                      : tr('Release-Name muss mindestens 3 Zeichen haben.', 'Release name must be at least 3 characters.')}
              </div>
            )}

            {releaseError && (
              <div style={{ fontSize: '0.74rem', color: 'var(--status-danger)', lineHeight: 1.35 }}>
                {releaseError}
                {(releaseError.toLowerCase().includes('tag') || releaseError.toLowerCase().includes('already')) && (
                  <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
                    {tr('Handlungsoption: Anderen Tag wählen.', 'Action: choose a different tag.')}
                  </div>
                )}
              </div>
            )}

            {releaseSuccess && (
              <div style={{ fontSize: '0.74rem', color: 'var(--status-success)', lineHeight: 1.35 }}>
                {tr('Release erfolgreich erstellt.', 'Release created successfully.')} {' '}
                <a href={releaseSuccess.htmlUrl} onClick={(e) => { e.preventDefault(); onOpenPR(releaseSuccess.htmlUrl); }} style={{ color: 'inherit', textDecoration: 'underline' }}>
                  {tr('Release öffnen', 'Open release')}
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
                {releaseSubmitting ? tr('Erstelle...', 'Creating...') : tr('Release erstellen', 'Create release')}
              </button>
            </div>
          </div>

          {prLoading && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 0' }}>
              {tr('Lade Pull Requests...', 'Loading pull requests...')}
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
                      const badgeStyles = getCiBadgeStyles(ci?.badge || 'unknown');
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
                          title={ci?.summary || tr('CI-Status laden...', 'Loading CI status...')}
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
                            <Clock3 size={11} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Trigger: {run.event} • Duration: {formatDuration(run.startedAt, run.updatedAt)}
                          </div>
                        </div>
                        <button className="staging-btn-sm" onClick={() => onOpenPR(run.htmlUrl)} title={tr('Im Browser oeffnen', 'Open in browser')}>
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    ))}
                    {prCiByNumber[pr.number]?.workflowRuns?.length === 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {tr('Keine Workflows fuer diesen PR-Head gefunden.', 'No workflows found for this PR head.')}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {pr.state === 'open' && (
                    <>
                      <button className="staging-btn-sm" onClick={() => onMergePR(pr.number, 'merge')} title={tr('Merge', 'Merge')}>Merge</button>
                      <button className="staging-btn-sm" onClick={() => onMergePR(pr.number, 'squash')} title={tr('Squash', 'Squash')}>Squash</button>
                      <button className="staging-btn-sm" onClick={() => onMergePR(pr.number, 'rebase')} title={tr('Rebase', 'Rebase')}>Rebase</button>
                    </>
                  )}
                  <button className="staging-btn-sm" onClick={() => onOpenPR(pr.htmlUrl)} title={tr('Im Browser oeffnen', 'Open in browser')}>
                    <ExternalLink size={12} />
                  </button>
                  <button className="staging-btn-sm" onClick={() => onCopyPRUrl(pr.htmlUrl)} title={tr('URL kopieren', 'Copy URL')}>
                    <Copy size={12} />
                  </button>
                  <button className="staging-btn-sm" onClick={() => onCheckoutPR(pr.number, pr.head)} title={tr('PR-Branch auschecken', 'Checkout PR branch')}>
                    <GitBranch size={12} />
                  </button>
                </div>
              </div>
            ))}

          {!prLoading && pullRequests.length === 0 && (
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                padding: '6px 0',
                textAlign: 'center',
              }}
            >
              {tr('Keine Pull Requests.', 'No pull requests.')}
            </div>
          )}
        </>
      )}
    </div>
  );
};
