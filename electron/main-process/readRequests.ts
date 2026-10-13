import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { ReadRequest } from '../../src/shared/cache/resource';

const requests = new Map<string, AbortController>();
type Sender = IpcMainInvokeEvent['sender'];
type ActiveRead = { controller: AbortController; id: string | null };
const senders = new WeakMap<Sender, { reads: Set<ActiveRead>; destroyed: () => void }>();
const key = (senderId: number, id: string) => `${senderId}:${id}`;
export function registerReadCancellation() {
  ipcMain.handle(IpcChannel.AppCancelRead, (event, id: unknown) => {
    if (typeof id === 'string' && id.length < 128) requests.get(key(event.sender.id, id))?.abort();
  });
}
export function beginReadRequest(event: IpcMainInvokeEvent, request?: ReadRequest) {
  const controller = new AbortController();
  const sender = event?.sender;
  const id = typeof request?.requestId === 'string' && request.requestId.length < 128 && sender ? key(sender.id, request.requestId) : null;
  const read = { controller, id };
  if (sender?.isDestroyed?.()) {
    controller.abort();
    return { signal: controller.signal, finish: () => {} };
  }
  if (sender) {
    let state = senders.get(sender);
    if (!state) {
      const reads = new Set<ActiveRead>();
      const destroyed = () => {
        senders.delete(sender);
        const active = [...reads];
        reads.clear();
        for (const entry of active) {
          if (entry.id && requests.get(entry.id) === entry.controller) requests.delete(entry.id);
          entry.controller.abort();
        }
      };
      state = { reads, destroyed };
      senders.set(sender, state);
      sender.once?.('destroyed', destroyed);
    }
    state.reads.add(read);
  }
  if (id) {
    requests.get(id)?.abort();
    requests.set(id, controller);
  }
  return {
    signal: controller.signal,
    finish: () => {
      if (id && requests.get(id) === controller) requests.delete(id);
      const state = sender && senders.get(sender);
      if (state?.reads.delete(read) && state.reads.size === 0) {
        sender.removeListener?.('destroyed', state.destroyed);
        senders.delete(sender);
      }
    },
  };
}
