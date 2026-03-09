import React, { useEffect, useState, useCallback } from 'react';
import { GitStatusDetailed, FileEntry, parseGitStatusDetailed } from '../utils/gitParsing';

interface StagingAreaProps {
  repoPath: string | null;
  onRepoChanged?: () => void; // Called after commit/stash/discard to refresh graph
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  'A': { label: 'Added', color: '#3fb950' },
  'M': { label: 'Modified', color: '#d29922' },
  'D': { label: 'Deleted', color: '#f85149' },
  'R': { label: 'Renamed', color: '#a371f7' },
  'C': { label: 'Copied', color: '#58a6ff' },
  '?': { label: 'Untracked', color: '#8b949e' },
};

const getStatusInfo = (code: string) => STATUS_LABELS[code] || { label: code, color: '#8b949e' };
const basename = (p: string) => p.split(/[\\/]/).pop() || p;

export const StagingArea: React.FC<StagingAreaProps> = ({ repoPath, onRepoChanged }) => {
  const [status, setStatus] = useState<GitStatusDetailed | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [diffContent, setDiffContent] = useState<{ path: string; diff: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    try {
      const { success, data } = await window.electronAPI.runGitCommand('status');
      if (success && data) setStatus(parseGitStatusDetailed(data));
    } catch (e) { console.error(e); }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) { setStatus(null); return; }
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, [repoPath, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const git = async (args: string[], msg: string, notify = false) => {
    if (!window.electronAPI) return;
    try {
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        setToast({ msg, err: false });
        await refresh();
        if (notify && onRepoChanged) onRepoChanged();
      } else {
        setToast({ msg: r.error || 'Fehler', err: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, err: true });
    }
  };

  // Single-file actions (sequential, no race condition)
  const stageFile = (f: string) => git(['add', '--', f], `${basename(f)} gestaged`);
  const unstageFile = (f: string) => git(['reset', 'HEAD', '--', f], `${basename(f)} unstaged`);
  
  // Bulk actions — use single git command to avoid lock file issues
  const stageAll = () => git(['add', '.'], 'Alle Dateien gestaged');
  const unstageAll = () => git(['reset', 'HEAD'], 'Alle Dateien unstaged');
  
  const discardFile = (f: string) => {
    if (confirm(`Änderungen in "${basename(f)}" verwerfen?`)) {
      git(['checkout', '--', f], `${basename(f)} verworfen`, true);
    }
  };
  const discardAll = () => {
    if (confirm('⚠️ Alle unstaged Änderungen verwerfen?')) {
      git(['checkout', '--', '.'], 'Alle Änderungen verworfen', true);
    }
  };
  const deleteUntracked = (f: string) => {
    if (confirm(`"${basename(f)}" löschen?`)) {
      git(['clean', '-f', '--', f], `${basename(f)} gelöscht`, true);
    }
  };
  
  const stashChanges = () => {
    const msg = prompt('Stash-Nachricht (optional):');
    if (msg !== null) {
      const args = msg.trim() ? ['stash', 'push', '-m', msg.trim()] : ['stash'];
      git(args, 'Änderungen gestasht', true);
    }
  };
  const stashPop = () => git(['stash', 'pop'], 'Stash angewendet', true);

  const showDiff = async (filePath: string, staged: boolean) => {
    if (!window.electronAPI) return;
    try {
      const args = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        setDiffContent({ path: filePath, diff: r.data || '(Keine Unterschiede)' });
      }
    } catch (e) { console.error(e); }
  };

  const handleCommit = async () => {
    if (!commitMsg.trim() || !window.electronAPI) return;
    if (!status || status.staged.length === 0) {
      setToast({ msg: 'Bitte zuerst Dateien stagen.', err: true });
      return;
    }
    setIsCommitting(true);
    try {
      const r = await window.electronAPI.runGitCommand('commit', '-m', commitMsg.trim());
      if (r.success) {
        setCommitMsg('');
        setToast({ msg: 'Commit erfolgreich!', err: false });
        await refresh();
        if (onRepoChanged) onRepoChanged();
      } else {
        setToast({ msg: r.error || 'Commit fehlgeschlagen', err: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, err: true });
    } finally {
      setIsCommitting(false);
    }
  };

  if (!repoPath) return null;
  if (!status) return <div style={{ color: 'var(--text-secondary)', padding: '16px' }}>Lade Status...</div>;

  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length;

  // Diff viewer overlay
  if (diffContent) {
    return (
      <div className="staging-container">
        <div className="staging-toolbar">
          <button className="staging-tool-btn" onClick={() => setDiffContent(null)}>← Zurück</button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{diffContent.path}</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {diffContent.diff.split('\n').map((line, i) => {
            let color = 'var(--text-secondary)';
            if (line.startsWith('+') && !line.startsWith('+++')) color = '#3fb950';
            else if (line.startsWith('-') && !line.startsWith('---')) color = '#f85149';
            else if (line.startsWith('@@')) color = '#a371f7';
            return <div key={i} style={{ color }}>{line || ' '}</div>;
          })}
        </div>
      </div>
    );
  }

  const FileRow = ({ entry, section }: { entry: FileEntry; section: 'staged' | 'unstaged' | 'untracked' }) => {
    const statusCode = section === 'staged' ? entry.x : entry.y;
    const info = getStatusInfo(statusCode);
    return (
      <div className="staging-file-row" onClick={() => section !== 'untracked' && showDiff(entry.path, section === 'staged')}>
        <span className="staging-status" style={{ color: info.color }}>{statusCode}</span>
        <span className="staging-path" title={entry.path}>{entry.path}</span>
        <div className="staging-actions">
          {section === 'staged' && (
            <button className="staging-btn" onClick={(e) => { e.stopPropagation(); unstageFile(entry.path); }} title="Unstage">−</button>
          )}
          {section === 'unstaged' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); discardFile(entry.path); }} title="Verwerfen">✕</button>
            </>
          )}
          {section === 'untracked' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); deleteUntracked(entry.path); }} title="Löschen">✕</button>
            </>
          )}
        </div>
      </div>
    );
  };

  const SectionHeader = ({ title, count, color, actions }: { title: string; count: number; color: string; actions?: React.ReactNode }) => (
    <div className="staging-section-header">
      <span style={{ color }}>{title}</span>
      <span className="staging-count">{count}</span>
      <div style={{ flex: 1 }} />
      {actions}
    </div>
  );

  return (
    <div className="staging-container">
      <div className="staging-toolbar">
        <button className="staging-tool-btn" onClick={stashChanges} title="Stash">📦 Stash</button>
        <button className="staging-tool-btn" onClick={stashPop} title="Stash Pop">📤 Pop</button>
        <div style={{ flex: 1 }} />
        {totalChanges > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {totalChanges} Änderung{totalChanges !== 1 ? 'en' : ''}
          </span>
        )}
      </div>

      <div className="staging-files">
        {totalChanges === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            ✓ Working Tree ist sauber.
          </div>
        )}

        {status.staged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Staged Changes" count={status.staged.length} color="#3fb950"
              actions={<button className="staging-btn-sm" onClick={unstageAll} title="Alle unstagen">− Alle</button>}
            />
            {status.staged.map(f => <FileRow key={`s-${f.path}`} entry={f} section="staged" />)}
          </div>
        )}

        {status.unstaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Changes" count={status.unstaged.length} color="#d29922"
              actions={
                <>
                  <button className="staging-btn-sm" onClick={stageAll} title="Alle stagen">+ Alle</button>
                  <button className="staging-btn-sm danger" onClick={discardAll} title="Alle verwerfen">✕ Alle</button>
                </>
              }
            />
            {status.unstaged.map(f => <FileRow key={`u-${f.path}`} entry={f} section="unstaged" />)}
          </div>
        )}

        {status.untracked.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Untracked" count={status.untracked.length} color="#8b949e"
              actions={<button className="staging-btn-sm" onClick={stageAll} title="Alle stagen">+ Alle</button>}
            />
            {status.untracked.map(f => <FileRow key={`t-${f.path}`} entry={f} section="untracked" />)}
          </div>
        )}
      </div>

      <div className="staging-commit-area">
        <textarea
          className="staging-commit-input"
          placeholder="Commit-Nachricht..."
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }}
        />
        <div className="staging-commit-bar">
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Ctrl+Enter</span>
          <button
            className="staging-commit-btn"
            onClick={handleCommit}
            disabled={!commitMsg.trim() || isCommitting || !status || status.staged.length === 0}
          >
            {isCommitting ? 'Committing...' : `Commit (${status?.staged.length || 0})`}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`action-toast ${toast.err ? 'error' : 'success'}`}>
          {toast.err ? '✗' : '✓'} {toast.msg}
        </div>
      )}
    </div>
  );
};
