const { contextBridge, ipcRenderer } = require('electron');

type RepoUnavailablePayload = {
  command: string;
  error: string;
};

const repoUnavailableListeners = new Set<(payload: RepoUnavailablePayload) => void>();
let lastRepoUnavailableNotifyAt = 0;

const REPO_UNAVAILABLE_ERROR_PATTERNS: RegExp[] = [
  /\[REPO_UNAVAILABLE\]/i,
  /not a git repository/i,
  /no repository path set/i,
  /cannot change to/i,
  /no such file or directory/i,
  /the system cannot find the path specified/i,
  /\buv_cwd\b/i,
];

const isRepoUnavailableError = (errorText: unknown): boolean => {
  const text = String(errorText || '');
  if (!text.trim()) return false;
  return REPO_UNAVAILABLE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
};

const notifyRepoUnavailable = (payload: RepoUnavailablePayload) => {
  const now = Date.now();
  if (now - lastRepoUnavailableNotifyAt < 1200) {
    return;
  }
  lastRepoUnavailableNotifyAt = now;
  for (const listener of repoUnavailableListeners) {
    try {
      listener(payload);
    } catch {
      // ignore callback errors
    }
  }
};

const invokeGitCommand = async (commandName: string, ...args: any[]) => {
  const result = await ipcRenderer.invoke('git:command', commandName, ...args);
  if (result && !result.success && isRepoUnavailableError(result.error)) {
    notifyRepoUnavailable({
      command: String(commandName || ''),
      error: String(result.error || ''),
    });
  }
  return result;
};

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectProjectParentDirectory: () => ipcRenderer.invoke('dialog:selectProjectParentDirectory'),
  setRepoPath: (repoPath: string) => ipcRenderer.invoke('git:setRepo', repoPath),
  runGitCommand: (commandName: string, ...args: any[]) => invokeGitCommand(commandName, ...args),
  getCommitLogPage: (params: { limit: number; offset: number; scope: 'all' | 'head' }) =>
    ipcRenderer.invoke('git:commitLogPage', params),
  requestCommitStats: (
    hashes: string[],
    priority?: 'selected' | 'visible' | 'background',
  ) => ipcRenderer.invoke('git:requestCommitStats', hashes, priority),
  onCommitStats: (callback: (update: any) => void) => {
    const handler = (_event: any, update: any) => callback(update);
    ipcRenderer.on('git:commitStats', handler);
    return () => ipcRenderer.removeListener('git:commitStats', handler);
  },
  getWorkingTreeSnapshot: () => ipcRenderer.invoke('git:workingTreeSnapshot'),
  getWorkingTreeStats: (snapshotId: string) => ipcRenderer.invoke('git:workingTreeStats', snapshotId),
  stagePaths: (paths: string[]) => ipcRenderer.invoke('git:stagePaths', paths),
  getDiffPreview: (args: string[], limits?: { maxBytes?: number; maxLines?: number }) =>
    ipcRenderer.invoke('git:diffPreview', args, limits || {}),
  getFileBlameRange: (filePath: string, commitHash: string | undefined, startLine: number, lineCount: number) =>
    ipcRenderer.invoke('git:fileBlameRange', filePath, commitHash, startLine, lineCount),
  onRepoUnavailable: (callback: (payload: RepoUnavailablePayload) => void) => {
    repoUnavailableListeners.add(callback);
    return () => {
      repoUnavailableListeners.delete(callback);
    };
  },
  startInteractiveRebase: (baseHash: string, todoLines: string[]) => ipcRenderer.invoke('git:interactiveRebase', baseHash, todoLines),
  applyPatch: (patch: string, options?: { cached?: boolean; reverse?: boolean }) => ipcRenderer.invoke('git:applyPatch', patch, options || {}),
  getStashes: () => ipcRenderer.invoke('git:stashes'),
  getRepoOriginUrl: (repoPath: string) => ipcRenderer.invoke('git:repoOriginUrl', repoPath),
  addIgnoreRule: (pattern: string) => ipcRenderer.invoke('git:addIgnoreRule', pattern),
  gitFetch: () => invokeGitCommand('fetch', '--all', '--prune', '--tags', '--quiet'),
  gitPull: () => invokeGitCommand('pull'),
  gitPush: () => invokeGitCommand('push'),
  scanPushSecrets: () => ipcRenderer.invoke('git:scanPushSecrets'),
  cancelSecretScan: () => ipcRenderer.invoke('git:cancelSecretScan'),
  gitClone: (cloneUrl: string, targetDir: string, targetName?: string) => ipcRenderer.invoke('git:clone', cloneUrl, targetDir, targetName),
  gitInit: (repoPath: string) => ipcRenderer.invoke('git:init', repoPath),
  getFileHistory: (filePath: string, commitHash?: string, limit?: number) =>
    ipcRenderer.invoke('git:fileHistory', filePath, commitHash, limit),
  getFileBlame: (filePath: string, commitHash?: string) =>
    ipcRenderer.invoke('git:fileBlame', filePath, commitHash),
  getFileTimelineData: (limit?: number) => ipcRenderer.invoke('git:getFileTimelineData', limit),
  readRepoFile: (filePath: string) => ipcRenderer.invoke('git:readRepoFile', filePath),
  writeRepoFile: (filePath: string, content: string) => ipcRenderer.invoke('git:writeRepoFile', filePath, content),
  openSubmodule: (submodulePath: string) => ipcRenderer.invoke('git:openSubmodule', submodulePath),
  onCloneProgress: (callback: (line: string) => void) => {
    const handler = (_event: any, line: string) => callback(line);
    ipcRenderer.on('clone:progress', handler);
    return () => ipcRenderer.removeListener('clone:progress', handler);
  },
  onJobEvent: (callback: (event: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('job:event', handler);
    return () => ipcRenderer.removeListener('job:event', handler);
  },
  getStoredRepos: () => ipcRenderer.invoke('repos:getStored'),
  setStoredRepos: (data: any) => ipcRenderer.invoke('repos:setStored', data),
  plannerGetData: () => ipcRenderer.invoke('planner:getData'),
  plannerEnsureRepositoryProject: (repoPath: string) => ipcRenderer.invoke('planner:ensureRepositoryProject', repoPath),
  plannerCreateProject: (input: any) => ipcRenderer.invoke('planner:createProject', input),
  plannerUpdateProject: (projectId: string, input: any) => ipcRenderer.invoke('planner:updateProject', projectId, input),
  plannerDeleteProject: (projectId: string) => ipcRenderer.invoke('planner:deleteProject', projectId),
  plannerCreateItem: (projectId: string, input: any) => ipcRenderer.invoke('planner:createItem', projectId, input),
  plannerUpdateItem: (itemId: string, input: any) => ipcRenderer.invoke('planner:updateItem', itemId, input),
  plannerDeleteItem: (itemId: string) => ipcRenderer.invoke('planner:deleteItem', itemId),
  plannerMaterializeProject: (projectId: string, parentDirectory: string, folderName: string) =>
    ipcRenderer.invoke('planner:materializeProject', projectId, parentDirectory, folderName),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: any) => ipcRenderer.invoke('settings:set', partial),
  setGeminiApiKey: (apiKey: string) => ipcRenderer.invoke('settings:setGeminiApiKey', apiKey),
  clearGeminiApiKey: () => ipcRenderer.invoke('settings:clearGeminiApiKey'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:getStatus'),
  checkForAppUpdates: () => ipcRenderer.invoke('updater:check'),
  runOneClickAppUpdate: () => ipcRenderer.invoke('updater:runOneClick'),
  downloadAppUpdate: () => ipcRenderer.invoke('updater:download'),
  installAppUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterEvent: (callback: (event: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('updater:event', handler);
    return () => ipcRenderer.removeListener('updater:event', handler);
  },
  aiTestConnection: () => ipcRenderer.invoke('ai:testConnection'),
  aiListModels: () => ipcRenderer.invoke('ai:listModels'),
  ollamaTestConnection: () => ipcRenderer.invoke('ai:testConnection'),
  ollamaListModels: () => ipcRenderer.invoke('ai:listModels'),
  runAiAutoCommit: () => ipcRenderer.invoke('git:aiAutoCommit'),
  cancelAiAutoCommit: () => ipcRenderer.invoke('git:cancelAiAutoCommit'),
  getAiAutoCommitState: () => ipcRenderer.invoke('git:getAiAutoCommitState'),
  githubAuth: (token: string, host?: string) => ipcRenderer.invoke('github:auth', token, host),
  githubDeviceStart: () => ipcRenderer.invoke('github:deviceStart'),
  githubDevicePoll: (deviceCode: string) => ipcRenderer.invoke('github:devicePoll', deviceCode),
  githubWebLogin: () => ipcRenderer.invoke('github:webLogin'),
  githubGetRepos: (params?: { page?: number; perPage?: number; search?: string }) => ipcRenderer.invoke('github:getRepos', params || {}),
  githubGetSavedAuthStatus: () => ipcRenderer.invoke('github:getSavedAuthStatus'),
  githubLoginWithSavedToken: () => ipcRenderer.invoke('github:loginWithSavedToken'),
  githubCheckAuthStatus: () => ipcRenderer.invoke('github:checkAuthStatus'),
  githubLogout: () => ipcRenderer.invoke('github:logout'),
  githubCreateRepo: (name: string, description: string, isPrivate: boolean) =>
    ipcRenderer.invoke('github:createRepo', { name, description, isPrivate }),
  githubForkRepo: (params: { owner: string; repo: string; name?: string; defaultBranchOnly?: boolean }) =>
    ipcRenderer.invoke('github:forkRepo', params),
  githubGetPRs: (owner: string, repo: string, state: string) =>
    ipcRenderer.invoke('github:getPRs', owner, repo, state),
  githubCreatePR: (params: { owner: string; repo: string; title: string; body: string; head: string; base: string }) =>
    ipcRenderer.invoke('github:createPR', params),
  githubCreateRelease: (params: { owner: string; repo: string; tagName: string; targetCommitish?: string; releaseName: string; body?: string; draft?: boolean; prerelease?: boolean }) =>
    ipcRenderer.invoke('github:createRelease', params),
  githubGetReleaseContext: (params: { owner: string; repo: string; targetCommitish?: string }) =>
    ipcRenderer.invoke('github:getReleaseContext', params),
  aiGenerateReleaseNotes: (params: {
    tagName: string;
    releaseName: string;
    lastReleaseTag?: string | null;
    commits: Array<{ hash: string; shortHash: string; subject: string; author: string; date: string }>;
    language: 'de' | 'en';
    versionBump: 'major' | 'minor' | 'patch';
    hints?: string[];
  }) => ipcRenderer.invoke('ai:generateReleaseNotes', params),
  githubGetWorkflowRuns: (params: { owner: string; repo: string; branch?: string; headSha?: string; perPage?: number }) =>
    ipcRenderer.invoke('github:getWorkflowRuns', params),
  githubGetStatusChecks: (params: { owner: string; repo: string; ref: string }) =>
    ipcRenderer.invoke('github:getStatusChecks', params),
  githubMergePR: (params: { owner: string; repo: string; pullNumber: number; mergeMethod: 'merge' | 'squash' | 'rebase'; commitTitle?: string; commitMessage?: string }) =>
    ipcRenderer.invoke('github:mergePR', params),
  getDiagnosticsReport: () => ipcRenderer.invoke('diagnostics:report'),
});

