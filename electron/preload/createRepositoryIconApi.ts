import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { RepositoryIconCacheRequestDto, RepositoryIconChoiceDto, RepositoryIconStateDto } from '../../src/shared/repositoryIcons';
export const createRepositoryIconApi = (ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>) => ({
  getRepositoryIcon: (repo: string, rescan?: boolean) => ipc.invoke(IpcChannel.RepositoryIconGet, repo, rescan),
  readRepositoryIconSource: (repo: string, file: string) => ipc.invoke(IpcChannel.RepositoryIconSource, repo, file),
  saveRepositoryIconChoice: (repo: string, choice: RepositoryIconChoiceDto) => ipc.invoke(IpcChannel.RepositoryIconChoice, repo, choice),
  cacheRepositoryIconThumbnail: (repo: string, request: RepositoryIconCacheRequestDto) => ipc.invoke(IpcChannel.RepositoryIconCache, repo, request),
  selectRepositoryIconFile: (repo: string) => ipc.invoke(IpcChannel.RepositoryIconSelectFile, repo),
  onRepositoryIconChanged: (callback: (state: RepositoryIconStateDto) => void) => {
    const handler = (_event: IpcRendererEvent, state: RepositoryIconStateDto) => callback(state);
    ipc.on(IpcChannel.RepositoryIconChanged, handler);
    return () => ipc.removeListener(IpcChannel.RepositoryIconChanged, handler);
  },
});
