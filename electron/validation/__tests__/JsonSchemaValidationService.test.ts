import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSON_SCHEMA_MAX_SCHEMA_CHARS } from '../../../src/shared/ipc/jsonSchemaValidation';
import { JsonSchemaValidationService } from '../JsonSchemaValidationService';

class Task extends EventEmitter {
  terminate = vi.fn(async () => 0);
}
const request = { source: '{}', schemaSource: '{}' };
const fixture = (timeoutMs = 1000) => {
  const tasks: Task[] = [];
  const createWorker = vi.fn(() => {
    const task = new Task();
    tasks.push(task);
    return task as unknown as Worker;
  });
  return { service: new JsonSchemaValidationService({ createWorker, timeoutMs }), createWorker, tasks };
};
afterEach(() => vi.useRealTimers());

describe('bounded schema validation jobs', () => {
  it('passes results through, terminates the worker and releases listeners', async () => {
    const f = fixture();
    const result = f.service.validate(request);
    f.tasks[0].emit('message', { success: true, data: ['/name: must be string'] });
    await expect(result).resolves.toEqual({ success: true, data: ['/name: must be string'] });
    expect(f.createWorker).toHaveBeenCalledWith(request);
    expect(f.tasks[0].terminate).toHaveBeenCalledOnce();
    expect(f.tasks[0].eventNames()).toEqual([]);
  });
  it('rejects invalid or oversized messages before creating a worker', async () => {
    const f = fixture();
    for (const input of [null, {}, { source: 1, schemaSource: '{}' }, { source: '{}', schemaSource: 'x'.repeat(JSON_SCHEMA_MAX_SCHEMA_CHARS + 1) }]) {
      expect(await f.service.validate(input)).toMatchObject({ success: false });
    }
    expect(f.createWorker).not.toHaveBeenCalled();
  });
  it('terminates stuck validation and handles a late error safely', async () => {
    vi.useFakeTimers();
    const f = fixture(50);
    const result = f.service.validate(request);
    let terminated!: (code: number) => void;
    f.tasks[0].terminate.mockImplementation(
      () =>
        new Promise((resolve) => {
          terminated = resolve;
        }),
    );
    vi.advanceTimersByTime(51);
    expect(() => f.tasks[0].emit('error', new Error('late failure'))).not.toThrow();
    terminated(0);
    await expect(result).resolves.toEqual({ success: false, error: 'JSON Schema validation timed out.' });
    expect(f.tasks[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['error', 'exit'])('reports an unexpected worker %s and frees its capacity', async (event) => {
    const f = fixture();
    const result = f.service.validate(request);
    f.tasks[0].emit(event, event === 'error' ? new Error('failure') : 1);
    expect(await result).toMatchObject({ success: false, error: expect.stringContaining('worker') });
    expect(f.tasks[0].terminate).toHaveBeenCalledOnce();
  });
  it('cancels on abort and rejects requests after their window is already destroyed', async () => {
    const f = fixture();
    const controller = new AbortController();
    const result = f.service.validate(request, controller.signal);
    controller.abort();
    await expect(result).resolves.toEqual({ success: false, error: 'JSON Schema validation was cancelled.' });
    await expect(f.service.validate(request, controller.signal)).resolves.toMatchObject({ success: false });
    expect(f.createWorker).toHaveBeenCalledOnce();
  });
  it('bounds concurrent workers and permits later requests after completion', async () => {
    const f = fixture();
    const first = f.service.validate(request),
      second = f.service.validate(request);
    await expect(f.service.validate(request)).resolves.toMatchObject({ success: false, error: expect.stringContaining('busy') });
    f.tasks[0].emit('message', { success: true, data: [] });
    f.tasks[1].emit('message', { success: true, data: [] });
    await Promise.all([first, second]);
    const next = f.service.validate(request);
    f.tasks[2].emit('message', { success: true, data: [] });
    await expect(next).resolves.toEqual({ success: true, data: [] });
  });
  it('reports worker startup errors without leaking the concurrency slot', async () => {
    const f = fixture();
    f.createWorker.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    await expect(f.service.validate(request)).resolves.toEqual({ success: false, error: 'Could not start JSON Schema validation.' });
    const result = f.service.validate(request);
    f.tasks[0].emit('message', { success: false, error: 'Invalid JSON Schema: invalid type' });
    await expect(result).resolves.toMatchObject({ success: false, error: 'Invalid JSON Schema: invalid type' });
  });
});
