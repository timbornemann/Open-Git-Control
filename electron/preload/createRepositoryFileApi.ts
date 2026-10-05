import type { ElectronGitAPI } from '../../src/shared/ipc/contracts/git';
import { IpcChannel } from '../../src/types/ipcContract';

type Invoke = (repoPath: string, command: string, channel: IpcChannel, ...args: unknown[]) => Promise<unknown>;
export function createRepositoryFileApi(invoke: Invoke): Pick<ElectronGitAPI, 'getRepositoryFilePreview' | 'getRepositoryFileInfo' | 'saveRepositoryFile'> {
  return {
    getRepositoryFilePreview: (request) =>
      invoke(request.repoPath, 'preview file', IpcChannel.GitGetRepositoryFilePreview, request) as ReturnType<ElectronGitAPI['getRepositoryFilePreview']>,
    getRepositoryFileInfo: (request) =>
      invoke(request.repoPath, 'file info', IpcChannel.GitGetRepositoryFileInfo, request) as ReturnType<ElectronGitAPI['getRepositoryFileInfo']>,
    saveRepositoryFile: (request) =>
      invoke(request.repoPath, 'save file', IpcChannel.GitSaveRepositoryFile, request) as ReturnType<ElectronGitAPI['saveRepositoryFile']>,
  };
}
