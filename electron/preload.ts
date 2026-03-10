const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  setRepoPath: (repoPath: string) => ipcRenderer.invoke('git:setRepo', repoPath),
  runGitCommand: (commandName: string, ...args: any[]) => ipcRenderer.invoke('git:command', commandName, ...args),
  gitClone: (cloneUrl: string, targetDir: string) => ipcRenderer.invoke('git:clone', cloneUrl, targetDir),
  gitInit: (repoPath: string) => ipcRenderer.invoke('git:init', repoPath),
  getFileHistory: (filePath: string, commitHash?: string, limit?: number) =>
    ipcRenderer.invoke('git:fileHistory', filePath, commitHash, limit),
  getFileBlame: (filePath: string, commitHash?: string) =>
    ipcRenderer.invoke('git:fileBlame', filePath, commitHash),
  onCloneProgress: (callback: (line: string) => void) => {
    const handler = (_event: any, line: string) => callback(line);
    ipcRenderer.on('clone:progress', handler);
    return () => ipcRenderer.removeListener('clone:progress', handler);
  },
  getStoredRepos: () => ipcRenderer.invoke('repos:getStored'),
  setStoredRepos: (data: any) => ipcRenderer.invoke('repos:setStored', data),
  githubAuth: (token: string) => ipcRenderer.invoke('github:auth', token),
  githubGetRepos: () => ipcRenderer.invoke('github:getRepos'),
  githubGetSavedAuthStatus: () => ipcRenderer.invoke('github:getSavedAuthStatus'),
  githubLoginWithSavedToken: () => ipcRenderer.invoke('github:loginWithSavedToken'),
  githubCheckAuthStatus: () => ipcRenderer.invoke('github:checkAuthStatus'),
  githubLogout: () => ipcRenderer.invoke('github:logout'),
  githubCreateRepo: (name: string, description: string, isPrivate: boolean) =>
    ipcRenderer.invoke('github:createRepo', { name, description, isPrivate }),
  githubGetPRs: (owner: string, repo: string, state: string) =>
    ipcRenderer.invoke('github:getPRs', owner, repo, state),
  githubCreatePR: (params: { owner: string; repo: string; title: string; body: string; head: string; base: string }) =>
    ipcRenderer.invoke('github:createPR', params)
});
