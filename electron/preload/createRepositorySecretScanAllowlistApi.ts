import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { ElectronRepositorySecretScanAllowlistAPI } from '../../src/shared/ipc/contracts/repositorySecretScanAllowlist';

export const createRepositorySecretScanAllowlistApi = (
  ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>,
): ElectronRepositorySecretScanAllowlistAPI => ({
  getRepositorySecretScanAllowlist: (repoPath) => ipcRenderer.invoke(IpcChannel.RepositorySecretScanAllowlistGet, repoPath),
  saveRepositorySecretScanAllowlist: (request) => ipcRenderer.invoke(IpcChannel.RepositorySecretScanAllowlistSave, request),
  addRepositorySecretScanAllowlistPaths: (request) => ipcRenderer.invoke(IpcChannel.RepositorySecretScanAllowlistAddPaths, request),
  watchRepositorySecretScanAllowlist: (repoPath) => ipcRenderer.invoke(IpcChannel.RepositorySecretScanAllowlistWatch, repoPath),
  onRepositorySecretScanAllowlistChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, repoPath: string) => callback(repoPath);
    ipcRenderer.on(IpcChannel.RepositorySecretScanAllowlistChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannel.RepositorySecretScanAllowlistChanged, handler);
  },
});
