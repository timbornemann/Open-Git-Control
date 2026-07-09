import { createElectronApi } from './preload/createElectronApi';

const { contextBridge, ipcRenderer } = require('electron');

const api = createElectronApi(ipcRenderer);

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('api', api);
