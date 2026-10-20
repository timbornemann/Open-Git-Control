import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelledError } from '@tanstack/react-query';
import type { GitCommit } from '@/utils/gitParsing';
import { computeGraphLayout, graphLayoutSeed, type GraphLayout, type GraphLayoutSeed } from '@/utils/graphLayout';
import { prepareGraphLayout } from '../graphLayout';
import { queryClient } from '../queryClient';

class LayoutWorker {
  static instances: LayoutWorker[] = [];
  static failCreation = false;
  static failMessage = false;
  onmessage: ((event: { data: { generation: number; layout: GraphLayout } }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: { generation: number; commits: GitCommit[]; seed?: GraphLayoutSeed }[] = [];
  terminate = vi.fn();
  constructor() {
    if (LayoutWorker.failCreation) throw new Error('Worker unavailable');
    LayoutWorker.instances.push(this);
  }
  postMessage(message: { generation: number; commits: GitCommit[]; seed?: GraphLayoutSeed }) {
    if (LayoutWorker.failMessage) throw new Error('Cannot clone message');
    this.messages.push(message);
  }
  finish(index: number) {
    const message = this.messages[index];
    this.onmessage?.({ data: { generation: message.generation, layout: computeGraphLayout(message.commits, message.seed) } });
  }
}
const commits = (hash: string): GitCommit[] => [
  { hash, abbrevHash: hash, parentHashes: [], refs: [], author: 'A', date: '', subject: hash, stats: { files: 0, additions: 0, deletions: 0 } },
];
beforeEach(() => {
  LayoutWorker.instances = [];
  LayoutWorker.failCreation = false;
  LayoutWorker.failMessage = false;
  vi.stubGlobal('Worker', LayoutWorker);
});
afterEach(() => {
  queryClient.clear();
  for (const worker of LayoutWorker.instances) worker.onerror?.({ preventDefault: vi.fn() });
  vi.unstubAllGlobals();
});

describe('graph layout worker ownership', () => {
  it.each(['worker', 'fallback'] as const)('preserves page positions through the %s and separates differently seeded cache entries', async (mode) => {
    const rows = commits('a');
    rows[0].parentHashes = ['c'];
    rows[0].refs = ['origin/topic'];
    const more = [...rows, { ...commits('b')[0], parentHashes: ['c'], refs: ['HEAD -> main'] }, commits('c')[0]];
    const previous = computeGraphLayout(rows);
    if (mode === 'fallback') LayoutWorker.failCreation = true;
    const result = prepareGraphLayout('/pages', more, previous);
    if (mode === 'worker') LayoutWorker.instances[0].finish(0);
    expect(await result).toEqual(computeGraphLayout(more, graphLayoutSeed(more, previous)));
    const fresh = prepareGraphLayout('/pages', more);
    if (mode === 'worker') LayoutWorker.instances[0].finish(1);
    expect(await fresh).toEqual(computeGraphLayout(more));
    expect((await result).nodes[0].lane).toBe(previous.nodes[0].lane);
    expect((await fresh).nodes[0].lane).not.toBe(previous.nodes[0].lane);
  });
  it('matches concurrent out-of-order responses to their own graph', async () => {
    const first = prepareGraphLayout('/first', commits('a'));
    const second = prepareGraphLayout('/second', commits('b'));
    const worker = LayoutWorker.instances[0];
    expect(worker.messages).toHaveLength(2);
    worker.finish(1);
    worker.finish(0);
    expect(await first).toEqual(computeGraphLayout(commits('a')));
    expect(await second).toEqual(computeGraphLayout(commits('b')));
  });

  it.each(['creation', 'message', 'error', 'messageerror'] as const)('recovers from a worker %s failure', async (failure) => {
    LayoutWorker.failCreation = failure === 'creation';
    LayoutWorker.failMessage = failure === 'message';
    const result = prepareGraphLayout('/repo', commits('a'));
    const worker = LayoutWorker.instances[0];
    if (failure === 'error') worker.onerror?.({ preventDefault: vi.fn() });
    if (failure === 'messageerror') worker.onmessageerror?.();
    expect(await result).toEqual(computeGraphLayout(commits('a')));
    if (worker) expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('releases cancelled jobs, stops an idle worker and ignores its late response', async () => {
    const result = prepareGraphLayout('/repo', commits('a'));
    const rejected = expect(result).rejects.toBeInstanceOf(CancelledError);
    const worker = LayoutWorker.instances[0];
    await queryClient.cancelQueries({ queryKey: ['resource', 'git', '/repo', 'layout'] });
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.finish(0);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .every((query) => query.state.data === undefined),
    ).toBe(true);
    const next = prepareGraphLayout('/repo', commits('b'));
    expect(LayoutWorker.instances).toHaveLength(2);
    LayoutWorker.instances[1].finish(0);
    expect(await next).toEqual(computeGraphLayout(commits('b')));
  });

  it('keeps another active job alive when one repository is cancelled', async () => {
    const first = prepareGraphLayout('/first', commits('a'));
    const rejected = expect(first).rejects.toBeInstanceOf(CancelledError);
    const second = prepareGraphLayout('/second', commits('b'));
    const worker = LayoutWorker.instances[0];
    await queryClient.cancelQueries({ queryKey: ['resource', 'git', '/first', 'layout'] });
    await rejected;
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.finish(1);
    expect(await second).toEqual(computeGraphLayout(commits('b')));
  });
});
