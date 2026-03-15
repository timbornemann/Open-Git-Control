const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  setRepoPath: (repoPath: string) => ipcRenderer.invoke('git:setRepo', repoPath),
  runGitCommand: (commandName: string, ...args: any[]) => ipcRenderer.invoke('git:command', commandName, ...args),
  startInteractiveRebase: (baseHash: string, todoLines: string[]) => ipcRenderer.invoke('git:interactiveRebase', baseHash, todoLines),
  applyPatch: (patch: string, options?: { cached?: boolean; reverse?: boolean }) => ipcRenderer.invoke('git:applyPatch', patch, options || {}),
  getStashes: () => ipcRenderer.invoke('git:stashes'),
  getRepoOriginUrl: (repoPath: string) => ipcRenderer.invoke('git:repoOriginUrl', repoPath),
  addIgnoreRule: (pattern: string) => ipcRenderer.invoke('git:addIgnoreRule', pattern),
  gitFetch: () => ipcRenderer.invoke('git:command', 'fetch', '--all', '--prune', '--tags', '--quiet'),
  gitPull: () => ipcRenderer.invoke('git:command', 'pull'),
  gitPush: () => ipcRenderer.invoke('git:command', 'push'),
  scanPushSecrets: () => ipcRenderer.invoke('git:scanPushSecrets'),
  gitClone: (cloneUrl: string, targetDir: string) => ipcRenderer.invoke('git:clone', cloneUrl, targetDir),
  gitInit: (repoPath: string) => ipcRenderer.invoke('git:init', repoPath),
  getFileHistory: (filePath: string, commitHash?: string, limit?: number) =>
    ipcRenderer.invoke('git:fileHistory', filePath, commitHash, limit),
  getFileBlame: (filePath: string, commitHash?: string) =>
    ipcRenderer.invoke('git:fileBlame', filePath, commitHash),
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
  }) => ipcRenderer.invoke('ai:generateReleaseNotes', params),
  githubGetWorkflowRuns: (params: { owner: string; repo: string; branch?: string; headSha?: string; perPage?: number }) =>
    ipcRenderer.invoke('github:getWorkflowRuns', params),
  githubGetStatusChecks: (params: { owner: string; repo: string; ref: string }) =>
    ipcRenderer.invoke('github:getStatusChecks', params),
  githubMergePR: (params: { owner: string; repo: string; pullNumber: number; mergeMethod: 'merge' | 'squash' | 'rebase'; commitTitle?: string; commitMessage?: string }) =>
    ipcRenderer.invoke('github:mergePR', params),
  getDiagnosticsReport: () => ipcRenderer.invoke('diagnostics:report'),
});

