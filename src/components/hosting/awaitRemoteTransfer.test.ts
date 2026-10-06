import { beforeEach, describe, expect, it, vi } from 'vitest';
import { awaitRemoteTransfer } from './awaitRemoteTransfer';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';
import { useRemoteTransferDialogState } from './remoteTransferDialogState';
import type { GitPushBatchDto } from '@/types/remoteTransfers';

beforeEach(() => {
  useRemoteTransferState.setState(initialRemoteTransferState());
  useRemoteTransferDialogState.setState({ dialog: null, cancelledRequest: null });
});
const intent = { repoPath: 'C:/repo', mode: 'push' as const };
const batch: GitPushBatchDto = { id: 'batch', planId: 'plan', repoPath: intent.repoPath, sourceOid: 'a'.repeat(40), state: 'success', targets: [] };

describe('publication transfer completion', () => {
  it('waits for its own request and for a successful targeted retry after partial results', async () => {
    const completed = vi.fn();
    const pending = awaitRemoteTransfer(intent, new AbortController().signal).then(completed);
    const own = useRemoteTransferDialogState.getState().dialog!;
    useRemoteTransferState.setState({ intent: { ...intent, requestId: 'unrelated' }, batch });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    useRemoteTransferState.setState({ intent: own, batch: { ...batch, state: 'partial' } });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    useRemoteTransferState.setState({ intent: own, batch });
    await pending;
    expect(completed).toHaveBeenCalledWith(batch);
  });
  it('rejects a context change after its transfer has started', async () => {
    const pending = awaitRemoteTransfer(intent, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('context changed');
    useRemoteTransferState.setState({ intent: useRemoteTransferDialogState.getState().dialog });
    useRemoteTransferState.setState(initialRemoteTransferState());
    await rejected;
  });
  it('cancels only its corresponding queued transfer', async () => {
    const controller = new AbortController();
    const pending = awaitRemoteTransfer(intent, controller.signal);
    const own = useRemoteTransferDialogState.getState().dialog!;
    const rejected = expect(pending).rejects.toThrow('cancelled');
    controller.abort();
    await rejected;
    expect(useRemoteTransferDialogState.getState()).toMatchObject({ dialog: null, cancelledRequest: own.requestId });
  });
  it('rejects cancellation, preparation errors and overlapping transfers', async () => {
    for (const update of [{ batch: { ...batch, state: 'cancelled' as const } }, { error: 'secret scan failed' }]) {
      useRemoteTransferState.setState(initialRemoteTransferState());
      useRemoteTransferDialogState.getState().close();
      const pending = awaitRemoteTransfer(intent, new AbortController().signal);
      const rejected = expect(pending).rejects.toThrow();
      useRemoteTransferState.setState({ intent: useRemoteTransferDialogState.getState().dialog, ...update });
      await rejected;
    }
    useRemoteTransferState.setState({ busy: true });
    await expect(awaitRemoteTransfer(intent, new AbortController().signal)).rejects.toThrow('Another transfer');
    const controller = new AbortController();
    controller.abort();
    await expect(awaitRemoteTransfer(intent, controller.signal)).rejects.toThrow('cancelled');
  });
});
