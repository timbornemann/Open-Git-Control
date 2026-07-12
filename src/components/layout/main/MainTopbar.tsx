import React from 'react';
import { GitBranch, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import { TopbarActions } from '@/components/topbar/TopbarActions';
import { useGitHubStore, useGitStore, useSettingsStore, useUIStore, useWorkflowStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';

type MainTopbarProps = {
  canShowInspectorPane: boolean;
  showInspectorPane: boolean;
  onToggleInspectorPane: () => void;
  onStageCommit: () => void;
  onOpenTimeline: () => void;
  isTimelineLoading: boolean;
};

export const MainTopbar: React.FC<MainTopbarProps> = ({
  canShowInspectorPane,
  showInspectorPane,
  onToggleInspectorPane,
  onStageCommit,
  onOpenTimeline,
  isTimelineLoading,
}) => {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const onSelectSettingsTab = useSettingsStore((state) => state.onSelectSettingsTab);
  const activeRepo = useGitStore((state) => state.activeRepo);
  const branches = useGitStore((state) => state.branches);
  const currentBranch = useGitStore((state) => state.currentBranch);
  const remoteSync = useGitStore((state) => state.remoteSync);
  const remoteStatus = useGitStore((state) => state.remoteStatus);
  const onMergeBranch = useGitStore((state) => state.onMergeBranch);
  const isGitActionRunning = useWorkflowStore((state) => state.isGitActionRunning);
  const activeGitActionLabel = useWorkflowStore((state) => state.activeGitActionLabel);
  const onFetch = useWorkflowStore((state) => state.onFetch);
  const onPull = useWorkflowStore((state) => state.onPull);
  const onPullRebase = useWorkflowStore((state) => state.onPullRebase);
  const onPullFfOnly = useWorkflowStore((state) => state.onPullFfOnly);
  const onPullNoFf = useWorkflowStore((state) => state.onPullNoFf);
  const onPush = useWorkflowStore((state) => state.onPush);
  const onPushForceWithLease = useWorkflowStore((state) => state.onPushForceWithLease);
  const onPushTags = useWorkflowStore((state) => state.onPushTags);
  const onPushSetUpstream = useWorkflowStore((state) => state.onPushSetUpstream);
  const repositoryRun = useWorkflowStore((state) => state.repositoryRun);
  const activeRunConfig = useWorkflowStore((state) => state.activeRunConfig);
  const onStartRepositoryRun = useWorkflowStore((state) => state.onStartRepositoryRun);
  const onStopRepositoryRun = useWorkflowStore((state) => state.onStopRepositoryRun);
  const onOpenRunConsole = useWorkflowStore((state) => state.onOpenRunConsole);
  const onOpenReleaseCreator = useGitHubStore((state) => state.onOpenReleaseCreator);
  const { t } = useI18n();
  const isPlannerView = activeTab === 'planner';

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div
          aria-hidden="true"
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent-primary-soft)',
            color: 'var(--text-accent)',
            border: '1px solid var(--accent-primary-border)',
          }}
        >
          <GitBranch size={14} />
        </div>
        <span className="topbar-repo-title">
          {isPlannerView
            ? t('generated.components.layout.main.maintopbar.project_planning_71556778')
            : activeRepo
              ? activeRepo.split(/[\\/]/).pop()
              : 'Open-Git-Control'}
        </span>
        {!isPlannerView && currentBranch && (
          <span className="topbar-chip topbar-chip-branch">
            <GitBranch size={12} /> {currentBranch}
          </span>
        )}
        {!isPlannerView && activeRepo && (
          <span
            className="topbar-chip topbar-chip-remote"
            style={{
              backgroundColor: remoteStatus.backgroundColor,
              color: remoteStatus.color,
              borderColor: remoteStatus.borderColor,
            }}
          >
            <RefreshCw size={12} style={{ opacity: remoteSync.isFetching ? 1 : 0.7 }} />
            {remoteStatus.title}
          </span>
        )}
      </div>

      <div className="topbar-right">
        {!isPlannerView && (
          <TopbarActions
            activeRepo={activeRepo}
            branches={branches}
            currentBranch={currentBranch}
            isGitActionRunning={isGitActionRunning}
            isFetching={remoteSync.isFetching}
            activeActionLabel={activeGitActionLabel}
            onFetch={onFetch}
            onPull={onPull}
            onPullRebase={onPullRebase}
            onPullFfOnly={onPullFfOnly}
            onPullNoFf={onPullNoFf}
            onPush={onPush}
            onPushForceWithLease={onPushForceWithLease}
            onPushTags={onPushTags}
            onPushSetUpstream={onPushSetUpstream}
            onMergeBranch={onMergeBranch}
            onStageCommit={onStageCommit}
            onOpenReleaseCreator={onOpenReleaseCreator}
            onOpenTimeline={onOpenTimeline}
            isTimelineLoading={isTimelineLoading}
            repositoryRun={repositoryRun}
            activeRunConfig={activeRunConfig}
            onStartRepositoryRun={async (action) => {
              const started = await onStartRepositoryRun(action);
              if (started) setActiveTab('repo');
              return started;
            }}
            onStopRepositoryRun={onStopRepositoryRun}
            onOpenRunConsole={() => {
              setActiveTab('repo');
              onOpenRunConsole();
            }}
            onOpenRunSettings={() => {
              onSelectSettingsTab('run');
              setActiveTab('settings');
            }}
          />
        )}
        {canShowInspectorPane && (
          <button
            className="icon-btn topbar-panel-toggle"
            onClick={onToggleInspectorPane}
            title={
              showInspectorPane
                ? t('generated.components.layout.main.maintopbar.close_right_inspector_e1b6b5a5')
                : t('generated.components.layout.main.maintopbar.open_right_inspector_d885605a')
            }
            aria-label={
              showInspectorPane
                ? t('generated.components.layout.main.maintopbar.close_right_inspector_e1b6b5a5')
                : t('generated.components.layout.main.maintopbar.open_right_inspector_d885605a')
            }
          >
            {showInspectorPane ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        )}
      </div>
    </div>
  );
};
