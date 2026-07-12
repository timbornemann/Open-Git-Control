import { createElectronApi } from './preload/createElectronApi';

const { contextBridge, ipcRenderer } = require('electron');

// Preloads can run in subframes as well. Never expose the privileged bridge
// to an embedded document such as the sandboxed HTML file preview.
if (process.isMainFrame) {
  const api = createElectronApi(ipcRenderer);

  contextBridge.exposeInMainWorld('electronAPI', api);
  contextBridge.exposeInMainWorld('api', api);
}
