import React, { useEffect, useMemo, useState } from 'react';
import { GitFileBlameLineDto, GitFileHistoryEntryDto } from '../types/git';
import { DiffRequest, DiffSource } from '../types/diff';
import { useI18n } from '../i18n';

type DetailsTab = 'history' | 'blame' | 'patch';

interface WorkingTreeFileDetailsProps {
  path: string;
  source: Extract<DiffSource, 'staged' | 'unstaged'>;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
}

export const WorkingTreeFileDetails: React.FC<WorkingTreeFileDetailsProps> = ({ path, source, onSelectCommit, onOpenDiff }) => {
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GitFileHistoryEntryDto[]>([]);

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<GitFileBlameLineDto[]>([]);

  const { tr, locale } = useI18n();

  const sourceLabel = useMemo(
    () => source === 'staged' ? tr('Staged Änderungen', 'Staged changes') : tr('Unstaged Änderungen', 'Unstaged changes'),
    [source, tr],
  );

  useEffect(() => {
    setActiveTab('history');
    setHistoryError(null);
    setHistoryEntries([]);
    setBlameError(null);
    setBlameLines([]);
  }, [path, source]);

  useEffect(() => {
    if (activeTab !== 'history' || !path || !window.electronAPI) return;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await window.electronAPI.getFileHistory(path, 'HEAD', 80);
        if (result.success) {
          setHistoryEntries(result.data || []);
        } else {
          setHistoryEntries([]);
          setHistoryError(result.error || tr('Datei-Historie konnte nicht geladen werden.', 'Could not load file history.'));
        }
      } catch (fetchError) {
        console.error(fetchError);
        setHistoryEntries([]);
        setHistoryError(tr('Datei-Historie konnte nicht geladen werden.', 'Could not load file history.'));
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [activeTab, path, tr]);

  useEffect(() => {
    if (activeTab !== 'blame' || !path || !window.electronAPI) return;

    const fetchBlame = async () => {
      setBlameLoading(true);
      setBlameError(null);
      try {
        const result = await window.electronAPI.getFileBlame(path, 'HEAD');
        if (result.success) {
          setBlameLines(result.data || []);
        } else {
          setBlameLines([]);
          setBlameError(result.error || tr('Blame-Daten konnten nicht geladen werden.', 'Could not load blame data.'));
        }
      } catch (fetchError) {
        console.error(fetchError);
        setBlameLines([]);
        setBlameError(tr('Blame-Daten konnten nicht geladen werden.', 'Could not load blame data.'));
      } finally {
        setBlameLoading(false);
      }
    };

    fetchBlame();
  }, [activeTab, path, tr]);

  useEffect(() => {
    if (activeTab !== 'patch' || !path) return;

    onOpenDiff?.({
      source,
      path,
      title: tr(`Working Tree Diff`, 'Working tree diff'),
    });
  }, [activeTab, onOpenDiff, path, source, tr]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="commit-details-panel" style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{tr('Datei-Inspector', 'File inspector')}</h4>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{sourceLabel}</span>
        <code style={{ fontSize: '0.76rem', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 8px', overflowX: 'auto', whiteSpace: 'nowrap' }}>{path}</code>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {(['history', 'blame', 'patch'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border-color)', backgroundColor: activeTab === tab ? 'var(--accent-primary)' : 'var(--bg-panel)', color: activeTab === tab ? 'var(--on-accent)' : 'var(--text-primary)', cursor: 'pointer' }}
          >
            {tab === 'history' ? tr('Historie', 'History') : tab === 'blame' ? 'Blame' : 'Patch'}
          </button>
        ))}
      </div>

      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {historyLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Lade Historie...', 'Loading history...')}</span>}
          {historyError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{historyError}</span>}
          {!historyLoading && !historyError && historyEntries.length === 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Keine Historie gefunden.', 'No history found.')}</span>
          )}
          {!historyLoading && !historyError && historyEntries.map(entry => (
            <button
              key={`${entry.hash}-${entry.subject}`}
              onClick={() => onSelectCommit?.(entry.hash)}
              style={{ width: '100%', textAlign: 'left', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', padding: '8px 9px', cursor: onSelectCommit ? 'pointer' : 'default', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{entry.abbrevHash}</span>
              <span style={{ fontSize: '0.84rem' }}>{entry.subject || tr('(ohne Nachricht)', '(no message)')}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{entry.author || '-'} | {formatDate(entry.date)}</span>
            </button>
          ))}
        </div>
      )}

      {activeTab === 'blame' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {blameLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Lade Blame...', 'Loading blame...')}</span>}
          {blameError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{blameError}</span>}
          {!blameLoading && !blameError && blameLines.length === 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Keine Blame-Daten gefunden.', 'No blame data found.')}</span>
          )}
          {!blameLoading && !blameError && blameLines.length > 0 && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                {blameLines.map(line => (
                  <div key={`${line.lineNumber}-${line.commitHash}`} style={{ display: 'grid', gridTemplateColumns: '50px 72px 1fr', gap: '8px', alignItems: 'start', padding: '5px 8px', borderBottom: '1px solid var(--line-subtle)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{line.lineNumber}</span>
                    <button onClick={() => onSelectCommit?.(line.commitHash)} style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--accent-primary)', textAlign: 'left', cursor: onSelectCommit ? 'pointer' : 'default', fontFamily: 'monospace', fontSize: '0.75rem' }}>{line.abbrevHash}</button>
                    <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>{line.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'patch' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            {tr('Diff im Hauptfenster geöffnet. Nutze dort Unified/Side-by-Side und Hunk-Navigation.', 'Diff opened in the main window. Use Unified/Side-by-Side and hunk navigation there.')}
          </span>
          <button className="staging-tool-btn" onClick={() => onOpenDiff?.({ source, path, title: tr('Working Tree Diff', 'Working tree diff') })}>
            {tr('Diff erneut im Hauptfenster anzeigen', 'Show diff again in main window')}
          </button>
        </div>
      )}
    </div>
  );
};

