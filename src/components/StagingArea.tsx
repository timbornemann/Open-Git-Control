import React, { useEffect, useState } from 'react';
import { GitStatus, parseGitStatus } from '../utils/gitParsing';

interface StagingAreaProps {
  repoPath: string | null;
}

export const StagingArea: React.FC<StagingAreaProps> = ({ repoPath }) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  useEffect(() => {
    if (!repoPath) {
      setStatus(null);
      return;
    }

    const fetchStatus = async () => {
      if (!window.electronAPI) return;
      try {
        const { success, data } = await window.electronAPI.runGitCommand('status');
        if (success && data) {
          setStatus(parseGitStatus(data));
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    // Initial fetch
    fetchStatus();
    
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [repoPath]);

  const handleCommit = async () => {
    if (!commitMsg.trim() || !hasChanges) return;
    if (!window.electronAPI) return;
    setIsCommitting(true);
    try {
      // First stage all for simplicity
      await window.electronAPI.runGitCommand('add', '.');
      // Then commit
      await window.electronAPI.runGitCommand('commit', '-m', `"${commitMsg}"`);
      setCommitMsg('');
    } catch (e) {
      console.error(e);
      alert('Commit fehlgeschlagen');
    } finally {
      setIsCommitting(false);
    }
  };

  if (!repoPath) return null;
  if (!status) return <div>Lade Status...</div>;

  const hasChanges = 
    status.staged.length > 0 || 
    status.modified.length > 0 || 
    status.untracked.length > 0 || 
    status.deleted.length > 0;

  if (!hasChanges) {
    return <div style={{ color: 'var(--text-secondary)' }}>Keine Änderungen (Working Tree clean).</div>;
  }

  const FileList = ({ title, files, color }: { title: string, files: string[], color: string }) => {
    if (files.length === 0) return null;
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          {title} ({files.length})
        </div>
        {files.map(f => (
          <div key={f} style={{ color, fontSize: '0.9rem', padding: '4px 8px', backgroundColor: 'var(--bg-dark)', borderRadius: '4px', marginBottom: '4px', fontFamily: 'monospace' }}>
            {f}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <FileList title="Staged Changes" files={status.staged} color="var(--commit-green)" />
        <FileList title="Modified (Unstaged)" files={status.modified} color="var(--commit-orange)" />
        <FileList title="Untracked" files={status.untracked} color="var(--text-primary)" />
        <FileList title="Deleted" files={status.deleted} color="var(--danger)" />
      </div>

      {hasChanges && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea 
            placeholder="Commit message..." 
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            style={{ width: '100%', minHeight: '60px', padding: '8px', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button 
            onClick={handleCommit}
            disabled={!commitMsg.trim() || isCommitting}
            style={{ padding: '8px 16px', backgroundColor: 'var(--commit-green)', color: '#fff', border: 'none', borderRadius: '4px', cursor: (!commitMsg.trim() || isCommitting) ? 'not-allowed' : 'pointer', opacity: (!commitMsg.trim() || isCommitting) ? 0.5 : 1, fontWeight: 500 }}
          >
            {isCommitting ? 'Committing...' : 'Commit Changes'}
          </button>
        </div>
      )}
    </div>
  );
};
