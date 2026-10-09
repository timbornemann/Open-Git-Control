import { requestRemoteTransfer, useRemoteTransferDialogState, type RemoteTransferDialog } from './remoteTransferDialogState';
import { useRemoteTransferState } from './remoteTransferState';

/** Legacy chained workflows wait for the same endpoint-bound pull as the toolbar and palette. */
export function awaitPullTransfer(intent: RemoteTransferDialog, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Transfer cancelled.'));
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
      reject(new Error('Transfer cancelled.'));
    };
    const unsubscribe = useRemoteTransferState.subscribe((state) => {
      if (state.intent?.requestId !== requestId) {
        if (started) {
          cleanup();
          reject(new Error('The pull context changed.'));
        }
        return;
      }
      started = true;
      if (state.error) {
        cleanup();
        reject(new Error(state.error));
      } else if (state.phase === 'idle' && !state.busy) {
        cleanup();
        resolve();
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    requestRemoteTransfer({ ...intent, mode: 'pull', requestId });
  });
}

export function pullIntentFromArguments(repoPath: string, args: string[]): RemoteTransferDialog {
  const options = args.slice(1);
  if (args[0] !== 'pull' || options.some((arg) => !['--rebase', '--no-rebase', '--ff-only', '--no-ff', '--autostash'].includes(arg)))
    throw new Error('Unsupported pull options. Use the remote configuration to choose a source and branch.');
  const pullMode = options.includes('--ff-only')
    ? 'ff-only'
    : options.includes('--no-ff')
      ? 'no-ff'
      : options.includes('--no-rebase')
        ? 'merge'
        : options.includes('--rebase')
          ? 'rebase'
          : undefined;
  return { repoPath, mode: 'pull', ...(pullMode ? { pullMode } : {}), ...(options.includes('--autostash') ? { autostash: true } : {}) };
}
