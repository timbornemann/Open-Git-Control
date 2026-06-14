import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, GitMerge, History, RefreshCw, Rocket } from 'lucide-react';
import { BranchInfo, GitMergeMode } from '../../types/git';
import { normalizeBranchRefForMerge } from '../../utils/gitParsing';
import { useI18n } from '../../i18n';

type Props = {
  activeRepo: string | null;
  branches: BranchInfo[];
  currentBranch: string;
  isGitActionRunning: boolean;
  isFetching: boolean;
  activeActionLabel: string | null;
  onFetch: () => void;
  onPull: () => void;
  onPullRebase: () => void;
  onPullFfOnly: () => void;
  onPullNoFf: () => void;
  onPush: () => void;
  onPushForceWithLease: () => void;
  onPushTags: () => void;
  onPushSetUpstream: () => void;
  onMergeBranch: (branchName: string, mode: GitMergeMode) => void;
  onStageCommit: () => void;
  onOpenReleaseCreator: () => void;
  onOpenTimeline?: () => void;
};

type SplitOption = {
  label: string;
  hint: string;
  action: () => void;
};

export const TopbarActions: React.FC<Props> = ({
  activeRepo,
  branches,
  currentBranch,
  isGitActionRunning,
  isFetching,
  activeActionLabel,
  onFetch,
  onPull,
  onPullRebase,
  onPullFfOnly,
  onPullNoFf,
  onPush,
  onPushForceWithLease,
  onPushTags,
  onPushSetUpstream,
  onMergeBranch,
  onStageCommit,
  onOpenReleaseCreator,
  onOpenTimeline,
}) => {
  const { tr } = useI18n();
  const normalizedAction = (activeActionLabel || '').toLowerCase();
  const isPullRunning = isGitActionRunning && normalizedAction.includes('pull');
  const isPushRunning = isGitActionRunning && normalizedAction.includes('push');
  const [openMenu, setOpenMenu] = useState<'pull' | 'push' | 'merge' | null>(null);
  const [mergeQuery, setMergeQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const pullOptions = useMemo<SplitOption[]>(() => ([
    {
      label: tr('Mit Rebase', 'With rebase'),
      hint: tr('Lokal neu auf Remote-Stand aufsetzen', 'Rebase local commits on top of remote'),
      action: onPullRebase,
    },
    {
      label: tr('Kein Fast-Forward (--no-ff)', 'No fast-forward (--no-ff)'),
      hint: tr('Erzwingt einen Merge-Commit', 'Always creates a merge commit'),
      action: onPullNoFf,
    },
    {
      label: tr('Nur Fast-Forward', 'Fast-forward only'),
      hint: tr('Abbruch bei Merge-Commit-Bedarf', 'Abort if a merge commit would be required'),
      action: onPullFfOnly,
    },
  ]), [onPullFfOnly, onPullNoFf, onPullRebase, tr]);

  const mergeCandidates = useMemo(() => {
    const q = mergeQuery.trim().toLowerCase();
    return branches
      .filter((b) => {
        if (b.scope === 'local' && b.name === currentBranch) return false;
        return true;
      })
      .map((b) => ({
        rawName: b.name,
        label: normalizeBranchRefForMerge(b.name),
        scope: b.scope,
      }))
      .filter((row) => !q || row.label.toLowerCase().includes(q) || row.rawName.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [branches, currentBranch, mergeQuery]);

  const mergeModeOptions = useMemo(() => ([
    { mode: 'default' as const, label: tr('Standard-Merge', 'Standard merge'), hint: tr('git merge <branch>', 'git merge <branch>') },
    { mode: 'noFf' as const, label: tr('Ohne Fast-Forward', 'No fast-forward'), hint: tr('Immer Merge-Commit erzeugen', 'Always create a merge commit') },
    { mode: 'squash' as const, label: tr('Squash', 'Squash'), hint: tr('Aenderungen squashen, ein Commit', 'Squash changes into one commit') },
    { mode: 'ffOnly' as const, label: tr('Nur Fast-Forward', 'Fast-forward only'), hint: tr('Abbruch ohne Merge-Commit', 'Abort if not fast-forward') },
  ]), [tr]);

  const pushOptions = useMemo<SplitOption[]>(() => ([
    {
      label: tr('Upstream setzen (-u)', 'Set upstream (-u)'),
      hint: tr('Ersten Push + Tracking-Branch setzen', 'First push & set remote tracking branch'),
      action: onPushSetUpstream,
    },
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
  ]), [onPushForceWithLease, onPushSetUpstream, onPushTags, tr]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node | null;
      if (target && rootRef.current.contains(target)) return;
      setOpenMenu(null);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setMergeQuery('');
      }
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
        <button
          className="icon-btn topbar-action-btn topbar-action-btn-sync topbar-split-main"
          onClick={() => setOpenMenu((prev) => (prev === 'merge' ? null : 'merge'))}
          disabled={!activeRepo || isGitActionRunning || branches.length === 0}
          title={tr('Branch in den aktuellen HEAD mergen', 'Merge a branch into the current branch')}
        >
          <GitMerge size={16} style={{ marginRight: '6px' }} />
          {tr('Merge', 'Merge')}
        </button>
        <button
          className="icon-btn topbar-action-btn topbar-split-toggle"
          onClick={() => setOpenMenu((prev) => (prev === 'merge' ? null : 'merge'))}
          disabled={!activeRepo || isGitActionRunning || branches.length === 0}
          aria-label={tr('Branch zum Mergen waehlen', 'Choose branch to merge')}
          title={tr('Branch zum Mergen waehlen', 'Choose branch to merge')}
        >
          <ChevronDown size={14} />
        </button>
        {openMenu === 'merge' && (
          <div className="topbar-dropdown" style={{ minWidth: 'min(320px, 92vw)', maxHeight: 'min(380px, 70vh)' }}>
            <div className="topbar-dropdown-header">{tr('Branch mergen', 'Merge branch')}</div>
            <div style={{ padding: '6px 8px' }}>
              <input
                type="search"
                value={mergeQuery}
                onChange={(e) => setMergeQuery(e.target.value)}
                placeholder={tr('Branch filtern...', 'Filter branches...')}
                className="repo-filter-input"
                style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.78rem', padding: '6px 8px' }}
                autoFocus
              />
            </div>
            <div className="topbar-dropdown-sep" />
            <div style={{ overflowY: 'auto', maxHeight: '200px' }}>
              {mergeCandidates.length === 0 ? (
                <div className="topbar-dropdown-item" style={{ cursor: 'default' }}>
                  <span className="topbar-dropdown-item-hint">{tr('Keine passenden Branches.', 'No matching branches.')}</span>
                </div>
              ) : (
                mergeCandidates.map((row) => (
                  <div key={row.rawName} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                    <div style={{ padding: '6px 10px 2px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {row.label}
                      <span style={{ marginLeft: '6px', opacity: 0.75 }}>{row.scope === 'remote' ? tr('remote', 'remote') : tr('lokal', 'local')}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '4px 8px 8px' }}>
                      {mergeModeOptions.map((opt) => (
                        <button
                          key={opt.mode}
                          type="button"
                          className="staging-tool-btn"
                          style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                          onClick={() => {
                            setOpenMenu(null);
                            setMergeQuery('');
                            onMergeBranch(row.rawName, opt.mode);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
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
      <button className="icon-btn topbar-action-btn" onClick={onOpenTimeline} disabled={!activeRepo}>
        <History size={16} style={{ marginRight: '6px' }} />
        {tr('Zeitleiste', 'Timeline')}
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
