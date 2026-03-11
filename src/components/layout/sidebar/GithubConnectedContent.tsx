import React from 'react';
import { Github, LogOut, DownloadCloud, FolderOpen, CheckCircle2, Plus, GitPullRequest, Copy, ExternalLink, GitBranch } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

type GithubConnectedContentProps = Pick<
  AppSidebarProps,
  | 'githubUser'
  | 'githubRepos'
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
  | 'onOpenPR'
  | 'onCopyPRUrl'
  | 'onCheckoutPR'
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

export const GithubConnectedContent: React.FC<GithubConnectedContentProps> = ({
  githubUser,
  githubRepos,
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
  onOpenPR,
  onCopyPRUrl,
  onCheckoutPR,
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
}) => {
  const { tr } = useI18n();

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

      {githubRepos.map(repo => {
        const localRepoPath = openRepos.find(p => (p.split(/[\\/]/).pop() || '').toLowerCase() === repo.name.toLowerCase());
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
              title={repo.name}
            >
              {repo.name}
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
                    color: '#3fb950',
                    backgroundColor: 'rgba(63, 185, 80, 0.14)',
                    border: '1px solid rgba(63, 185, 80, 0.35)',
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
                  title={isActiveLocalRepo ? tr('Bereits aktiv', 'Already active') : tr('Lokales Repository öffnen', 'Open local repository')}
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
                  color: prFilter === filter ? '#fff' : 'var(--text-secondary)',
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
                    color: newPRTitle.trim() ? '#fff' : 'var(--text-secondary)',
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
                      color: pr.merged ? '#a371f7' : pr.state === 'open' ? '#3fb950' : '#f85149',
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
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <button className="staging-btn-sm" onClick={() => onOpenPR(pr.htmlUrl)} title={tr('Im Browser öffnen', 'Open in browser')}>
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
