const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  runGitCommand: (commandName: string, ...args: any[]) => ipcRenderer.invoke('git:command', commandName, ...args),
  gitClone: (cloneUrl: string, targetDir: string) => ipcRenderer.invoke('git:clone', cloneUrl, targetDir),
  onCloneProgress: (callback: (line: string) => void) => {
    const handler = (_event: any, line: string) => callback(line);
    ipcRenderer.on('clone:progress', handler);
    return () => ipcRenderer.removeListener('clone:progress', handler);
  },
  githubAuth: (token: string) => ipcRenderer.invoke('github:auth', token),
  githubGetRepos: () => ipcRenderer.invoke('github:getRepos'),
  githubCheckAuthStatus: () => ipcRenderer.invoke('github:checkAuthStatus')
});
