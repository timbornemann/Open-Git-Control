import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runDemoRegex, DEMO_REGEX_TIMEOUT } from './demoRegexWorker';
import type { DemoRegexRequest } from './demoRegexEngine';
import type { IpcResult } from '@/types/ipc';
class PracticeWorker {
  static instances: PracticeWorker[] = [];
  onmessage: ((event: MessageEvent<IpcResult<number[]>>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    PracticeWorker.instances.push(this);
  }
  reply(data: IpcResult<number[]>) {
    this.onmessage?.({ data } as MessageEvent<IpcResult<number[]>>);
  }
}
const request: DemoRegexRequest = { pattern: 'Hallo', records: [['Hallo'], []], limit: 200 };
beforeEach(() => {
  vi.useFakeTimers();
  PracticeWorker.instances = [];
  vi.stubGlobal('Worker', PracticeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('owns, resolves and terminates the worker for a successful read', async () => {
  const pending = runDemoRegex({}, request),
    worker = PracticeWorker.instances[0];
  expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(request);
  worker.reply({ success: true, data: [0] });
  expect(await pending).toEqual({ success: true, data: [0] });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('cancels the previous read for the same model while retaining an independent consumer', async () => {
  const owner = {},
    first = runDemoRegex(owner, request),
    independent = runDemoRegex({}, request);
  const old = PracticeWorker.instances[0],
    other = PracticeWorker.instances[1];
  const next = runDemoRegex(owner, request),
    current = PracticeWorker.instances[2];
  expect(await first).toMatchObject({ success: false, error: expect.stringContaining('replaced') });
  expect(old.terminate).toHaveBeenCalledOnce();
  expect(other.terminate).not.toHaveBeenCalled();
  other.reply({ success: true, data: [] });
  current.reply({ success: true, data: [0] });
  expect(await independent).toEqual({ success: true, data: [] });
  expect(await next).toEqual({ success: true, data: [0] });
  expect(vi.getTimerCount()).toBe(0);
});
it('ends a nonresponsive search deterministically and releases its timer and worker', async () => {
  const pending = runDemoRegex({}, request),
    worker = PracticeWorker.instances[0];
  await vi.advanceTimersByTimeAsync(DEMO_REGEX_TIMEOUT);
  expect(await pending).toMatchObject({ success: false, error: expect.stringContaining('takes too long') });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each([[2], [0, 0], [-1]])('rejects invalid result indices %s', async (indices) => {
  const pending = runDemoRegex({}, request),
    worker = PracticeWorker.instances[0];
  worker.reply({ success: true, data: indices });
  expect(await pending).toMatchObject({ success: false });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('releases a worker after a loading error and handles a missing Worker implementation', async () => {
  const pending = runDemoRegex({}, request),
    worker = PracticeWorker.instances[0],
    preventDefault = vi.fn();
  worker.onerror?.({ preventDefault } as unknown as ErrorEvent);
  expect(await pending).toMatchObject({ success: false });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
  vi.stubGlobal('Worker', undefined);
  expect(await runDemoRegex({}, request)).toMatchObject({ success: false });
  expect(vi.getTimerCount()).toBe(0);
});
