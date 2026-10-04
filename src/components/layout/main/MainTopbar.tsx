import React, { useEffect } from 'react';
import { FolderGit2, GitBranch, Globe, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import { TopbarActions } from '@/components/topbar/TopbarActions';
import { useGitStore, useUIStore, useWorkflowStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { RemoteTransferPanel } from '@/components/hosting/RemoteTransferPanel';
import { useRemoteTransferDialogState, type RemoteTransferDialog } from '@/components/hosting/remoteTransferDialogState';
import { DialogFrame } from '@/components/DialogFrame';
import { useRepositoryHosting } from '@/components/hosting/useRepositoryHosting';
import { useHostingState } from '@/components/hosting/hostingState';

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
  const onOpenRunConfig = useUIStore((state) => state.onOpenRunConfig);
  const onCloseRunConfig = useUIStore((state) => state.onCloseRunConfig);
  const activeRepo = useGitStore((state) => state.activeRepo);
  const branches = useGitStore((state) => state.branches);
  const currentBranch = useGitStore((state) => state.currentBranch);
  const remoteSync = useGitStore((state) => state.remoteSync);
  const remoteStatus = useGitStore((state) => state.remoteStatus);
  const onMergeBranch = useGitStore((state) => state.onMergeBranch);
  const isGitActionRunning = useWorkflowStore((state) => state.isGitActionRunning);
  const activeGitActionLabel = useWorkflowStore((state) => state.activeGitActionLabel);
  const transferDialog = useRemoteTransferDialogState((state) => state.dialog);
  const openTransfer = useRemoteTransferDialogState((state) => state.open);
  const closeTransfer = useRemoteTransferDialogState((state) => state.close);
  const showTransfer = (mode: RemoteTransferDialog['mode'], extra: Partial<RemoteTransferDialog> = {}) => {
    if (!activeRepo) return;
    onCloseRunConfig();
    openTransfer({ repoPath: activeRepo, mode, ...extra });
  };
  useEffect(() => {
    if (transferDialog && transferDialog.repoPath !== activeRepo) closeTransfer();
  }, [activeRepo, transferDialog, closeTransfer]);
  const repositoryRun = useWorkflowStore((state) => state.repositoryRun);
  const activeRunConfig = useWorkflowStore((state) => state.activeRunConfig);
  const hasUnreadRepositoryRunResult = useWorkflowStore((state) => state.hasUnreadRepositoryRunResult);
  const onStartRepositoryRun = useWorkflowStore((state) => state.onStartRepositoryRun);
  const onStopRepositoryRun = useWorkflowStore((state) => state.onStopRepositoryRun);
  const onOpenRunConsole = useWorkflowStore((state) => state.onOpenRunConsole);
  const hostingTarget = useRepositoryHosting(activeRepo);
  const selectHostedRepository = useHostingState((state) => state.select);
  const navigateHosting = useHostingState((state) => state.navigate);
  const { t, tr } = useI18n();
  const isPlannerView = activeTab === 'planner';
  const isGithubView = activeTab === 'github' || activeTab === 'hosting';
  const isLocalReposView = activeTab === 'localRepos';
  const isWorkspaceView = isPlannerView || isGithubView || isLocalReposView;
  const repositoryRunForActiveRepo = repositoryRun?.repoPath === activeRepo ? repositoryRun : null;

  return (
    <>
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
            {isGithubView ? <Globe size={14} /> : isLocalReposView ? <FolderGit2 size={14} /> : <GitBranch size={14} />}
          </div>
          <span className="topbar-repo-title">
            {isGithubView
              ? 'Hosting'
              : isLocalReposView
                ? t('sidebar.localRepos')
                : isPlannerView
                  ? t('generated.components.layout.main.maintopbar.project_planning_71556778')
                  : activeRepo
                    ? activeRepo.split(/[\\/]/).pop()
                    : 'Open-Git-Control'}
          </span>
          {!isWorkspaceView && currentBranch && (
            <span className="topbar-chip topbar-chip-branch">
              <GitBranch size={12} /> {currentBranch}
            </span>
          )}
          {!isWorkspaceView && activeRepo && (
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
          {!isWorkspaceView && (
            <TopbarActions
              activeRepo={activeRepo}
              branches={branches}
              currentBranch={currentBranch}
              isGitActionRunning={isGitActionRunning}
              isFetching={remoteSync.isFetching}
              activeActionLabel={activeGitActionLabel}
              onFetch={() => showTransfer('fetch')}
              onPull={() => showTransfer('pull')}
              onPullRebase={() => showTransfer('pull', { pullMode: 'rebase' })}
              onPullFfOnly={() => showTransfer('pull', { pullMode: 'ff-only' })}
              onPullNoFf={() => showTransfer('pull', { pullMode: 'no-ff' })}
              onPush={() => showTransfer('push')}
              onPushForceWithLease={() => showTransfer('push', { force: true })}
              onPushTags={() => showTransfer('push')}
              onPushSetUpstream={() => showTransfer('remotes')}
              onMergeBranch={onMergeBranch}
              onStageCommit={() => {
                onCloseRunConfig();
                onStageCommit();
              }}
              onOpenReleaseCreator={() => {
                onCloseRunConfig();
                if (!hostingTarget.repository) {
                  showTransfer('remotes');
                  return;
                }
                selectHostedRepository(hostingTarget.repository);
                navigateHosting('releases');
                setActiveTab('hosting');
              }}
              onOpenTimeline={() => {
                onCloseRunConfig();
                onOpenTimeline();
              }}
              isTimelineLoading={isTimelineLoading}
              repositoryRun={repositoryRunForActiveRepo}
              activeRunConfig={activeRunConfig}
              hasUnreadRepositoryRunResult={hasUnreadRepositoryRunResult}
              onStartRepositoryRun={async (action) => {
                const started = await onStartRepositoryRun(action);
                if (started) {
                  onCloseRunConfig();
                  setActiveTab('repo');
                }
                return started;
              }}
              onStopRepositoryRun={onStopRepositoryRun}
              onOpenRunConsole={() => {
                onCloseRunConfig();
                setActiveTab('repo');
                onOpenRunConsole();
              }}
              onOpenRunSettings={() => {
                if (!activeRepo) return;
                setActiveTab('repo');
                onOpenRunConfig();
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
      {transferDialog && activeRepo === transferDialog.repoPath && (
        <DialogFrame
          open
          title={tr('Remotes & Übertragungen', 'Remotes & transfers')}
          onClose={closeTransfer}
          cancelLabel={tr('Schließen', 'Close')}
          closeOnBackdrop={false}
        >
          <RemoteTransferPanel
            key={`${transferDialog.repoPath}:${transferDialog.mode}:${transferDialog.force}:${transferDialog.pullMode}:${transferDialog.destinationBranch}`}
            {...transferDialog}
            onClose={closeTransfer}
          />
        </DialogFrame>
      )}
    </>
  );
};
