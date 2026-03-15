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
    <div className="topbar-actions">
      <button className="icon-btn topbar-action-btn topbar-action-btn-sync" onClick={onFetch} disabled={!activeRepo || isGitActionRunning || isFetching}>
        <RefreshCw size={16} className={isFetching ? 'spin' : ''} style={{ marginRight: '6px' }} />
        Fetch
      </button>
      <button className="icon-btn topbar-action-btn topbar-action-btn-sync" onClick={onPull} disabled={!activeRepo || isGitActionRunning}>
        <ArrowDownCircle size={16} className={isPullRunning ? 'spin' : ''} style={{ marginRight: '6px' }} />
        Pull
      </button>
      <button className="icon-btn topbar-action-btn topbar-action-btn-sync" onClick={onPush} disabled={!activeRepo || isGitActionRunning}>
        <ArrowUpCircle size={16} className={isPushRunning ? 'spin' : ''} style={{ marginRight: '6px' }} />
        Push
      </button>
      <button className="icon-btn topbar-action-btn" onClick={onOpenReleaseCreator} disabled={!activeRepo}>
        <Rocket size={16} style={{ marginRight: '6px' }} />
        {tr('Release', 'Release')}
      </button>
      <button className="icon-btn topbar-action-btn topbar-action-btn-primary" onClick={onStageCommit} disabled={!activeRepo}>
        {tr('Stagen / Commit', 'Stage / Commit')}
      </button>
    </div>
  );
};
