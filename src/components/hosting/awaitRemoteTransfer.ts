import { requestRemoteTransfer, useRemoteTransferDialogState, type RemoteTransferDialog } from './remoteTransferDialogState';
import { useRemoteTransferState } from './remoteTransferState';
import type { GitPushBatchDto } from '@/types/remoteTransfers';

/** A publication only continues after its own transfer, including a targeted retry. */
export function awaitRemoteTransfer(intent: RemoteTransferDialog, signal: AbortSignal): Promise<GitPushBatchDto> {
  if (signal.aborted) return Promise.reject(new Error('Publication cancelled.'));
  if (useRemoteTransferState.getState().busy || useRemoteTransferDialogState.getState().dialog)
    return Promise.reject(new Error('Another transfer is running. Wait for it to finish.'));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let started = false;
    const cleanup = () => {
      unsubscribe();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      useRemoteTransferDialogState.getState().cancelRequest(requestId);
      reject(new Error('Publication cancelled.'));
    };
    const unsubscribe = useRemoteTransferState.subscribe((state) => {
      if (state.intent?.requestId !== requestId) {
        if (started) {
          cleanup();
          reject(new Error('The publication transfer context changed.'));
        }
        return;
      }
      started = true;
      if (state.batch?.state === 'success') {
        cleanup();
        resolve(state.batch);
      } else if (state.batch?.state === 'cancelled') {
        cleanup();
        reject(new Error('Publication cancelled.'));
      } else if (state.error && !state.batch) {
        cleanup();
        reject(new Error(state.error));
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    requestRemoteTransfer({ ...intent, requestId });
  });
}
