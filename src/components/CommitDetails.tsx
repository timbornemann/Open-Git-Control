import React, { useEffect, useMemo, useState } from 'react';
import { CommitFileDetail, parseCommitDetails } from '../utils/gitParsing';
import { GitFileBlameLineDto, GitFileHistoryEntryDto } from '../types/git';
import { FileCode, FileEdit, FileMinus, FilePlus } from 'lucide-react';
import { DiffRequest } from '../types/diff';
import { useI18n } from '../i18n';

type DetailsTab = 'history' | 'blame' | 'patch';

interface CommitDetailsProps {
  hash: string;
  onSelectCommit?: (hash: string) => void;
  onOpenDiff?: (request: DiffRequest) => void;
}

export const CommitDetails: React.FC<CommitDetailsProps> = ({ hash, onSelectCommit, onOpenDiff }) => {
  const normalizedHash = useMemo(() => {
    const match = String(hash || '').match(/[0-9a-f]{7,40}/i);
    return match ? match[0] : '';
  }, [hash]);

  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesSourceHint, setFilesSourceHint] = useState<string | null>(null);
  const [isMergeCommit, setIsMergeCommit] = useState(false);
  const [files, setFiles] = useState<CommitFileDetail[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileCommitHash, setSelectedFileCommitHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GitFileHistoryEntryDto[]>([]);

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<GitFileBlameLineDto[]>([]);

  const { tr, locale } = useI18n();

  useEffect(() => {
    setSelectedFilePath(null);
    setSelectedFileCommitHash(null);
    setActiveTab('history');
    setHistoryEntries([]);
    setBlameLines([]);
    setHistoryError(null);
    setBlameError(null);
  }, [normalizedHash]);

  useEffect(() => {
    if (!normalizedHash || !window.electronAPI) return;

    const fetchDetails = async () => {
      setLoadingFiles(true);
      setFilesError(null);
      setFilesSourceHint(null);
      setIsMergeCommit(false);

      try {
        const parentsResult = await window.electronAPI.runGitCommand('show', '-s', '--format=%P', normalizedHash);
        const parents = parentsResult.success
          ? String(parentsResult.data || '').trim().split(/\s+/).filter(Boolean)
          : [];
        const mergeCommit = parents.length > 1;
        setIsMergeCommit(mergeCommit);

        const detailResult = await window.electronAPI.runGitCommand('commitDetails', normalizedHash);
        if (!detailResult.success) {
          setFiles([]);
          setFilesError(detailResult.error || tr('Commit-Details konnten nicht geladen werden.', 'Could not load commit details.'));
          return;
        }

        const directFiles = parseCommitDetails(String(detailResult.data || ''));
        if (directFiles.length > 0) {
          setFiles(directFiles);
          return;
        }

        if (mergeCommit) {
          const mergeRangeResult = await window.electronAPI.runGitCommand('diff', '--name-status', `${normalizedHash}^1`, normalizedHash);
          if (mergeRangeResult.success) {
            const mergedBranchFiles = parseCommitDetails(String(mergeRangeResult.data || ''));
            if (mergedBranchFiles.length > 0) {
              setFiles(mergedBranchFiles);
              setFilesSourceHint(tr('Dateien zeigen die effektiven Änderungen aus dem gemergten Branch (gegen Parent 1).', 'Files show the effective changes from the merged branch (against parent 1).'));
              return;
            }
          }
        }

        setFiles([]);
      } catch (fetchError) {
        console.error(fetchError);
        setFiles([]);
        setFilesError(tr('Commit-Details konnten nicht geladen werden.', 'Could not load commit details.'));
      } finally {
        setLoadingFiles(false);
      }
    };

    fetchDetails();
  }, [normalizedHash, tr]);

  const selectedFile = useMemo(
    () => selectedFileCommitHash === normalizedHash
      ? files.find(file => file.path === selectedFilePath) ?? null
      : null,
    [files, normalizedHash, selectedFileCommitHash, selectedFilePath],
  );
  const isDeletedFile = selectedFile?.status.startsWith('D') ?? false;

  useEffect(() => {
    if (!selectedFile || !window.electronAPI) return;

    const fetchHistory = async () => {
      if (activeTab !== 'history') return;

      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await window.electronAPI.getFileHistory(selectedFile.path, normalizedHash, 80);
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
  }, [activeTab, normalizedHash, selectedFile, tr]);

  useEffect(() => {
    if (!selectedFile || !window.electronAPI) return;

    const fetchBlame = async () => {
      if (activeTab !== 'blame') return;

      if (isDeletedFile) {
        setBlameLines([]);
        setBlameError(tr('Blame ist für gelöschte Dateien in diesem Commit nicht verfügbar.', 'Blame is not available for deleted files in this commit.'));
        return;
      }

      setBlameLoading(true);
      setBlameError(null);
      try {
        const result = await window.electronAPI.getFileBlame(selectedFile.path, normalizedHash);
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
  }, [activeTab, normalizedHash, isDeletedFile, selectedFile, tr]);

  useEffect(() => {
    if (!selectedFile || activeTab !== 'patch' || !normalizedHash) return;

    onOpenDiff?.({
      source: 'commit',
      path: selectedFile.path,
      commitHash: normalizedHash,
      title: tr(`Commit Diff ${normalizedHash.slice(0, 8)}`, `Commit diff ${normalizedHash.slice(0, 8)}`),
    });
  }, [activeTab, normalizedHash, onOpenDiff, selectedFile, tr]);

  const getIconForStatus = (status: string) => {
    switch (status[0]) {
      case 'A':
        return <FilePlus size={14} color="var(--status-success)" />;
      case 'D':
        return <FileMinus size={14} color="var(--status-danger)" />;
      case 'M':
        return <FileEdit size={14} color="var(--status-warning)" />;
      default:
        return <FileCode size={14} color="var(--status-untracked)" />;
    }
  };

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

  const formatRelativeDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return '-';

    const now = Date.now();
    const diffMs = now - parsed.getTime();
    const absMs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (absMs < minute) return tr('gerade eben', 'just now');
    if (absMs < hour) return tr('vor ' + Math.max(1, Math.round(absMs / minute)) + ' Min', Math.max(1, Math.round(absMs / minute)) + ' min ago');
    if (absMs < day) return tr('vor ' + Math.max(1, Math.round(absMs / hour)) + ' Std', Math.max(1, Math.round(absMs / hour)) + ' h ago');
    const days = Math.max(1, Math.round(absMs / day));
    return tr('vor ' + days + ' Tag' + (days === 1 ? '' : 'en'), days + ' day' + (days === 1 ? '' : 's') + ' ago');
  };

  const formatBlameDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleDateString(locale, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="commit-details-panel" style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
          {tr('Commit Details', 'Commit details')}: {normalizedHash ? normalizedHash.substring(0, 8) : tr('ungültig', 'invalid')}
        </h4>
        {selectedFile && (
          <button className="icon-btn" onClick={() => { setSelectedFilePath(null); setSelectedFileCommitHash(null); }} style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
            {tr('Dateien', 'Files')}
          </button>
        )}
      </div>

      {!normalizedHash ? (
        <div style={{ color: 'var(--status-danger)', fontSize: '0.84rem', border: '1px solid var(--status-danger-border)', borderRadius: 6, padding: '8px 10px' }}>
          {tr('Ungültige Commit-ID.', 'Invalid commit ID.')}
        </div>
      ) : loadingFiles ? (
        <p style={{ color: 'var(--text-secondary)' }}>{tr('Lade Details...', 'Loading details...')}</p>
      ) : filesError ? (
        <div style={{ color: 'var(--status-danger)', fontSize: '0.84rem', border: '1px solid var(--status-danger-border)', borderRadius: 6, padding: '8px 10px' }}>
          {filesError}
        </div>
      ) : !selectedFile ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filesSourceHint && (
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 8px', backgroundColor: 'var(--bg-panel)' }}>
              {filesSourceHint}
            </li>
          )}
          {files.map((file, index) => (
            <li key={`${file.path}-${index}`}>
              <button
                onClick={() => { setSelectedFilePath(file.path); setSelectedFileCommitHash(normalizedHash); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 8px', cursor: 'pointer', textAlign: 'left' }}
              >
                {getIconForStatus(file.status)}
                <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.path}</span>
              </button>
            </li>
          ))}
          {files.length === 0 && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {isMergeCommit ? tr('Keine effektiven Dateiänderungen gegen Parent 1 gefunden.', 'No effective file changes against parent 1 found.') : tr('Keine Dateien geändert.', 'No files changed.')}
            </span>
          )}
        </ul>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{tr('Datei', 'File')}</div>
          <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 8px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {selectedFile.path}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
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
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {tr('Verlauf dieser Datei. Klick auf einen Eintrag öffnet den kompletten Commit rechts.', 'History of this file. Click an entry to open the full commit on the right.')}
              </span>
              {historyLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Lade Historie...', 'Loading history...')}</span>}
              {historyError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{historyError}</span>}
              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Keine Historie gefunden.', 'No history found.')}</span>
              )}
              {!historyLoading && !historyError && historyEntries.map(entry => {
                const normalizedEntryHash = (entry.hash.match(/[0-9a-f]{7,40}/i) || [''])[0];
                const isCurrentCommit = normalizedEntryHash === normalizedHash;
                return (
                  <button
                    key={`${entry.hash}-${entry.subject}`}
                    onClick={() => normalizedEntryHash && onSelectCommit?.(normalizedEntryHash)}
                    style={{ width: '100%', textAlign: 'left', border: isCurrentCommit ? '1px solid var(--accent-primary-border)' : '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: isCurrentCommit ? 'var(--accent-primary-soft)' : 'var(--bg-panel)', padding: '8px 9px', cursor: onSelectCommit ? 'pointer' : 'default', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}
                    disabled={!normalizedEntryHash}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {entry.abbrevHash || (normalizedEntryHash ? normalizedEntryHash.slice(0, 8) : tr('ungültig', 'invalid'))}
                      </span>
                      {isCurrentCommit && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, backgroundColor: 'var(--accent-primary-soft)', color: 'var(--text-accent)' }}>
                          {tr('Aktuell', 'Current')}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.84rem', color: entry.subject ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {entry.subject || tr('(ohne Nachricht)', '(no message)')}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      {entry.author || '-'} | {formatDate(entry.date)} | {formatRelativeDate(entry.date)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'blame' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {tr('Blame zeigt pro Zeile, aus welchem Commit sie zuletzt stammt.', 'Blame shows for each line which commit last touched it.')}
              </span>
              {blameLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Lade Blame...', 'Loading blame...')}</span>}
              {blameError && <span style={{ color: 'var(--status-danger)', fontSize: '0.82rem' }}>{blameError}</span>}
              {!blameLoading && !blameError && blameLines.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{tr('Keine Blame-Daten gefunden.', 'No blame data found.')}</span>
              )}
              {!blameLoading && !blameError && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '56px 80px 120px 60px 1fr', gap: '8px', padding: '6px 8px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--accent-primary-softer)', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <span>{tr('Zeile', 'Line')}</span><span>{tr('Commit', 'Commit')}</span><span>{tr('Autor', 'Author')}</span><span>{tr('Datum', 'Date')}</span><span>{tr('Inhalt', 'Content')}</span>
                  </div>
                  <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    {blameLines.map((line, index) => (
                      <div
                        key={`${line.lineNumber}-${line.commitHash}`}
                        style={{ display: 'grid', gridTemplateColumns: '56px 80px 120px 60px 1fr', gap: '8px', alignItems: 'start', padding: '5px 8px', borderBottom: '1px solid var(--line-subtle)', fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-primary)', backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--accent-primary-softer)' }}
                        title={`${line.author} - ${line.summary}`}
                      >
                        <span style={{ color: 'var(--text-secondary)' }}>{line.lineNumber}</span>
                        <button
                          onClick={() => onSelectCommit?.(line.commitHash)}
                          style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--accent-primary)', textAlign: 'left', cursor: onSelectCommit ? 'pointer' : 'default', fontFamily: 'monospace', fontSize: '0.76rem' }}
                        >
                          {line.abbrevHash}
                        </button>
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line.author || '-'}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{formatBlameDate(line.authorTime)}</span>
                        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line.content}</span>
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
              <button
                className="staging-tool-btn"
                onClick={() => onOpenDiff?.({ source: 'commit', path: selectedFile.path, commitHash: normalizedHash, title: tr(`Commit Diff ${normalizedHash.slice(0, 8)}`, `Commit diff ${normalizedHash.slice(0, 8)}`) })}
              >
                {tr('Diff erneut im Hauptfenster anzeigen', 'Show diff again in main window')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
