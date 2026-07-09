import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type {
  AppSettingsDto,
  CommitStatsUpdateDto,
  ElectronAPI,
  GitCommandNameDto,
  GitCommandResultDto,
  GitJobEventDto,
  PlanningApiTokenLifetimeDto,
  StoredRepoData,
  UpdaterStatusDto,
} from '../../src/global';
import type { PlannerItemInput, PlannerProjectInput } from '../../src/types/projectPlanner';

type RepoUnavailablePayload = {
  command: string;
  error: string;
};

type PreloadIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>;

export const createElectronApi = (ipcRenderer: PreloadIpcRenderer): ElectronAPI => {
  const invokeGitCommand = async (commandName: GitCommandNameDto, ...args: string[]): Promise<GitCommandResultDto> => {
    return ipcRenderer.invoke(IpcChannel.GitCommand, commandName, ...args);
  };

  const invokeGitMutation = async (ipcChannel: IpcChannel, commandName: string, payload: unknown) => {
    void commandName;
    return ipcRenderer.invoke(ipcChannel, payload);
  };

  const electronAPI = {
    openDirectory: () => ipcRenderer.invoke(IpcChannel.DialogOpenDirectory),
    selectDirectory: () => ipcRenderer.invoke(IpcChannel.DialogSelectDirectory),
    selectProjectParentDirectory: () => ipcRenderer.invoke(IpcChannel.DialogSelectProjectParentDirectory),
    setRepoPath: (repoPath: string) => ipcRenderer.invoke(IpcChannel.GitSetRepo, repoPath),
    clearRepoPath: () => ipcRenderer.invoke(IpcChannel.GitClearRepo),
    openExternalUrl: (url: string) => ipcRenderer.invoke(IpcChannel.ExternalOpen, url),
    runGitCommand: (commandName: GitCommandNameDto, ...args: string[]) => invokeGitCommand(commandName, ...args),
    createCommit: (params: { title: string; description?: string; amend?: boolean; signoff?: boolean; allowEmpty?: boolean }) =>
      invokeGitMutation(IpcChannel.GitCreateCommit, 'commit', params),
    getCommitLogPage: (params: { limit: number; offset: number; scope: 'all' | 'head' }) => ipcRenderer.invoke(IpcChannel.GitCommitLogPage, params),
    requestCommitStats: (hashes: string[], priority?: 'selected' | 'visible' | 'background') =>
      ipcRenderer.invoke(IpcChannel.GitRequestCommitStats, hashes, priority),
    onCommitStats: (callback: (update: CommitStatsUpdateDto) => void) => {
      const handler = (_event: IpcRendererEvent, update: CommitStatsUpdateDto) => callback(update);
      ipcRenderer.on(IpcChannel.GitCommitStats, handler);
      return () => ipcRenderer.removeListener(IpcChannel.GitCommitStats, handler);
    },
    getWorkingTreeSnapshot: () => ipcRenderer.invoke(IpcChannel.GitWorkingTreeSnapshot),
    getWorkingTreeStats: (snapshotId: string) => ipcRenderer.invoke(IpcChannel.GitWorkingTreeStats, snapshotId),
    stagePaths: (paths: string[]) => ipcRenderer.invoke(IpcChannel.GitStagePaths, paths),
    getDiffPreview: (args: string[], limits?: { maxBytes?: number; maxLines?: number }) => ipcRenderer.invoke(IpcChannel.GitDiffPreview, args, limits || {}),
    getFileBlameRange: (filePath: string, commitHash: string | undefined, startLine: number, lineCount: number) =>
      ipcRenderer.invoke(IpcChannel.GitFileBlameRange, filePath, commitHash, startLine, lineCount),
    onRepoUnavailable: (callback: (payload: RepoUnavailablePayload) => void) => {
      void callback;
      return () => undefined;
    },
    startInteractiveRebase: (baseHash: string, todoLines: string[]) => ipcRenderer.invoke(IpcChannel.GitInteractiveRebase, baseHash, todoLines),
    applyPatch: (patch: string, options?: { cached?: boolean; reverse?: boolean }) => ipcRenderer.invoke(IpcChannel.GitApplyPatch, patch, options || {}),
    getStashes: () => ipcRenderer.invoke(IpcChannel.GitStashes),
    gitStashBranch: (stashName: string, branchName: string) => invokeGitMutation(IpcChannel.GitStashBranch, 'stash branch', { stashName, branchName }),
    getRepoOriginUrl: (repoPath: string) => ipcRenderer.invoke(IpcChannel.GitRepoOriginUrl, repoPath),
    addIgnoreRule: (pattern: string) => ipcRenderer.invoke(IpcChannel.GitAddIgnoreRule, pattern),
    gitFetch: () => invokeGitCommand('fetch', '--all', '--prune', '--tags', '--quiet'),
    gitPull: () => invokeGitCommand('pull'),
    gitPush: () => invokeGitCommand('push'),
    scanPushSecrets: (params?: { includeTags?: boolean }) => ipcRenderer.invoke(IpcChannel.GitScanPushSecrets, params || {}),
    cancelSecretScan: () => ipcRenderer.invoke(IpcChannel.GitCancelSecretScan),
    gitClone: (cloneUrl: string, targetDir: string, targetName?: string) => ipcRenderer.invoke(IpcChannel.GitClone, cloneUrl, targetDir, targetName),
    gitInit: (repoPath: string) => ipcRenderer.invoke(IpcChannel.GitInit, repoPath),
    getFileHistory: (filePath: string, commitHash?: string, limit?: number) => ipcRenderer.invoke(IpcChannel.GitFileHistory, filePath, commitHash, limit),
    getFileBlame: (filePath: string, commitHash?: string) => ipcRenderer.invoke(IpcChannel.GitFileBlame, filePath, commitHash),
    getFileTimelineData: (limit?: number) => ipcRenderer.invoke(IpcChannel.GitGetFileTimelineData, limit),
    readRepoFile: (filePath: string) => ipcRenderer.invoke(IpcChannel.GitReadRepoFile, filePath),
    getMarkdownPreviewFile: (params: { source: 'unstaged' | 'staged' | 'commit'; path: string; commitHash?: string }) =>
      ipcRenderer.invoke(IpcChannel.GitMarkdownPreviewFile, params),
    getRepoFileDataUrl: (params: { source: 'unstaged' | 'staged' | 'commit'; path: string; commitHash?: string }) =>
      ipcRenderer.invoke(IpcChannel.GitRepoFileDataUrl, params),
    writeRepoFile: (filePath: string, content: string) => ipcRenderer.invoke(IpcChannel.GitWriteRepoFile, filePath, content),
    openSubmodule: (submodulePath: string) => ipcRenderer.invoke(IpcChannel.GitOpenSubmodule, submodulePath),
    onCloneProgress: (callback: (line: string) => void) => {
      const handler = (_event: IpcRendererEvent, line: string) => callback(line);
      ipcRenderer.on(IpcChannel.CloneProgress, handler);
      return () => ipcRenderer.removeListener(IpcChannel.CloneProgress, handler);
    },
    onJobEvent: (callback: (event: GitJobEventDto) => void) => {
      const handler = (_event: IpcRendererEvent, payload: GitJobEventDto) => callback(payload);
      ipcRenderer.on(IpcChannel.JobEvent, handler);
      return () => ipcRenderer.removeListener(IpcChannel.JobEvent, handler);
    },
    getStoredRepos: () => ipcRenderer.invoke(IpcChannel.ReposGetStored),
    setStoredRepos: (data: StoredRepoData) => ipcRenderer.invoke(IpcChannel.ReposSetStored, data),
    plannerGetData: () => ipcRenderer.invoke(IpcChannel.PlannerGetData),
    plannerEnsureRepositoryProject: (repoPath: string) => ipcRenderer.invoke(IpcChannel.PlannerEnsureRepositoryProject, repoPath),
    plannerCreateProject: (input: PlannerProjectInput) => ipcRenderer.invoke(IpcChannel.PlannerCreateProject, input),
    plannerUpdateProject: (projectId: string, input: Partial<PlannerProjectInput>) => ipcRenderer.invoke(IpcChannel.PlannerUpdateProject, projectId, input),
    plannerDeleteProject: (projectId: string) => ipcRenderer.invoke(IpcChannel.PlannerDeleteProject, projectId),
    plannerDeleteRepositoryProjectByPath: (repoPath: string) => ipcRenderer.invoke(IpcChannel.PlannerDeleteRepositoryProjectByPath, repoPath),
    plannerCreateItem: (projectId: string, input: PlannerItemInput) => ipcRenderer.invoke(IpcChannel.PlannerCreateItem, projectId, input),
    plannerUpdateItem: (itemId: string, input: Partial<PlannerItemInput>) => ipcRenderer.invoke(IpcChannel.PlannerUpdateItem, itemId, input),
    plannerDeleteItem: (itemId: string) => ipcRenderer.invoke(IpcChannel.PlannerDeleteItem, itemId),
    plannerMaterializeProject: (projectId: string, parentDirectory: string, folderName: string) =>
      ipcRenderer.invoke(IpcChannel.PlannerMaterializeProject, projectId, parentDirectory, folderName),
    getSettings: () => ipcRenderer.invoke(IpcChannel.SettingsGet),
    setSettings: (partial: Partial<AppSettingsDto>) => ipcRenderer.invoke(IpcChannel.SettingsSet, partial),
    setGeminiApiKey: (apiKey: string) => ipcRenderer.invoke(IpcChannel.SettingsSetGeminiApiKey, apiKey),
    clearGeminiApiKey: () => ipcRenderer.invoke(IpcChannel.SettingsClearGeminiApiKey),
    getPlanningApiInfo: () => ipcRenderer.invoke(IpcChannel.PlanningApiGetInfo),
    generatePlanningApiToken: (lifetime: PlanningApiTokenLifetimeDto) => ipcRenderer.invoke(IpcChannel.PlanningApiGenerateToken, lifetime),
    clearPlanningApiToken: () => ipcRenderer.invoke(IpcChannel.PlanningApiClearSavedToken),
    getAppVersion: () => ipcRenderer.invoke(IpcChannel.AppGetVersion),
    getUpdaterStatus: () => ipcRenderer.invoke(IpcChannel.UpdaterGetStatus),
    checkForAppUpdates: () => ipcRenderer.invoke(IpcChannel.UpdaterCheck),
    runOneClickAppUpdate: () => ipcRenderer.invoke(IpcChannel.UpdaterRunOneClick),
    downloadAppUpdate: () => ipcRenderer.invoke(IpcChannel.UpdaterDownload),
    installAppUpdate: () => ipcRenderer.invoke(IpcChannel.UpdaterInstall),
    onUpdaterEvent: (callback: (event: UpdaterStatusDto) => void) => {
      const handler = (_event: IpcRendererEvent, payload: UpdaterStatusDto) => callback(payload);
      ipcRenderer.on(IpcChannel.UpdaterEvent, handler);
      return () => ipcRenderer.removeListener(IpcChannel.UpdaterEvent, handler);
    },
    aiTestConnection: () => ipcRenderer.invoke(IpcChannel.AiTestConnection),
    aiListModels: () => ipcRenderer.invoke(IpcChannel.AiListModels),
    ollamaTestConnection: () => ipcRenderer.invoke(IpcChannel.AiTestConnection),
    ollamaListModels: () => ipcRenderer.invoke(IpcChannel.AiListModels),
    runAiAutoCommit: () => ipcRenderer.invoke(IpcChannel.GitAiAutoCommit),
    cancelAiAutoCommit: () => ipcRenderer.invoke(IpcChannel.GitCancelAiAutoCommit),
    getAiAutoCommitState: () => ipcRenderer.invoke(IpcChannel.GitGetAiAutoCommitState),
    aiGenerateCommitMessage: (params: { notes: string }) => ipcRenderer.invoke(IpcChannel.AiGenerateCommitMessage, params),
    githubAuth: (token: string, host?: string) => ipcRenderer.invoke(IpcChannel.GithubAuth, token, host),
    githubDeviceStart: () => ipcRenderer.invoke(IpcChannel.GithubDeviceStart),
    githubDevicePoll: (deviceCode: string) => ipcRenderer.invoke(IpcChannel.GithubDevicePoll, deviceCode),
    githubWebLogin: () => ipcRenderer.invoke(IpcChannel.GithubWebLogin),
    githubGetRepos: (params?: { page?: number; perPage?: number; search?: string }) => ipcRenderer.invoke(IpcChannel.GithubGetRepos, params || {}),
    githubGetSavedAuthStatus: () => ipcRenderer.invoke(IpcChannel.GithubGetSavedAuthStatus),
    githubLoginWithSavedToken: () => ipcRenderer.invoke(IpcChannel.GithubLoginWithSavedToken),
    githubCheckAuthStatus: () => ipcRenderer.invoke(IpcChannel.GithubCheckAuthStatus),
    githubLogout: () => ipcRenderer.invoke(IpcChannel.GithubLogout),
    githubCreateRepo: (name: string, description: string, isPrivate: boolean) =>
      ipcRenderer.invoke(IpcChannel.GithubCreateRepo, { name, description, isPrivate }),
    githubForkRepo: (params: { owner: string; repo: string; name?: string; defaultBranchOnly?: boolean }) =>
      ipcRenderer.invoke(IpcChannel.GithubForkRepo, params),
    githubGetPRs: (owner: string, repo: string, state: string) => ipcRenderer.invoke(IpcChannel.GithubGetPrs, owner, repo, state),
    githubCreatePR: (params: { owner: string; repo: string; title: string; body: string; head: string; base: string }) =>
      ipcRenderer.invoke(IpcChannel.GithubCreatePr, params),
    githubCreateRelease: (params: {
      owner: string;
      repo: string;
      tagName: string;
      targetCommitish?: string;
      releaseName: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
    }) => ipcRenderer.invoke(IpcChannel.GithubCreateRelease, params),
    githubGetReleaseContext: (params: { owner: string; repo: string; targetCommitish?: string }) =>
      ipcRenderer.invoke(IpcChannel.GithubGetReleaseContext, params),
    aiGenerateReleaseNotes: (params: {
      tagName: string;
      releaseName: string;
      lastReleaseTag?: string | null;
      commits: Array<{ hash: string; shortHash: string; subject: string; author: string; date: string; htmlUrl?: string | null }>;
      repositoryHtmlUrl?: string | null;
      language: 'de' | 'en';
      versionBump: 'major' | 'minor' | 'patch';
      hints?: string[];
    }) => ipcRenderer.invoke(IpcChannel.AiGenerateReleaseNotes, params),
    githubGetWorkflowRuns: (params: { owner: string; repo: string; branch?: string; headSha?: string; perPage?: number }) =>
      ipcRenderer.invoke(IpcChannel.GithubGetWorkflowRuns, params),
    githubGetStatusChecks: (params: { owner: string; repo: string; ref: string }) => ipcRenderer.invoke(IpcChannel.GithubGetStatusChecks, params),
    githubMergePR: (params: {
      owner: string;
      repo: string;
      pullNumber: number;
      mergeMethod: 'merge' | 'squash' | 'rebase';
      commitTitle?: string;
      commitMessage?: string;
    }) => ipcRenderer.invoke(IpcChannel.GithubMergePr, params),
    getDiagnosticsReport: () => ipcRenderer.invoke(IpcChannel.DiagnosticsReport),
  } as unknown as ElectronAPI;

  electronAPI.git = {
    setRepoPath: electronAPI.setRepoPath,
    clearRepoPath: electronAPI.clearRepoPath,
    runGitCommand: electronAPI.runGitCommand,
    createCommit: electronAPI.createCommit,
    getCommitLogPage: electronAPI.getCommitLogPage,
    requestCommitStats: electronAPI.requestCommitStats,
    onCommitStats: electronAPI.onCommitStats,
    getWorkingTreeSnapshot: electronAPI.getWorkingTreeSnapshot,
    getWorkingTreeStats: electronAPI.getWorkingTreeStats,
    stagePaths: electronAPI.stagePaths,
    getDiffPreview: electronAPI.getDiffPreview,
    getFileBlameRange: electronAPI.getFileBlameRange,
    onRepoUnavailable: electronAPI.onRepoUnavailable,
    startInteractiveRebase: electronAPI.startInteractiveRebase,
    applyPatch: electronAPI.applyPatch,
    getStashes: electronAPI.getStashes,
    gitStashBranch: electronAPI.gitStashBranch,
    getRepoOriginUrl: electronAPI.getRepoOriginUrl,
    addIgnoreRule: electronAPI.addIgnoreRule,
    gitFetch: electronAPI.gitFetch,
    gitPull: electronAPI.gitPull,
    gitPush: electronAPI.gitPush,
    scanPushSecrets: electronAPI.scanPushSecrets,
    cancelSecretScan: electronAPI.cancelSecretScan,
    gitClone: electronAPI.gitClone,
    gitInit: electronAPI.gitInit,
    getFileHistory: electronAPI.getFileHistory,
    getFileBlame: electronAPI.getFileBlame,
    getFileTimelineData: electronAPI.getFileTimelineData,
    readRepoFile: electronAPI.readRepoFile,
    getMarkdownPreviewFile: electronAPI.getMarkdownPreviewFile,
    getRepoFileDataUrl: electronAPI.getRepoFileDataUrl,
    writeRepoFile: electronAPI.writeRepoFile,
    openSubmodule: electronAPI.openSubmodule,
    onCloneProgress: electronAPI.onCloneProgress,
    onJobEvent: electronAPI.onJobEvent,
  };

  electronAPI.github = {
    githubAuth: electronAPI.githubAuth,
    githubDeviceStart: electronAPI.githubDeviceStart,
    githubDevicePoll: electronAPI.githubDevicePoll,
    githubWebLogin: electronAPI.githubWebLogin,
    githubGetRepos: electronAPI.githubGetRepos,
    githubGetSavedAuthStatus: electronAPI.githubGetSavedAuthStatus,
    githubLoginWithSavedToken: electronAPI.githubLoginWithSavedToken,
    githubCheckAuthStatus: electronAPI.githubCheckAuthStatus,
    githubLogout: electronAPI.githubLogout,
    githubCreateRepo: electronAPI.githubCreateRepo,
    githubForkRepo: electronAPI.githubForkRepo,
    githubGetPRs: electronAPI.githubGetPRs,
    githubCreatePR: electronAPI.githubCreatePR,
    githubCreateRelease: electronAPI.githubCreateRelease,
    githubGetReleaseContext: electronAPI.githubGetReleaseContext,
    githubGetWorkflowRuns: electronAPI.githubGetWorkflowRuns,
    githubGetStatusChecks: electronAPI.githubGetStatusChecks,
    githubMergePR: electronAPI.githubMergePR,
  };

  electronAPI.planner = {
    plannerGetData: electronAPI.plannerGetData,
    plannerEnsureRepositoryProject: electronAPI.plannerEnsureRepositoryProject,
    plannerCreateProject: electronAPI.plannerCreateProject,
    plannerUpdateProject: electronAPI.plannerUpdateProject,
    plannerDeleteProject: electronAPI.plannerDeleteProject,
    plannerDeleteRepositoryProjectByPath: electronAPI.plannerDeleteRepositoryProjectByPath,
    plannerCreateItem: electronAPI.plannerCreateItem,
    plannerUpdateItem: electronAPI.plannerUpdateItem,
    plannerDeleteItem: electronAPI.plannerDeleteItem,
    plannerMaterializeProject: electronAPI.plannerMaterializeProject,
  };

  electronAPI.settings = {
    getSettings: electronAPI.getSettings,
    setSettings: electronAPI.setSettings,
    setGeminiApiKey: electronAPI.setGeminiApiKey,
    clearGeminiApiKey: electronAPI.clearGeminiApiKey,
  };

  electronAPI.app = {
    openDirectory: electronAPI.openDirectory,
    selectDirectory: electronAPI.selectDirectory,
    selectProjectParentDirectory: electronAPI.selectProjectParentDirectory,
    openExternalUrl: electronAPI.openExternalUrl,
    getPlanningApiInfo: electronAPI.getPlanningApiInfo,
    generatePlanningApiToken: electronAPI.generatePlanningApiToken,
    clearPlanningApiToken: electronAPI.clearPlanningApiToken,
    getAppVersion: electronAPI.getAppVersion,
    getUpdaterStatus: electronAPI.getUpdaterStatus,
    checkForAppUpdates: electronAPI.checkForAppUpdates,
    runOneClickAppUpdate: electronAPI.runOneClickAppUpdate,
    downloadAppUpdate: electronAPI.downloadAppUpdate,
    installAppUpdate: electronAPI.installAppUpdate,
    onUpdaterEvent: electronAPI.onUpdaterEvent,
    getDiagnosticsReport: electronAPI.getDiagnosticsReport,
  };

  electronAPI.ai = {
    aiTestConnection: electronAPI.aiTestConnection,
    aiListModels: electronAPI.aiListModels,
    ollamaTestConnection: electronAPI.ollamaTestConnection,
    ollamaListModels: electronAPI.ollamaListModels,
    runAiAutoCommit: electronAPI.runAiAutoCommit,
    cancelAiAutoCommit: electronAPI.cancelAiAutoCommit,
    getAiAutoCommitState: electronAPI.getAiAutoCommitState,
    aiGenerateCommitMessage: electronAPI.aiGenerateCommitMessage,
    aiGenerateReleaseNotes: electronAPI.aiGenerateReleaseNotes,
    onJobEvent: electronAPI.onJobEvent,
  };

  electronAPI.repos = {
    getStoredRepos: electronAPI.getStoredRepos,
    setStoredRepos: electronAPI.setStoredRepos,
    setRepoPath: electronAPI.setRepoPath,
    clearRepoPath: electronAPI.clearRepoPath,
  };

  return electronAPI;
};
