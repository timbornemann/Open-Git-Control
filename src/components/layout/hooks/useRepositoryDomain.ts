import { useRepositoryBranches } from './useRepositoryBranches';
import { useRepositoryRemoteSync } from './useRepositoryRemoteSync';
import { useRepositoryRemotes } from './useRepositoryRemotes';
import { useRepositorySubmodules } from './useRepositorySubmodules';
import { useRepositoryTags } from './useRepositoryTags';
import type { RepositoryDomainParams } from './repositoryDomainTypes';

export const useRepositoryDomain = ({
  activeRepo,
  refreshTrigger,
  triggerRefresh,
  setGitActionToast,
  setActiveGitActionLabel,
  isGitActionRunningRef,
  runGitCommand,
  setConfirmDialog,
  setInputDialog,
  autoFetchIntervalMs,
  language,
  onNavigateToCommit,
}: RepositoryDomainParams) => {
  const remotes = useRepositoryRemotes({
    activeRepo,
    refreshTrigger,
    language,
    runGitCommand,
    setConfirmDialog,
    setInputDialog,
  });

  const branches = useRepositoryBranches({
    activeRepo,
    refreshTrigger,
    hasRemoteOrigin: remotes.hasRemoteOrigin,
    language,
    setGitActionToast,
    runGitCommand,
    triggerRefresh,
    setConfirmDialog,
    setInputDialog,
  });

  const remoteSync = useRepositoryRemoteSync({
    activeRepo,
    refreshTrigger,
    triggerRefresh,
    autoFetchIntervalMs,
    language,
    hasAnyRemote: remotes.hasAnyRemote,
    remotes: remotes.remotes,
    setGitActionToast,
    setActiveGitActionLabel,
    isGitActionRunningRef,
  });

  const tags = useRepositoryTags({
    activeRepo,
    refreshTrigger,
    currentBranch: branches.currentBranch,
    trackedRemoteName: remoteSync.lastFetchedRemote,
    language,
    setGitActionToast,
    runGitCommand,
    setConfirmDialog,
    setInputDialog,
    onNavigateToCommit,
  });

  const submodules = useRepositorySubmodules({
    activeRepo,
    refreshTrigger,
    language,
    setGitActionToast,
    runGitCommand,
  });

  return {
    ...branches,
    tags: tags.tags,
    tagConflicts: tags.tagConflicts,
    remotes: remotes.remotes,
    submodules: submodules.submodules,
    hasRemoteOrigin: remotes.hasRemoteOrigin,
    setHasRemoteOrigin: remotes.setHasRemoteOrigin,
    remoteSync: remoteSync.remoteSync,
    remoteStatus: remoteSync.remoteStatus,
    refreshRemoteState: remoteSync.refreshRemoteState,
    handleCreateTag: tags.handleCreateTag,
    handleDeleteTag: tags.handleDeleteTag,
    handleSelectTag: tags.handleSelectTag,
    handlePushTags: tags.handlePushTags,
    handleAddRemote: remotes.handleAddRemote,
    handleRemoveRemote: remotes.handleRemoveRemote,
    handleRenameRemote: remotes.handleRenameRemote,
    handleSetRemoteUrl: remotes.handleSetRemoteUrl,
    handleSubmoduleInitUpdate: submodules.handleSubmoduleInitUpdate,
    handleSubmoduleSync: submodules.handleSubmoduleSync,
    handleOpenSubmodule: submodules.handleOpenSubmodule,
  };
};
