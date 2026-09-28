import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';

const handlers = vi.hoisted(() => new Map<string, (event: IpcMainInvokeEvent, id: string) => void>());
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (event: IpcMainInvokeEvent, id: string) => void) => handlers.set(name, handler) } }));
import { beginReadRequest, registerReadCancellation } from '../readRequests';
const event = (id: number) => ({ sender: { id } }) as IpcMainInvokeEvent;
beforeEach(() => {
  handlers.clear();
  registerReadCancellation();
});

describe('read request cancellation', () => {
  it('only allows the originating window to cancel a request', () => {
    const request = beginReadRequest(event(1), { requestId: 'same-id', priority: 'startup' });
    handlers.get('app:cancelRead')!(event(2), 'same-id');
    expect(request.signal.aborted).toBe(false);
    handlers.get('app:cancelRead')!(event(1), 'same-id');
    expect(request.signal.aborted).toBe(true);
    request.finish();
  });
  it('does not remove a newer request when the superseded request finishes', () => {
    const old = beginReadRequest(event(1), { requestId: 'reused', priority: 'speculative' });
    const current = beginReadRequest(event(1), { requestId: 'reused', priority: 'visible' });
    expect(old.signal.aborted).toBe(true);
    old.finish();
    handlers.get('app:cancelRead')!(event(1), 'reused');
    expect(current.signal.aborted).toBe(true);
    current.finish();
  });
  it('releases completed request controllers', () => {
    const request = beginReadRequest(event(3), { requestId: 'finished', priority: 'repository' });
    request.finish();
    handlers.get('app:cancelRead')!(event(3), 'finished');
    expect(request.signal.aborted).toBe(false);
  });
});
