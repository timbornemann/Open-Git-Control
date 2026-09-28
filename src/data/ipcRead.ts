import { getElectronApi } from '@/services/electronApi';
import type { ReadPriority, ReadRequest } from '@/shared/cache/resource';

let nextRequestId = 0;
export async function cancellableRead<T>(signal: AbortSignal, priority: ReadPriority, read: (request?: ReadRequest) => Promise<T>) {
  const api = getElectronApi()?.app;
  if (!api?.cancelReadRequest) return read();
  const requestId = `preview-${++nextRequestId}`;
  const cancel = () => {
    void api.cancelReadRequest(requestId).catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    return await read({ requestId, priority });
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
