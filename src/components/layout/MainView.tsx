import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import { TopbarActions } from '../topbar/TopbarActions';
import { CommitGraph } from '../CommitGraph';
import { CommitDetails } from '../CommitDetails';
import { StagingArea } from '../StagingArea';
import { DiffViewer } from '../DiffViewer';
import { RemoteSyncState } from '../../types/git';
import { DiffRequest } from '../../types/diff';

type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

type Props = {
  activeRepo: string | null;
  currentBranch: string;
  remoteSync: RemoteSyncState;
  remoteStatus: RemoteStatus;
  isGitActionRunning: boolean;
  activeGitActionLabel: string | null;
  selectedCommit: string | null;
  setSelectedCommit: (hash: string | null) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  showSecondaryHistory: boolean;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
};

const normalizeCommitHash = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = String(value).match(/[0-9a-f]{7,40}/i);
  return match ? match[0] : null;
};

export const MainView: React.FC<Props> = ({
  activeRepo,
  currentBranch,
  remoteSync,
  remoteStatus,
  isGitActionRunning,
  activeGitActionLabel,
  selectedCommit,
  setSelectedCommit,
  refreshTrigger,
  triggerRefresh,
  showSecondaryHistory,
  onFetch,
  onPull,
  onPush,
}) => {
  const [activeDiffRequest, setActiveDiffRequest] = useState<DiffRequest | null>(null);
  const [commitHistoryStack, setCommitHistoryStack] = useState<string[]>([]);

  useEffect(() => {
    setActiveDiffRequest(null);
    setCommitHistoryStack([]);
  }, [activeRepo]);

  const handleOpenDiff = useCallback((diffRequest: DiffRequest) => {
    setActiveDiffRequest((previous) => {
      if (
        previous &&
        previous.source === diffRequest.source &&
        previous.path === diffRequest.path &&
        previous.commitHash === diffRequest.commitHash
      ) {
        return previous;
      }
      return diffRequest;
    });
  }, []);

  const handleSelectCommitDirect = useCallback((hash: string | null) => {
    const normalized = normalizeCommitHash(hash);
    setCommitHistoryStack([]);
    setSelectedCommit(normalized);
  }, [setSelectedCommit]);

  const handleSelectCommitFromHistory = useCallback((hash: string) => {
    const normalized = normalizeCommitHash(hash);
    if (!normalized) return;

    if (!selectedCommit) {
      setSelectedCommit(normalized);
      return;
    }

    if (selectedCommit === normalized) return;

    setCommitHistoryStack(prev => [...prev, selectedCommit]);
    setSelectedCommit(normalized);
  }, [selectedCommit, setSelectedCommit]);

  const handleCommitBack = useCallback(() => {
    setCommitHistoryStack(prev => {
      if (prev.length === 0) return prev;
      const nextHash = normalizeCommitHash(prev[prev.length - 1]);
      setSelectedCommit(nextHash);
      return prev.slice(0, -1);
    });
  }, [setSelectedCommit]);

  const closeInspector = useCallback(() => {
    setCommitHistoryStack([]);
    setSelectedCommit(null);
  }, [setSelectedCommit]);

  return (
    <div className="main-view">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {activeRepo ? activeRepo.split(/[\\/]/).pop() : 'Git-Organizer'}
          </span>
          {currentBranch && (
            <span
              style={{
                fontSize: '0.8rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(57, 163, 71, 0.15)',
                color: '#3fb950',
                border: '1px solid rgba(57, 163, 71, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <GitBranch size={12} /> {currentBranch}
            </span>
          )}
          {activeRepo && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: remoteStatus.backgroundColor,
                color: remoteStatus.color,
                border: `1px solid ${remoteStatus.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={12} style={{ opacity: remoteSync.isFetching ? 1 : 0.7 }} />
              {remoteStatus.title}
            </span>
          )}
          {(isGitActionRunning || remoteSync.isFetching) && activeGitActionLabel && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(31, 111, 235, 0.14)',
                color: '#7cb8ff',
                border: '1px solid rgba(31, 111, 235, 0.28)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={12} className="spin" />
              {activeGitActionLabel}
            </span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <TopbarActions
          activeRepo={activeRepo}
          isGitActionRunning={isGitActionRunning}
          isFetching={remoteSync.isFetching}
          activeActionLabel={activeGitActionLabel}
          onFetch={onFetch}
          onPull={onPull}
          onPush={onPush}
          onStageCommit={() => handleSelectCommitDirect(null)}
        />
      </div>

      <div className="content-area">
        <div className="pane" style={{ flex: 2.35 }}>
          <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{activeDiffRequest ? 'Diff Viewer' : 'Commit Graph'}</span>
            {activeDiffRequest && (
              <button
                className="icon-btn"
                onClick={() => setActiveDiffRequest(null)}
                style={{ fontSize: '0.75rem', padding: '2px 6px' }}
              >
                Zurueck zum Graph
              </button>
            )}
          </div>
          <div className="pane-content" style={{ padding: 0 }}>
            {activeDiffRequest ? (
              <DiffViewer repoPath={activeRepo} request={activeDiffRequest} onClose={() => setActiveDiffRequest(null)} />
            ) : (
              <CommitGraph
                repoPath={activeRepo}
                selectedHash={selectedCommit}
                onSelectCommit={handleSelectCommitDirect}
                refreshTrigger={refreshTrigger}
                showSecondaryHistory={showSecondaryHistory}
              />
            )}
          </div>
        </div>

        <div className="pane">
          <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{selectedCommit ? 'Commit Inspector' : 'Working Directory'}</span>
            {selectedCommit && (
              <div style={{ display: 'flex', gap: '6px' }}>
                {commitHistoryStack.length > 0 && (
                  <button className="icon-btn" onClick={handleCommitBack} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                    Zurueck
                  </button>
                )}
                <button className="icon-btn" onClick={closeInspector} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                  Schliessen
                </button>
              </div>
            )}
          </div>
          <div className="pane-content" style={{ overflow: 'hidden' }}>
            {selectedCommit ? (
              <CommitDetails
                hash={selectedCommit}
                onSelectCommit={handleSelectCommitFromHistory}
                onOpenDiff={handleOpenDiff}
              />
            ) : (
              <StagingArea
                repoPath={activeRepo}
                onRepoChanged={triggerRefresh}
                onOpenDiff={handleOpenDiff}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
