import type { ElectronHostingAPI } from '../../src/shared/ipc/contracts/hosting';
import type { ElectronRemoteTransferAPI } from '../../src/shared/ipc/contracts/remoteTransfers';
import { IpcChannel } from '../../src/types/ipcContract';

export function createHostingApi(ipc: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }): ElectronHostingAPI & ElectronRemoteTransferAPI {
  return {
    hostingRequest: (operation, input) => ipc.invoke(IpcChannel.HostingRequest, operation, input) as ReturnType<ElectronHostingAPI['hostingRequest']>,
    remoteTransferRequest: (operation, input) =>
      ipc.invoke(IpcChannel.RemoteTransferRequest, operation, input) as ReturnType<ElectronRemoteTransferAPI['remoteTransferRequest']>,
  };
}
