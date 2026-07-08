import React from 'react';
import { GitBranch, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import { TopbarActions } from '@/components/topbar/TopbarActions';
import { useGithubContext, useRepositoryContext, useUIContext, useWorkflowContext } from '@/contexts/AppStateContext';
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
  const { activeTab } = useUIContext();
  const repository = useRepositoryContext();
  const github = useGithubContext();
  const workflow = useWorkflowContext();
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
            : repository.activeRepo
              ? repository.activeRepo.split(/[\\/]/).pop()
              : 'Open-Git-Control'}
        </span>
        {!isPlannerView && repository.currentBranch && (
          <span className="topbar-chip topbar-chip-branch">
            <GitBranch size={12} /> {repository.currentBranch}
          </span>
        )}
        {!isPlannerView && repository.activeRepo && (
          <span
            className="topbar-chip topbar-chip-remote"
            style={{
              backgroundColor: repository.remoteStatus.backgroundColor,
              color: repository.remoteStatus.color,
              borderColor: repository.remoteStatus.borderColor,
            }}
          >
            <RefreshCw size={12} style={{ opacity: repository.remoteSync.isFetching ? 1 : 0.7 }} />
            {repository.remoteStatus.title}
          </span>
        )}
      </div>

      <div className="topbar-right">
        {!isPlannerView && (
          <TopbarActions
            activeRepo={repository.activeRepo}
            branches={repository.branches}
            currentBranch={repository.currentBranch}
            isGitActionRunning={workflow.isGitActionRunning}
            isFetching={repository.remoteSync.isFetching}
            activeActionLabel={workflow.activeGitActionLabel}
            onFetch={workflow.onFetch}
            onPull={workflow.onPull}
            onPullRebase={workflow.onPullRebase}
            onPullFfOnly={workflow.onPullFfOnly}
            onPullNoFf={workflow.onPullNoFf}
            onPush={workflow.onPush}
            onPushForceWithLease={workflow.onPushForceWithLease}
            onPushTags={workflow.onPushTags}
            onPushSetUpstream={workflow.onPushSetUpstream}
            onMergeBranch={repository.onMergeBranch}
            onStageCommit={onStageCommit}
            onOpenReleaseCreator={github.onOpenReleaseCreator}
            onOpenTimeline={onOpenTimeline}
            isTimelineLoading={isTimelineLoading}
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
