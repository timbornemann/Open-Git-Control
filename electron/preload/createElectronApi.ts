import { createRepositorySecretScanAllowlistApi } from './createRepositorySecretScanAllowlistApi';
import { createSystemToolsApi } from './createSystemToolsApi';
import type { PreviewSnapshot, ReadRequest } from '../../src/shared/cache/resource';
import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { ElectronAPI, ElectronFlatAPI } from '../../src/shared/ipc/contracts/electronApi';
import type {
  AppSettingsDto,
  CommitStatsUpdateDto,
  GitCommandNameDto,
  GitCommandResultDto,
  GitJobEventDto,
  PlanningApiTokenLifetimeDto,
  StoredRepoData,
  UpdaterStatusDto,
} from '../../src/types/preloadDtos';
import type { PlannerItemInput, PlannerProjectInput } from '../../src/types/projectPlanner';
import { isRepoUnavailableError, type RepoUnavailablePayload } from '../../src/shared/git/errors';
import type {
  RepositoryInitializationOptionsDto,
  TextFileEncodingDto,
  WorkingDirectoryReplaceRequestDto,
  WorkingDirectorySearchRequestDto,
} from '../../src/shared/ipc/contracts/git';
import type { FeedbackReportInputDto } from '../../src/types/feedbackDtos';
import { createRepositoryRunApi } from './createRepositoryRunApi';
import { createHostingApi } from './createHostingApi';
import { createRepositoryFileApi } from './createRepositoryFileApi';
import { createRepositoryIconApi } from './createRepositoryIconApi';
import type { ReleaseNotesGenerationParamsDto } from '../../src/types/releaseNotes';
import type { ScanPushSecretsRequestDto } from '../../src/types/secretScan';

type PreloadIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>;

