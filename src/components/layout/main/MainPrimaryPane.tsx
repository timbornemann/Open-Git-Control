/* eslint-disable complexity -- this component is the intentionally central primary-pane route switch. */
import React from 'react';
import { RecoveryCenter } from '@/components/RecoveryCenter';
import { StagingArea } from '@/components/staging-area';
import { useGithubContext, useRepositoryContext, useSettingsContext, useUIContext, useWorkflowContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { DiffRequest } from '@/types/diff';
import type { FileTimelineCommitDto } from '@/types/gitDtos';
import type { WorkingTreeState } from '@/hooks/useWorkingTreeSnapshot';
import { PRIMARY_PANE_MIN_WIDTH } from '@/components/layout/hooks/useMainViewPaneResizer';
import { GithubAuthGuide } from './GithubAuthGuide';
import type { GithubAuthHelpMethod } from '@/app/state/contracts';
import { getMainPrimaryRoute, getMainPrimaryTitle, hasMainPrimaryHeader } from './mainPrimaryRoute';
import { WorkingDirectoryFileViewer } from '@/components/working-directory/WorkingDirectoryFileViewer';
import { RepositoryRunConsole } from '@/components/repository-run/RepositoryRunConsole';

const CommitGraph = React.lazy(() => import('@/components/commit-graph').then((module) => ({ default: module.CommitGraph })));
const DiffViewer = React.lazy(() => import('@/components/diff-viewer').then((module) => ({ default: module.DiffViewer })));
const FileTimelineView = React.lazy(() => import('@/components/FileTimelineView').then((module) => ({ default: module.FileTimelineView })));
const ProjectPlannerView = React.lazy(() => import('@/components/project-planner').then((module) => ({ default: module.ProjectPlannerView })));
const ReleaseCreator = React.lazy(() => import('@/components/release-creator/ReleaseCreator').then((module) => ({ default: module.ReleaseCreator })));
const SettingsMainContent = React.lazy(() => import('@/components/layout/SettingsMainContent').then((module) => ({ default: module.SettingsMainContent })));

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
}) => {
  const ui = useUIContext();
  const settingsState = useSettingsContext();
  const repository = useRepositoryContext();
  const github = useGithubContext();
  const workflow = useWorkflowContext();
  const { t } = useI18n();
  const [workingDirectoryCloseRequest, setWorkingDirectoryCloseRequest] = React.useState<(() => void) | null>(null);
  const handleWorkingDirectoryCloseRequestChange = React.useCallback((request: (() => void) | null) => {
    setWorkingDirectoryCloseRequest(() => request);
  }, []);

  const route = getMainPrimaryRoute({
    activeConflictPath,
    activeDiffRequest,
    workingDirectoryFilePath,
    activeTab: ui.activeTab,
    isAuthenticated: github.isAuthenticated,
    selectedGithubAuthHelpMethod: github.selectedGithubAuthHelpMethod,
    showRecoveryCenter,
    showReleaseCreator: github.showReleaseCreator,
    showTimeline,
    showRunConsole: workflow.isRunConsoleOpen && Boolean(workflow.repositoryRun),
  });
  const showGithubGuide = route === 'githubGuide';
  const isSettingsView = route === 'settings';
  const isPlannerView = route === 'planner';
  const isReleaseView = route === 'release';
  const isTimelineView = route === 'timeline';
  const isRunConsoleView = route === 'runConsole';
  const primaryPaneTitle = getMainPrimaryTitle(route, t);
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
        isSettingsView || isPlannerView || isReleaseView || !showInspectorPane
          ? { minWidth: 0 }
          : { flex: `0 0 ${primaryPaneBasis}`, minWidth: `${PRIMARY_PANE_MIN_WIDTH}px` }
      }
    >
      {shouldShowPrimaryPaneHeader && (
        <div className={`pane-header pane-header-main${activeConflictPath ? ' pane-header-main--conflict' : ''}`}>
          <span className="pane-header-main-title">{primaryPaneTitle}</span>
          {isSettingsView ? null : isReleaseView ? (
            <button className="icon-btn pane-header-nav-btn" onClick={github.onCloseReleaseCreator}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : isTimelineView ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => setShowTimeline(false)}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : showGithubGuide ? (
            <button className="icon-btn pane-header-nav-btn" onClick={ui.onClearGithubAuthHelpMethod}>
              {t('generated.components.layout.main.maininspectorpane.back_c5e2bc76')}
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
        {isPlannerView ? (
          <React.Suspense fallback={lazyPaneFallback}>
            <ProjectPlannerView />
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
        ) : isReleaseView ? (
          <React.Suspense fallback={lazyPaneFallback}>
            <ReleaseCreator
              ownerRepo={
                github.prOwnerRepo?.headOwner
                  ? { owner: github.prOwnerRepo.headOwner, repo: github.prOwnerRepo.headRepo || github.prOwnerRepo.repo }
                  : github.prOwnerRepo
              }
              releaseForm={github.releaseForm}
              setReleaseForm={github.setReleaseForm}
              releaseSubmitting={github.releaseSubmitting}
              releaseError={github.releaseError}
              releaseSuccess={github.releaseSuccess}
              onCreateRelease={github.onCreateRelease}
              pendingAssets={github.releasePendingAssets}
              onAddPendingAssets={github.onAddReleasePendingAssets}
              onRemovePendingAsset={github.onRemoveReleasePendingAsset}
              contextLoading={github.releaseContextLoading}
              contextError={github.releaseContextError}
              context={github.releaseContext}
              onRefreshContext={github.onRefreshReleaseContext}
              onGenerateNotes={github.onGenerateReleaseNotes}
              notesGenerating={github.releaseNotesGenerating}
              notesLanguage={github.releaseNotesLanguage}
              setNotesLanguage={github.setReleaseNotesLanguage}
              notesOptions={github.releaseNotesOptions}
              setNotesOptions={github.setReleaseNotesOptions}
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
        ) : activeDiffRequest || (!showGithubGuide && !showRecoveryCenter) ? (
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
                refreshTrigger={repository.refreshTrigger}
                commitRefreshTrigger={repository.commitRefreshTrigger}
                showSecondaryHistory={repository.showSecondaryHistory}
                onOpenDiff={handleOpenDiff}
                showRecoveryCenter={showRecoveryCenter}
                onToggleRecoveryCenter={handleToggleRecoveryCenter}
                currentBranch={repository.currentBranch}
                branches={repository.branches}
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
        ) : showGithubGuide ? (
          <GithubAuthGuide method={github.selectedGithubAuthHelpMethod as Exclude<GithubAuthHelpMethod, null>} onClose={ui.onClearGithubAuthHelpMethod} />
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
