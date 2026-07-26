import React from 'react';
import { useGitHubStore, useGitStore, useUIStore, useWorkflowStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { useWorkingTreeSnapshot } from '@/hooks/useWorkingTreeSnapshot';
import { useMainViewInspector } from './hooks/useMainViewInspector';
import { useMainViewPaneResizer } from './hooks/useMainViewPaneResizer';
import { MainInspectorPane } from './main/MainInspectorPane';
import { MainPrimaryPane } from './main/MainPrimaryPane';
import { MainTopbar } from './main/MainTopbar';
import { useInspectorPaneVisibility } from './main/useInspectorPaneVisibility';
import { useMainViewTimeline } from './main/useMainViewTimeline';
import { APPLICATION_OPEN_STAGING_COMMIT_EVENT } from '@/utils/layoutPreferences';

const MainViewComponent: React.FC = () => {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const activeRepo = useGitStore((state) => state.activeRepo);
  const refreshTrigger = useGitStore((state) => state.refreshTrigger);
  const setSelectedCommit = useGitStore((state) => state.setSelectedCommit);
  const onOpenRepoWorkspace = useGitStore((state) => state.onOpenRepoWorkspace);
  const commitNavigationRequest = useGitStore((state) => state.commitNavigationRequest);
  const onNavigateToCommit = useGitStore((state) => state.onNavigateToCommit);
  const showReleaseCreator = useGitHubStore((state) => state.showReleaseCreator);
  const onCloseReleaseCreator = useGitHubStore((state) => state.onCloseReleaseCreator);
  const autoOpenConflictResolverPath = useWorkflowStore((state) => state.autoOpenConflictResolverPath);
  const onAutoOpenConflictResolverConsumed = useWorkflowStore((state) => state.onAutoOpenConflictResolverConsumed);
  const { t } = useI18n();
  const workingTree = useWorkingTreeSnapshot(activeRepo, refreshTrigger);

  const { primaryPaneBasis, isContentResizing, contentAreaRef, handleContentResizeStart } = useMainViewPaneResizer();

  const {
    activeDiffRequest,
    activeConflictPath,
    setActiveConflictPath,
    showRecoveryCenter,
    setShowRecoveryCenter,
    commitHistoryStack,
    workingTreeSelection,
    workingDirectoryFilePath,
    isCommitInspectorOpen,
    handleToggleRecoveryCenter,
    handleOpenDiff,
    handleOpenConflictResolver,
    handleSelectCommitDirect,
    handleSelectCommitFromHistory,
    handleSelectWorkingTreeFile,
    handleOpenWorkingDirectoryFile,
    handleWorkingDirectoryEntryInvalidated,
    setWorkingDirectoryNavigationGuard,
    handleSelectCommitFromWorkingTree,
    handleCommitBack,
    closeInspector,
    handleStageCommitOpen,
  } = useMainViewInspector({
    autoOpenConflictResolverPath,
    onAutoOpenConflictResolverConsumed,
    setSelectedCommit,
    activeRepo,
    onOpenRepoWorkspace,
    onCloseReleaseCreator,
    commitNavigationRequest,
    onNavigateToCommit,
  });

  const { isInspectorPaneVisible, toggleInspectorPane, revealInspectorPane } = useInspectorPaneVisibility();

  // Owned here rather than inside MainInspectorPane because that pane unmounts
  // whenever a non-inspector view (planner, settings, release) takes over. Keeping
  // the directory mode and expanded folders at this always-mounted level lets them
  // survive those round-trips instead of resetting to defaults on every return.
  const [directoryMode, setDirectoryMode] = React.useState<'staging' | 'tree'>('staging');
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = React.useState<Set<string>>(() => new Set(['']));
  // Folder expansion is per-repository, so drop the previous repo's paths on switch.
  React.useEffect(() => {
    setExpandedDirectoryPaths(new Set(['']));
  }, [activeRepo]);

  const { showTimeline, setShowTimeline, isTimelineLoading, timelineCommits, openTimeline } = useMainViewTimeline({
    activeRepo,
    setActiveTab,
    onCloseReleaseCreator,
    t,
  });

  React.useEffect(() => {
    if (showReleaseCreator) setShowTimeline(false);
  }, [showReleaseCreator, setShowTimeline]);

  const handleRepositoryStagingOpen = React.useCallback(() => {
    setShowTimeline(false);
    handleStageCommitOpen();
  }, [handleStageCommitOpen, setShowTimeline]);

  React.useEffect(() => {
    const handleOpenStagingCommit = () => {
      handleRepositoryStagingOpen();
      revealInspectorPane();
    };

    window.addEventListener(APPLICATION_OPEN_STAGING_COMMIT_EVENT, handleOpenStagingCommit);
    return () => window.removeEventListener(APPLICATION_OPEN_STAGING_COMMIT_EVENT, handleOpenStagingCommit);
  }, [handleRepositoryStagingOpen, revealInspectorPane]);

  const isSettingsView = activeTab === 'settings';
  const isPlannerView = activeTab === 'planner';
  const isReleaseView = activeTab === 'repo' && showReleaseCreator;
  const canShowInspectorPane = !isSettingsView && !isPlannerView && !isReleaseView;
  const showInspectorPane = canShowInspectorPane && isInspectorPaneVisible;

  return (
    <div className="main-view">
      <MainTopbar
        canShowInspectorPane={canShowInspectorPane}
        showInspectorPane={showInspectorPane}
        onToggleInspectorPane={toggleInspectorPane}
        onStageCommit={handleRepositoryStagingOpen}
        onOpenTimeline={openTimeline}
        isTimelineLoading={isTimelineLoading}
      />

      <div ref={contentAreaRef} className="content-area">
        <MainPrimaryPane
          primaryPaneBasis={primaryPaneBasis}
          showInspectorPane={showInspectorPane}
          showTimeline={showTimeline}
          setShowTimeline={setShowTimeline}
          timelineCommits={timelineCommits}
          workingTree={workingTree}
          activeDiffRequest={activeDiffRequest}
          workingDirectoryFilePath={workingDirectoryFilePath}
          activeConflictPath={activeConflictPath}
          showRecoveryCenter={showRecoveryCenter}
          setActiveConflictPath={setActiveConflictPath}
          setShowRecoveryCenter={setShowRecoveryCenter}
          closeInspector={closeInspector}
          handleOpenDiff={handleOpenDiff}
          handleToggleRecoveryCenter={handleToggleRecoveryCenter}
          handleSelectCommitDirect={handleSelectCommitDirect}
          onWorkingDirectoryNavigationGuardChange={setWorkingDirectoryNavigationGuard}
        />

        {showInspectorPane && (
          <MainInspectorPane
            isContentResizing={isContentResizing}
            onContentResizeStart={handleContentResizeStart}
            workingTree={workingTree}
            commitHistoryStack={commitHistoryStack}
            workingTreeSelection={workingTreeSelection}
            onOpenWorkingDirectoryFile={handleOpenWorkingDirectoryFile}
            workingDirectoryFilePath={workingDirectoryFilePath}
            onWorkingDirectoryEntryInvalidated={handleWorkingDirectoryEntryInvalidated}
            isCommitInspectorOpen={isCommitInspectorOpen}
            handleOpenDiff={handleOpenDiff}
            handleOpenConflictResolver={handleOpenConflictResolver}
            handleSelectCommitFromHistory={handleSelectCommitFromHistory}
            handleSelectWorkingTreeFile={handleSelectWorkingTreeFile}
            handleSelectCommitFromWorkingTree={handleSelectCommitFromWorkingTree}
            handleCommitBack={handleCommitBack}
            closeInspector={closeInspector}
            directoryMode={directoryMode}
            onDirectoryModeChange={setDirectoryMode}
            expandedDirectoryPaths={expandedDirectoryPaths}
            onExpandedDirectoryPathsChange={setExpandedDirectoryPaths}
          />
        )}
      </div>
    </div>
  );
};

export const MainView = React.memo(MainViewComponent);
