import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Rocket } from 'lucide-react';
import { useI18n } from '../../i18n';

type Props = {
  activeRepo: string | null;
  isGitActionRunning: boolean;
  isFetching: boolean;
  activeActionLabel: string | null;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onStageCommit: () => void;
  onOpenReleaseCreator: () => void;
};

export const TopbarActions: React.FC<Props> = ({ activeRepo, isGitActionRunning, isFetching, activeActionLabel, onFetch, onPull, onPush, onStageCommit, onOpenReleaseCreator }) => {
  const { tr } = useI18n();
  const normalizedAction = (activeActionLabel || '').toLowerCase();
  const isPullRunning = isGitActionRunning && normalizedAction.includes('pull');
  const isPushRunning = isGitActionRunning && normalizedAction.includes('push');

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button className="icon-btn" onClick={onFetch} disabled={!activeRepo || isGitActionRunning || isFetching} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', fontSize: '0.85rem', padding: '6px 12px' }}>
        <RefreshCw size={16} className={isFetching ? 'spin' : ''} style={{ marginRight: '6px' }} />
        {isFetching ? tr('Fetch laeuft...', 'Fetch running...') : 'Fetch'}
      </button>
      <button className="icon-btn" onClick={onPull} disabled={!activeRepo || isGitActionRunning} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', fontSize: '0.85rem', padding: '6px 12px' }}>
        <ArrowDownCircle size={16} className={isPullRunning ? 'spin' : ''} style={{ marginRight: '6px' }} />
        {isPullRunning ? tr('Pull laeuft...', 'Pull running...') : 'Pull'}
      </button>
      <button className="icon-btn" onClick={onPush} disabled={!activeRepo || isGitActionRunning} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', fontSize: '0.85rem', padding: '6px 12px' }}>
        <ArrowUpCircle size={16} className={isPushRunning ? 'spin' : ''} style={{ marginRight: '6px' }} />
        {isPushRunning ? tr('Push laeuft...', 'Push running...') : 'Push'}
      </button>
      <button className="icon-btn" onClick={onOpenReleaseCreator} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', fontSize: '0.85rem', padding: '6px 12px' }} disabled={!activeRepo}>
        <Rocket size={16} style={{ marginRight: '6px' }} />
        {tr('Release', 'Release')}
      </button>
      <button className="icon-btn" onClick={onStageCommit} style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--on-accent)', fontSize: '0.85rem', padding: '6px 12px' }} disabled={!activeRepo}>{tr('Stagen / Commit', 'Stage / Commit')}</button>
    </div>
  );
};
