import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { GitScheduler } from '../GitScheduler';
import { GitRunner } from '../git/GitRunner';

const repo = path.join(os.tmpdir(), 'ogc-scheduler-shutdown-fixture');
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

it('waits for an already started read and rejects later work before starting it', async () => {
  const scheduler = new GitScheduler();
  const read = deferred<string>();
  let signal!: AbortSignal;
  const pending = scheduler.schedule(repo, 'interactive', 'ls-files', (current) => {
    signal = current;
    return read.promise;
  });
  const completed = vi.fn();
  const closing = scheduler.close().then(completed);
  const late = vi.fn();
  await expect(scheduler.schedule(repo, 'interactive', 'status', late)).rejects.toMatchObject({ name: 'AbortError' });
  await tick();
  expect(completed).not.toHaveBeenCalled();
  expect(late).not.toHaveBeenCalled();
  expect(signal.aborted).toBe(false);
  read.resolve('index');
  await expect(pending).resolves.toBe('index');
  await closing;
  expect(completed).toHaveBeenCalledOnce();
  expect(scheduler.isRepositoryBusy(repo)).toBe(false);
});

it('finishes accepted writes serially and drains their queued reads without cancelling a write', async () => {
  const scheduler = new GitScheduler();
  const first = deferred<string>();
  const second = deferred<string>();
  const signals: AbortSignal[] = [];
  const order: string[] = [];
  const write = scheduler.schedule(repo, 'write', 'add', (signal) => {
    signals.push(signal);
    order.push('first');
    return first.promise;
  });
  const next = scheduler.schedule(repo, 'write', 'commit', (signal) => {
    signals.push(signal);
    order.push('second');
    return second.promise;
  });
  const read = scheduler.schedule(repo, 'interactive', 'status', async () => {
    order.push('read');
    return 'clean';
  });
  const completed = vi.fn();
  const closing = scheduler.close().then(completed);
  expect(order).toEqual(['first']);
  first.resolve('added');
  await write;
  await tick();
  expect(order).toEqual(['first', 'second']);
  expect(completed).not.toHaveBeenCalled();
  second.resolve('committed');
  await Promise.all([next, read, closing]);
  expect(order).toEqual(['first', 'second', 'read']);
  expect(signals.every((signal) => !signal.aborted)).toBe(true);
  expect(scheduler.isRepositoryBusy(repo)).toBe(false);
});

it('drains independent repository and network jobs before closing', async () => {
  const scheduler = new GitScheduler();
  const local = deferred<string>();
  const remote = deferred<string>();
  const first = scheduler.schedule(repo, 'polling', 'status', () => local.promise);
  const second = scheduler.schedule(repo + '-other', 'network-read', 'ls-remote', () => remote.promise);
  const completed = vi.fn();
  const closing = scheduler.close().then(completed);
  local.resolve('clean');
  await first;
  await tick();
  expect(completed).not.toHaveBeenCalled();
  remote.resolve('refs');
  await Promise.all([second, closing]);
  expect(completed).toHaveBeenCalledOnce();
});

it('waits for all accepted jobs even when one of them fails', async () => {
  const scheduler = new GitScheduler();
  const failed = deferred<string>();
  const held = deferred<string>();
  const first = scheduler.schedule(repo, 'interactive', 'show', () => failed.promise);
  const second = scheduler.schedule(repo, 'interactive', 'ls-files', () => held.promise);
  const handled = expect(first).rejects.toThrow('read failed');
  const completed = vi.fn();
  const closing = scheduler.close().then(completed);
  failed.reject(new Error('read failed'));
  await handled;
  await tick();
  expect(completed).not.toHaveBeenCalled();
  held.resolve('index');
  await Promise.all([second, closing]);
});

it('shares repeated close requests and closes an empty scheduler', async () => {
  const scheduler = new GitScheduler();
  const closing = scheduler.close();
  expect(scheduler.close()).toBe(closing);
  await closing;
  await expect(scheduler.schedule(repo, 'write', 'add', vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
});

it('drains the public runner and refuses new commands without invoking their executable', async () => {
  const read = deferred<{ stdout: string; stderr: string }>();
  const execute = vi.fn(() => read.promise);
  const runner = new GitRunner(execute);
  const pending = runner.run(os.tmpdir(), ['status']);
  const completed = vi.fn();
  const closing = runner.close().then(completed);
  await expect(runner.run(os.tmpdir(), ['log'])).rejects.toMatchObject({ name: 'AbortError' });
  expect(execute).toHaveBeenCalledOnce();
  expect(completed).not.toHaveBeenCalled();
  read.resolve({ stdout: 'clean\n', stderr: '' });
  await expect(pending).resolves.toBe('clean');
  await closing;
  expect(completed).toHaveBeenCalledOnce();
});
