import { beforeEach, describe, expect, it, vi } from 'vitest';
import { awaitPullTransfer, pullIntentFromArguments } from './awaitPullTransfer';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';
import { useRemoteTransferDialogState } from './remoteTransferDialogState';

beforeEach(() => {
  useRemoteTransferState.setState(initialRemoteTransferState());
  useRemoteTransferDialogState.setState({ dialog: null, cancelledRequest: null });
});
const intent = { repoPath: '/repo', mode: 'pull' as const };
describe('coordinated legacy pull workflows', () => {
  it('waits for its own completed pull before continuing a stash recovery', async () => {
    const completed = vi.fn();
    const pending = awaitPullTransfer(intent, new AbortController().signal).then(completed);
    const own = useRemoteTransferDialogState.getState().dialog!;
    useRemoteTransferState.setState({ intent: { ...intent, requestId: 'other' }, phase: 'idle', busy: false });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    useRemoteTransferState.setState({ intent: own, phase: 'selection', busy: false });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    useRemoteTransferState.setState({ phase: 'running', busy: true });
    useRemoteTransferState.setState({ phase: 'idle', busy: false });
    await pending;
    expect(completed).toHaveBeenCalledOnce();
  });
  it('stops a chained recovery on failure while leaving the exact failed pull available for retry', async () => {
    const pending = awaitPullTransfer(intent, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('Conflict');
    const failedPull = { repoPath: '/repo', remote: 'private', branch: 'release', mode: 'merge' as const };
    useRemoteTransferState.setState({ intent: useRemoteTransferDialogState.getState().dialog, phase: 'result', error: 'Conflict', failedPull });
    await rejected;
    expect(useRemoteTransferState.getState().failedPull).toEqual(failedPull);
  });
  it('cancels only its own queued transfer and rejects repository changes and overlapping transfers', async () => {
    const controller = new AbortController();
    const pending = awaitPullTransfer(intent, controller.signal);
    const own = useRemoteTransferDialogState.getState().dialog!;
    const rejected = expect(pending).rejects.toThrow('cancelled');
    controller.abort();
    await rejected;
    expect(useRemoteTransferDialogState.getState()).toMatchObject({ dialog: null, cancelledRequest: own.requestId });
    const next = awaitPullTransfer(intent, new AbortController().signal);
    const switched = expect(next).rejects.toThrow('context changed');
    useRemoteTransferState.setState({ intent: useRemoteTransferDialogState.getState().dialog, phase: 'running', busy: true });
    useRemoteTransferState.setState(initialRemoteTransferState());
    await switched;
    useRemoteTransferState.setState({ busy: true });
    await expect(awaitPullTransfer(intent, new AbortController().signal)).rejects.toThrow('Another transfer');
    await expect(awaitPullTransfer(intent, controller.signal)).rejects.toThrow('cancelled');
  });
  it('uses repository preferences when no strategy was specified and keeps explicit options one-off', () => {
    expect(pullIntentFromArguments('/repo', ['pull'])).toEqual(intent);
    expect(pullIntentFromArguments('/repo', ['pull', '--no-rebase', '--no-ff'])).toEqual({ ...intent, pullMode: 'no-ff' });
    expect(pullIntentFromArguments('/repo', ['pull', '--rebase', '--autostash'])).toEqual({ ...intent, pullMode: 'rebase', autostash: true });
    expect(pullIntentFromArguments('/repo', ['pull', '--no-rebase'])).toEqual({ ...intent, pullMode: 'merge' });
    expect(pullIntentFromArguments('/repo', ['pull', '--ff-only'])).toEqual({ ...intent, pullMode: 'ff-only' });
    expect(() => pullIntentFromArguments('/repo', ['pull', '--exec=unsafe'])).toThrow('Unsupported pull options');
    expect(() => pullIntentFromArguments('/repo', ['push'])).toThrow();
  });
});
