import React from 'react';
import { useGitStore, useUIStore, useWorkflowStore } from '@/contexts/AppStateContext';
import { useWorkingTreeSnapshot } from '@/hooks/useWorkingTreeSnapshot';
import { useMainViewInspector } from './hooks/useMainViewInspector';
import { useMainViewPaneResizer } from './hooks/useMainViewPaneResizer';
import { MainInspectorPane } from './main/MainInspectorPane';
import { MainPrimaryPane } from './main/MainPrimaryPane';
import { MainTopbar } from './main/MainTopbar';
import { useInspectorPaneVisibility } from './main/useInspectorPaneVisibility';
import { APPLICATION_OPEN_STAGING_COMMIT_EVENT, type OpenStagingCommitOptions } from '@/utils/layoutPreferences';
import { clearCommitShortcutRequest, requestCommitShortcut } from '@/components/staging-area/commitShortcutState';

const MainViewComponent: React.FC = () => {
  const activeTab = useUIStore((state) => state.activeTab);
  const isRunConfigOpen = useUIStore((state) => state.isRunConfigOpen);
  const onCloseRunConfig = useUIStore((state) => state.onCloseRunConfig);
  const isSecretScanAllowlistOpen = useUIStore((state) => state.isSecretScanAllowlistOpen);
  const onCloseSecretScanAllowlist = useUIStore((state) => state.onCloseSecretScanAllowlist);
  const isRemoteConfigOpen = useUIStore((state) => state.isRemoteConfigOpen);
  const onCloseRemoteConfig = useUIStore((state) => state.onCloseRemoteConfig);
  const isReleaseCreatorOpen = useUIStore((state) => state.isReleaseCreatorOpen);
  const isRepositoryPublicationOpen = useUIStore((state) => state.isRepositoryPublicationOpen);
  const onCloseRepositoryPublication = useUIStore((state) => state.onCloseRepositoryPublication);
  const onCloseReleaseCreator = useUIStore((state) => state.onCloseReleaseCreator);
  const activeRepo = useGitStore((state) => state.activeRepo);
  const activeRepoRef = React.useRef(activeRepo);
  activeRepoRef.current = activeRepo;
  const refreshTrigger = useGitStore((state) => state.refreshTrigger);
  const setSelectedCommit = useGitStore((state) => state.setSelectedCommit);
  const onOpenRepoWorkspace = useGitStore((state) => state.onOpenRepoWorkspace);
  const commitNavigationRequest = useGitStore((state) => state.commitNavigationRequest);
  const onNavigateToCommit = useGitStore((state) => state.onNavigateToCommit);
  const autoOpenConflictResolverPath = useWorkflowStore((state) => state.autoOpenConflictResolverPath);
  const onAutoOpenConflictResolverConsumed = useWorkflowStore((state) => state.onAutoOpenConflictResolverConsumed);

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
    workingDirectoryFilePosition,
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
    closeWorkingTreeFileDetails,
    handleStageCommitOpen,
  } = useMainViewInspector({
    autoOpenConflictResolverPath,
    onAutoOpenConflictResolverConsumed,
    setSelectedCommit,
    activeRepo,
    onOpenRepoWorkspace,
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
    clearCommitShortcutRequest();
  }, [activeRepo]);

  const handleRepositoryStagingOpen = React.useCallback(
    (onOpened?: () => void) => {
      handleStageCommitOpen(
        () => {
          setDirectoryMode('staging');
          revealInspectorPane();
          onOpened?.();
        },
        () => {
          onCloseRunConfig();
          onCloseRemoteConfig();
          onCloseSecretScanAllowlist();
          if (isReleaseCreatorOpen) onCloseReleaseCreator();
          if (isRepositoryPublicationOpen) onCloseRepositoryPublication?.();
        },
      );
    },
    [
      handleStageCommitOpen,
      onCloseRunConfig,
      onCloseRemoteConfig,
      onCloseSecretScanAllowlist,
      onCloseReleaseCreator,
      isReleaseCreatorOpen,
      isRepositoryPublicationOpen,
      onCloseRepositoryPublication,
      revealInspectorPane,
    ],
  );

  React.useEffect(() => {
    const handleOpenStagingCommit = (event: Event) => {
      const options = (event as CustomEvent<OpenStagingCommitOptions | undefined>).detail;
      if (options && options.repoPath !== activeRepo) return;
      const repoAtStart = activeRepo;
      handleRepositoryStagingOpen(() => {
        if (options?.submit && repoAtStart && repoAtStart === activeRepoRef.current) requestCommitShortcut(repoAtStart);
      });
    };

    window.addEventListener(APPLICATION_OPEN_STAGING_COMMIT_EVENT, handleOpenStagingCommit);
    return () => window.removeEventListener(APPLICATION_OPEN_STAGING_COMMIT_EVENT, handleOpenStagingCommit);
  }, [activeRepo, handleRepositoryStagingOpen]);

  const isSettingsView = activeTab === 'settings';
  const isPlannerView = activeTab === 'planner';
  const isHostingView = activeTab === 'github' || activeTab === 'hosting';
  const isLocalReposView = activeTab === 'localRepos';
  const isAnalyticsView = activeTab === 'analytics';
  const canShowInspectorPane =
    !isSettingsView &&
    !isPlannerView &&
    !isHostingView &&
    !isLocalReposView &&
    !isAnalyticsView &&
    !(
      activeTab === 'repo' &&
      (showRecoveryCenter || isRunConfigOpen || isRemoteConfigOpen || isSecretScanAllowlistOpen || isReleaseCreatorOpen || isRepositoryPublicationOpen)
    );
  const showInspectorPane = canShowInspectorPane && isInspectorPaneVisible;
  const workingTree = useWorkingTreeSnapshot(activeRepo, refreshTrigger, canShowInspectorPane);
  const previousCommitContextRef = React.useRef({ visible: showInspectorPane, directoryMode, tab: activeTab });
  React.useEffect(() => {
    const previous = previousCommitContextRef.current;
    previousCommitContextRef.current = { visible: showInspectorPane, directoryMode, tab: activeTab };
    // The app context can update after the local pane state. Cancel only when
    // leaving staging, not during the intermediate render that is opening it.
    if (
      (previous.visible && !showInspectorPane) ||
      (previous.directoryMode === 'staging' && directoryMode === 'tree') ||
      (previous.tab !== activeTab && activeTab !== 'repo')
    )
      clearCommitShortcutRequest();
  }, [showInspectorPane, directoryMode, activeTab]);

  return (
    <div className="main-view">
      <MainTopbar
        canShowInspectorPane={canShowInspectorPane}
        showInspectorPane={showInspectorPane}
        onToggleInspectorPane={toggleInspectorPane}
        onStageCommit={() => handleRepositoryStagingOpen()}
      />

      <div ref={contentAreaRef} className="content-area">
        <MainPrimaryPane
          primaryPaneBasis={primaryPaneBasis}
          showInspectorPane={showInspectorPane}
          workingTree={workingTree}
          activeDiffRequest={activeDiffRequest}
          workingDirectoryFilePath={workingDirectoryFilePath}
          workingDirectoryFilePosition={workingDirectoryFilePosition}
          onOpenWorkingDirectoryFile={handleOpenWorkingDirectoryFile}
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
            activeDiffRequest={activeDiffRequest}
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
            closeWorkingTreeFileDetails={closeWorkingTreeFileDetails}
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
