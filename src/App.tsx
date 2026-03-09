import React, { useState, useEffect } from 'react';
import { GitBranch, History, Settings, FolderGit2, ArrowDownCircle, ArrowUpCircle, Plus, Github, DownloadCloud, Key, ExternalLink, LogOut } from 'lucide-react';
import { CommitGraph } from './components/CommitGraph';
import { StagingArea } from './components/StagingArea';
import { CommitDetails } from './components/CommitDetails';
import './index.css';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('history');
  const [currentRepo, setCurrentRepo] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [cloneRepoName, setCloneRepoName] = useState<string | null>(null);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

  // PAT auth state
  const [tokenInput, setTokenInput] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Auto-login with saved token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('github_token');
    if (savedToken && window.electronAPI) {
      setIsAuthenticating(true);
      window.electronAPI.githubAuth(savedToken).then(async (success) => {
        if (success) {
          setIsAuthenticated(true);
          const status = await window.electronAPI.githubCheckAuthStatus();
          setGithubUser(status.username);
          const result = await window.electronAPI.githubGetRepos();
          if (result.success) setGithubRepos(result.data || []);
        } else {
          // Saved token is invalid, remove it
          localStorage.removeItem('github_token');
        }
        setIsAuthenticating(false);
      }).catch(() => {
        setIsAuthenticating(false);
      });
    }
  }, []);

  const handleOpenFolder = async () => {
    if (!window.electronAPI) {
      alert('Achtung: Du hast die App in einem normalen Web-Browser geöffnet. Um auf deine lokalen Dateien (und Git) zugreifen zu können, musst du sie als Desktop-App über Electron starten!\n\nBitte nutze den Befehl: npm run dev');
      return;
    }
    
    try {
      const result = await window.electronAPI.openDirectory();
      if (result) {
        if (result.isRepo) {
          setCurrentRepo(result.path);
        } else {
          alert('Das ausgewählte Verzeichnis ist kein Git-Repository.');
        }
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleTokenLogin = async () => {
    if (!window.electronAPI) {
      alert('GitHub Login funktioniert nur in der Desktop-Applikation.');
      return;
    }

    const token = tokenInput.trim();
    if (!token) return;

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const success = await window.electronAPI.githubAuth(token);
      if (success) {
        localStorage.setItem('github_token', token);
        setIsAuthenticated(true);
        setTokenInput('');

        const status = await window.electronAPI.githubCheckAuthStatus();
        setGithubUser(status.username);

        const result = await window.electronAPI.githubGetRepos();
        if (result.success) setGithubRepos(result.data || []);
      } else {
        setAuthError('Token ungültig. Bitte prüfe, ob der Token korrekt ist und die nötigen Berechtigungen (repo) hat.');
      }
    } catch (e) {
      console.error(e);
      setAuthError('Fehler bei der Authentifizierung.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('github_token');
    setIsAuthenticated(false);
    setGithubUser(null);
    setGithubRepos([]);
    setTokenInput('');
  };

  const handleClone = async (cloneUrl: string, repoName: string) => {
    if (!window.electronAPI) {
      alert('Klonen funktioniert nur in der Desktop-Applikation.');
      return;
    }

    // Ask user to pick target directory
    const targetDir = await window.electronAPI.selectDirectory();
    if (!targetDir) return;

    // Open clone progress modal
    setIsCloning(true);
    setCloneLog([]);
    setCloneRepoName(repoName);
    setCloneFinished(false);
    setCloneError(null);

    // Subscribe to progress events
    const cleanup = window.electronAPI.onCloneProgress((line: string) => {
      setCloneLog(prev => [...prev, line]);
    });

    try {
      const result = await window.electronAPI.gitClone(cloneUrl, targetDir);
      cleanup();
      if (result.success) {
        setCloneFinished(true);
        setCloneLog(prev => [...prev, `✓ Repository erfolgreich geklont nach: ${result.repoPath}`]);
      } else {
        setCloneError(result.error || 'Unbekannter Fehler');
        setCloneLog(prev => [...prev, `✗ Fehler: ${result.error}`]);
      }
    } catch (e: any) {
      cleanup();
      setCloneError(e.message);
      setCloneLog(prev => [...prev, `✗ Fehler: ${e.message}`]);
    }
  };

  const closeCloneModal = () => {
    setIsCloning(false);
    setCloneLog([]);
    setCloneRepoName(null);
    setCloneFinished(false);
    setCloneError(null);
  };

  return (
    <div className="app-container">
      {/* Activity Bar (Slim Left) */}
      <div className="activity-bar">
        <button className={`icon-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')} title="History">
          <History size={22} />
        </button>
        <button className={`icon-btn ${activeTab === 'repos' ? 'active' : ''}`} onClick={() => setActiveTab('repos')} title="Repositories">
          <FolderGit2 size={22} />
        </button>
        <button className={`icon-btn ${activeTab === 'github' ? 'active' : ''}`} onClick={() => setActiveTab('github')} title="GitHub">
          <Github size={22} />
        </button>
        <div style={{ flex: 1 }}></div>
        <button className="icon-btn" title="Settings">
          <Settings size={22} />
        </button>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{activeTab === 'history' ? 'Local Branches' : activeTab === 'repos' ? 'Repositories' : 'GitHub'}</span>
          {activeTab === 'repos' && (
            <button className="icon-btn" style={{ padding: '4px' }} onClick={handleOpenFolder} title="Add Repository">
              <Plus size={16} />
            </button>
          )}
        </div>
        <div className="pane-content" style={{ padding: '8px' }}>
          {/* GitHub Tab - Not Authenticated */}
          {activeTab === 'github' && !isAuthenticated && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px', textAlign: 'center', marginTop: '16px' }}>
              <Github size={48} style={{ margin: '0 auto', color: 'var(--text-secondary)' }} />
              <h3 style={{ margin: '8px 0 4px', fontSize: '1.1rem' }}>GitHub Connect</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                 Verbinde deinen Account mit einem Personal Access Token.
              </p>
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); window.open('https://github.com/settings/tokens/new?scopes=repo,user&description=Git-Organizer'); }}
                style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', textDecoration: 'none' }}
              >
                <ExternalLink size={12} /> Token erstellen auf GitHub
              </a>
              <div style={{ position: 'relative' }}>
                <Key size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="password" 
                  placeholder="ghp_xxxxxxxxxxxx" 
                  value={tokenInput}
                  onChange={(e) => { setTokenInput(e.target.value); setAuthError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTokenLogin(); }}
                  style={{ 
                    width: '100%', boxSizing: 'border-box',
                    padding: '8px 8px 8px 28px', borderRadius: '4px', 
                    border: authError ? '1px solid #f85149' : '1px solid var(--border-color)', 
                    backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', 
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              {authError && (
                <p style={{ fontSize: '0.8rem', color: '#f85149', margin: 0, textAlign: 'left' }}>{authError}</p>
              )}
              <button 
                disabled={!tokenInput.trim() || isAuthenticating} 
                onClick={handleTokenLogin} 
                style={{ 
                  padding: '8px', 
                  backgroundColor: tokenInput.trim() && !isAuthenticating ? 'var(--accent-primary)' : 'var(--bg-dark)', 
                  color: tokenInput.trim() && !isAuthenticating ? '#fff' : 'var(--text-secondary)', 
                  border: 'none', borderRadius: '4px', 
                  cursor: tokenInput.trim() && !isAuthenticating ? 'pointer' : 'not-allowed', 
                  fontWeight: 600 
                }}
              >
                {isAuthenticating ? 'Verbinde...' : 'Verbinden'}
              </button>
            </div>
          )}

          {/* GitHub Tab - Authenticated */}
          {activeTab === 'github' && isAuthenticated && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Github size={16} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{githubUser || 'Verbunden'}</span>
                </div>
                <button onClick={handleLogout} className="icon-btn" style={{ padding: '4px' }} title="Abmelden">
                  <LogOut size={14} />
                </button>
              </div>
              {githubRepos.map(repo => (
                <div key={repo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: 'var(--bg-panel)', borderRadius: '4px', border: '1px solid var(--border-color)'}}>
                  <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</span>
                  <button onClick={() => handleClone(repo.cloneUrl, repo.name)} disabled={isCloning} className="icon-btn" style={{ padding: '4px' }} title="Clone Repo">
                    <DownloadCloud size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'repos' && currentRepo && (
             <div style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--accent-primary)'}}>
                <FolderGit2 size={16} />
                <span style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentRepo.split('\\').pop() || currentRepo.split('/').pop()}
                </span>
             </div>
          )}
          {activeTab === 'repos' && !currentRepo && (
             <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Kein Repository geöffnet.
             </div>
          )}
          {activeTab === 'history' && currentRepo && (
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', color: 'var(--accent-primary)', backgroundColor: 'var(--bg-hover)', borderRadius: '6px'}}>
              <GitBranch size={16} />
              <span style={{ fontSize: '0.9rem' }}>main</span>
            </div>
          )}
        </div>
      </div>

      {/* Main View */}
      <div className="main-view">
        <div className="topbar">
          <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {currentRepo ? currentRepo.split('\\').pop() || currentRepo.split('/').pop() : 'Git-Organizer'}
          </div>
          <div style={{ flex: 1 }}></div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="icon-btn" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} disabled={!currentRepo}>
              <ArrowDownCircle size={18} style={{marginRight: '6px'}}/> Pull
            </button>
            <button className="icon-btn" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }} disabled={!currentRepo}>
              <ArrowUpCircle size={18} style={{marginRight: '6px'}}/> Push
            </button>
            <button className="icon-btn" style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }} disabled={!currentRepo}>
              Commit
            </button>
          </div>
        </div>

        <div className="content-area">
          <div className="pane" style={{ flex: 2 }}>
            <div className="pane-header">Commit Graph</div>
            <div className="pane-content">
              <CommitGraph repoPath={currentRepo} selectedHash={selectedCommit} onSelectCommit={setSelectedCommit} />
            </div>
          </div>
          <div className="pane">
            <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{selectedCommit ? 'Commit Inspector' : 'Staged Changes'}</span>
              {selectedCommit && (
                <button className="icon-btn" onClick={() => setSelectedCommit(null)} style={{ fontSize: '0.8rem', padding: '2px 6px' }}>
                  Schließen
                </button>
              )}
            </div>
            <div className="pane-content" style={{ overflow: 'hidden' }}>
              {selectedCommit ? (
                <CommitDetails hash={selectedCommit} />
              ) : (
                <StagingArea repoPath={currentRepo} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clone Progress Modal */}
      {isCloning && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            width: '520px', maxHeight: '400px',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <DownloadCloud size={18} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                Klone: {cloneRepoName || 'Repository'}
              </span>
              <div style={{ flex: 1 }} />
              {!cloneFinished && !cloneError && (
                <div className="clone-spinner" />
              )}
              {cloneFinished && (
                <span style={{ color: '#3fb950', fontSize: '0.85rem', fontWeight: 600 }}>✓ Fertig</span>
              )}
              {cloneError && (
                <span style={{ color: '#f85149', fontSize: '0.85rem', fontWeight: 600 }}>✗ Fehler</span>
              )}
            </div>

            {/* Log Output */}
            <div style={{
              flex: 1, overflow: 'auto',
              padding: '12px 16px',
              fontFamily: 'monospace', fontSize: '0.78rem',
              lineHeight: '1.6',
              color: 'var(--text-secondary)',
              maxHeight: '260px'
            }}>
              {cloneLog.length === 0 && (
                <span style={{ color: 'var(--text-secondary)' }}>Starte Clone-Prozess...</span>
              )}
              {cloneLog.map((line, i) => (
                <div key={i} style={{
                  color: line.startsWith('✓') ? '#3fb950' : line.startsWith('✗') ? '#f85149' : 'var(--text-secondary)'
                }}>{line}</div>
              ))}
            </div>

            {/* Modal Footer */}
            {(cloneFinished || cloneError) && (
              <div style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'flex-end'
              }}>
                <button
                  onClick={closeCloneModal}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff', border: 'none', borderRadius: '4px',
                    cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem'
                  }}
                >Schließen</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
