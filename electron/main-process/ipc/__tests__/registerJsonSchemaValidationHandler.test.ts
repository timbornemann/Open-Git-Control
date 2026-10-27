import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { registerJsonSchemaValidationHandler } from '../registerJsonSchemaValidationHandler';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => Promise<any>) => handlers.set(name, handler) } }));
beforeEach(() => handlers.clear());
const sender = (destroyed = false) => Object.assign(new EventEmitter(), { isDestroyed: () => destroyed });

describe('JSON Schema validation IPC lifetime', () => {
  it('forwards data without repository or filesystem access and cleans up its window listener', async () => {
    const result = { success: true, data: ['/name: must be string'] };
    const validate = vi.fn().mockResolvedValue(result);
    registerJsonSchemaValidationHandler({ validate } as any);
    const owner = sender();
    const request = { source: '{}', schemaSource: '{"type":"object"}' };
    expect(await handlers.get(IpcChannel.AppValidateJsonSchema)!({ sender: owner }, request)).toEqual(result);
    expect(validate).toHaveBeenCalledWith(request, expect.any(AbortSignal));
    expect(owner.listenerCount('destroyed')).toBe(0);
  });
  it('aborts a request when the originating window is destroyed', async () => {
    const validate = vi.fn(
      (_request, signal: AbortSignal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve({ success: false, error: 'cancelled' }), { once: true });
        }),
    );
    registerJsonSchemaValidationHandler({ validate } as any);
    const owner = sender();
    const result = handlers.get(IpcChannel.AppValidateJsonSchema)!({ sender: owner }, {});
    owner.emit('destroyed');
    expect(await result).toEqual({ success: false, error: 'cancelled' });
    expect(validate.mock.calls[0][1].aborted).toBe(true);
    expect(owner.listenerCount('destroyed')).toBe(0);
  });
  it('passes an already aborted signal for a destroyed window', async () => {
    const validate = vi.fn().mockResolvedValue({ success: false, error: 'cancelled' });
    registerJsonSchemaValidationHandler({ validate } as any);
    const owner = sender(true);
    await handlers.get(IpcChannel.AppValidateJsonSchema)!({ sender: owner }, {});
    expect(validate.mock.calls[0][1].aborted).toBe(true);
    expect(owner.listenerCount('destroyed')).toBe(0);
  });
});
