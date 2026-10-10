import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, GitCommitHorizontal, GitMerge, MoreHorizontal, RefreshCw, Rocket } from 'lucide-react';
import type { BranchInfo, GitMergeMode, GitMergeDirection } from '@/types/git';
import type { RepositoryRunActionId, RepositoryRunConfigStateDto, RepositoryRunStateDto } from '@/types/repositoryRun';
import { useI18n } from '@/i18n';
import { RepositoryRunMenu } from './RepositoryRunMenu';
import { TopbarMoreMenu, type TopbarMoreMenuView } from './TopbarMoreMenu';
import { MergeBranchMenu } from './MergeBranchMenu';

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
  onMergeBranch: (branchName: string, mode: GitMergeMode, direction?: GitMergeDirection) => void;
  onStageCommit: () => void;
  onOpenReleaseCreator: () => void;
  repositoryRun: RepositoryRunStateDto | null;
  activeRunConfig: RepositoryRunConfigStateDto | null;
  hasUnreadRepositoryRunResult: boolean;
  onStartRepositoryRun: (action: RepositoryRunActionId) => Promise<boolean>;
  onStopRepositoryRun: () => Promise<boolean>;
  onOpenRunConsole: () => void;
  onOpenRunSettings: () => void;
  onOpenSecretScanAllowlist?: () => void;
  onOpenRemoteConfig?: () => void;
  onOpenRepositoryAnalytics?: () => void;
  onPublishRepository?: () => void;
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
  repositoryRun,
  activeRunConfig,
  hasUnreadRepositoryRunResult,
  onStartRepositoryRun,
  onStopRepositoryRun,
  onOpenRunConsole,
  onOpenRunSettings,
  onOpenSecretScanAllowlist,
  onOpenRemoteConfig,
  onOpenRepositoryAnalytics,
  onPublishRepository,
}) => {
  const { t, tr } = useI18n();
  const normalizedAction = (activeActionLabel || '').toLowerCase();
  const isPullRunning = isGitActionRunning && normalizedAction.includes('pull');
  const isPushRunning = isGitActionRunning && normalizedAction.includes('push');
  const [openMenu, setOpenMenu] = useState<'pull' | 'push' | 'merge' | 'run' | 'more' | 'moreMerge' | 'moreRun' | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const pullOptions = useMemo<SplitOption[]>(
    () => [
      {
        label: t('generated.components.topbar.topbaractions.with_rebase_56cff35e'),
        hint: t('generated.components.topbar.topbaractions.rebase_local_commits_on_top_of_remote_55a2835e'),
        action: onPullRebase,
      },
      {
        label: t('generated.components.topbar.topbaractions.no_fast_forward_no_ff_7e7bdf45'),
        hint: t('generated.components.topbar.topbaractions.always_creates_a_merge_commit_31377986'),
        action: onPullNoFf,
      },
      {
        label: t('generated.components.topbar.topbaractions.fast_forward_only_b9d481fe'),
        hint: t('generated.components.topbar.topbaractions.abort_if_a_merge_commit_would_be_required_b2a50e57'),
        action: onPullFfOnly,
      },
    ],
    [onPullFfOnly, onPullNoFf, onPullRebase, t],
  );

  const pushOptions = useMemo<SplitOption[]>(
    () => [
      {
        label: t('generated.components.topbar.topbaractions.set_upstream_u_ae697a9c'),
        hint: t('generated.components.topbar.topbaractions.first_push_set_remote_tracking_branch_670d2556'),
        action: onPushSetUpstream,
      },
      {
        label: t('generated.components.topbar.topbaractions.force_with_lease_6940465b'),
        hint: t('generated.components.topbar.topbaractions.safer_force_push_with_lease_check_01d2b820'),
        action: onPushForceWithLease,
      },
      {
        label: t('generated.components.topbar.topbaractions.push_tags_too_d0a29da5'),
        hint: t('generated.components.topbar.topbaractions.push_including_local_tags_bd03300d'),
        action: onPushTags,
      },
    ],
    [onPushForceWithLease, onPushSetUpstream, onPushTags, t],
  );
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
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  useEffect(() => setOpenMenu(null), [activeRepo, currentBranch, isGitActionRunning]);

  const renderMergePicker = () => (
    <MergeBranchMenu
      key={`${activeRepo}:${currentBranch}`}
      branches={branches}
      currentBranch={currentBranch}
      onMerge={(branch, mode, direction) => {
        setOpenMenu(null);
        onMergeBranch(branch, mode, direction);
      }}
    />
  );

  const remoteConfigurationItem = onOpenRemoteConfig && (
    <>
      <div className="topbar-dropdown-sep" />
      <button
        type="button"
        className="topbar-dropdown-item"
        disabled={!activeRepo}
        onClick={() => {
          setOpenMenu(null);
          onOpenRemoteConfig();
        }}
      >
        <span className="topbar-dropdown-item-label">{tr('Remote-Konfiguration', 'Remote configuration')}</span>
      </button>
    </>
  );

  const moreMenuView: TopbarMoreMenuView | null = openMenu === 'more' || openMenu === 'moreMerge' || openMenu === 'moreRun' ? openMenu : null;

  return (
    <div className="topbar-actions" ref={rootRef}>
      <button
        className="icon-btn topbar-action-btn topbar-action-btn-sync"
        onClick={onFetch}
        disabled={!activeRepo || isGitActionRunning || isFetching}
        title={t('generated.components.sidebar.remotepanel.refresh_remote_e97c388d')}
      >
        <RefreshCw size={16} className={isFetching ? 'spin' : ''} />
        <span className="topbar-action-label">Fetch</span>
      </button>
      <div className="topbar-split-wrap topbar-action-secondary">
        <button
          className="icon-btn topbar-action-btn topbar-action-btn-sync topbar-split-main"
          onClick={() => setOpenMenu((prev) => (prev === 'merge' ? null : 'merge'))}
          disabled={!activeRepo || isGitActionRunning || branches.length === 0}
          title={tr('Branches zusammenführen: Quelle und Ziel auswählen', 'Merge branches: choose source and target')}
        >
          <GitMerge size={16} />
          <span className="topbar-action-label">{t('generated.components.layout.main.mainprimarypane.merge_83b759bf')}</span>
        </button>
        <button
          className="icon-btn topbar-action-btn topbar-split-toggle"
          onClick={() => setOpenMenu((prev) => (prev === 'merge' ? null : 'merge'))}
          disabled={!activeRepo || isGitActionRunning || branches.length === 0}
          aria-label={t('generated.components.topbar.topbaractions.choose_branch_to_merge_333ec0e8')}
          title={t('generated.components.topbar.topbaractions.choose_branch_to_merge_333ec0e8')}
        >
          <ChevronDown size={14} />
        </button>
        {openMenu === 'merge' && <div className="topbar-dropdown topbar-merge-dropdown">{renderMergePicker()}</div>}
      </div>
      <div className="topbar-split-wrap">
        <button
          className="icon-btn topbar-action-btn topbar-action-btn-sync topbar-split-main"
          onClick={onPull}
          disabled={!activeRepo || isGitActionRunning}
          title={t('generated.components.topbar.topbaractions.default_action_pull_590eb177')}
        >
          <ArrowDownCircle size={16} className={isPullRunning ? 'spin' : ''} />
          <span className="topbar-action-label">Pull</span>
        </button>
        <button
          className="icon-btn topbar-action-btn topbar-split-toggle"
          onClick={() => setOpenMenu((prev) => (prev === 'pull' ? null : 'pull'))}
          disabled={!activeRepo || isGitActionRunning}
          aria-label={t('generated.components.topbar.topbaractions.more_pull_options_f09b5f88')}
          title={t('generated.components.topbar.topbaractions.more_pull_options_f09b5f88')}
        >
          <ChevronDown size={14} />
        </button>
        {openMenu === 'pull' && (
          <div className="topbar-dropdown">
            <div className="topbar-dropdown-header">{t('generated.components.topbar.topbaractions.direct_click_pull_c9756c50')}</div>
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
            {remoteConfigurationItem}
          </div>
        )}
      </div>
      <div className="topbar-split-wrap">
        <button
          className="icon-btn topbar-action-btn topbar-action-btn-sync topbar-split-main"
          onClick={onPush}
          disabled={!activeRepo || isGitActionRunning}
          title={t('generated.components.topbar.topbaractions.default_action_push_8196dfeb')}
        >
          <ArrowUpCircle size={16} className={isPushRunning ? 'spin' : ''} />
          <span className="topbar-action-label">Push</span>
        </button>
        <button
          className="icon-btn topbar-action-btn topbar-split-toggle"
          onClick={() => setOpenMenu((prev) => (prev === 'push' ? null : 'push'))}
          disabled={!activeRepo || isGitActionRunning}
          aria-label={t('generated.components.topbar.topbaractions.more_push_options_b2656212')}
          title={t('generated.components.topbar.topbaractions.more_push_options_b2656212')}
        >
          <ChevronDown size={14} />
        </button>
        {openMenu === 'push' && (
          <div className="topbar-dropdown">
            <div className="topbar-dropdown-header">{t('generated.components.topbar.topbaractions.direct_click_push_b4919db8')}</div>
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
            {remoteConfigurationItem}
          </div>
        )}
      </div>
      <RepositoryRunMenu
        activeRepo={activeRepo}
        activeRunConfig={activeRunConfig}
        repositoryRun={repositoryRun}
        hasUnreadResult={hasUnreadRepositoryRunResult}
        open={openMenu === 'run'}
        setOpen={(open) => setOpenMenu(open ? 'run' : null)}
        onStart={onStartRepositoryRun}
        onStop={onStopRepositoryRun}
        onOpenConsole={onOpenRunConsole}
        onOpenSettings={onOpenRunSettings}
      />
      <button className="icon-btn topbar-action-btn topbar-action-secondary" onClick={onOpenReleaseCreator} disabled={!activeRepo}>
        <Rocket size={16} />
        <span className="topbar-action-label">{t('generated.components.topbar.topbaractions.release_f55496ba')}</span>
      </button>
      <button className="icon-btn topbar-action-btn topbar-action-btn-primary topbar-action-secondary" onClick={onStageCommit} disabled={!activeRepo}>
        <GitCommitHorizontal size={16} />
        <span className="topbar-action-label">{t('generated.components.topbar.topbaractions.stage_commit_77275475')}</span>
      </button>
      <div className="topbar-split-wrap topbar-more-wrap">
        <button
          className="icon-btn topbar-action-btn topbar-more-toggle"
          onClick={() => setOpenMenu((previous) => (previous === 'more' || previous === 'moreMerge' || previous === 'moreRun' ? null : 'more'))}
          aria-label={t('generated.components.topbar.topbaractions.more_actions_a53b5e21')}
          title={t('generated.components.topbar.topbaractions.more_actions_a53b5e21')}
        >
          <MoreHorizontal size={18} />
          <span className="topbar-action-label">{t('generated.components.topbar.topbaractions.more_d62e1799')}</span>
        </button>
        {moreMenuView && (
          <TopbarMoreMenu
            view={moreMenuView}
            setView={(view) => setOpenMenu(view)}
            activeRepo={activeRepo}
            isGitActionRunning={isGitActionRunning}
            branchCount={branches.length}
            pullOptions={pullOptions}
            pushOptions={pushOptions}
            renderMergePicker={renderMergePicker}
            onStageCommit={onStageCommit}
            onOpenReleaseCreator={onOpenReleaseCreator}
            activeRunConfig={activeRunConfig}
            repositoryRun={repositoryRun}
            onStartRepositoryRun={onStartRepositoryRun}
            onStopRepositoryRun={onStopRepositoryRun}
            onOpenRunConsole={onOpenRunConsole}
            onOpenRunSettings={onOpenRunSettings}
            onOpenSecretScanAllowlist={onOpenSecretScanAllowlist}
            onOpenRemoteConfig={onOpenRemoteConfig}
            onOpenRepositoryAnalytics={onOpenRepositoryAnalytics}
            onPublishRepository={onPublishRepository}
          />
        )}
      </div>
    </div>
  );
};
