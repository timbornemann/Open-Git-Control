import { useCallback, useRef, useState } from 'react';
import { useToastQueue } from '../../hooks/useToastQueue';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useGithubDomain } from './hooks/useGithubDomain';

export const useAppState = () => {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);

  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const { toast: gitActionToast, setToast: setGitActionToast } = useToastQueue(3000);

  const {
    confirmDialog,
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    closeInputDialog,
    executeInputDialog,
  } = useDialogControllers();

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const resetRepoScopedUi = useCallback(() => {
    setSelectedCommit(null);
    setNewRepoName('');
    setNewRepoDescription('');
    setConnectError(null);
  }, []);

  const workspace = useWorkspaceDomain({
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
    onRepoActivated: resetRepoScopedUi,
    onNoActiveRepo: resetRepoScopedUi,
  });

  const runGitCommand = useCallback(async (args: string[], successMsg: string, actionLabel?: string) => {
    if (!window.electronAPI || !workspace.activeRepo) return;

    setIsGitActionRunning(true);
    setActiveGitActionLabel(actionLabel || `Git ${args[0]} wird ausgefuehrt...`);

    try {
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        setGitActionToast({ msg: successMsg, isError: false });
        triggerRefresh();
      } else {
        setGitActionToast({ msg: r.error || 'Fehler beim Ausführen von git.', isError: true });
      }
    } catch (e: any) {
      setGitActionToast({ msg: e.message, isError: true });
    } finally {
      setIsGitActionRunning(false);
      setActiveGitActionLabel(null);
    }
  }, [setGitActionToast, triggerRefresh, workspace.activeRepo]);

  isGitActionRunningRef.current = isGitActionRunning;

  const repository = useRepositoryDomain({
    activeRepo: workspace.activeRepo,
    refreshTrigger,
    triggerRefresh,
    setGitActionToast,
    setActiveGitActionLabel,
    isGitActionRunningRef,
    runGitCommand,
    setConfirmDialog,
    setInputDialog,
  });

  const github = useGithubDomain({
    activeRepo: workspace.activeRepo,
    currentBranch: repository.currentBranch,
    refreshTrigger,
    triggerRefresh,
    setGitActionToast,
    onRepoCloned: workspace.addOpenRepo,
    setActiveTab: workspace.setActiveTab,
  });

  const handleCreateGithubRepoForCurrent = async () => {
    if (!window.electronAPI || !workspace.activeRepo) return;
    if (!github.isAuthenticated) {
      setConnectError('Bitte zuerst GitHub verbinden (GitHub-Tab).');
      return;
    }

    const folderName = workspace.activeRepo.split(/[\\/]/).pop() || 'repository';
    const name = (newRepoName || folderName).trim();
    const description = newRepoDescription.trim();

    if (!name) {
      setConnectError('Repository-Name darf nicht leer sein.');
      return;
    }

    setIsConnectingGithubRepo(true);
    setConnectError(null);

    try {
      const result = await window.electronAPI.githubCreateRepo(name, description, newRepoPrivate);
      if (!result.success) {
        throw new Error(result.error || 'Fehler beim Erstellen des GitHub-Repositories.');
      }

      const remoteUrl = result.data.cloneUrl;

      let r = await window.electronAPI.runGitCommand('remote', 'add', 'origin', remoteUrl);
      if (!r.success) {
        throw new Error(r.error || 'Fehler beim Setzen des Git-Remotes.');
      }

      r = await window.electronAPI.runGitCommand('push', '-u', 'origin', 'HEAD');
      if (!r.success) {
        throw new Error(r.error || 'Fehler beim Pushen nach GitHub.');
      }

      repository.setHasRemoteOrigin(true);
      setGitActionToast({ msg: 'Neues GitHub-Repository erstellt und verbunden.', isError: false });
      triggerRefresh();
    } catch (e: any) {
      setConnectError(e?.message || 'Fehler beim Erstellen und Verbinden mit GitHub.');
    } finally {
      setIsConnectingGithubRepo(false);
    }
  };

  return {
    activeTab: workspace.activeTab,
    setActiveTab: workspace.setActiveTab,
    openRepos: workspace.openRepos,
    activeRepo: workspace.activeRepo,
    handleOpenFolder: workspace.handleOpenFolder,
    handleSwitchRepo: workspace.handleSwitchRepo,
    handleCloseRepo: workspace.handleCloseRepo,

    refreshTrigger,
    triggerRefresh,
    selectedCommit,
    setSelectedCommit,

    isGitActionRunning,
    activeGitActionLabel,
    runGitCommand,
    gitActionToast,

    branches: repository.branches,
    currentBranch: repository.currentBranch,
    isCreatingBranch: repository.isCreatingBranch,
    setIsCreatingBranch: repository.setIsCreatingBranch,
    newBranchName: repository.newBranchName,
    setNewBranchName: repository.setNewBranchName,
    newBranchInputRef: repository.newBranchInputRef,
    branchContextMenu: repository.branchContextMenu,
    setBranchContextMenu: repository.setBranchContextMenu,

    tags: repository.tags,
    remotes: repository.remotes,
    hasRemoteOrigin: repository.hasRemoteOrigin,
    remoteSync: repository.remoteSync,
    remoteOnlyBranches: repository.remoteOnlyBranches,
    remoteStatus: repository.remoteStatus,
    refreshRemoteState: repository.refreshRemoteState,

    handleCreateBranch: repository.handleCreateBranch,
    handleDeleteBranch: repository.handleDeleteBranch,
    handleMergeBranch: repository.handleMergeBranch,
    handleRenameBranch: repository.handleRenameBranch,
    handleCreateTag: repository.handleCreateTag,
    handleDeleteTag: repository.handleDeleteTag,
    handlePushTags: repository.handlePushTags,
    handleAddRemote: repository.handleAddRemote,
    handleRemoveRemote: repository.handleRemoveRemote,

    isAuthenticated: github.isAuthenticated,
    githubUser: github.githubUser,
    githubRepos: github.githubRepos,
    tokenInput: github.tokenInput,
    setTokenInput: github.setTokenInput,
    isAuthenticating: github.isAuthenticating,
    authError: github.authError,
    setAuthError: github.setAuthError,
    handleTokenLogin: github.handleTokenLogin,
    handleLogout: github.handleLogout,

    isCloning: github.isCloning,
    setIsCloning: github.setIsCloning,
    cloneLog: github.cloneLog,
    cloneRepoName: github.cloneRepoName,
    cloneFinished: github.cloneFinished,
    cloneError: github.cloneError,
    handleClone: github.handleClone,

    prOwnerRepo: github.prOwnerRepo,
    prFilter: github.prFilter,
    setPrFilter: github.setPrFilter,
    prLoading: github.prLoading,
    pullRequests: github.pullRequests,
    showCreatePR: github.showCreatePR,
    setShowCreatePR: github.setShowCreatePR,
    newPRTitle: github.newPRTitle,
    setNewPRTitle: github.setNewPRTitle,
    newPRBody: github.newPRBody,
    setNewPRBody: github.setNewPRBody,
    newPRHead: github.newPRHead,
    setNewPRHead: github.setNewPRHead,
    newPRBase: github.newPRBase,
    setNewPRBase: github.setNewPRBase,
    handleCreatePR: github.handleCreatePR,

    isConnectingGithubRepo,
    connectError,
    newRepoName,
    setNewRepoName,
    newRepoDescription,
    setNewRepoDescription,
    newRepoPrivate,
    setNewRepoPrivate,
    handleCreateGithubRepoForCurrent,

    confirmDialog,
    inputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    closeInputDialog,
    executeInputDialog,
  };
};
