import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type { ElectronAppAPI } from '../../src/shared/ipc/contracts/app';
import type { SystemToolInstallEvent, SystemToolsStatus } from '../../src/shared/ipc/systemTools';
import { IpcChannel } from '../../src/types/ipcContract';

export function createSystemToolsApi(
  ipc: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>,
): Pick<ElectronAppAPI, 'getSystemToolsStatus' | 'recheckSystemTools' | 'installSystemTool' | 'onSystemToolsStatus' | 'onSystemToolInstallation'> {
  const subscribe = <T>(channel: IpcChannel, callback: (value: T) => void) => {
    const listener = (_event: IpcRendererEvent, value: T) => callback(value);
    ipc.on(channel, listener);
    return () => {
      ipc.removeListener(channel, listener);
    };
  };
  return {
    getSystemToolsStatus: () => ipc.invoke(IpcChannel.AppSystemToolsStatus),
    recheckSystemTools: () => ipc.invoke(IpcChannel.AppSystemToolsRecheck),
    installSystemTool: (request) => ipc.invoke(IpcChannel.AppSystemToolInstall, request),
    onSystemToolsStatus: (callback) => subscribe<SystemToolsStatus>(IpcChannel.AppSystemToolsChanged, callback),
    onSystemToolInstallation: (callback) => subscribe<SystemToolInstallEvent>(IpcChannel.AppSystemToolInstallation, callback),
  };
}
