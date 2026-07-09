import { createElectronApi } from './preload/createElectronApi';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', createElectronApi(ipcRenderer));