export const createElectronApi = (ipcRenderer: PreloadIpcRenderer): ElectronAPI => {
  const preloadRepoUnavailableListeners = new Set<(payload: RepoUnavailablePayload) => void>();
  let activeRepoPath: string | null = null;
  let repoSelectionSequence = 0;
  const notifyRepoUnavailableIfNeeded = (result: unknown, command: string, repoPath: string | null): void => {
    if (!result || typeof result !== 'object') return;

    const candidate = result as { success?: unknown; error?: unknown };
    if (candidate.success !== false || typeof candidate.error !== 'string' || !isRepoUnavailableError(candidate.error) || !repoPath) return;

    const payload = { repoPath, command, error: candidate.error };
    for (const listener of preloadRepoUnavailableListeners) {
      try {
        listener(payload);
      } catch {
        // A consumer must not be able to break an unrelated IPC operation.
      }
    }
  };

  const invokeGitOperation = async (command: string, ipcChannel: IpcChannel, ...args: unknown[]): ReturnType<PreloadIpcRenderer['invoke']> => {
    const repoPathAtStart = activeRepoPath;
    const result = await ipcRenderer.invoke(ipcChannel, ...args);
    notifyRepoUnavailableIfNeeded(result, command, repoPathAtStart);
    return result;
  };

  const invokeGitOperationForRepo = async (
    repoPath: string,
    command: string,
    ipcChannel: IpcChannel,
    ...args: unknown[]
  ): ReturnType<PreloadIpcRenderer['invoke']> => {
    const result = await ipcRenderer.invoke(ipcChannel, ...args);
    notifyRepoUnavailableIfNeeded(result, command, repoPath);
    return result;
  };

  const invokeGitCommand = async (commandName: GitCommandNameDto, ...args: string[]): Promise<GitCommandResultDto> => {
    return invokeGitOperation(commandName, IpcChannel.GitCommand, commandName, ...args);
  };

  const invokeGitMutation = (command: string, ipcChannel: IpcChannel, payload: unknown) => {
    return invokeGitOperation(command, ipcChannel, payload);
  };

  const flatApi = {
    ...createSystemToolsApi(ipcRenderer),
    ...createRepositorySecretScanAllowlistApi(ipcRenderer),
    ...createRepositoryIconApi(ipcRenderer),
    ...createHostingApi(ipcRenderer),
    inspectCommitMessageEdit: (request: Parameters<ElectronAPI['inspectCommitMessageEdit']>[0]) =>
      invokeGitOperationForRepo(request.repoPath, 'inspectCommitMessageEdit', IpcChannel.GitInspectCommitMessageEdit, request),
    rewordCommitMessage: (request: Parameters<ElectronAPI['rewordCommitMessage']>[0]) =>
      invokeGitOperationForRepo(request.repoPath, 'rewordCommitMessage', IpcChannel.GitRewordCommitMessage, request),
    getCommitMessageEditBackups: (repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'getCommitMessageEditBackups', IpcChannel.GitCommitMessageEditBackups, repoPath),
    cancelCommitMessageEdit: (operationId: string) => ipcRenderer.invoke(IpcChannel.GitCancelCommitMessageEdit, operationId),
    cancelReadRequest: (requestId: string) => ipcRenderer.invoke(IpcChannel.AppCancelRead, requestId),
    getBootstrap: () => ipcRenderer.invoke(IpcChannel.AppBootstrap),
    savePreviews: (snapshots: PreviewSnapshot[]) => ipcRenderer.invoke(IpcChannel.AppSavePreviews, snapshots),
    openDirectory: () => ipcRenderer.invoke(IpcChannel.DialogOpenDirectory),
    selectDirectory: () => ipcRenderer.invoke(IpcChannel.DialogSelectDirectory),
    selectFiles: () => ipcRenderer.invoke(IpcChannel.DialogSelectFiles),
    selectProjectParentDirectory: () => ipcRenderer.invoke(IpcChannel.DialogSelectProjectParentDirectory),
    resolveRepoPath: (repoPath: string) => ipcRenderer.invoke(IpcChannel.GitResolveRepoPath, repoPath),
    setRepoPath: async (repoPath: string) => {
      const selectionId = ++repoSelectionSequence;
      const result = await ipcRenderer.invoke(IpcChannel.GitSetRepo, repoPath);
      const canonicalRepoPath = typeof result === 'string' && result ? result : repoPath;
      if (result && repoSelectionSequence === selectionId) activeRepoPath = canonicalRepoPath;
      return canonicalRepoPath;
    },
    clearRepoPath: async () => {
      const selectionId = ++repoSelectionSequence;
      const result = await ipcRenderer.invoke(IpcChannel.GitClearRepo);
      if (result && repoSelectionSequence === selectionId) activeRepoPath = null;
      return result;
    },
    openExternalUrl: (url: string) => ipcRenderer.invoke(IpcChannel.ExternalOpen, url),
    getFeedbackReportCapability: () => ipcRenderer.invoke(IpcChannel.FeedbackGetCapability),
    submitFeedbackReport: (input: FeedbackReportInputDto) => ipcRenderer.invoke(IpcChannel.FeedbackSubmit, input),
    runGitCommand: (commandName: GitCommandNameDto, ...args: string[]) => invokeGitCommand(commandName, ...args),
    runGitCommandForRepo: (repoPath: string, commandName: GitCommandNameDto, ...args: string[]) =>
      invokeGitOperationForRepo(repoPath, commandName, IpcChannel.GitCommandForRepo, repoPath, commandName, ...args),
    createCommit: (params: { repoPath?: string; title: string; description?: string; amend?: boolean; signoff?: boolean; allowEmpty?: boolean }) =>
      params.repoPath
        ? invokeGitOperationForRepo(params.repoPath, 'commit', IpcChannel.GitCreateCommit, params)
        : invokeGitMutation('commit', IpcChannel.GitCreateCommit, params),
    getCommitLogPage: (params: { repoPath?: string; limit: number; offset: number; scope: 'all' | 'head' }) =>
      params.repoPath
        ? invokeGitOperationForRepo(params.repoPath, 'log', IpcChannel.GitCommitLogPage, params)
        : invokeGitOperation('log', IpcChannel.GitCommitLogPage, params),
    requestCommitStats: (hashes: string[], priority?: 'selected' | 'visible' | 'background', repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'show', IpcChannel.GitRequestCommitStats, hashes, priority, repoPath)
        : invokeGitOperation('show', IpcChannel.GitRequestCommitStats, hashes, priority),
    onCommitStats: (callback: (update: CommitStatsUpdateDto) => void) => {
      const handler = (_event: IpcRendererEvent, update: CommitStatsUpdateDto) => callback(update);
      ipcRenderer.on(IpcChannel.GitCommitStats, handler);
      return () => ipcRenderer.removeListener(IpcChannel.GitCommitStats, handler);
    },
    getWorkingTreeSnapshot: (repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'status', IpcChannel.GitWorkingTreeSnapshot, repoPath)
        : invokeGitOperation('status', IpcChannel.GitWorkingTreeSnapshot),
    getWorkingTreeStats: (snapshotId: string, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'status', IpcChannel.GitWorkingTreeStats, snapshotId, repoPath)
        : invokeGitOperation('status', IpcChannel.GitWorkingTreeStats, snapshotId),
    // Background inspection must not trigger active-workspace recovery dialogs.
    getRepositoryChangeSummary: (repoPath: string, readRequest?: ReadRequest) =>
      ipcRenderer.invoke(IpcChannel.GitRepositoryChangeSummary, repoPath, readRequest),
    getSequencerState: (repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'status', IpcChannel.GitSequencerState, repoPath)
        : invokeGitOperation('status', IpcChannel.GitSequencerState),
    stagePaths: (paths: string[], repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'add', IpcChannel.GitStagePaths, paths, repoPath)
        : invokeGitOperation('add', IpcChannel.GitStagePaths, paths),
    getDiffPreview: (args: string[], limits?: { maxBytes?: number; maxLines?: number }, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'diff', IpcChannel.GitDiffPreview, args, limits || {}, repoPath)
        : invokeGitOperation('diff', IpcChannel.GitDiffPreview, args, limits || {}),
    getFileBlameRange: (
      filePath: string,
      commitHash: string | undefined,
      startLine: number,
      lineCount: number,
      repoPath?: string,
      source?: 'staged' | 'unstaged',
    ) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'blame', IpcChannel.GitFileBlameRange, filePath, commitHash, startLine, lineCount, repoPath, source)
        : invokeGitOperation('blame', IpcChannel.GitFileBlameRange, filePath, commitHash, startLine, lineCount, undefined, source),
    onRepoUnavailable: (callback: (payload: RepoUnavailablePayload) => void) => {
      preloadRepoUnavailableListeners.add(callback);
      return () => {
        preloadRepoUnavailableListeners.delete(callback);
      };
    },
    startInteractiveRebase: (baseHash: string, todoLines: string[], repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'rebase', IpcChannel.GitInteractiveRebase, baseHash, todoLines, repoPath)
        : invokeGitOperation('rebase', IpcChannel.GitInteractiveRebase, baseHash, todoLines),
    applyPatch: (patch: string, options?: { cached?: boolean; reverse?: boolean }, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'apply', IpcChannel.GitApplyPatch, patch, options || {}, repoPath)
        : invokeGitOperation('apply', IpcChannel.GitApplyPatch, patch, options || {}),
    getStashes: (repoPath?: string) =>
      repoPath ? invokeGitOperationForRepo(repoPath, 'stash list', IpcChannel.GitStashes, repoPath) : invokeGitOperation('stash list', IpcChannel.GitStashes),
    gitStashBranch: (stashName: string, branchName: string, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'stash branch', IpcChannel.GitStashBranch, { stashName, branchName, repoPath })
        : invokeGitMutation('stash branch', IpcChannel.GitStashBranch, { stashName, branchName }),
    getRepoOriginUrl: (repoPath: string) => invokeGitOperationForRepo(repoPath, 'remote get-url', IpcChannel.GitRepoOriginUrl, repoPath),
    addIgnoreRule: (pattern: string, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'ignore', IpcChannel.GitAddIgnoreRule, pattern, repoPath)
        : invokeGitOperation('ignore', IpcChannel.GitAddIgnoreRule, pattern),
    gitFetch: () => invokeGitCommand('fetch', '--all', '--prune', '--tags', '--quiet'),
    gitPull: () => invokeGitCommand('pull'),
    gitPush: () => invokeGitCommand('push'),
    scanCommitSecrets: (params: { repoPath: string }) => invokeGitOperationForRepo(params.repoPath, 'commit', IpcChannel.GitScanCommitSecrets, params),
    approveSecretScanCommit: (repoPath: string) => invokeGitOperationForRepo(repoPath, 'commit', IpcChannel.GitApproveSecretScanCommit, repoPath),
    scanPushSecrets: (params: ScanPushSecretsRequestDto) => invokeGitOperationForRepo(params.repoPath, 'push', IpcChannel.GitScanPushSecrets, params),
    approveSecretScanPush: (pushArgs: string[] | undefined, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'push', IpcChannel.GitApproveSecretScanPush, pushArgs, repoPath),
    cancelSecretScan: (repoPath: string) => invokeGitOperationForRepo(repoPath, 'push', IpcChannel.GitCancelSecretScan, repoPath),
    // Clone is not an operation on the selected repository; a target-path
    // failure must never evict whichever repository is currently open.
    gitClone: (cloneUrl: string, targetDir: string, targetName?: string) => ipcRenderer.invoke(IpcChannel.GitClone, cloneUrl, targetDir, targetName),
    gitInit: (repoPath: string, options?: RepositoryInitializationOptionsDto) =>
      invokeGitOperationForRepo(repoPath, 'init', IpcChannel.GitInit, repoPath, options),
    getFileHistory: (filePath: string, commitHash?: string, limit?: number, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'log', IpcChannel.GitFileHistory, filePath, commitHash, limit, repoPath)
        : invokeGitOperation('log', IpcChannel.GitFileHistory, filePath, commitHash, limit),
    getFileBlame: (filePath: string, commitHash?: string, repoPath?: string, source?: 'staged' | 'unstaged') =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'blame', IpcChannel.GitFileBlame, filePath, commitHash, repoPath, source)
        : invokeGitOperation('blame', IpcChannel.GitFileBlame, filePath, commitHash, undefined, source),
    getFileTimelineData: (limit?: number, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'log', IpcChannel.GitGetFileTimelineData, limit, repoPath)
        : invokeGitOperation('log', IpcChannel.GitGetFileTimelineData, limit),
    readRepoFile: (filePath: string, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'show', IpcChannel.GitReadRepoFile, filePath, repoPath)
        : invokeGitOperation('show', IpcChannel.GitReadRepoFile, filePath),
    ...createRepositoryFileApi(invokeGitOperationForRepo),
    getMarkdownPreviewFile: (params: { source: 'unstaged' | 'staged' | 'commit'; path: string; commitHash?: string; repoPath?: string }) =>
      params.repoPath
        ? invokeGitOperationForRepo(params.repoPath, 'show', IpcChannel.GitMarkdownPreviewFile, params)
        : invokeGitOperation('show', IpcChannel.GitMarkdownPreviewFile, params),
    getRepoFileDataUrl: (params: { source: 'unstaged' | 'staged' | 'commit'; path: string; commitHash?: string; repoPath?: string }) =>
      params.repoPath
        ? invokeGitOperationForRepo(params.repoPath, 'show', IpcChannel.GitRepoFileDataUrl, params)
        : invokeGitOperation('show', IpcChannel.GitRepoFileDataUrl, params),
    writeRepoFile: (filePath: string, content: string, repoPath?: string, encoding?: TextFileEncodingDto) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'write', IpcChannel.GitWriteRepoFile, filePath, content, repoPath, encoding)
        : invokeGitOperation('write', IpcChannel.GitWriteRepoFile, filePath, content, undefined, encoding),
    deleteRepoFile: (filePath: string, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'delete', IpcChannel.GitDeleteRepoFile, filePath, repoPath)
        : invokeGitOperation('delete', IpcChannel.GitDeleteRepoFile, filePath),
    listWorkingDirectory: (repoPath: string, parentPath = '') =>
      invokeGitOperationForRepo(repoPath, 'list files', IpcChannel.GitListWorkingDirectory, repoPath, parentPath),
    createWorkingDirectoryFile: (filePath: string, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'create file', IpcChannel.GitCreateWorkingDirectoryFile, filePath, repoPath),
    createWorkingDirectoryFolder: (folderPath: string, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'create folder', IpcChannel.GitCreateWorkingDirectoryFolder, folderPath, repoPath),
    getWorkingDirectoryFileInfo: (filePath: string, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'file info', IpcChannel.GitGetWorkingDirectoryFileInfo, filePath, repoPath),
    getWorkingDirectoryPreview: (filePath: string, repoPath: string, allowLargeImage?: boolean) =>
      invokeGitOperationForRepo(repoPath, 'preview file', IpcChannel.GitGetWorkingDirectoryPreview, filePath, repoPath, allowLargeImage),
    searchWorkingDirectory: (request: WorkingDirectorySearchRequestDto, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'search files', IpcChannel.GitSearchWorkingDirectory, request, repoPath),
    replaceWorkingDirectory: (request: WorkingDirectoryReplaceRequestDto, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'replace in files', IpcChannel.GitReplaceWorkingDirectory, request, repoPath),
    applyWorkingDirectoryMoves: (moves: Array<{ sourcePath: string; targetPath: string }>, createParentFolders: boolean, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'move files', IpcChannel.GitApplyWorkingDirectoryMoves, { moves, createParentFolders }, repoPath),
    listWorkingDirectoryFolders: (repoPath: string, parentPath = '') =>
      invokeGitOperationForRepo(repoPath, 'list folders', IpcChannel.GitListWorkingDirectoryFolders, repoPath, parentPath),
    findEmptyWorkingDirectoryFolders: (folderPaths: string[], repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'find empty folders', IpcChannel.GitFindEmptyWorkingDirectoryFolders, folderPaths, repoPath),
    deleteEmptyWorkingDirectoryFolders: (folderPaths: string[], repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'delete empty folders', IpcChannel.GitDeleteEmptyWorkingDirectoryFolders, folderPaths, repoPath),
    createWorkingDirectoryArchive: (sourcePaths: string[], targetPath: string, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'create archive', IpcChannel.GitCreateWorkingDirectoryArchive, { sourcePaths, targetPath }, repoPath),
    moveWorkingDirectoryEntry: (sourcePath: string, targetPath: string, overwrite: boolean, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'move file', IpcChannel.GitMoveWorkingDirectoryEntry, { sourcePath, targetPath, overwrite }, repoPath),
    copyWorkingDirectoryEntry: (sourcePath: string, targetPath: string, overwrite: boolean, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'copy file', IpcChannel.GitCopyWorkingDirectoryEntry, { sourcePath, targetPath, overwrite }, repoPath),
    deleteWorkingDirectoryEntry: (filePath: string, repoPath: string) =>
      invokeGitOperationForRepo(repoPath, 'delete file', IpcChannel.GitDeleteWorkingDirectoryEntry, filePath, repoPath),
    openRepositoryPath: (params: { path?: string; action: 'reveal' | 'open' | 'openWith'; repoPath?: string }) =>
      params.repoPath
        ? invokeGitOperationForRepo(params.repoPath, 'open path', IpcChannel.GitOpenRepositoryPath, params)
        : invokeGitOperation('open path', IpcChannel.GitOpenRepositoryPath, params),
    openSubmodule: (submodulePath: string, repoPath?: string) =>
      repoPath
        ? invokeGitOperationForRepo(repoPath, 'submodule', IpcChannel.GitOpenSubmodule, submodulePath, repoPath)
        : invokeGitOperation('submodule', IpcChannel.GitOpenSubmodule, submodulePath),
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
    ...createRepositoryRunApi(ipcRenderer),
    plannerGetData: () => ipcRenderer.invoke(IpcChannel.PlannerGetData),
    onPlannerDataChanged: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(IpcChannel.PlannerDataChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannel.PlannerDataChanged, handler);
    },
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
    setOpenAiApiKey: (apiKey: string) => ipcRenderer.invoke(IpcChannel.SettingsSetOpenAiApiKey, apiKey),
    clearOpenAiApiKey: () => ipcRenderer.invoke(IpcChannel.SettingsClearOpenAiApiKey),
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
    runAiAutoCommit: (params: { repoPath: string }) => ipcRenderer.invoke(IpcChannel.GitAiAutoCommit, params),
    cancelAiAutoCommit: () => ipcRenderer.invoke(IpcChannel.GitCancelAiAutoCommit),
    getAiAutoCommitState: () => ipcRenderer.invoke(IpcChannel.GitGetAiAutoCommitState),
    aiGenerateCommitMessage: (params: { notes: string }) => ipcRenderer.invoke(IpcChannel.AiGenerateCommitMessage, params),
    aiGenerateReleaseNotes: (params: ReleaseNotesGenerationParamsDto) => ipcRenderer.invoke(IpcChannel.AiGenerateReleaseNotes, params),
    getDiagnosticsReport: () => ipcRenderer.invoke(IpcChannel.DiagnosticsReport),
  } satisfies ElectronFlatAPI;
  const electronAPI: ElectronAPI = {
    ...flatApi,
    hosting: { hostingRequest: flatApi.hostingRequest },
    transfers: { remoteTransferRequest: flatApi.remoteTransferRequest },
    git: {
      setRepoPath: flatApi.setRepoPath,
      clearRepoPath: flatApi.clearRepoPath,
      runGitCommand: flatApi.runGitCommand,
      runGitCommandForRepo: flatApi.runGitCommandForRepo,
      createCommit: flatApi.createCommit,
      getCommitLogPage: flatApi.getCommitLogPage,
      requestCommitStats: flatApi.requestCommitStats,
      onCommitStats: flatApi.onCommitStats,
      getWorkingTreeSnapshot: flatApi.getWorkingTreeSnapshot,
      getRepositoryChangeSummary: flatApi.getRepositoryChangeSummary,
      getWorkingTreeStats: flatApi.getWorkingTreeStats,
      getSequencerState: flatApi.getSequencerState,
      stagePaths: flatApi.stagePaths,
      getDiffPreview: flatApi.getDiffPreview,
      getFileBlameRange: flatApi.getFileBlameRange,
      onRepoUnavailable: flatApi.onRepoUnavailable,
      startInteractiveRebase: flatApi.startInteractiveRebase,
      inspectCommitMessageEdit: flatApi.inspectCommitMessageEdit,
      rewordCommitMessage: flatApi.rewordCommitMessage,
      getCommitMessageEditBackups: flatApi.getCommitMessageEditBackups,
      cancelCommitMessageEdit: flatApi.cancelCommitMessageEdit,
      applyPatch: flatApi.applyPatch,
      getStashes: flatApi.getStashes,
      gitStashBranch: flatApi.gitStashBranch,
      getRepoOriginUrl: flatApi.getRepoOriginUrl,
      addIgnoreRule: flatApi.addIgnoreRule,
      gitFetch: flatApi.gitFetch,
      gitPull: flatApi.gitPull,
      gitPush: flatApi.gitPush,
      ...createRepositorySecretScanAllowlistApi(ipcRenderer),
      scanCommitSecrets: flatApi.scanCommitSecrets,
      approveSecretScanCommit: flatApi.approveSecretScanCommit,
      scanPushSecrets: flatApi.scanPushSecrets,
      approveSecretScanPush: flatApi.approveSecretScanPush,
      cancelSecretScan: flatApi.cancelSecretScan,
      gitClone: flatApi.gitClone,
      gitInit: flatApi.gitInit,
      getFileHistory: flatApi.getFileHistory,
      getFileBlame: flatApi.getFileBlame,
      getFileTimelineData: flatApi.getFileTimelineData,
      readRepoFile: flatApi.readRepoFile,
      getMarkdownPreviewFile: flatApi.getMarkdownPreviewFile,
      getRepoFileDataUrl: flatApi.getRepoFileDataUrl,
      writeRepoFile: flatApi.writeRepoFile,
      deleteRepoFile: flatApi.deleteRepoFile,
      listWorkingDirectory: flatApi.listWorkingDirectory,
      createWorkingDirectoryFile: flatApi.createWorkingDirectoryFile,
      createWorkingDirectoryFolder: flatApi.createWorkingDirectoryFolder,
      getWorkingDirectoryFileInfo: flatApi.getWorkingDirectoryFileInfo,
      getWorkingDirectoryPreview: flatApi.getWorkingDirectoryPreview,
      getRepositoryFilePreview: flatApi.getRepositoryFilePreview,
      getGitLfsStatus: flatApi.getGitLfsStatus,
      trackWithGitLfs: flatApi.trackWithGitLfs,
      getRepositoryFileInfo: flatApi.getRepositoryFileInfo,
      saveRepositoryFile: flatApi.saveRepositoryFile,
      searchWorkingDirectory: flatApi.searchWorkingDirectory,
      replaceWorkingDirectory: flatApi.replaceWorkingDirectory,
      applyWorkingDirectoryMoves: flatApi.applyWorkingDirectoryMoves,
      listWorkingDirectoryFolders: flatApi.listWorkingDirectoryFolders,
      findEmptyWorkingDirectoryFolders: flatApi.findEmptyWorkingDirectoryFolders,
      deleteEmptyWorkingDirectoryFolders: flatApi.deleteEmptyWorkingDirectoryFolders,
      createWorkingDirectoryArchive: flatApi.createWorkingDirectoryArchive,
      moveWorkingDirectoryEntry: flatApi.moveWorkingDirectoryEntry,
      copyWorkingDirectoryEntry: flatApi.copyWorkingDirectoryEntry,
      deleteWorkingDirectoryEntry: flatApi.deleteWorkingDirectoryEntry,
      openRepositoryPath: flatApi.openRepositoryPath,
      openSubmodule: flatApi.openSubmodule,
      onCloneProgress: flatApi.onCloneProgress,
      onJobEvent: flatApi.onJobEvent,
    },
    planner: {
      plannerGetData: flatApi.plannerGetData,
      onPlannerDataChanged: flatApi.onPlannerDataChanged,
      plannerEnsureRepositoryProject: flatApi.plannerEnsureRepositoryProject,
      plannerCreateProject: flatApi.plannerCreateProject,
      plannerUpdateProject: flatApi.plannerUpdateProject,
      plannerDeleteProject: flatApi.plannerDeleteProject,
      plannerDeleteRepositoryProjectByPath: flatApi.plannerDeleteRepositoryProjectByPath,
      plannerCreateItem: flatApi.plannerCreateItem,
      plannerUpdateItem: flatApi.plannerUpdateItem,
      plannerDeleteItem: flatApi.plannerDeleteItem,
      plannerMaterializeProject: flatApi.plannerMaterializeProject,
    },
    settings: {
      getSettings: flatApi.getSettings,
      setSettings: flatApi.setSettings,
      setGeminiApiKey: flatApi.setGeminiApiKey,
      clearGeminiApiKey: flatApi.clearGeminiApiKey,
      setOpenAiApiKey: flatApi.setOpenAiApiKey,
      clearOpenAiApiKey: flatApi.clearOpenAiApiKey,
    },
    app: {
      ...createSystemToolsApi(ipcRenderer),
      cancelReadRequest: flatApi.cancelReadRequest,
      getBootstrap: flatApi.getBootstrap,
      savePreviews: flatApi.savePreviews,
      openDirectory: flatApi.openDirectory,
      selectDirectory: flatApi.selectDirectory,
      selectFiles: flatApi.selectFiles,
      selectProjectParentDirectory: flatApi.selectProjectParentDirectory,
      openExternalUrl: flatApi.openExternalUrl,
      getFeedbackReportCapability: flatApi.getFeedbackReportCapability,
      submitFeedbackReport: flatApi.submitFeedbackReport,
      getPlanningApiInfo: flatApi.getPlanningApiInfo,
      generatePlanningApiToken: flatApi.generatePlanningApiToken,
      clearPlanningApiToken: flatApi.clearPlanningApiToken,
      getAppVersion: flatApi.getAppVersion,
      getUpdaterStatus: flatApi.getUpdaterStatus,
      checkForAppUpdates: flatApi.checkForAppUpdates,
      runOneClickAppUpdate: flatApi.runOneClickAppUpdate,
      downloadAppUpdate: flatApi.downloadAppUpdate,
      installAppUpdate: flatApi.installAppUpdate,
      onUpdaterEvent: flatApi.onUpdaterEvent,
      getDiagnosticsReport: flatApi.getDiagnosticsReport,
    },
    ai: {
      aiTestConnection: flatApi.aiTestConnection,
      aiListModels: flatApi.aiListModels,
      ollamaTestConnection: flatApi.ollamaTestConnection,
      ollamaListModels: flatApi.ollamaListModels,
      runAiAutoCommit: flatApi.runAiAutoCommit,
      cancelAiAutoCommit: flatApi.cancelAiAutoCommit,
      getAiAutoCommitState: flatApi.getAiAutoCommitState,
      aiGenerateCommitMessage: flatApi.aiGenerateCommitMessage,
      aiGenerateReleaseNotes: flatApi.aiGenerateReleaseNotes,
      onJobEvent: flatApi.onJobEvent,
    },
    repos: {
      ...createRepositoryIconApi(ipcRenderer),
      getStoredRepos: flatApi.getStoredRepos,
      setStoredRepos: flatApi.setStoredRepos,
      resolveRepoPath: flatApi.resolveRepoPath,
      setRepoPath: flatApi.setRepoPath,
      clearRepoPath: flatApi.clearRepoPath,
    },
    runs: {
      getRepositoryRunConfig: flatApi.getRepositoryRunConfig,
      saveRepositoryRunConfig: flatApi.saveRepositoryRunConfig,
      watchRepositoryRunConfig: flatApi.watchRepositoryRunConfig,
      startRepositoryRun: flatApi.startRepositoryRun,
      stopRepositoryRun: flatApi.stopRepositoryRun,
      getRepositoryRunState: flatApi.getRepositoryRunState,
      onRepositoryRunConfigChanged: flatApi.onRepositoryRunConfigChanged,
      onRepositoryRunEvent: flatApi.onRepositoryRunEvent,
    },
  };
  return electronAPI;
};
