import React from 'react';
import { AppSidebar } from './components/layout/AppSidebar';
import { MainView } from './components/layout/MainView';
import { BranchContextMenu } from './components/layout/BranchContextMenu';
import { CloneProgressModal } from './components/layout/CloneProgressModal';
import { Confirm } from './components/Confirm';
import { DangerConfirm } from './components/DangerConfirm';
import { Input } from './components/Input';
import { useAppState } from './components/layout/useAppState';
import './index.css';

const App: React.FC = () => {
  const state = useAppState();

  return (
    <div className="app-container">
      <AppSidebar
        activeTab={state.activeTab}
        setActiveTab={state.setActiveTab}
        activeRepo={state.activeRepo}
        openRepos={state.openRepos}
        onOpenFolder={state.handleOpenFolder}
        onSwitchRepo={state.handleSwitchRepo}
        onCloseRepo={state.handleCloseRepo}
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
        onCheckoutBranch={(name) => state.runGitCommand(['checkout', name], `Ausgecheckt: ${name}`)}
        onSetBranchContextMenu={state.setBranchContextMenu}
        tags={state.tags}
        onCreateTag={state.handleCreateTag}
        onPushTags={state.handlePushTags}
        onDeleteTag={state.handleDeleteTag}
        remotes={state.remotes}
        remoteStatus={state.remoteStatus}
        remoteOnlyBranchesCount={state.remoteOnlyBranches.length}
        onAddRemote={state.handleAddRemote}
        onRemoveRemote={state.handleRemoveRemote}
        onRefreshRemote={() => state.refreshRemoteState(true)}
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
        githubUser={state.githubUser}
        githubRepos={state.githubRepos}
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

      <MainView
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
        onPull={() => state.runGitCommand(['pull'], 'Erfolgreich gepullt.', 'Pull wird ausgefuehrt...')}
        onPush={() => state.runGitCommand(['push'], 'Erfolgreich gepusht.', 'Push wird ausgefuehrt...')}
      />

      {state.gitActionToast && (
        <div className={`action-toast ${state.gitActionToast.isError ? 'error' : 'success'}`}>
          {state.gitActionToast.isError ? 'x' : 'ok'} {state.gitActionToast.msg}
        </div>
      )}

      <BranchContextMenu
        branchContextMenu={state.branchContextMenu}
        setBranchContextMenu={state.setBranchContextMenu}
        onCheckout={(branch) => state.runGitCommand(['checkout', branch], `Ausgecheckt: ${branch}`)}
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
  );
};

export default App;
