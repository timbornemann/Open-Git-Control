import type { IpcResult } from '../../../types/ipc';
import type { RemoteTransferOperation, RemoteTransferOperations } from '../../../types/remoteTransfers';

export interface ElectronRemoteTransferAPI {
  remoteTransferRequest: <K extends RemoteTransferOperation>(
    operation: K,
    input: RemoteTransferOperations[K]['input'],
  ) => Promise<IpcResult<RemoteTransferOperations[K]['output']>>;
}
