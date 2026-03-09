import React, { useEffect, useState } from 'react';
import { CommitFileDetail, parseCommitDetails } from '../utils/gitParsing';
import { FilePlus, FileMinus, FileEdit, FileCode } from 'lucide-react';

interface CommitDetailsProps {
  hash: string;
}

export const CommitDetails: React.FC<CommitDetailsProps> = ({ hash }) => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<CommitFileDetail[]>([]);

  useEffect(() => {
    if (!hash || !window.electronAPI) return;

    const fetchDetails = async () => {
      setLoading(true);
      try {
        const { success, data } = await window.electronAPI.runGitCommand('commitDetails', hash);
        if (success && data) {
          const parsed = parseCommitDetails(data);
          setFiles(parsed);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [hash]);

  const getIconForStatus = (status: string) => {
    switch(status[0]) {
      case 'A': return <FilePlus size={14} color="#4ade80" />;
      case 'D': return <FileMinus size={14} color="#f87171" />;
      case 'M': return <FileEdit size={14} color="#fbbf24" />;
      default: return <FileCode size={14} color="#9ca3af" />;
    }
  };

  return (
    <div className="commit-details-panel" style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
      <h4 style={{ marginBottom: '12px', color: 'var(--text-primary)' }}>Commit Details: {hash.substring(0, 8)}</h4>
      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Lade Details...</p> : (
         <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
           {files.map((file, i) => (
             <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {getIconForStatus(file.status)}
                <span style={{ fontFamily: 'monospace' }}>{file.path}</span>
             </li>
           ))}
           {files.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Keine Dateien geändert.</span>}
         </ul>
      )}
    </div>
  );
};
