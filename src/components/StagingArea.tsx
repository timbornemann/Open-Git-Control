import React, { useEffect, useState, useCallback } from 'react';
import { GitStatusDetailed, FileEntry, parseGitStatusDetailed } from '../utils/gitParsing';
import { useToastQueue } from '../hooks/useToastQueue';
import { Confirm, DialogContextItem } from './Confirm';
import { DangerConfirm } from './DangerConfirm';
import { Input, InputDialogField } from './Input';

interface StagingAreaProps {
  repoPath: string | null;
  onRepoChanged?: () => void;
}

type ConfirmDialogState = {
  variant: 'confirm' | 'danger';
  title: string;
  message: string;
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

type InputDialogState = {
  title: string;
  message: string;
  fields: InputDialogField[];
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};

type ConflictEntry = FileEntry & { code: string };
type GitStatusWithConflicts = GitStatusDetailed & { conflicts: ConflictEntry[] };

const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  A: { label: 'Added', color: '#3fb950' },
  M: { label: 'Modified', color: '#d29922' },
  D: { label: 'Deleted', color: '#f85149' },
  R: { label: 'Renamed', color: '#a371f7' },
  C: { label: 'Copied', color: '#58a6ff' },
  '?': { label: 'Untracked', color: '#8b949e' },
};

const CONFLICT_LABELS: Record<string, string> = {
  UU: 'Both modified',
  AA: 'Both added',
  DD: 'Both deleted',
  AU: 'Added by us',
  UA: 'Added by them',
  DU: 'Deleted by us',
  UD: 'Deleted by them',
};

const getStatusInfo = (code: string) => STATUS_LABELS[code] || { label: code, color: '#8b949e' };
const basename = (p: string) => p.split(/[\\/]/).pop() || p;

const parseConflictEntries = (statusOutput: string): ConflictEntry[] => {
  if (!statusOutput.trim()) return [];

  const conflicts: ConflictEntry[] = [];
  for (const line of statusOutput.split('\n')) {
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const code = `${x}${y}`;
    if (!CONFLICT_CODES.has(code)) continue;
    conflicts.push({ path: line.substring(3).trim(), x, y, code });
  }

  return conflicts;
};

