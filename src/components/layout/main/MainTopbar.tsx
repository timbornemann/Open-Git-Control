import React from 'react';
import { BarChart3, FolderGit2, GitBranch, Globe, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import { TopbarActions } from '@/components/topbar/TopbarActions';
import { useGitStore, useUIStore, useWorkflowStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { RemoteTransferHost } from '@/components/hosting/RemoteTransferHost';
import { requestRemoteTransfer, type RemoteTransferDialog } from '@/components/hosting/remoteTransferDialogState';
import { useRemoteTransferState } from '@/components/hosting/remoteTransferState';
import { RepositoryAnalyticsToolbar } from '@/components/repository-analytics/RepositoryAnalyticsToolbar';

type MainTopbarProps = {
  canShowInspectorPane: boolean;
  showInspectorPane: boolean;
  onToggleInspectorPane: () => void;
  onStageCommit: () => void;
};

export const MainTopbar: React.FC<MainTopbarProps> = ({ canShowInspectorPane, showInspectorPane, onToggleInspectorPane, onStageCommit }) => {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const onOpenRunConfig = useUIStore((state) => state.onOpenRunConfig);
  const onCloseRunConfig = useUIStore((state) => state.onCloseRunConfig);
  const onOpenSecretScanAllowlist = useUIStore((state) => state.onOpenSecretScanAllowlist);
  const onOpenRemoteConfig = useUIStore((state) => state.onOpenRemoteConfig);
  const onOpenRepositoryAnalytics = useUIStore((state) => state.onOpenRepositoryAnalytics);
  const onCloseRemoteConfig = useUIStore((state) => state.onCloseRemoteConfig);
  const onOpenReleaseCreator = useUIStore((state) => state.onOpenReleaseCreator);
  const onPublishRepository = useUIStore((state) => state.onOpenRepositoryPublication);
  const onCloseRepositoryPublication = useUIStore((state) => state.onCloseRepositoryPublication);
  const isRepositoryPublicationOpen = useUIStore((state) => state.isRepositoryPublicationOpen);
  const activeRepo = useGitStore((state) => state.activeRepo);
  const branches = useGitStore((state) => state.branches);
  const tags = useGitStore((state) => state.tags);
  const currentBranch = useGitStore((state) => state.currentBranch);
  const remoteSync = useGitStore((state) => state.remoteSync);
  const remoteStatus = useGitStore((state) => state.remoteStatus);
  const onMergeBranch = useGitStore((state) => state.onMergeBranch);
  const isGitActionRunning = useWorkflowStore((state) => state.isGitActionRunning);
  const isTransferRunning = useRemoteTransferState((state) => state.busy);
  const activeGitActionLabel = useWorkflowStore((state) => state.activeGitActionLabel);
  const showTransfer = (mode: RemoteTransferDialog['mode'], extra: Partial<RemoteTransferDialog> = {}) => {
    if (!activeRepo) return;
    onCloseRunConfig();
    onCloseRemoteConfig();
    requestRemoteTransfer({ repoPath: activeRepo, mode, ...extra });
  };
  const repositoryRun = useWorkflowStore((state) => state.repositoryRun);
  const activeRunConfig = useWorkflowStore((state) => state.activeRunConfig);
  const hasUnreadRepositoryRunResult = useWorkflowStore((state) => state.hasUnreadRepositoryRunResult);
  const onStartRepositoryRun = useWorkflowStore((state) => state.onStartRepositoryRun);
  const onStopRepositoryRun = useWorkflowStore((state) => state.onStopRepositoryRun);
  const onOpenRunConsole = useWorkflowStore((state) => state.onOpenRunConsole);
  const { t, tr } = useI18n();
  const isPlannerView = activeTab === 'planner';
  const isGithubView = activeTab === 'github' || activeTab === 'hosting';
  const isLocalReposView = activeTab === 'localRepos';
  const isAnalyticsView = activeTab === 'analytics';
  const isWorkspaceView = isPlannerView || isGithubView || isLocalReposView || isAnalyticsView;
  const repositoryRunForActiveRepo = repositoryRun?.repoPath === activeRepo ? repositoryRun : null;

  return (
    <>
      <div className={`topbar${isAnalyticsView ? ' topbar--analytics' : ''}`}>
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
            {isAnalyticsView ? (
              <BarChart3 size={14} />
            ) : isGithubView ? (
              <Globe size={14} />
            ) : isLocalReposView ? (
              <FolderGit2 size={14} />
            ) : (
              <GitBranch size={14} />
            )}
          </div>
          <span className="topbar-repo-title">
            {isAnalyticsView
              ? tr('Statistik & Analyse', 'Statistics & analytics')
              : isGithubView
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
          {isAnalyticsView && <RepositoryAnalyticsToolbar repoPath={activeRepo} />}
          {!isWorkspaceView && (
            <TopbarActions
              activeRepo={activeRepo}
              branches={branches}
              currentBranch={currentBranch}
              isGitActionRunning={isGitActionRunning || isTransferRunning}
              isFetching={remoteSync.isFetching}
              activeActionLabel={activeGitActionLabel}
              onFetch={() => showTransfer('fetch')}
              onPull={() => showTransfer('pull')}
              onPullRebase={() => showTransfer('pull', { pullMode: 'rebase' })}
              onPullFfOnly={() => showTransfer('pull', { pullMode: 'ff-only' })}
              onPullNoFf={() => showTransfer('pull', { pullMode: 'no-ff' })}
              onPush={() => showTransfer('push')}
              onPushForceWithLease={() => showTransfer('push', { force: true })}
              onPushTags={() => showTransfer('push', { tagNames: tags, selectTags: true })}
              onPushSetUpstream={() => showTransfer('remotes')}
              onMergeBranch={onMergeBranch}
              onStageCommit={() => {
                onCloseRunConfig();
                onCloseRemoteConfig();
                onStageCommit();
              }}
              onOpenReleaseCreator={() => {
                onOpenReleaseCreator();
              }}
              repositoryRun={repositoryRunForActiveRepo}
              activeRunConfig={activeRunConfig}
              hasUnreadRepositoryRunResult={hasUnreadRepositoryRunResult}
              onStartRepositoryRun={async (action) => {
                const started = await onStartRepositoryRun(action);
                if (started) {
                  if (isRepositoryPublicationOpen) onCloseRepositoryPublication?.();
                  onCloseRunConfig();
                  setActiveTab('repo');
                }
                return started;
              }}
              onStopRepositoryRun={onStopRepositoryRun}
              onOpenRunConsole={() => {
                if (isRepositoryPublicationOpen) onCloseRepositoryPublication?.();
                onCloseRunConfig();
                setActiveTab('repo');
                onOpenRunConsole();
              }}
              onOpenRunSettings={() => {
                if (!activeRepo) return;
                setActiveTab('repo');
                onOpenRunConfig();
              }}
              onOpenSecretScanAllowlist={onOpenSecretScanAllowlist}
              onOpenRemoteConfig={onOpenRemoteConfig}
              onOpenRepositoryAnalytics={onOpenRepositoryAnalytics}
              onPublishRepository={() => onPublishRepository?.()}
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
      <RemoteTransferHost
        onOpenConfiguration={(repoPath) => {
          if (repoPath === activeRepo) onOpenRemoteConfig();
        }}
      />
    </>
  );
};
