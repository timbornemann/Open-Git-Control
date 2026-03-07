const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  runGitCommand: (commandName: string, ...args: any[]) => ipcRenderer.invoke('git:command', commandName, ...args),
  githubAuth: (token: string) => ipcRenderer.invoke('github:auth', token),
  githubGetRepos: () => ipcRenderer.invoke('github:getRepos'),
});
