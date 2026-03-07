import React, { useEffect, useState } from 'react';
import { GitCommit, parseGitLog } from '../utils/gitParsing';

interface CommitGraphProps {
  repoPath: string | null;
}

export const CommitGraph: React.FC<CommitGraphProps> = ({ repoPath }) => {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoPath) {
      setCommits([]);
      return;
    }

    const fetchCommits = async () => {
      if (!window.electronAPI) return;
      setLoading(true);
      try {
        const { success, data, error } = await window.electronAPI.runGitCommand('log', '50');
        if (success && data) {
          setCommits(parseGitLog(data));
        } else {
          console.error('Failed to fetch commits:', error);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchCommits();
  }, [repoPath]);

  if (!repoPath) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>Bitte wähle ein Repository aus, um den Graphen zu sehen.</div>;
  }

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Lade Logs...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {commits.map((commit) => (
        <div key={commit.hash} style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-dark)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--border-radius)',
          gap: '16px'
        }}>
          {/* Simple Visual Node placeholder */}
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--commit-purple)', border: '2px solid var(--bg-darker)' }} />
          
          <div style={{ color: 'var(--accent-primary)', fontFamily: 'monospace', width: '70px' }}>
            {commit.abbrevHash}
          </div>
          <div style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {commit.subject}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', width: '100px', textAlign: 'right' }}>
            {commit.author}
          </div>
        </div>
      ))}
    </div>
  );
};
