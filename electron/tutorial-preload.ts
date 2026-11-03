import { TUTORIAL_CHANNELS } from '../src/shared/tutorial/types';
import type { TutorialHostApi } from '../src/shared/tutorial/types';

const { contextBridge, ipcRenderer } = require('electron');
if (process.isMainFrame) {
  const host: TutorialHostApi = {
    getContext: () => ipcRenderer.invoke(TUTORIAL_CHANNELS.context),
    completeChapter: (id) => ipcRenderer.invoke(TUTORIAL_CHANNELS.complete, id),
    close: (failed = false) => ipcRenderer.invoke(TUTORIAL_CHANNELS.close, failed),
    ready: () => ipcRenderer.invoke(TUTORIAL_CHANNELS.ready),
  };
  contextBridge.exposeInMainWorld('tutorialHost', host);
}
