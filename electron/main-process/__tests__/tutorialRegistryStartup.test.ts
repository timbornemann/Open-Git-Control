import { createRequire } from 'node:module';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { StoredRepoData } from '../../../src/types/appDtos';
const script = path.resolve(process.cwd(), 'scripts/tutorial-workspace-isolation.cjs');
const { createRegistryStartupBarrier } = createRequire(script)(script);
const repo = path.resolve('practice-workspace');
const snapshot = (revision: number): StoredRepoData => ({
  revision,
  activeRepo: repo,
  repos: [{ path: repo, createdAt: 11, lastOpened: 12, pinned: true }],
  sortBy: 'lastOpenedDesc',
});
afterEach(() => vi.useRealTimers());

it('waits for activation after an already persisted canonicalization instead of accepting its positive revision', async () => {
  vi.useFakeTimers();
  const barrier = createRegistryStartupBarrier(repo);
  let settled = false;
  const waiting = barrier.wait().then((stored: StoredRepoData) => {
    settled = true;
    return stored;
  });
  barrier.observe({ kind: 'canonicalize', path: repo + '/nested', canonicalPath: repo }, { success: true, data: snapshot(1) });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  barrier.observe({ kind: 'activate', path: repo }, { success: true, data: snapshot(2) });
  await expect(waiting).resolves.toEqual(snapshot(2));
});

it('ignores failed activations, unrelated writes and acknowledgements for another repository', async () => {
  vi.useFakeTimers();
  const barrier = createRegistryStartupBarrier(repo);
  let settled = false;
  const waiting = barrier.wait().then((stored: StoredRepoData) => {
    settled = true;
    return stored;
  });
  barrier.observe({ kind: 'metadata', path: repo }, { success: true, data: snapshot(3) });
  barrier.observe({ kind: 'activate', path: repo }, { success: false, error: 'failed' });
  barrier.observe({ kind: 'activate', path: repo }, { success: true, data: { ...snapshot(4), activeRepo: repo + '-other' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  barrier.observe({ kind: 'activate', path: repo }, { success: true, data: snapshot(5) });
  await expect(waiting).resolves.toEqual(snapshot(5));
});

it('preserves the first acknowledged snapshot including its revision and metadata', async () => {
  const barrier = createRegistryStartupBarrier(repo);
  const result = snapshot(2);
  barrier.observe({ kind: 'activate', path: repo }, { success: true, data: result });
  result.revision = 3;
  result.repos[0].pinned = false;
  barrier.observe({ kind: 'activate', path: repo }, { success: true, data: result });
  await expect(barrier.wait()).resolves.toEqual(snapshot(2));
});

it('fails explicitly when startup never acknowledges activation', async () => {
  vi.useFakeTimers();
  const waiting = createRegistryStartupBarrier(repo).wait();
  const rejected = expect(waiting).rejects.toThrow('did not acknowledge its startup repository activation');
  await vi.advanceTimersByTimeAsync(12_000);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

it('clears the deadline after successful startup', async () => {
  vi.useFakeTimers();
  const barrier = createRegistryStartupBarrier(repo);
  const waiting = barrier.wait();
  barrier.observe({ kind: 'activate', path: repo }, { success: true, data: snapshot(2) });
  await waiting;
  expect(vi.getTimerCount()).toBe(0);
});
