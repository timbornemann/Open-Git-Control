import React from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import { TopbarActions } from '../topbar/TopbarActions';
import { CommitGraph } from '../CommitGraph';
import { CommitDetails } from '../CommitDetails';
import { StagingArea } from '../StagingArea';
import { RemoteSyncState } from '../../types/git';

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
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
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
  onFetch,
  onPull,
  onPush,
}) => (
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
        onStageCommit={() => setSelectedCommit(null)}
      />
    </div>

    <div className="content-area">
      <div className="pane" style={{ flex: 2 }}>
        <div className="pane-header">Commit Graph</div>
        <div className="pane-content" style={{ padding: 0 }}>
          <CommitGraph
            repoPath={activeRepo}
            selectedHash={selectedCommit}
            onSelectCommit={setSelectedCommit}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>
      <div className="pane">
        <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selectedCommit ? 'Commit Inspector' : 'Working Directory'}</span>
          {selectedCommit && (
            <button className="icon-btn" onClick={() => setSelectedCommit(null)} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
              ? Schlieﬂen
            </button>
          )}
        </div>
        <div className="pane-content" style={{ overflow: 'hidden' }}>
          {selectedCommit ? (
            <CommitDetails hash={selectedCommit} onSelectCommit={setSelectedCommit} />
          ) : (
            <StagingArea repoPath={activeRepo} onRepoChanged={triggerRefresh} />
          )}
        </div>
      </div>
    </div>
  </div>
);
