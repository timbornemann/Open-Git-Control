import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppSidebar } from './components/layout/AppSidebar';
import { MainView } from './components/layout/MainView';
import { BranchContextMenu } from './components/layout/BranchContextMenu';
import { CloneProgressModal } from './components/layout/CloneProgressModal';
import { Confirm } from './components/Confirm';
import { DangerConfirm } from './components/DangerConfirm';
import { Input } from './components/Input';
import { useAppState } from './components/layout/useAppState';
import { I18nProvider } from './i18n';
import './index.css';

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 260;
const APP_RESIZER_WIDTH = 8;
const MIN_MAIN_VIEW_WIDTH = 608;

const App: React.FC = () => {
  const state = useAppState();
  const tr = (deText: string, enText: string) => (state.settings.language === 'en' ? enText : deText);
  const [selectedGithubAuthHelpMethod, setSelectedGithubAuthHelpMethod] = useState<'pat' | 'device' | 'web' | null>('pat');
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const getSidebarMaxWidth = useCallback(() => {
    const maxFromWindow = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - MIN_MAIN_VIEW_WIDTH - APP_RESIZER_WIDTH);
    return Math.min(SIDEBAR_MAX_WIDTH, maxFromWindow);
  }, []);

  const handleSidebarResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    sidebarResizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    setIsSidebarResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = sidebarResizeStateRef.current;
      if (!dragState) return;

      const delta = event.clientX - dragState.startX;
      const nextWidth = Math.round(dragState.startWidth + delta);
      const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(getSidebarMaxWidth(), nextWidth));
      setSidebarWidth(clampedWidth);
    };

    const stopResize = () => {
      if (!sidebarResizeStateRef.current) return;
      sidebarResizeStateRef.current = null;
      setIsSidebarResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [getSidebarMaxWidth]);

  useEffect(() => {
    const clampToViewport = () => {
      const maxWidth = getSidebarMaxWidth();
      setSidebarWidth((previous) => Math.max(SIDEBAR_MIN_WIDTH, Math.min(previous, maxWidth)));
    };

    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [getSidebarMaxWidth]);

  return (
    <I18nProvider language={state.settings.language}>
      <div className="app-container" style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
        <AppSidebar
          activeTab={state.activeTab}
          setActiveTab={state.setActiveTab}
          activeRepo={state.activeRepo}
          openRepos={state.openRepos}
          repoMeta={state.repoMeta}
          onToggleRepoPin={state.handleToggleRepoPin}
          onOpenFolder={state.handleOpenFolder}
          onSwitchRepo={state.handleSwitchRepo}
          onCloseRepo={state.handleCloseRepo}
          isRepoPanelCollapsed={state.isRepoPanelCollapsed}
          onToggleRepoPanelCollapsed={state.toggleRepoPanelCollapsed}
          remoteSync={state.remoteSync}
          isGitActionRunning={state.isGitActionRunning}
          onRefreshRemoteQuick={() => state.refreshRemoteState(true)}
          branches={state.branches}
          isCreatingBranch={state.isCreatingBranch}
          newBranchName={state.newBranchName}
          newBranchInputRef={state.newBranchInputRef}
          onSetCreatingBranch={state.setIsCreatingBranch}
          onSetNewBranchName={state.setNewBranchName}
          onCreateBranch={state.handleCreateBranch}
          onCheckoutBranch={(name) => state.runGitCommand(['checkout', name], tr(`Ausgecheckt: ${name}`, `Checked out: ${name}`))}
          onSetBranchContextMenu={state.setBranchContextMenu}
          isBranchPanelCollapsed={state.isBranchPanelCollapsed}
          onToggleBranchPanelCollapsed={state.toggleBranchPanelCollapsed}
          tags={state.tags}
          onCreateTag={state.handleCreateTag}
          onPushTags={state.handlePushTags}
          onDeleteTag={state.handleDeleteTag}
          isTagPanelCollapsed={state.isTagPanelCollapsed}
          onToggleTagPanelCollapsed={state.toggleTagPanelCollapsed}
          remotes={state.remotes}
          remoteStatus={state.remoteStatus}
          remoteOnlyBranchesCount={state.remoteOnlyBranches.length}
          remoteOnlyBranches={state.remoteOnlyBranches.map(branch => branch.name)}
          onAddRemote={state.handleAddRemote}
          onRemoveRemote={state.handleRemoveRemote}
          onRefreshRemote={() => state.refreshRemoteState(true)}
          onSetUpstreamForCurrentBranch={state.handleSetUpstreamForCurrentBranch}
          onCheckoutRemoteBranch={state.handleCheckoutRemoteBranch}
          isRemotePanelCollapsed={state.isRemotePanelCollapsed}
          onToggleRemotePanelCollapsed={state.toggleRemotePanelCollapsed}
          submodules={state.submodules}
          onSubmoduleInitUpdate={state.handleSubmoduleInitUpdate}
          onSubmoduleSync={state.handleSubmoduleSync}
          onOpenSubmodule={state.handleOpenSubmodule}
          isSubmodulePanelCollapsed={state.isSubmodulePanelCollapsed}
          onToggleSubmodulePanelCollapsed={state.toggleSubmodulePanelCollapsed}
          hasRemoteOrigin={state.hasRemoteOrigin}
          isConnectingGithubRepo={state.isConnectingGithubRepo}
          connectError={state.connectError}
          newRepoName={state.newRepoName}
          setNewRepoName={state.setNewRepoName}
          newRepoDescription={state.newRepoDescription}
          setNewRepoDescription={state.setNewRepoDescription}
          newRepoPrivate={state.newRepoPrivate}
          setNewRepoPrivate={state.setNewRepoPrivate}
          onCreateGithubRepoForCurrent={state.handleCreateGithubRepoForCurrent}
          isAuthenticated={state.isAuthenticated}
          tokenInput={state.tokenInput}
          setTokenInput={state.setTokenInput}
          isAuthenticating={state.isAuthenticating}
          authError={state.authError}
          setAuthError={state.setAuthError}
          onTokenLogin={state.handleTokenLogin}
          oauthConfigured={state.oauthConfigured}
          deviceFlow={state.deviceFlow}
          isDeviceFlowRunning={state.isDeviceFlowRunning}
          deviceFlowError={state.deviceFlowError}
          onStartDeviceFlowLogin={state.handleStartDeviceFlowLogin}
          onCancelDeviceFlow={state.handleCancelDeviceFlow}
          isWebFlowRunning={state.isWebFlowRunning}
          webFlowError={state.webFlowError}
          onStartWebFlowLogin={state.handleStartWebFlowLogin}
          selectedGithubAuthHelpMethod={selectedGithubAuthHelpMethod}
          onSelectGithubAuthHelpMethod={setSelectedGithubAuthHelpMethod}
          githubUser={state.githubUser}
          githubRepos={state.githubRepos}
          githubRepoSearch={state.githubRepoSearch}
          setGithubRepoSearch={state.setGithubRepoSearch}
          githubReposHasMore={state.githubReposHasMore}
          isLoadingGithubRepos={state.isLoadingGithubRepos}
          isLoadingMoreGithubRepos={state.isLoadingMoreGithubRepos}
          loadMoreGithubRepos={state.loadMoreGithubRepos}
          refreshGithubRepos={state.refreshGithubRepos}
          onLogout={state.handleLogout}
          onClone={state.handleClone}
          isCloning={state.isCloning}
          prOwnerRepo={state.prOwnerRepo}
          prFilter={state.prFilter}
          setPrFilter={state.setPrFilter}
          prLoading={state.prLoading}
          pullRequests={state.pullRequests}
          onOpenPR={state.handleOpenPR}
          onCopyPRUrl={state.handleCopyPRUrl}
          onCheckoutPR={state.handleCheckoutPR}
          onMergePR={state.handleMergePR}
          showCreatePR={state.showCreatePR}
          setShowCreatePR={state.setShowCreatePR}
          currentBranch={state.currentBranch}
          setNewPRHead={state.setNewPRHead}
          newPRTitle={state.newPRTitle}
          setNewPRTitle={state.setNewPRTitle}
          newPRBody={state.newPRBody}
          setNewPRBody={state.setNewPRBody}
          newPRHead={state.newPRHead}
          setNewPRHeadInput={state.setNewPRHead}
          newPRBase={state.newPRBase}
          setNewPRBase={state.setNewPRBase}
          onCreatePR={state.handleCreatePR}
          settings={state.settings}
          onUpdateSettings={state.handleUpdateSettings}
          jobs={state.jobs}
          onClearJobs={state.clearJobs}
        />

        <div
          className={`pane-resizer app-sidebar-resizer ${isSidebarResizing ? 'dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={tr('Sidebar-Breite anpassen', 'Resize sidebar width')}
          onPointerDown={handleSidebarResizeStart}
        />

        <MainView
          activeTab={state.activeTab}
          isAuthenticated={state.isAuthenticated}
          selectedGithubAuthHelpMethod={selectedGithubAuthHelpMethod}
          onClearGithubAuthHelpMethod={() => setSelectedGithubAuthHelpMethod(null)}
          activeRepo={state.activeRepo}
          currentBranch={state.currentBranch}
          remoteSync={state.remoteSync}
          remoteStatus={state.remoteStatus}
          isGitActionRunning={state.isGitActionRunning}
          activeGitActionLabel={state.activeGitActionLabel}
          selectedCommit={state.selectedCommit}
          setSelectedCommit={state.setSelectedCommit}
          refreshTrigger={state.refreshTrigger}
          triggerRefresh={state.triggerRefresh}
          showSecondaryHistory={state.settings.showSecondaryHistory}
          onFetch={() => state.refreshRemoteState(true)}
          onPull={() => state.runGitCommand(['pull'], tr('Erfolgreich gepullt.', 'Pull completed successfully.'), tr('Pull wird ausgefuehrt...', 'Running pull...'))}
          onPush={() => state.runGitCommand(['push'], tr('Erfolgreich gepusht.', 'Push completed successfully.'), tr('Push wird ausgefuehrt...', 'Running push...'))}
          settings={state.settings}
        />

        {state.gitActionToast && (
          <div className={`action-toast ${state.gitActionToast.isError ? 'error' : 'success'}`}>
            {state.gitActionToast.isError ? 'x' : 'ok'} {state.gitActionToast.msg}
          </div>
        )}

        <BranchContextMenu
          branchContextMenu={state.branchContextMenu}
          setBranchContextMenu={state.setBranchContextMenu}
          onCheckout={(branch) => state.runGitCommand(['checkout', branch], tr(`Ausgecheckt: ${branch}`, `Checked out: ${branch}`))}
          onMerge={state.handleMergeBranch}
          onRename={state.handleRenameBranch}
          onDelete={state.handleDeleteBranch}
        />

        {state.confirmDialog && state.confirmDialog.variant === 'confirm' && (
          <Confirm
            open={true}
            title={state.confirmDialog.title}
            message={state.confirmDialog.message}
            contextItems={state.confirmDialog.contextItems}
            irreversible={state.confirmDialog.irreversible}
            consequences={state.confirmDialog.consequences}
            confirmLabel={state.confirmDialog.confirmLabel}
            onConfirm={state.executeConfirmDialog}
            onCancel={state.closeConfirmDialog}
          />
        )}

        {state.confirmDialog && state.confirmDialog.variant === 'danger' && (
          <DangerConfirm
            open={true}
            title={state.confirmDialog.title}
            message={state.confirmDialog.message}
            contextItems={state.confirmDialog.contextItems}
            irreversible={state.confirmDialog.irreversible}
            consequences={state.confirmDialog.consequences}
            confirmLabel={state.confirmDialog.confirmLabel}
            onConfirm={state.executeConfirmDialog}
            onCancel={state.closeConfirmDialog}
          />
        )}

        {state.inputDialog && (
          <Input
            open={true}
            title={state.inputDialog.title}
            message={state.inputDialog.message}
            fields={state.inputDialog.fields}
            contextItems={state.inputDialog.contextItems}
            irreversible={state.inputDialog.irreversible}
            consequences={state.inputDialog.consequences}
            confirmLabel={state.inputDialog.confirmLabel}
            onSubmit={state.executeInputDialog}
            onCancel={state.closeInputDialog}
          />
        )}

        <CloneProgressModal
          isCloning={state.isCloning}
          cloneRepoName={state.cloneRepoName}
          cloneFinished={state.cloneFinished}
          cloneError={state.cloneError}
          cloneLog={state.cloneLog}
          onClose={() => {
            state.setIsCloning(false);
            state.triggerRefresh();
          }}
        />
      </div>
    </I18nProvider>
  );
};

export default App;
