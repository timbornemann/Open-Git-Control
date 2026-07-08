import React from 'react';
import {
  useGithubContext,
  useRepositoryContext,
  useUIContext,
  useWorkflowContext,
} from '../../contexts/AppStateContext';
import { useI18n } from '../../i18n';
import { useWorkingTreeSnapshot } from '../../hooks/useWorkingTreeSnapshot';
import { useMainViewInspector } from './hooks/useMainViewInspector';
import { useMainViewPaneResizer } from './hooks/useMainViewPaneResizer';
import { MainInspectorPane } from './main/MainInspectorPane';
import { MainPrimaryPane } from './main/MainPrimaryPane';
import { MainTopbar } from './main/MainTopbar';
import { useInspectorPaneVisibility } from './main/useInspectorPaneVisibility';
import { useMainViewTimeline } from './main/useMainViewTimeline';

export const MainView: React.FC = () => {
  const ui = useUIContext();
  const repository = useRepositoryContext();
  const github = useGithubContext();
  const workflow = useWorkflowContext();
  const { tr } = useI18n();
  const workingTree = useWorkingTreeSnapshot(repository.activeRepo, repository.refreshTrigger);

  const {
    primaryPaneBasis,
    isContentResizing,
    contentAreaRef,
    handleContentResizeStart,
  } = useMainViewPaneResizer();

  const {
    activeDiffRequest,
    activeConflictPath,
    setActiveConflictPath,
    showRecoveryCenter,
    setShowRecoveryCenter,
    commitHistoryStack,
    workingTreeSelection,
    isCommitInspectorOpen,
    handleToggleRecoveryCenter,
    handleOpenDiff,
    handleOpenConflictResolver,
    handleSelectCommitDirect,
    handleSelectCommitFromHistory,
    handleSelectWorkingTreeFile,
    handleSelectCommitFromWorkingTree,
    handleCommitBack,
    closeInspector,
    handleStageCommitOpen,
  } = useMainViewInspector({
    autoOpenConflictResolverPath: workflow.autoOpenConflictResolverPath,
    onAutoOpenConflictResolverConsumed: workflow.onAutoOpenConflictResolverConsumed,
    setSelectedCommit: repository.setSelectedCommit,
    activeRepo: repository.activeRepo,
    onOpenRepoWorkspace: repository.onOpenRepoWorkspace,
    onCloseReleaseCreator: github.onCloseReleaseCreator,
    commitNavigationRequest: repository.commitNavigationRequest,
    onNavigateToCommit: repository.onNavigateToCommit,
  });

  const {
    isInspectorPaneVisible,
    toggleInspectorPane,
    hideInspectorPane,
  } = useInspectorPaneVisibility();

  const {
    showTimeline,
    setShowTimeline,
    isTimelineLoading,
    timelineCommits,
    openTimeline,
  } = useMainViewTimeline({
    activeRepo: repository.activeRepo,
    setActiveTab: ui.setActiveTab,
    onCloseReleaseCreator: github.onCloseReleaseCreator,
    tr,
  });

  React.useEffect(() => {
    if (github.showReleaseCreator) setShowTimeline(false);
  }, [github.showReleaseCreator, setShowTimeline]);

  const isSettingsView = ui.activeTab === 'settings';
  const isPlannerView = ui.activeTab === 'planner';
  const isReleaseView = ui.activeTab === 'repo' && github.showReleaseCreator;
  const canShowInspectorPane = !isSettingsView && !isPlannerView && !isReleaseView;
  const showInspectorPane = canShowInspectorPane && isInspectorPaneVisible;

  return (
    <div className="main-view">
      <MainTopbar
        canShowInspectorPane={canShowInspectorPane}
        showInspectorPane={showInspectorPane}
        onToggleInspectorPane={toggleInspectorPane}
        onStageCommit={handleStageCommitOpen}
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
          activeConflictPath={activeConflictPath}
          showRecoveryCenter={showRecoveryCenter}
          setActiveConflictPath={setActiveConflictPath}
          setShowRecoveryCenter={setShowRecoveryCenter}
          closeInspector={closeInspector}
          handleOpenDiff={handleOpenDiff}
          handleToggleRecoveryCenter={handleToggleRecoveryCenter}
          handleSelectCommitDirect={handleSelectCommitDirect}
        />

        {showInspectorPane && (
          <MainInspectorPane
            isContentResizing={isContentResizing}
            onContentResizeStart={handleContentResizeStart}
            onHideInspectorPane={hideInspectorPane}
            workingTree={workingTree}
            commitHistoryStack={commitHistoryStack}
            workingTreeSelection={workingTreeSelection}
            isCommitInspectorOpen={isCommitInspectorOpen}
            handleOpenDiff={handleOpenDiff}
            handleOpenConflictResolver={handleOpenConflictResolver}
            handleSelectCommitFromHistory={handleSelectCommitFromHistory}
            handleSelectWorkingTreeFile={handleSelectWorkingTreeFile}
            handleSelectCommitFromWorkingTree={handleSelectCommitFromWorkingTree}
            handleCommitBack={handleCommitBack}
            closeInspector={closeInspector}
          />
        )}
      </div>
    </div>
  );
};
