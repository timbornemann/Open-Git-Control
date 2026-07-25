import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { RepositoryRunActionId, RepositoryRunConfigDto, RepositoryRunEventDto } from '../../src/types/repositoryRun';

type PreloadIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>;

export const createRepositoryRunApi = (ipcRenderer: PreloadIpcRenderer) => ({
  getRepositoryRunConfig: (repoPath: string) => ipcRenderer.invoke(IpcChannel.RepositoryRunGetConfig, repoPath),
  saveRepositoryRunConfig: (repoPath: string, config: RepositoryRunConfigDto) => ipcRenderer.invoke(IpcChannel.RepositoryRunSaveConfig, repoPath, config),
  watchRepositoryRunConfig: (repoPath: string | null) => ipcRenderer.invoke(IpcChannel.RepositoryRunWatchConfig, repoPath),
  startRepositoryRun: (repoPath: string, action: RepositoryRunActionId) => ipcRenderer.invoke(IpcChannel.RepositoryRunStart, repoPath, action),
  stopRepositoryRun: (runId?: string) => ipcRenderer.invoke(IpcChannel.RepositoryRunStop, runId),
  getRepositoryRunState: () => ipcRenderer.invoke(IpcChannel.RepositoryRunGetState),
  onRepositoryRunConfigChanged: (callback: (repoPath: string) => void) => {
    const handler = (_event: IpcRendererEvent, repoPath: string) => callback(repoPath);
    ipcRenderer.on(IpcChannel.RepositoryRunConfigChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannel.RepositoryRunConfigChanged, handler);
  },
  onRepositoryRunEvent: (callback: (event: RepositoryRunEventDto) => void) => {
    const handler = (_event: IpcRendererEvent, payload: RepositoryRunEventDto) => callback(payload);
    ipcRenderer.on(IpcChannel.RepositoryRunEvent, handler);
    return () => ipcRenderer.removeListener(IpcChannel.RepositoryRunEvent, handler);
  },
});
