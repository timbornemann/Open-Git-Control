import { getElectronApi } from '@/services/electronApi';
import type { ReadPriority, ReadRequest } from '@/shared/cache/resource';

let nextRequestId = 0;
const active = new Map<string, { signal: AbortSignal; cancelled: boolean }>();
export const readRequestSignal = (request?: ReadRequest) => request && active.get(request.requestId)?.signal;
export async function cancellableRead<T>(signal: AbortSignal, priority: ReadPriority, read: (request?: ReadRequest) => Promise<T>, supplied?: ReadRequest) {
  signal.throwIfAborted();
  const api = getElectronApi()?.app;
  if (!api?.cancelReadRequest) return read(supplied);
  const request = supplied || { requestId: `preview-${++nextRequestId}`, priority };
  const { requestId } = request;
  if (!supplied) active.set(requestId, { signal, cancelled: false });
  const cancel = () => {
    const entry = active.get(requestId);
    if (entry?.cancelled) return;
    if (entry) entry.cancelled = true;
    void api.cancelReadRequest(requestId).catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    return await read(request);
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!supplied) active.delete(requestId);
  }
}