export const StagingArea: React.FC<StagingAreaProps> = ({ repoPath, onRepoChanged }) => {
  const [status, setStatus] = useState<GitStatusWithConflicts | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [diffContent, setDiffContent] = useState<{ path: string; diff: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const { toast, setToast } = useToastQueue(3000);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'staged' | 'unstaged' | 'untracked' | 'conflicts'>('all');
  const [amendCommit, setAmendCommit] = useState(false);
  const [signoffCommit, setSignoffCommit] = useState(false);

  const refresh = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    try {
      const { success, data } = await window.electronAPI.runGitCommand('statusPorcelain');
      if (!success) return;

      const rawStatus = data || '';
      const parsed = parseGitStatusDetailed(rawStatus);
      const conflicts = parseConflictEntries(rawStatus);
      const conflictPathSet = new Set(conflicts.map(c => c.path));

      setStatus({
        ...parsed,
        conflicts,
        staged: parsed.staged.filter(f => !conflictPathSet.has(f.path)),
        unstaged: parsed.unstaged.filter(f => !conflictPathSet.has(f.path)),
      });
    } catch (e) {
      console.error(e);
    }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath) {
      setStatus(null);
      return;
    }
    refresh();
    const iv = setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', refresh);
    };
  }, [repoPath, refresh]);


  useEffect(() => {
    const loadCommitPreferences = async () => {
      if (!window.electronAPI) return;
      try {
        const settings = await window.electronAPI.getSettings();
        setSignoffCommit(Boolean(settings.commitSignoffByDefault));
        if (settings.commitTemplate && !commitMsg.trim()) {
          setCommitMsg(settings.commitTemplate);
        }
      } catch {
        // ignore
      }
    };

    loadCommitPreferences();
  }, []);
  const git = async (args: string[], msg: string, notify = false) => {
    if (!window.electronAPI) return;
    try {
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        setToast({ msg, isError: false });
        await refresh();
        if (notify && onRepoChanged) onRepoChanged();
      } else {
        setToast({ msg: r.error || 'Fehler', isError: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    }
  };

  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), []);
  const executeConfirmDialog = useCallback(async () => {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }, [confirmDialog]);

  const closeInputDialog = useCallback(() => setInputDialog(null), []);
  const executeInputDialog = useCallback(async (values: Record<string, string>) => {
    if (!inputDialog) return;
    const action = inputDialog.onSubmit;
    setInputDialog(null);
    await action(values);
  }, [inputDialog]);

  const stageFile = (f: string) => git(['add', '--', f], `${basename(f)} gestaged`);
  const unstageFile = (f: string) => git(['reset', 'HEAD', '--', f], `${basename(f)} unstaged`);
  const stageAll = () => git(['add', '.'], 'Alle Dateien gestaged');
  const stageAllUntracked = async () => {
    if (!window.electronAPI || !status || status.untracked.length === 0) return;

    try {
      for (const entry of status.untracked) {
        const r = await window.electronAPI.runGitCommand('add', '--', entry.path);
        if (!r.success) {
          throw new Error(r.error || `Fehler beim Stagen von ${entry.path}`);
        }
      }

      const count = status.untracked.length;
      setToast({ msg: `${count} untracked Datei${count !== 1 ? 'en' : ''} gestaged`, isError: false });
      await refresh();
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    }
  };
  const unstageAll = () => git(['reset', 'HEAD'], 'Alle Dateien unstaged');

  const discardFile = (f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Datei-Aenderungen verwerfen?',
      message: 'Alle nicht gespeicherten Aenderungen dieser Datei werden verworfen.',
      contextItems: [
        { label: 'Datei', value: f },
        { label: 'Bereich', value: 'Unstaged Working Tree' },
      ],
      irreversible: true,
      consequences: 'Die verworfenen Zeilen koennen nicht aus Git wiederhergestellt werden.',
      confirmLabel: 'Aenderungen verwerfen',
      onConfirm: () => git(['checkout', '--', f], `${basename(f)} verworfen`, true),
    });
  };

  const discardAll = () => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Alle unstaged Aenderungen verwerfen?',
      message: 'Alle lokalen unstaged Aenderungen werden auf den letzten Commit zurueckgesetzt.',
      contextItems: [
        { label: 'Umfang', value: 'Gesamtes Repository' },
        { label: 'Betrifft', value: 'Nur unstaged Dateien' },
      ],
      irreversible: true,
      consequences: 'Nicht gespeicherte Aenderungen gehen unwiderruflich verloren.',
      confirmLabel: 'Alles verwerfen',
      onConfirm: () => git(['checkout', '--', '.'], 'Alle Aenderungen verworfen', true),
    });
  };

  const deleteUntracked = (f: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Untracked Datei loeschen?',
      message: 'Die Datei ist nicht versioniert und wird direkt vom Dateisystem entfernt.',
      contextItems: [
        { label: 'Datei', value: f },
        { label: 'Git-Status', value: 'Untracked' },
      ],
      irreversible: true,
      consequences: 'Die Datei ist danach ohne Backup nicht wiederherstellbar.',
      confirmLabel: 'Datei loeschen',
      onConfirm: () => git(['clean', '-f', '--', f], `${basename(f)} geloescht`, true),
    });
  };

  const stashChanges = () => {
    setInputDialog({
      title: 'Aenderungen stashen',
      message: 'Optional eine Nachricht fuer den neuen Stash hinterlegen.',
      fields: [
        {
          id: 'message',
          label: 'Stash-Nachricht (optional)',
          placeholder: 'z.B. WIP: Feature XYZ',
        },
      ],
      contextItems: [
        { label: 'Repository', value: repoPath ? basename(repoPath) : '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Aenderungen werden temporaer aus dem Working Tree entfernt und im Stash gespeichert.',
      confirmLabel: 'Stash erstellen',
      onSubmit: async (values) => {
        const msg = (values.message || '').trim();
        const args = msg ? ['stash', 'push', '-m', msg] : ['stash'];
        await git(args, 'Aenderungen gestasht', true);
      },
    });
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
    } catch (e) {
      console.error(e);
    }
  };

  const takeConflictVersion = (filePath: string, side: 'ours' | 'theirs') => {
    const command = side === 'ours' ? 'conflictTakeOurs' : 'conflictTakeTheirs';
    return git([command, filePath], `${basename(filePath)}: ${side} uebernommen`);
  };

  const markConflictResolved = (filePath: string) => git(['conflictMarkResolved', filePath], `${basename(filePath)} als geloest markiert`);

  const mergeContinue = () => git(['mergeContinue'], 'Merge fortgesetzt', true);
  const mergeAbort = () => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Merge abbrechen?',
      message: 'Der laufende Merge wird verworfen und auf den Zustand vor dem Merge zurueckgesetzt.',
      contextItems: [{ label: 'Aktion', value: 'git merge --abort' }],
      irreversible: true,
      consequences: 'Alle noch nicht gesicherten Merge-Konfliktaufloesungen gehen verloren.',
      confirmLabel: 'Merge abbrechen',
      onConfirm: () => git(['mergeAbort'], 'Merge abgebrochen', true),
    });
  };

  const rebaseContinue = () => git(['rebaseContinue'], 'Rebase fortgesetzt', true);
  const rebaseAbort = () => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Rebase abbrechen?',
      message: 'Der laufende Rebase wird verworfen und der vorherige Branch-Zustand wiederhergestellt.',
      contextItems: [{ label: 'Aktion', value: 'git rebase --abort' }],
      irreversible: true,
      consequences: 'Alle noch nicht gesicherten Rebase-Aufloesungen gehen verloren.',
      confirmLabel: 'Rebase abbrechen',
      onConfirm: () => git(['rebaseAbort'], 'Rebase abgebrochen', true),
    });
  };

  const handleCommit = async () => {
    if (!commitMsg.trim() || !window.electronAPI || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: 'Bitte zuerst alle Konflikte aufloesen.', isError: true });
      return;
    }

    if (status.staged.length === 0) {
      setToast({ msg: 'Bitte zuerst Dateien stagen.', isError: true });
      return;
    }

    setIsCommitting(true);
    try {
      const commitArgs: string[] = ['commit'];
      if (amendCommit) commitArgs.push('--amend');
      if (signoffCommit) commitArgs.push('--signoff');
      commitArgs.push('-m', commitMsg.trim());
      const r = await window.electronAPI.runGitCommand(commitArgs[0], ...commitArgs.slice(1));
      if (r.success) {
        setCommitMsg('');
        setToast({ msg: 'Commit erfolgreich!', isError: false });
        await refresh();
        if (onRepoChanged) onRepoChanged();
      } else {
        setToast({ msg: r.error || 'Commit fehlgeschlagen', isError: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message, isError: true });
    } finally {
      setIsCommitting(false);
    }
  };

  if (!repoPath) return null;
  if (!status) return <div style={{ color: 'var(--text-secondary)', padding: '16px' }}>Lade Status...</div>;

  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length + status.conflicts.length;
  const hasOpenConflicts = status.conflicts.length > 0;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const bySearch = <T extends { path: string }>(entries: T[]) => entries
    .filter(entry => !normalizedQuery || entry.path.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => a.path.localeCompare(b.path));

  const visibleStaged = activeFilter === 'all' || activeFilter === 'staged' ? bySearch(status.staged) : [];
  const visibleUnstaged = activeFilter === 'all' || activeFilter === 'unstaged' ? bySearch(status.unstaged) : [];
  const visibleUntracked = activeFilter === 'all' || activeFilter === 'untracked' ? bySearch(status.untracked) : [];
  const visibleConflicts = activeFilter === 'all' || activeFilter === 'conflicts' ? bySearch(status.conflicts) : [];
  const visibleTotal = visibleStaged.length + visibleUnstaged.length + visibleUntracked.length + visibleConflicts.length;

  if (diffContent) {
    return (
      <div className="staging-container">
        <div className="staging-toolbar">
          <button className="staging-tool-btn" onClick={() => setDiffContent(null)}>
            Zurueck
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{diffContent.path}</span>
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.75rem',
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {diffContent.diff.split('\n').map((line, i) => {
            let color = 'var(--text-secondary)';
            if (line.startsWith('+') && !line.startsWith('+++')) color = '#3fb950';
            else if (line.startsWith('-') && !line.startsWith('---')) color = '#f85149';
            else if (line.startsWith('@@')) color = '#a371f7';
            return (
              <div key={i} style={{ color }}>
                {line || ' '}
              </div>
            );
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
            <button className="staging-btn" onClick={(e) => { e.stopPropagation(); unstageFile(entry.path); }} title="Unstage">-</button>
          )}
          {section === 'unstaged' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); discardFile(entry.path); }} title="Verwerfen">x</button>
            </>
          )}
          {section === 'untracked' && (
            <>
              <button className="staging-btn" onClick={(e) => { e.stopPropagation(); stageFile(entry.path); }} title="Stage">+</button>
              <button className="staging-btn danger" onClick={(e) => { e.stopPropagation(); deleteUntracked(entry.path); }} title="Loeschen">x</button>
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
      <div className="staging-toolbar" style={{ flexWrap: 'wrap' }}>
        <button className="staging-tool-btn" onClick={stashChanges} title="Stash">Stash</button>
        <button className="staging-tool-btn" onClick={stashPop} title="Stash Pop">Pop</button>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Datei suchen..."
          style={{ flex: 1, minWidth: '170px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.76rem' }}
        />
        {(['all', 'staged', 'unstaged', 'untracked', 'conflicts'] as const).map((filter) => (
          <button
            key={filter}
            className="staging-tool-btn"
            style={{
              backgroundColor: activeFilter === filter ? 'rgba(31, 111, 235, 0.2)' : undefined,
              borderColor: activeFilter === filter ? 'rgba(31, 111, 235, 0.5)' : undefined,
              color: activeFilter === filter ? '#7cb8ff' : undefined,
            }}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {visibleTotal > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {visibleTotal} sichtbar
          </span>
        )}
      </div>

      <div className="staging-files">
        {totalChanges === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Working Tree ist sauber.
          </div>
        )}

        {visibleConflicts.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Konflikte" count={visibleConflicts.length} color="#f85149" />
            <div style={{ padding: '6px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)' }}>
              <button className="staging-btn-sm" onClick={mergeContinue}>Merge fortsetzen</button>
              <button className="staging-btn-sm danger" onClick={mergeAbort}>Abbrechen</button>
              <button className="staging-btn-sm" onClick={rebaseContinue}>Rebase continue</button>
              <button className="staging-btn-sm danger" onClick={rebaseAbort}>Rebase abort</button>
            </div>
            {visibleConflicts.map((f) => (
              <div key={`c-${f.path}`} className="staging-file-row" style={{ alignItems: 'flex-start' }}>
                <span className="staging-status" style={{ color: '#f85149', width: 22 }}>{f.code}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="staging-path" title={f.path}>{f.path}</span>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>{CONFLICT_LABELS[f.code] || 'Konflikt'}</div>
                </div>
                <div className="staging-actions" style={{ opacity: 1, flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="staging-btn-sm" onClick={() => takeConflictVersion(f.path, 'ours')}>Take ours</button>
                  <button className="staging-btn-sm" onClick={() => takeConflictVersion(f.path, 'theirs')}>Take theirs</button>
                  <button className="staging-btn-sm" onClick={() => showDiff(f.path, false)}>Diff anzeigen</button>
                  <button className="staging-btn-sm" onClick={() => markConflictResolved(f.path)}>Als geloest markieren</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {visibleStaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Staged Changes" count={visibleStaged.length} color="#3fb950"
              actions={<button className="staging-btn-sm" onClick={unstageAll} title="Alle unstagen">- Alle</button>}
            />
            {visibleStaged.map(f => <FileRow key={`s-${f.path}`} entry={f} section="staged" />)}
          </div>
        )}

        {visibleUnstaged.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Changes" count={visibleUnstaged.length} color="#d29922"
              actions={
                <>
                  <button className="staging-btn-sm" onClick={stageAll} title="Alle stagen">+ Alle</button>
                  <button className="staging-btn-sm danger" onClick={discardAll} title="Alle verwerfen">x Alle</button>
                </>
              }
            />
            {visibleUnstaged.map(f => <FileRow key={`u-${f.path}`} entry={f} section="unstaged" />)}
          </div>
        )}

        {visibleUntracked.length > 0 && (
          <div className="staging-section">
            <SectionHeader title="Untracked" count={visibleUntracked.length} color="#8b949e"
              actions={<button className="staging-btn-sm" onClick={stageAllUntracked} title="Alle untracked stagen">+ Alle</button>}
            />
            {visibleUntracked.map(f => <FileRow key={`t-${f.path}`} entry={f} section="untracked" />)}
          </div>
        )}
      </div>

      <div className="staging-commit-area">
        <textarea
          className="staging-commit-input"
          placeholder={hasOpenConflicts ? 'Konflikte aufloesen, danach committen...' : 'Commit-Nachricht...'}
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }}
          disabled={hasOpenConflicts}
        />
        <div className="staging-commit-bar" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: hasOpenConflicts ? '#f85149' : 'var(--text-secondary)' }}>
            {hasOpenConflicts ? 'Offene Konflikte blockieren Commit' : 'Ctrl+Enter'}
          </span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={amendCommit} onChange={(e) => setAmendCommit(e.target.checked)} />
            Amend
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={signoffCommit} onChange={(e) => setSignoffCommit(e.target.checked)} />
            Signoff
          </label>
          <div style={{ flex: 1 }} />
          <button
            className="staging-commit-btn"
            onClick={handleCommit}
            disabled={hasOpenConflicts || !commitMsg.trim() || isCommitting || !status || status.staged.length === 0}
          >
            {hasOpenConflicts
              ? `Konflikte (${status.conflicts.length})`
              : (isCommitting ? 'Committing...' : `Commit (${status?.staged.length || 0})`)
            }
          </button>
        </div>
      </div>

      {toast && (
        <div className={`action-toast ${toast.isError ? 'error' : 'success'}`}>
          {toast.isError ? 'x' : 'ok'} {toast.msg}
        </div>
      )}

      {confirmDialog && confirmDialog.variant === 'confirm' && (
        <Confirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {confirmDialog && confirmDialog.variant === 'danger' && (
        <DangerConfirm
          open={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          contextItems={confirmDialog.contextItems}
          irreversible={confirmDialog.irreversible}
          consequences={confirmDialog.consequences}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={executeConfirmDialog}
          onCancel={closeConfirmDialog}
        />
      )}

      {inputDialog && (
        <Input
          open={true}
          title={inputDialog.title}
          message={inputDialog.message}
          fields={inputDialog.fields}
          contextItems={inputDialog.contextItems}
          irreversible={inputDialog.irreversible}
          consequences={inputDialog.consequences}
          confirmLabel={inputDialog.confirmLabel}
          onSubmit={executeInputDialog}
          onCancel={closeInputDialog}
        />
      )}
    </div>
  );
};








