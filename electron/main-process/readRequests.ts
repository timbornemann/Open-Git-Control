import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel } from '../../src/types/ipcContract';
import type { ReadRequest } from '../../src/shared/cache/resource';

const requests = new Map<string, AbortController>();
const key = (senderId: number, id: string) => `${senderId}:${id}`;
export function registerReadCancellation() {
  ipcMain.handle(IpcChannel.AppCancelRead, (event, id: unknown) => {
    if (typeof id === 'string' && id.length < 128) requests.get(key(event.sender.id, id))?.abort();
  });
}
export function beginReadRequest(event: IpcMainInvokeEvent, request?: ReadRequest) {
  const controller = new AbortController();
  const id = typeof request?.requestId === 'string' && request.requestId.length < 128 && event?.sender ? key(event.sender.id, request.requestId) : null;
  if (id) {
    requests.get(id)?.abort();
    requests.set(id, controller);
  }
  return {
    signal: controller.signal,
    finish: () => {
      if (id && requests.get(id) === controller) requests.delete(id);
    },
  };
}
