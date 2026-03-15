import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, RefreshCw, Rocket } from 'lucide-react';
import { useI18n } from '../../i18n';

type Props = {
  activeRepo: string | null;
  isGitActionRunning: boolean;
  isFetching: boolean;
  activeActionLabel: string | null;
  onFetch: () => void;
  onPull: () => void;
  onPullRebase: () => void;
  onPullFfOnly: () => void;
  onPush: () => void;
  onPushForceWithLease: () => void;
  onPushTags: () => void;
  onStageCommit: () => void;
  onOpenReleaseCreator: () => void;
};

type SplitOption = {
  label: string;
  hint: string;
  action: () => void;
};

export const TopbarActions: React.FC<Props> = ({
  activeRepo,
  isGitActionRunning,
  isFetching,
  activeActionLabel,
  onFetch,
  onPull,
  onPullRebase,
  onPullFfOnly,
  onPush,
  onPushForceWithLease,
  onPushTags,
  onStageCommit,
  onOpenReleaseCreator,
}) => {
  const { tr } = useI18n();
  const normalizedAction = (activeActionLabel || '').toLowerCase();
  const isPullRunning = isGitActionRunning && normalizedAction.includes('pull');
  const isPushRunning = isGitActionRunning && normalizedAction.includes('push');
  const [openMenu, setOpenMenu] = useState<'pull' | 'push' | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const pullOptions = useMemo<SplitOption[]>(() => ([
    {
      label: tr('Mit Rebase', 'With rebase'),
      hint: tr('Lokal neu auf Remote-Stand aufsetzen', 'Rebase local commits on top of remote'),
      action: onPullRebase,
    },
    {
      label: tr('Nur Fast-Forward', 'Fast-forward only'),
      hint: tr('Abbruch bei Merge-Commit-Bedarf', 'Abort if a merge commit would be required'),
      action: onPullFfOnly,
    },
  ]), [onPullFfOnly, onPullRebase, tr]);

  const pushOptions = useMemo<SplitOption[]>(() => ([
    {
      label: tr('Force with lease', 'Force with lease'),
      hint: tr('Sicheres Force-Push mit Lease-Pruefung', 'Safer force push with lease check'),
      action: onPushForceWithLease,
    },
    {
      label: tr('Tags mit pushen', 'Push tags too'),
      hint: tr('Push inklusive lokaler Tags', 'Push including local tags'),
      action: onPushTags,
    },
  ]), [onPushForceWithLease, onPushTags, tr]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node | null;
      if (target && rootRef.current.contains(target)) return;
      setOpenMenu(null);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  return (
    <div className="topbar-actions" ref={rootRef}>
      <button className="icon-btn topbar-action-btn topbar-action-btn-sync" onClick={onFetch} disabled={!activeRepo || isGitActionRunning || isFetching}>
        <RefreshCw size={16} className={isFetching ? 'spin' : ''} style={{ marginRight: '6px' }} />
        Fetch
      </button>
      <div className="topbar-split-wrap">
        <button className="icon-btn topbar-action-btn topbar-action-btn-sync topbar-split-main" onClick={onPull} disabled={!activeRepo || isGitActionRunning} title={tr('Standardaktion: Pull', 'Default action: pull')}>
          <ArrowDownCircle size={16} className={isPullRunning ? 'spin' : ''} style={{ marginRight: '6px' }} />
          Pull
        </button>
        <button
          className="icon-btn topbar-action-btn topbar-split-toggle"
          onClick={() => setOpenMenu((prev) => (prev === 'pull' ? null : 'pull'))}
          disabled={!activeRepo || isGitActionRunning}
          aria-label={tr('Weitere Pull-Optionen', 'More pull options')}
          title={tr('Weitere Pull-Optionen', 'More pull options')}
        >
          <ChevronDown size={14} />
        </button>
        {openMenu === 'pull' && (
          <div className="topbar-dropdown">
            <div className="topbar-dropdown-header">{tr('Direktklick: Pull', 'Direct click: Pull')}</div>
            <div className="topbar-dropdown-sep" />
            {pullOptions.map((option) => (
              <button
                key={option.label}
                className="topbar-dropdown-item"
                onClick={() => {
                  setOpenMenu(null);
                  option.action();
                }}
              >
                <span className="topbar-dropdown-item-label">{option.label}</span>
                <span className="topbar-dropdown-item-hint">{option.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="topbar-split-wrap">
        <button className="icon-btn topbar-action-btn topbar-action-btn-sync topbar-split-main" onClick={onPush} disabled={!activeRepo || isGitActionRunning} title={tr('Standardaktion: Push', 'Default action: push')}>
          <ArrowUpCircle size={16} className={isPushRunning ? 'spin' : ''} style={{ marginRight: '6px' }} />
          Push
        </button>
        <button
          className="icon-btn topbar-action-btn topbar-split-toggle"
          onClick={() => setOpenMenu((prev) => (prev === 'push' ? null : 'push'))}
          disabled={!activeRepo || isGitActionRunning}
          aria-label={tr('Weitere Push-Optionen', 'More push options')}
          title={tr('Weitere Push-Optionen', 'More push options')}
        >
          <ChevronDown size={14} />
        </button>
        {openMenu === 'push' && (
          <div className="topbar-dropdown">
            <div className="topbar-dropdown-header">{tr('Direktklick: Push', 'Direct click: Push')}</div>
            <div className="topbar-dropdown-sep" />
            {pushOptions.map((option) => (
              <button
                key={option.label}
                className="topbar-dropdown-item"
                onClick={() => {
                  setOpenMenu(null);
                  option.action();
                }}
              >
                <span className="topbar-dropdown-item-label">{option.label}</span>
                <span className="topbar-dropdown-item-hint">{option.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
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
