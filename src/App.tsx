import React, { useState } from 'react';
import { GitBranch, History, Settings, FolderGit2, ArrowDownCircle, ArrowUpCircle, Plus, Github, DownloadCloud } from 'lucide-react';
import { CommitGraph } from './components/CommitGraph';
import { StagingArea } from './components/StagingArea';
import './index.css';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('history');
  const [currentRepo, setCurrentRepo] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [isCloning, setIsCloning] = useState(false);

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
          // fetch branches later
        } else {
          alert('Das ausgewählte Verzeichnis ist kein Git-Repository.');
        }
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleGithubLogin = async () => {
    if (!githubToken.trim()) return;
    if (!window.electronAPI) {
      alert('GitHub Login funktioniert nur in der Desktop-Applikation.');
      return;
    }
    try {
      const success = await window.electronAPI.githubAuth(githubToken);
      setIsAuthenticated(success);
      if (success) {
        const result = await window.electronAPI.githubGetRepos();
        if (result.success) setGithubRepos(result.data);
      } else {
        alert('GitHub Login fehlgeschlagen (Token ungültig?)');
      }
    } catch(e) { console.error(e); }
  };

  const handleClone = async (cloneUrl: string) => {
    if (!window.electronAPI) {
      alert('Klonen funktioniert nur in der Desktop-Applikation.');
      return;
    }
    setIsCloning(true);
    try {
      const parentDir = await window.electronAPI.openDirectory();
      if (parentDir) {
         // Mocking the real clone for the UI context
         alert(`Klonen gestartet nach ${parentDir.path} von ${cloneUrl}`);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsCloning(false);
    }
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
          {activeTab === 'github' && !isAuthenticated && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Personal Access Token:</span>
              <input type="password" value={githubToken} onChange={e=>setGithubToken(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-darker)', color: 'var(--text-primary)'}} />
              <button onClick={handleGithubLogin} style={{ padding: '6px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Login</button>
            </div>
          )}
          {activeTab === 'github' && isAuthenticated && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             {githubRepos.map(repo => (
                 <div key={repo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: 'var(--bg-panel)', borderRadius: '4px', border: '1px solid var(--border-color)'}}>
                   <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</span>
                   <button onClick={() => handleClone(repo.cloneUrl)} disabled={isCloning} className="icon-btn" style={{ padding: '4px' }} title="Clone Repo">
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
              <CommitGraph repoPath={currentRepo} />
            </div>
          </div>
          <div className="pane">
            <div className="pane-header">Staged Changes</div>
            <div className="pane-content">
              <StagingArea repoPath={currentRepo} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
