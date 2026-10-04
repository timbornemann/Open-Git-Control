import { viewModules } from '@/data/viewModules';
/* eslint-disable complexity -- this component is the intentionally central primary-pane route switch. */
import React from 'react';
import { RecoveryCenter } from '@/components/RecoveryCenter';
import { StagingArea } from '@/components/staging-area';
import { useRepositoryContext, useSettingsContext, useUIContext, useWorkflowContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { DiffRequest } from '@/types/diff';
import type { WorkingDirectoryNavigationGuard } from '@/components/layout/hooks/useMainViewInspector';
import type { FileTimelineCommitDto } from '@/types/gitDtos';
import type { WorkingTreeState } from '@/hooks/useWorkingTreeSnapshot';
import { PRIMARY_PANE_MIN_WIDTH } from '@/components/layout/hooks/useMainViewPaneResizer';
import { getMainPrimaryRoute, getMainPrimaryTitle, hasMainPrimaryHeader } from './mainPrimaryRoute';
import { WorkingDirectoryFileViewer } from '@/components/working-directory/WorkingDirectoryFileViewer';
import { RepositoryRunConsole } from '@/components/repository-run/RepositoryRunConsole';
import { LocalRepositoriesView } from '@/components/local-repositories/LocalRepositoriesView';
import { RepositoryRunConfigView } from '@/components/repository-run/RepositoryRunConfigView';
import { RemoteConfigurationView } from '@/components/hosting/RemoteConfigurationView';
import { useCommitMessageEditor } from '@/components/commit-graph/useCommitMessageEditor';

const CommitGraph = viewModules.repo.View;
const DiffViewer = viewModules.diff.View;
const FileTimelineView = viewModules.timeline.View;
const ProjectPlannerView = viewModules.planner.View;
const HostingWorkspaceView = viewModules.hosting.View;
const SettingsMainContent = viewModules.settings.View;

type MainPrimaryPaneProps = {
  primaryPaneBasis: string;
  showInspectorPane: boolean;
  showTimeline: boolean;
  setShowTimeline: (value: boolean) => void;
  timelineCommits: FileTimelineCommitDto[];
  workingTree: WorkingTreeState;
  activeDiffRequest: DiffRequest | null;
  workingDirectoryFilePath: string | null;
  activeConflictPath: string | null;
  showRecoveryCenter: boolean;
  setActiveConflictPath: (path: string | null) => void;
  setShowRecoveryCenter: (value: boolean) => void;
  closeInspector: () => void;
  handleOpenDiff: (request: DiffRequest) => void;
  handleToggleRecoveryCenter: () => void;
  handleSelectCommitDirect: (hash: string | null) => void;
  onWorkingDirectoryNavigationGuardChange: (guard: WorkingDirectoryNavigationGuard | null) => void;
};

export const MainPrimaryPane: React.FC<MainPrimaryPaneProps> = ({
  primaryPaneBasis,
  showInspectorPane,
  showTimeline,
  setShowTimeline,
  timelineCommits,
  workingTree,
  activeDiffRequest,
  workingDirectoryFilePath,
  activeConflictPath,
  showRecoveryCenter,
  setActiveConflictPath,
  setShowRecoveryCenter,
  closeInspector,
  handleOpenDiff,
  handleToggleRecoveryCenter,
  handleSelectCommitDirect,
  onWorkingDirectoryNavigationGuardChange,
}) => {
  const ui = useUIContext();
  const settingsState = useSettingsContext();
  const repository = useRepositoryContext();
  const workflow = useWorkflowContext();
  const commitEditor = useCommitMessageEditor(repository.activeRepo, repository.selectedCommit, repository.onNavigateToCommit, repository.triggerRefresh);
  const { t, tr } = useI18n();
  const [workingDirectoryCloseRequest, setWorkingDirectoryCloseRequest] = React.useState<(() => void) | null>(null);
  const handleWorkingDirectoryCloseRequestChange = React.useCallback((request: (() => void) | null) => {
    setWorkingDirectoryCloseRequest(() => request);
  }, []);

  const route = getMainPrimaryRoute({
    activeConflictPath,
    activeDiffRequest,
    workingDirectoryFilePath,
    activeTab: ui.activeTab,
    showRecoveryCenter,
    showTimeline,
    showRunConsole: workflow.isRunConsoleOpen && workflow.repositoryRun?.repoPath === repository.activeRepo,
    showRunConfig: ui.isRunConfigOpen,
    showRemoteConfig: ui.isRemoteConfigOpen,
  });
  const isSettingsView = route === 'settings';
  const isPlannerView = route === 'planner';
  const isHostingView = route === 'hosting';
  const isLocalReposView = route === 'localRepos';
  const isTimelineView = route === 'timeline';
  const isRunConsoleView = route === 'runConsole';
  const isRunConfigView = route === 'runConfig';
  const isRemoteConfigView = route === 'remoteConfig';
  const primaryPaneTitle = getMainPrimaryTitle(route, t, tr);
  const shouldShowPrimaryPaneHeader = hasMainPrimaryHeader(route);
  const lazyPaneFallback = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        padding: '16px',
      }}
    >
      {t('generated.components.layout.sidebar.settingssidebarcontent.loading_7f8a8587')}
    </div>
  );

  return (
    <div
      className="pane"
      style={
        isSettingsView || isPlannerView || isHostingView || isLocalReposView || isRunConfigView || isRemoteConfigView || !showInspectorPane
          ? { minWidth: 0 }
          : { flex: `0 0 ${primaryPaneBasis}`, minWidth: `${PRIMARY_PANE_MIN_WIDTH}px` }
      }
    >
      {commitEditor.dialog}
      {shouldShowPrimaryPaneHeader && (
        <div className={`pane-header pane-header-main${activeConflictPath ? ' pane-header-main--conflict' : ''}`}>
          <span className="pane-header-main-title">{primaryPaneTitle}</span>
          {isSettingsView ? null : isRunConfigView || isRemoteConfigView ? (
            <button className="icon-btn pane-header-nav-btn" onClick={isRemoteConfigView ? ui.onCloseRemoteConfig : ui.onCloseRunConfig}>
              {tr('Zurück zum Repository', 'Back to repository')}
            </button>
          ) : isTimelineView ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => setShowTimeline(false)}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : showRecoveryCenter ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => setShowRecoveryCenter(false)}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : workingDirectoryFilePath ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => workingDirectoryCloseRequest?.() ?? closeInspector()}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : activeConflictPath ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => setActiveConflictPath(null)}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : activeDiffRequest ? (
            <button className="icon-btn pane-header-nav-btn" onClick={closeInspector}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : null}
        </div>
      )}

      <div className="pane-content" style={{ padding: 0 }}>
        {isRemoteConfigView ? (
          <RemoteConfigurationView key={repository.activeRepo ?? ''} repoPath={repository.activeRepo} />
        ) : isRunConfigView ? (
          <RepositoryRunConfigView key={repository.activeRepo ?? ''} />
        ) : isLocalReposView ? (
          <LocalRepositoriesView />
        ) : isPlannerView ? (
          <React.Suspense fallback={lazyPaneFallback}>
            <ProjectPlannerView />
          </React.Suspense>
        ) : isHostingView ? (
          <React.Suspense fallback={lazyPaneFallback}>
            <HostingWorkspaceView />
          </React.Suspense>
        ) : isSettingsView ? (
          <React.Suspense fallback={lazyPaneFallback}>
            <SettingsMainContent
              settings={settingsState.settings}
              onUpdateSettings={settingsState.onUpdateSettings}
              jobs={workflow.jobs}
              onClearJobs={workflow.onClearJobs}
              activeTab={settingsState.settingsTab}
              onResetLayout={ui.onResetLayout}
            />
          </React.Suspense>
        ) : isTimelineView ? (
          <React.Suspense fallback={lazyPaneFallback}>
            <FileTimelineView onClose={() => setShowTimeline(false)} commits={timelineCommits} />
          </React.Suspense>
        ) : isRunConsoleView && workflow.repositoryRun ? (
          <RepositoryRunConsole run={workflow.repositoryRun} onStop={() => void workflow.onStopRepositoryRun()} onBack={workflow.onCloseRunConsole} />
        ) : workingDirectoryFilePath && repository.activeRepo ? (
          <WorkingDirectoryFileViewer
            repoPath={repository.activeRepo}
            path={workingDirectoryFilePath}
            onClose={closeInspector}
            onRepoChanged={repository.triggerRefresh}
            onCloseRequestChange={handleWorkingDirectoryCloseRequestChange}
            onNavigationGuardChange={onWorkingDirectoryNavigationGuardChange}
          />
        ) : activeConflictPath ? (
          <StagingArea
            repoPath={repository.activeRepo}
            onRepoChanged={repository.triggerRefresh}
            onCommitsCreated={repository.triggerCommitRefresh}
            onOpenDiff={handleOpenDiff}
            onCloseConflictResolver={() => setActiveConflictPath(null)}
            viewMode="conflictOnly"
            initialConflictPath={activeConflictPath}
            settings={settingsState.settings}
            workingTreeRepoPath={workingTree.dataRepoPath}
            workingTreeSnapshot={workingTree.snapshot}
            workingTreeStatus={workingTree.status}
            workingTreeStats={workingTree.stats}
            onRefreshWorkingTree={workingTree.refresh}
          />
        ) : activeDiffRequest || !showRecoveryCenter ? (
          <React.Suspense fallback={lazyPaneFallback}>
            <div
              aria-hidden={activeDiffRequest ? true : undefined}
              style={{
                display: activeDiffRequest ? 'none' : 'block',
                height: '100%',
                overflow: 'auto',
                overflowAnchor: 'none',
              }}
            >
              <CommitGraph
                repoPath={repository.activeRepo}
                selectedHash={repository.selectedCommit}
                navigationRequest={repository.commitNavigationRequest}
                onNavigationRequestHandled={repository.onCommitNavigationRequestHandled}
                onSelectCommit={handleSelectCommitDirect}
                onEditCommitMessage={commitEditor.open}
                refreshTrigger={repository.refreshTrigger}
                commitRefreshTrigger={repository.commitRefreshTrigger}
                showSecondaryHistory={repository.showSecondaryHistory}
                onOpenDiff={handleOpenDiff}
                showRecoveryCenter={showRecoveryCenter}
                onToggleRecoveryCenter={handleToggleRecoveryCenter}
                currentBranch={repository.currentBranch}
                branches={repository.branches}
                conflictingTags={repository.tagConflicts}
                onMergeBranch={repository.onMergeBranch}
                onRunGitCommand={workflow.runGitCommand}
                onOpenConflictResolverForPath={workflow.onOpenConflictResolverForPath}
                workingTreeStatus={workingTree.status}
                onRefreshWorkingTree={workingTree.refresh}
              />
            </div>
            {activeDiffRequest && (
              <DiffViewer
                repoPath={repository.activeRepo}
                request={activeDiffRequest}
                onClose={closeInspector}
                onRepoChanged={repository.triggerRefresh}
                onNavigateToCommit={(hash) => {
                  repository.onNavigateToCommit(hash);
                  closeInspector();
                }}
              />
            )}
          </React.Suspense>
        ) : showRecoveryCenter ? (
          <RecoveryCenter
            repoPath={repository.activeRepo}
            refreshTrigger={repository.refreshTrigger}
            onRepoChanged={repository.triggerRefresh}
            settings={settingsState.settings}
          />
        ) : null}
      </div>
    </div>
  );
};
