import React, { useEffect, useMemo, useState } from 'react';
import { CommitFileDetail, parseCommitDetails } from '../utils/gitParsing';
import { GitFileBlameLineDto, GitFileHistoryEntryDto } from '../types/git';
import { FileCode, FileEdit, FileMinus, FilePlus } from 'lucide-react';
import { DiffRequest } from '../types/diff';

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
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GitFileHistoryEntryDto[]>([]);

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<GitFileBlameLineDto[]>([]);

  useEffect(() => {
    if (!normalizedHash || !window.electronAPI) return;

    const fetchDetails = async () => {
      setLoadingFiles(true);
      setFilesError(null);
      setFilesSourceHint(null);
      setIsMergeCommit(false);
      setSelectedFilePath(null);
      setActiveTab('history');
      setHistoryEntries([]);
      setBlameLines([]);
      setHistoryError(null);
      setBlameError(null);

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
          setFilesError(detailResult.error || 'Commit-Details konnten nicht geladen werden.');
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
              setFilesSourceHint('Dateien zeigen die effektiven Aenderungen aus dem gemergten Branch (gegen Parent 1).');
              return;
            }
          }
        }

        setFiles([]);
      } catch (fetchError) {
        console.error(fetchError);
        setFiles([]);
        setFilesError('Commit-Details konnten nicht geladen werden.');
      } finally {
        setLoadingFiles(false);
      }
    };

    fetchDetails();
  }, [normalizedHash]);

  const selectedFile = useMemo(
    () => files.find(file => file.path === selectedFilePath) ?? null,
    [files, selectedFilePath],
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
          setHistoryError(result.error || 'Datei-Historie konnte nicht geladen werden.');
        }
      } catch (fetchError) {
        console.error(fetchError);
        setHistoryEntries([]);
        setHistoryError('Datei-Historie konnte nicht geladen werden.');
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [activeTab, normalizedHash, selectedFile]);

  useEffect(() => {
    if (!selectedFile || !window.electronAPI) return;

    const fetchBlame = async () => {
      if (activeTab !== 'blame') return;

      if (isDeletedFile) {
        setBlameLines([]);
        setBlameError('Blame ist fuer geloeschte Dateien in diesem Commit nicht verfuegbar.');
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
          setBlameError(result.error || 'Blame-Daten konnten nicht geladen werden.');
        }
      } catch (fetchError) {
        console.error(fetchError);
        setBlameLines([]);
        setBlameError('Blame-Daten konnten nicht geladen werden.');
      } finally {
        setBlameLoading(false);
      }
    };

    fetchBlame();
  }, [activeTab, normalizedHash, isDeletedFile, selectedFile]);

  useEffect(() => {
    if (!selectedFile || activeTab !== 'patch' || !normalizedHash) return;

    onOpenDiff?.({
      source: 'commit',
      path: selectedFile.path,
      commitHash: normalizedHash,
      title: `Commit Diff ${normalizedHash.slice(0, 8)}`,
    });
  }, [activeTab, normalizedHash, onOpenDiff, selectedFile]);

  const getIconForStatus = (status: string) => {
    switch (status[0]) {
      case 'A':
        return <FilePlus size={14} color="#4ade80" />;
      case 'D':
        return <FileMinus size={14} color="#f87171" />;
      case 'M':
        return <FileEdit size={14} color="#fbbf24" />;
      default:
        return <FileCode size={14} color="#9ca3af" />;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleString('de-DE', {
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

    if (absMs < minute) return 'gerade eben';
    if (absMs < hour) return 'vor ' + Math.max(1, Math.round(absMs / minute)) + ' Min';
    if (absMs < day) return 'vor ' + Math.max(1, Math.round(absMs / hour)) + ' Std';
    const days = Math.max(1, Math.round(absMs / day));
    return 'vor ' + days + ' Tag' + (days === 1 ? '' : 'en');
  };

  const formatBlameDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleDateString('de-DE', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="commit-details-panel" style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
          Commit Details: {normalizedHash ? normalizedHash.substring(0, 8) : 'ungueltig'}
        </h4>
        {selectedFile && (
          <button className="icon-btn" onClick={() => setSelectedFilePath(null)} style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
            Dateien
          </button>
        )}
      </div>

      {!normalizedHash ? (
        <div style={{ color: '#f87171', fontSize: '0.84rem', border: '1px solid rgba(248,81,73,0.35)', borderRadius: 6, padding: '8px 10px' }}>
          Ungueltige Commit-ID.
        </div>
      ) : loadingFiles ? (
        <p style={{ color: 'var(--text-secondary)' }}>Lade Details...</p>
      ) : filesError ? (
        <div style={{ color: '#f87171', fontSize: '0.84rem', border: '1px solid rgba(248,81,73,0.35)', borderRadius: 6, padding: '8px 10px' }}>
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
                onClick={() => setSelectedFilePath(file.path)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 8px', cursor: 'pointer', textAlign: 'left' }}
              >
                {getIconForStatus(file.status)}
                <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.path}</span>
              </button>
            </li>
          ))}
          {files.length === 0 && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {isMergeCommit ? 'Keine effektiven Dateiaenderungen gegen Parent 1 gefunden.' : 'Keine Dateien geaendert.'}
            </span>
          )}
        </ul>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Datei</div>
          <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 8px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {selectedFile.path}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {(['history', 'blame', 'patch'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border-color)', backgroundColor: activeTab === tab ? 'var(--accent-primary)' : 'var(--bg-panel)', color: activeTab === tab ? '#ffffff' : 'var(--text-primary)', cursor: 'pointer' }}
              >
                {tab === 'history' ? 'History' : tab === 'blame' ? 'Blame' : 'Patch'}
              </button>
            ))}
          </div>

          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Verlauf dieser Datei. Klick auf einen Eintrag oeffnet den kompletten Commit rechts.
              </span>
              {historyLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Lade History...</span>}
              {historyError && <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{historyError}</span>}
              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Keine Historie gefunden.</span>
              )}
              {!historyLoading && !historyError && historyEntries.map(entry => {
                const normalizedEntryHash = (entry.hash.match(/[0-9a-f]{7,40}/i) || [''])[0];
                const isCurrentCommit = normalizedEntryHash === normalizedHash;
                return (
                  <button
                    key={`${entry.hash}-${entry.subject}`}
                    onClick={() => normalizedEntryHash && onSelectCommit?.(normalizedEntryHash)}
                    style={{ width: '100%', textAlign: 'left', border: isCurrentCommit ? '1px solid rgba(31, 111, 235, 0.5)' : '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: isCurrentCommit ? 'rgba(31, 111, 235, 0.12)' : 'var(--bg-panel)', padding: '8px 9px', cursor: onSelectCommit ? 'pointer' : 'default', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}
                    disabled={!normalizedEntryHash}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {entry.abbrevHash || (normalizedEntryHash ? normalizedEntryHash.slice(0, 8) : 'ungueltig')}
                      </span>
                      {isCurrentCommit && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, backgroundColor: 'rgba(31,111,235,0.25)', color: '#7cb8ff' }}>
                          Aktuell
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.84rem', color: entry.subject ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {entry.subject || '(ohne Nachricht)'}
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
                Blame zeigt pro Zeile, aus welchem Commit sie zuletzt stammt.
              </span>
              {blameLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Lade Blame...</span>}
              {blameError && <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{blameError}</span>}
              {!blameLoading && !blameError && blameLines.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Keine Blame-Daten gefunden.</span>
              )}
              {!blameLoading && !blameError && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '56px 80px 120px 60px 1fr', gap: '8px', padding: '6px 8px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255, 255, 255, 0.03)', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <span>Zeile</span><span>Commit</span><span>Autor</span><span>Datum</span><span>Inhalt</span>
                  </div>
                  <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    {blameLines.map((line, index) => (
                      <div
                        key={`${line.lineNumber}-${line.commitHash}`}
                        style={{ display: 'grid', gridTemplateColumns: '56px 80px 120px 60px 1fr', gap: '8px', alignItems: 'start', padding: '5px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-primary)', backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)' }}
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
                Diff im Hauptfenster geoeffnet. Nutze dort Unified/Side-by-Side und Hunk-Navigation.
              </span>
              <button
                className="staging-tool-btn"
                onClick={() => onOpenDiff?.({ source: 'commit', path: selectedFile.path, commitHash: normalizedHash, title: `Commit Diff ${normalizedHash.slice(0, 8)}` })}
              >
                Diff erneut im Hauptfenster anzeigen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
