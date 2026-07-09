import React, { useCallback, useMemo, useState } from 'react';
import { AppSidebar } from './components/layout/AppSidebar';
import { MainView } from './components/layout/MainView';
import { OverlayManager } from './components/layout/OverlayManager';
import { useAppState } from './components/layout/useAppState';
import type { SettingsTabId } from './components/layout/sidebar/AppSidebar.types';
import { I18nProvider, translateFromCatalog, type TranslationVariables } from './i18n';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { useRepoSwitcherKeyboard } from './hooks/useRepoSwitcherKeyboard';
import { useResizableSidebar } from './hooks/useResizableSidebar';
import { AppStateSlicesProvider } from './contexts/AppStateContext';
import { ProjectPlannerProvider } from './contexts/ProjectPlannerContext';
import { createAppStateSlicesValue } from './app/createAppStateSlicesValue';
import { useAppPaletteCommands } from './app/useAppPaletteCommands';

const App: React.FC = () => {
  const state = useAppState();
  const tr = useCallback((deText: string, enText: string) => (state.settings.language === 'en' ? enText : deText), [state.settings.language]);
  const t = useCallback(
    (key: string, variables?: TranslationVariables) => translateFromCatalog(state.settings.language, key, variables),
    [state.settings.language],
  );
  const [selectedGithubAuthHelpMethod, setSelectedGithubAuthHelpMethod] = useState<'pat' | 'device' | 'web' | null>('pat');
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const { sidebarWidth, isSidebarCollapsed, isSidebarResizing, resetLayout, handleToggleSidebar, handleSidebarResizeStart } = useResizableSidebar();
  const { repoSwitcherIndex, repoSwitcherListRef } = useRepoSwitcherKeyboard({
    openRepos: state.openRepos,
    activeRepo: state.activeRepo,
    onSwitchRepo: state.handleSwitchRepo,
    onRepositoryCommitted: () => state.setActiveTab('repo'),
  });

  const paletteCommands = useAppPaletteCommands({ state, t });

  useGlobalKeyboardShortcuts({
    setActiveTab: state.setActiveTab,
    onFetch: () => state.refreshRemoteState(true),
    onOpenCommandPalette: () => setIsPaletteOpen(true),
  });

  const activeTransferCommand = state.activeGitCommand === 'pull' || state.activeGitCommand === 'fetch' ? state.activeGitCommand : null;
  const activeTransferEvents = useMemo(() => {
    if (!activeTransferCommand) return [];

    const operation = `git:${activeTransferCommand}`;
    const latestEvent = state.jobs.find((event) => event.operation === operation);
    if (!latestEvent || latestEvent.status === 'done' || latestEvent.status === 'failed' || latestEvent.status === 'cancelled') {
      return [];
    }

    return state.jobs
      .filter((event) => event.id === latestEvent.id)
      .slice()
      .reverse();
  }, [activeTransferCommand, state.jobs]);
  const showGitTransferProgress = Boolean(activeTransferCommand && state.isGitActionRunning && !state.isCloning);
  const handleBranchMenuCheckout = useCallback(
    (branch: string) => {
      if (branch.startsWith('remotes/')) {
        void state.handleCheckoutRemoteBranch(branch);
        return;
      }
      void state.runGitCommand(['checkout', branch], tr(`Ausgecheckt: ${branch}`, `Checked out: ${branch}`));
    },
    [state, tr],
  );
  const handleCloneProgressClose = useCallback(() => {
    state.closeCloneProgress();
    state.triggerRefresh();
  }, [state]);

  const appStateSlices = createAppStateSlicesValue({
    state,
    selectedGithubAuthHelpMethod,
    setSelectedGithubAuthHelpMethod,
    settingsTab,
    setSettingsTab,
    resetLayout,
    t,
    tr,
    uiState: {
      sidebarWidth,
      isSidebarCollapsed,
      isSidebarResizing,
      onToggleSidebar: handleToggleSidebar,
      onSidebarResizeStart: handleSidebarResizeStart,
      isCommandPaletteOpen: isPaletteOpen,
      setCommandPaletteOpen: setIsPaletteOpen,
      branchContextMenu: state.branchContextMenu,
      setBranchContextMenu: state.setBranchContextMenu,
      confirmDialog: state.confirmDialog,
      setConfirmDialog: state.setConfirmDialog,
      inputDialog: state.inputDialog,
      setInputDialog: state.setInputDialog,
      closeConfirmDialog: state.closeConfirmDialog,
      executeConfirmDialog: state.executeConfirmDialog,
      executeConfirmDialogSecondary: state.executeConfirmDialogSecondary,
      closeInputDialog: state.closeInputDialog,
      executeInputDialog: state.executeInputDialog,
    },
  });

  return (
    <I18nProvider language={state.settings.language}>
      <AppStateSlicesProvider value={appStateSlices}>
        <ProjectPlannerProvider
          activeRepo={state.activeRepo}
          refreshSignal={state.plannerRefreshSignal}
          onRepositorySelected={state.addOpenRepo}
          onRepositoryMaterialized={async (repoPath) => {
            await state.addOpenRepo(repoPath);
            state.setActiveTab('planner');
            state.setGitActionToast({
              msg: t('generated.app.created_project_folder_and_initialized_git_repository_1d314004'),
              isError: false,
            });
          }}
          onToast={(message, isError) => state.setGitActionToast({ msg: message, isError })}
          setConfirmDialog={state.setConfirmDialog}
        >
          <div
            className={`app-container${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
            style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
          >
            <AppSidebar />

            {!isSidebarCollapsed && (
              <div
                className={`pane-resizer app-sidebar-resizer ${isSidebarResizing ? 'dragging' : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label={t('generated.app.resize_sidebar_width_d9368c0f')}
                onPointerDown={handleSidebarResizeStart}
              />
            )}

            <MainView />

            <OverlayManager
              repoSwitcher={{
                selectedIndex: repoSwitcherIndex,
                listRef: repoSwitcherListRef,
                openRepos: state.openRepos,
                activeRepo: state.activeRepo,
              }}
              toasts={{
                items: state.gitActionToasts,
                onDismiss: state.dismissToast,
              }}
              branchMenu={{
                menu: state.branchContextMenu,
                setMenu: state.setBranchContextMenu,
                onCheckout: handleBranchMenuCheckout,
                onMerge: state.handleMergeBranch,
                onRename: state.handleRenameBranch,
                onDelete: state.handleDeleteBranch,
              }}
              dialogs={{
                confirmDialog: state.confirmDialog,
                inputDialog: state.inputDialog,
                onConfirm: state.executeConfirmDialog,
                onSecondaryConfirm: state.executeConfirmDialogSecondary,
                onCancelConfirm: state.closeConfirmDialog,
                onSubmitInput: state.executeInputDialog,
                onCancelInput: state.closeInputDialog,
              }}
              gitTransfer={{
                open: showGitTransferProgress,
                title: state.activeGitActionLabel,
                events: activeTransferEvents,
              }}
              cloneProgress={{
                isCloning: state.isCloning,
                cloneRepoName: state.cloneRepoName,
                cloneFinished: state.cloneFinished,
                cloneError: state.cloneError,
                cloneLog: state.cloneLog,
                onClose: handleCloneProgressClose,
              }}
              commandPalette={{
                open: isPaletteOpen,
                commands: paletteCommands,
                onClose: () => setIsPaletteOpen(false),
              }}
            />
          </div>
        </ProjectPlannerProvider>
      </AppStateSlicesProvider>
    </I18nProvider>
  );
};

export default App;
