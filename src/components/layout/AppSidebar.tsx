import React from 'react';
import {
  Settings,
  FolderGit2,
  Plus,
  Github,
  RefreshCw,
  Key,
  ExternalLink,
  LogOut,
  DownloadCloud,
  GitPullRequest,
} from 'lucide-react';
import { RepoList } from '../sidebar/RepoList';
import { BranchPanel } from '../sidebar/BranchPanel';
import { TagPanel } from '../sidebar/TagPanel';
import { RemotePanel } from '../sidebar/RemotePanel';
import { BranchInfo, RemoteSyncState } from '../../types/git';
import { GitHubRepositoryDto, PullRequestDto } from '../../global';

type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

type BranchContextMenuState = { x: number; y: number; branch: string; isHead: boolean } | null;

type Props = {
  activeTab: 'repos' | 'github';
  setActiveTab: (tab: 'repos' | 'github') => void;

  activeRepo: string | null;
  openRepos: string[];
  onOpenFolder: () => void;
  onSwitchRepo: (repoPath: string) => void;
  onCloseRepo: (repoPath: string) => void;

  remoteSync: RemoteSyncState;
  isGitActionRunning: boolean;
  onRefreshRemoteQuick: () => void;

  branches: BranchInfo[];
  isCreatingBranch: boolean;
  newBranchName: string;
  newBranchInputRef: React.RefObject<HTMLInputElement>;
  onSetCreatingBranch: (value: boolean) => void;
  onSetNewBranchName: (value: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (name: string) => void;
  onSetBranchContextMenu: (value: BranchContextMenuState) => void;

  tags: string[];
  onCreateTag: () => void;
  onPushTags: () => void;
  onDeleteTag: (name: string) => void;

  remotes: { name: string; url: string }[];
  remoteStatus: RemoteStatus;
  remoteOnlyBranchesCount: number;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onRefreshRemote: () => void;

  hasRemoteOrigin: boolean | null;
  isConnectingGithubRepo: boolean;
  connectError: string | null;
  newRepoName: string;
  setNewRepoName: (value: string) => void;
  newRepoDescription: string;
  setNewRepoDescription: (value: string) => void;
  newRepoPrivate: boolean;
  setNewRepoPrivate: (value: boolean) => void;
  onCreateGithubRepoForCurrent: () => void;

  isAuthenticated: boolean;
  tokenInput: string;
  setTokenInput: (value: string) => void;
  isAuthenticating: boolean;
  authError: string | null;
  setAuthError: (value: string | null) => void;
  onTokenLogin: () => void;

  githubUser: string | null;
  githubRepos: GitHubRepositoryDto[];
  onLogout: () => void;
  onClone: (cloneUrl: string, repoName: string) => void;
  isCloning: boolean;

  prOwnerRepo: { owner: string; repo: string } | null;
  prFilter: 'open' | 'closed' | 'all';
  setPrFilter: (value: 'open' | 'closed' | 'all') => void;
  prLoading: boolean;
  pullRequests: PullRequestDto[];

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
};

export const AppSidebar: React.FC<Props> = ({
  activeTab,
  setActiveTab,
  activeRepo,
  openRepos,
  onOpenFolder,
  onSwitchRepo,
  onCloseRepo,
  remoteSync,
  isGitActionRunning,
  onRefreshRemoteQuick,
  branches,
  isCreatingBranch,
  newBranchName,
  newBranchInputRef,
  onSetCreatingBranch,
  onSetNewBranchName,
  onCreateBranch,
  onCheckoutBranch,
  onSetBranchContextMenu,
  tags,
  onCreateTag,
  onPushTags,
  onDeleteTag,
  remotes,
  remoteStatus,
  remoteOnlyBranchesCount,
  onAddRemote,
  onRemoveRemote,
  onRefreshRemote,
  hasRemoteOrigin,
  isConnectingGithubRepo,
  connectError,
  newRepoName,
  setNewRepoName,
  newRepoDescription,
  setNewRepoDescription,
  newRepoPrivate,
  setNewRepoPrivate,
  onCreateGithubRepoForCurrent,
  isAuthenticated,
  tokenInput,
  setTokenInput,
  isAuthenticating,
  authError,
  setAuthError,
  onTokenLogin,
  githubUser,
  githubRepos,
  onLogout,
  onClone,
  isCloning,
  prOwnerRepo,
  prFilter,
  setPrFilter,
  prLoading,
  pullRequests,
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
}) => (
  <>
    <div className="activity-bar">
      <button className={`icon-btn ${activeTab === 'repos' ? 'active' : ''}`} onClick={() => setActiveTab('repos')} title="Repositories">
        <FolderGit2 size={22} />
      </button>
      <button className={`icon-btn ${activeTab === 'github' ? 'active' : ''}`} onClick={() => setActiveTab('github')} title="GitHub">
        <Github size={22} />
      </button>
      <div style={{ flex: 1 }} />
      <button className="icon-btn" title="Settings">
        <Settings size={22} />
      </button>
    </div>

    <div className="sidebar">
      <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{activeTab === 'repos' ? 'Repositories' : 'GitHub'}</span>
        {activeTab === 'repos' && (
          <div style={{ display: 'flex', gap: '2px' }}>
            <button className="icon-btn" style={{ padding: '4px' }} onClick={onOpenFolder} title="Repository hinzufügen">
              <Plus size={16} />
            </button>
            {activeRepo && (
              <button
                className="icon-btn"
                style={{ padding: '4px' }}
                onClick={onRefreshRemoteQuick}
                title="Remote aktualisieren"
                disabled={remoteSync.isFetching || isGitActionRunning}
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="pane-content" style={{ padding: '8px' }}>
        {activeTab === 'repos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <RepoList
              openRepos={openRepos}
              activeRepo={activeRepo}
              onSwitchRepo={onSwitchRepo}
              onCloseRepo={onCloseRepo}
              onOpenFolder={onOpenFolder}
            />

            {activeRepo && (
              <BranchPanel
                branches={branches}
                isCreatingBranch={isCreatingBranch}
                newBranchName={newBranchName}
                newBranchInputRef={newBranchInputRef}
                onSetCreatingBranch={onSetCreatingBranch}
                onSetNewBranchName={onSetNewBranchName}
                onCreateBranch={onCreateBranch}
                onCheckoutBranch={onCheckoutBranch}
                onSetBranchContextMenu={onSetBranchContextMenu}
              />
            )}

            {activeRepo && (
              <TagPanel
                tags={tags}
                onCreateTag={onCreateTag}
                onPushTags={onPushTags}
                onDeleteTag={onDeleteTag}
              />
            )}

            {activeRepo && (
              <RemotePanel
                remotes={remotes}
                remoteSync={remoteSync}
                remoteStatus={remoteStatus}
                remoteOnlyBranchesCount={remoteOnlyBranchesCount}
                onAddRemote={onAddRemote}
                onRemoveRemote={onRemoveRemote}
                onRefreshRemote={onRefreshRemote}
              />
            )}

            {activeRepo && hasRemoteOrigin === false && (
              <>
                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    Noch nicht mit GitHub verbunden.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Repository-Name auf GitHub"
                      value={newRepoName}
                      onChange={e => setNewRepoName(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-dark)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                      }}
                    />
                    <textarea
                      placeholder="Beschreibung (optional)"
                      value={newRepoDescription}
                      onChange={e => setNewRepoDescription(e.target.value)}
                      rows={2}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-dark)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        resize: 'vertical',
                      }}
                    />
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newRepoPrivate}
                        onChange={e => setNewRepoPrivate(e.target.checked)}
                      />
                      Privat
                    </label>
                  </div>
                  {connectError && (
                    <div style={{ fontSize: '0.8rem', color: '#f85149' }}>
                      {connectError}
                    </div>
                  )}
                  <button
                    onClick={onCreateGithubRepoForCurrent}
                    disabled={isConnectingGithubRepo}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: !isConnectingGithubRepo ? 'var(--accent-primary)' : 'var(--bg-dark)',
                      color: !isConnectingGithubRepo ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: !isConnectingGithubRepo ? 'pointer' : 'not-allowed',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Github size={14} />
                    {isConnectingGithubRepo ? 'Verbinde...' : 'GitHub-Repo erstellen & verbinden'}
                  </button>
                  {!isAuthenticated && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Hinweis: Bitte zuerst im GitHub-Tab einen Token hinterlegen.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'github' && !isAuthenticated && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px', textAlign: 'center', marginTop: '16px' }}>
            <Github size={48} style={{ margin: '0 auto', color: 'var(--text-secondary)' }} />
            <h3 style={{ margin: '8px 0 4px', fontSize: '1.1rem' }}>GitHub Connect</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
              Verbinde deinen Account mit einem PAT.
            </p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.open('https://github.com/settings/tokens/new?scopes=repo,user&description=Git-Organizer');
              }}
              style={{
                fontSize: '0.8rem',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={12} /> Token erstellen
            </a>
            <div style={{ position: 'relative' }}>
              <Key
                size={14}
                style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
              />
              <input
                type="password"
                placeholder="ghp_xxx"
                value={tokenInput}
                onChange={e => {
                  setTokenInput(e.target.value);
                  setAuthError(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') onTokenLogin();
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 8px 8px 28px',
                  borderRadius: '4px',
                  border: authError ? '1px solid #f85149' : '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            {authError && <p style={{ fontSize: '0.8rem', color: '#f85149', margin: 0, textAlign: 'left' }}>{authError}</p>}
            <button
              disabled={!tokenInput.trim() || isAuthenticating}
              onClick={onTokenLogin}
              style={{
                padding: '8px',
                backgroundColor: tokenInput.trim() && !isAuthenticating ? 'var(--accent-primary)' : 'var(--bg-dark)',
                color: tokenInput.trim() && !isAuthenticating ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                cursor: tokenInput.trim() && !isAuthenticating ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >
              {isAuthenticating ? 'Verbinde...' : 'Verbinden'}
            </button>
          </div>
        )}

        {activeTab === 'github' && isAuthenticated && (
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
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{githubUser || 'Verbunden'}</span>
              </div>
              <button onClick={onLogout} className="icon-btn" style={{ padding: '4px' }} title="Abmelden">
                <LogOut size={14} />
              </button>
            </div>

            {githubRepos.map(repo => (
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
                }}
              >
                <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</span>
                <button onClick={() => onClone(repo.cloneUrl, repo.name)} disabled={isCloning} className="icon-btn" style={{ padding: '4px' }} title="Clone Repo">
                  <DownloadCloud size={14} />
                </button>
              </div>
            ))}

            {prOwnerRepo && (
              <>
                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 6px' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Pull Requests ({prOwnerRepo.owner}/{prOwnerRepo.repo})
                  </span>
                  <button
                    className="icon-btn"
                    style={{ padding: '2px' }}
                    onClick={() => {
                      setShowCreatePR(true);
                      setNewPRHead(currentBranch);
                    }}
                    title="Neuen PR erstellen"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  {(['open', 'closed', 'all'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setPrFilter(f)}
                      style={{
                        flex: 1,
                        padding: '3px 6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        backgroundColor: prFilter === f ? 'var(--accent-primary)' : 'var(--bg-dark)',
                        color: prFilter === f ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${prFilter === f ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {f === 'open' ? 'Offen' : f === 'closed' ? 'Geschlossen' : 'Alle'}
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
                      placeholder="PR Titel"
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
                      placeholder="Beschreibung (optional)"
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
                        placeholder="Head Branch"
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
                      <span style={{ color: 'var(--text-secondary)', alignSelf: 'center', fontSize: '0.8rem' }}>?</span>
                      <input
                        type="text"
                        placeholder="Base Branch"
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
                        Abbrechen
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
                        Erstellen
                      </button>
                    </div>
                  </div>
                )}

                {prLoading && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '6px 0' }}>
                    Lade Pull Requests...
                  </div>
                )}

                {!prLoading &&
                  pullRequests.map(pr => (
                    <div
                      key={pr.number}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px',
                        backgroundColor: 'var(--bg-panel)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                      }}
                      onClick={() => window.open(pr.htmlUrl, '_blank')}
                    >
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
                          #{pr.number} · {pr.head} ? {pr.base} · {pr.user}
                        </div>
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
                    Keine Pull Requests.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  </>
);
