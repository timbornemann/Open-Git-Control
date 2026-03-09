import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';

type Props = {
  activeRepo: string | null;
  isGitActionRunning: boolean;
  isFetching: boolean;
  activeActionLabel: string | null;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onStageCommit: () => void;
};

export const TopbarActions: React.FC<Props> = ({ activeRepo, isGitActionRunning, isFetching, activeActionLabel, onFetch, onPull, onPush, onStageCommit }) => (
  <div style={{ display: 'flex', gap: '8px' }}>
    <button className="icon-btn" onClick={onFetch} disabled={!activeRepo || isGitActionRunning || isFetching} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', fontSize: '0.85rem', padding: '6px 12px' }}>
      <RefreshCw size={16} className={isFetching ? 'spin' : ''} style={{ marginRight: '6px' }} />
      {isFetching ? 'Fetch läuft...' : 'Fetch'}
    </button>
    <button className="icon-btn" onClick={onPull} disabled={!activeRepo || isGitActionRunning} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', fontSize: '0.85rem', padding: '6px 12px' }}>
      <ArrowDownCircle size={16} className={isGitActionRunning && activeActionLabel === 'Pull wird ausgefuehrt...' ? 'spin' : ''} style={{ marginRight: '6px' }} />
      {isGitActionRunning && activeActionLabel === 'Pull wird ausgefuehrt...' ? 'Pull läuft...' : 'Pull'}
    </button>
    <button className="icon-btn" onClick={onPush} disabled={!activeRepo || isGitActionRunning} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', fontSize: '0.85rem', padding: '6px 12px' }}>
      <ArrowUpCircle size={16} className={isGitActionRunning && activeActionLabel === 'Push wird ausgefuehrt...' ? 'spin' : ''} style={{ marginRight: '6px' }} />
      {isGitActionRunning && activeActionLabel === 'Push wird ausgefuehrt...' ? 'Push läuft...' : 'Push'}
    </button>
    <button className="icon-btn" onClick={onStageCommit} style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', fontSize: '0.85rem', padding: '6px 12px' }} disabled={!activeRepo}>Stage / Commit</button>
  </div>
);
