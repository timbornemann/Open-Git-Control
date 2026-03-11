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
  const [loadingFiles, setLoadingFiles] = useState(false);
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
    if (!hash || !window.electronAPI) return;

    const fetchDetails = async () => {
      setLoadingFiles(true);
      setSelectedFilePath(null);
      setActiveTab('history');
      setHistoryEntries([]);
      setBlameLines([]);
      setHistoryError(null);
      setBlameError(null);

      try {
        const { success, data } = await window.electronAPI.runGitCommand('commitDetails', hash);
        if (success && data) {
          setFiles(parseCommitDetails(data));
        } else {
          setFiles([]);
        }
      } catch (error) {
        console.error(error);
        setFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    };

    fetchDetails();
  }, [hash]);

  const selectedFile = useMemo(
    () => files.find(file => file.path === selectedFilePath) ?? null,
    [files, selectedFilePath],
  );

  useEffect(() => {
    if (!selectedFile || !window.electronAPI) return;

    const fetchHistory = async () => {
      if (activeTab !== 'history') return;

      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await window.electronAPI.getFileHistory(selectedFile.path, hash, 80);
        if (result.success) {
          setHistoryEntries(result.data || []);
        } else {
          setHistoryEntries([]);
          setHistoryError(result.error || 'Datei-Historie konnte nicht geladen werden.');
        }
      } catch (error) {
        console.error(error);
        setHistoryEntries([]);
        setHistoryError('Datei-Historie konnte nicht geladen werden.');
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [activeTab, hash, selectedFile]);

  useEffect(() => {
    if (!selectedFile || !window.electronAPI) return;

    const fetchBlame = async () => {
      if (activeTab !== 'blame') return;

      setBlameLoading(true);
      setBlameError(null);
      try {
        const result = await window.electronAPI.getFileBlame(selectedFile.path, hash);
        if (result.success) {
          setBlameLines(result.data || []);
        } else {
          setBlameLines([]);
          setBlameError(result.error || 'Blame-Daten konnten nicht geladen werden.');
        }
      } catch (error) {
        console.error(error);
        setBlameLines([]);
        setBlameError('Blame-Daten konnten nicht geladen werden.');
      } finally {
        setBlameLoading(false);
      }
    };

    fetchBlame();
  }, [activeTab, hash, selectedFile]);

  useEffect(() => {
    if (!selectedFile || activeTab !== 'patch') return;

    onOpenDiff?.({
      source: 'commit',
      path: selectedFile.path,
      commitHash: hash,
      title: `Commit Diff ${hash.slice(0, 8)}`,
    });
  }, [activeTab, hash, onOpenDiff, selectedFile]);

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
    if (!dateString) return '';
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

  return (
    <div className="commit-details-panel" style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Commit Details: {hash.substring(0, 8)}</h4>
        {selectedFile && (
          <button
            className="icon-btn"
            onClick={() => setSelectedFilePath(null)}
            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
          >
            Dateien
          </button>
        )}
      </div>

      {loadingFiles ? (
        <p style={{ color: 'var(--text-secondary)' }}>Lade Details...</p>
      ) : !selectedFile ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {files.map((file, index) => (
            <li key={`${file.path}-${index}`}>
              <button
                onClick={() => setSelectedFilePath(file.path)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '7px 8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {getIconForStatus(file.status)}
                <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.path}</span>
              </button>
            </li>
          ))}
          {files.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Keine Dateien geaendert.</span>}
        </ul>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Datei</div>
          <div
            style={{
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '7px 8px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedFile.path}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {(['history', 'blame', 'patch'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  fontSize: '0.78rem',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: activeTab === tab ? 'var(--accent-primary)' : 'var(--bg-panel)',
                  color: activeTab === tab ? '#ffffff' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {tab === 'history' ? 'History' : tab === 'blame' ? 'Blame' : 'Patch'}
              </button>
            ))}
          </div>

          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {historyLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Lade History...</span>}
              {historyError && <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{historyError}</span>}
              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Keine Historie gefunden.</span>
              )}
              {!historyLoading && !historyError && historyEntries.map(entry => (
                <button
                  key={`${entry.hash}-${entry.subject}`}
                  onClick={() => onSelectCommit?.(entry.hash)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-panel)',
                    padding: '7px 8px',
                    cursor: onSelectCommit ? 'pointer' : 'default',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{entry.abbrevHash}</span>
                  <span style={{ fontSize: '0.84rem' }}>{entry.subject || '(ohne Nachricht)'}</span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{entry.author} - {formatDate(entry.date)}</span>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'blame' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {blameLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Lade Blame...</span>}
              {blameError && <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{blameError}</span>}
              {!blameLoading && !blameError && blameLines.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Keine Blame-Daten gefunden.</span>
              )}
              {!blameLoading && !blameError && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                  {blameLines.map(line => (
                    <div
                      key={`${line.lineNumber}-${line.commitHash}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '52px 76px 1fr',
                        gap: '8px',
                        alignItems: 'start',
                        padding: '5px 8px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        fontFamily: 'monospace',
                        fontSize: '0.76rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{line.lineNumber}</span>
                      <button
                        onClick={() => onSelectCommit?.(line.commitHash)}
                        style={{
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--accent-primary)',
                          textAlign: 'left',
                          cursor: onSelectCommit ? 'pointer' : 'default',
                          fontFamily: 'monospace',
                          fontSize: '0.76rem',
                        }}
                        title={`${line.author} - ${line.summary}`}
                      >
                        {line.abbrevHash}
                      </button>
                      <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line.content}</span>
                    </div>
                  ))}
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
                onClick={() => onOpenDiff?.({ source: 'commit', path: selectedFile.path, commitHash: hash, title: `Commit Diff ${hash.slice(0, 8)}` })}
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
