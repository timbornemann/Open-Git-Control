import type { IpcRenderer } from 'electron';
import type { RepositoryAnalyticsApi, AnalyticsProgress } from '../../src/shared/ipc/repositoryAnalytics';
import { IpcChannel } from '../../src/types/ipcContract';

export function createRepositoryAnalyticsApi(ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>): RepositoryAnalyticsApi {
  return {
    getRepositoryAnalyticsSnapshot: (request) => ipc.invoke(IpcChannel.GitAnalyticsSnapshot, request),
    refreshRepositoryAnalytics: (request) => ipc.invoke(IpcChannel.GitAnalyticsRefresh, request),
    getRepositoryAnalyticsDetails: (request) => ipc.invoke(IpcChannel.GitAnalyticsDetails, request),
    onRepositoryAnalyticsProgress: (callback) => {
      const listener = (_event: unknown, progress: AnalyticsProgress) => callback(progress);
      ipc.on(IpcChannel.GitAnalyticsProgress, listener);
      return () => ipc.removeListener(IpcChannel.GitAnalyticsProgress, listener);
    },
  };
}
