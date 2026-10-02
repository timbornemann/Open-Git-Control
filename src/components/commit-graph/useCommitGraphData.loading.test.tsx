// @vitest-environment jsdom

import { act, createElement, StrictMode, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CancelledError } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import * as graphLayout from '@/data/graphLayout';
import { computeGraphLayout } from '@/utils/graphLayout';
import { parseGitLog } from '@/utils/gitParsing';
import { getGraphCacheKey, storeGraphCache } from './commitGraphDataCache';
import { useCommitGraphData } from './useCommitGraphData';

const repoPath = 'C:/graph-loading-repo';
const hash = 'a'.repeat(40);
const raw = [hash, hash.slice(0, 7), 'Author', '2026-10-02T10:00:00Z', 'Saved commit', '', 'HEAD -> main'].join('\x1f') + '\x00';
const stats = { files: 1, additions: 1, deletions: 0 };
const page = { success: true as const, data: { raw, stats: { [hash]: stats }, hasMore: false, repoPath } };
const commits = parseGitLog(raw).map((commit) => ({ ...commit, stats, statsState: 'ready' as const }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('commit graph loading lifecycle', () => {
  let root: Root;
  let host: HTMLDivElement;
  let graph: ReturnType<typeof useCommitGraphData>;
  const refreshWorkingTree = vi.fn().mockResolvedValue(undefined);

  const Harness = ({ refreshTrigger = 0, path = repoPath, all = false }: { refreshTrigger?: number; path?: string; all?: boolean }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);
    graph = useCommitGraphData({
      repoPath: path,
      showSecondaryHistory: all,
      logContainerRef,
      refreshTrigger,
      externalWorkingTreeStatus: null,
      onRefreshWorkingTree: refreshWorkingTree,
    });
    return createElement(
      'div',
      null,
      graph.loading
        ? 'Loading history'
        : graph.layout
          ? createElement('div', { ref: logContainerRef }, graph.layout.nodes.map((node) => node.commit.subject).join(', '))
          : 'No commits',
    );
  };
  const render = async (refreshTrigger = 0, path = repoPath, all = false) => {
    await act(async () => {
      root.render(createElement(Harness, { refreshTrigger, path, all }));
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'onCommitStats').mockReturnValue(vi.fn());
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('finishes loading when a refresh supersedes the initial read after cached layout preparation', async () => {
    storeGraphCache(getGraphCacheKey(repoPath, false), commits, false);
    const first = deferred<typeof page>();
    const second = deferred<typeof page>();
    const read = vi.spyOn(gitClient, 'getCommitLogPage').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render();
    expect(graph.layout?.nodes[0].commit.hash).toBe(hash);
    await render(1);
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.resolve(page);
      second.resolve(page);
    });
    expect(graph.loading).toBe(false);
    expect(host.textContent).toContain('Saved commit');
  });

  it('reveals a restored graph immediately while the live history read is pending', async () => {
    const pending = deferred<typeof page>();
    vi.spyOn(gitClient, 'getCommitLogPage').mockReturnValue(pending.promise);
    await render();
    expect(graph.loading).toBe(true);
    await act(async () => {
      storeGraphCache(getGraphCacheKey(repoPath, false), commits, false, computeGraphLayout(commits));
    });
    expect(graph.layout?.nodes[0].commit.hash).toBe(hash);
    expect(graph.loading).toBe(false);
    expect(host.textContent).toContain('Saved commit');
    await act(async () => {
      pending.resolve(page);
    });
  });

  it.each([
    ['query cancellation', () => new CancelledError({ revert: true })],
    ['IPC cancellation', () => new DOMException('The read was cancelled.', 'AbortError')],
  ] as const)('recovers automatically after %s', async (_label, cancellation) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const read = vi.spyOn(gitClient, 'getCommitLogPage').mockRejectedValueOnce(cancellation()).mockResolvedValueOnce(page);
    await render();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(graph.loading).toBe(false);
    expect(host.textContent).toContain('Saved commit');
  });

  it('ignores a late response from the repository that was left', async () => {
    const pending = deferred<typeof page>();
    vi.spyOn(gitClient, 'getCommitLogPage')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ success: true, data: { raw: '', stats: {}, hasMore: false, repoPath: 'C:/another' } });
    await render();
    await render(0, 'C:/another');
    await act(async () => {
      pending.resolve(page);
    });
    expect(graph.loading).toBe(false);
    expect(graph.layout?.nodes).toEqual([]);
  });

  it('bounds abort retries and allows another attempt without remounting', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const read = vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue({ success: false, error: 'This operation was aborted' });
    await render();
    expect(graph.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(read).toHaveBeenCalledTimes(3);
    expect(graph.loading).toBe(false);
    expect(graph.loadError).toBe('This operation was aborted');

    read.mockResolvedValueOnce({ success: false, error: 'Git operation was aborted.' }).mockResolvedValueOnce(page);
    await act(async () => {
      await graph.refreshCommits();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(read).toHaveBeenCalledTimes(5);
    expect(graph.loading).toBe(false);
    expect(graph.loadError).toBeNull();
    expect(host.textContent).toContain('Saved commit');
  });

  it('keeps cached history visible when a background refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    storeGraphCache(getGraphCacheKey(repoPath, false), commits, false, computeGraphLayout(commits));
    vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue({ success: false, error: 'History read failed' });
    await render();
    expect(graph.loading).toBe(false);
    expect(graph.loadError).toBe('History read failed');
    expect(host.textContent).toContain('Saved commit');
  });

  it('can leave and reopen the graph while the original request is pending', async () => {
    const pending = deferred<typeof page>();
    vi.spyOn(gitClient, 'getCommitLogPage').mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page);
    await render();
    act(() => root.render(null));
    storeGraphCache(getGraphCacheKey(repoPath, false), commits, false, computeGraphLayout(commits));
    await render();
    expect(host.textContent).toContain('Saved commit');
    await act(async () => {
      pending.resolve({ ...page, data: { ...page.data, raw: '' } });
    });
    expect(graph.loading).toBe(false);
    expect(host.textContent).toContain('Saved commit');
  });

  it('keeps the first load pending until its layout is ready', async () => {
    const pendingLayout = deferred<ReturnType<typeof computeGraphLayout>>();
    vi.spyOn(graphLayout, 'prepareGraphLayout').mockReturnValue(pendingLayout.promise);
    vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue(page);
    await render();
    expect(graph.loading).toBe(true);
    expect(host.textContent).not.toContain('No commits');
    await act(async () => {
      pendingLayout.resolve(computeGraphLayout(commits));
    });
    expect(graph.loading).toBe(false);
    expect(host.textContent).toContain('Saved commit');
  });

  it('discards a pending layout when the history scope changes', async () => {
    const pendingLayout = deferred<ReturnType<typeof computeGraphLayout>>();
    const nextRead = deferred<typeof page>();
    vi.spyOn(graphLayout, 'prepareGraphLayout').mockReturnValueOnce(pendingLayout.promise).mockResolvedValueOnce(computeGraphLayout([]));
    vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValueOnce(page).mockReturnValueOnce(nextRead.promise);
    await render();
    await render(0, repoPath, true);
    await act(async () => {
      pendingLayout.resolve(computeGraphLayout(commits));
    });
    expect(graph.layout).toBeNull();
    expect(graph.loading).toBe(true);
    await act(async () => {
      nextRead.resolve({ ...page, data: { ...page.data, raw: '' } });
    });
    expect(graph.layout?.nodes).toEqual([]);
    expect(graph.loading).toBe(false);
  });

  it('reports a layout failure and can retry it without restarting the app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(graphLayout, 'prepareGraphLayout').mockRejectedValueOnce(new Error('Layout failed')).mockResolvedValueOnce(computeGraphLayout(commits));
    vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue(page);
    await render();
    expect(graph.loading).toBe(false);
    expect(graph.loadError).toBe('Layout failed');
    await act(async () => {
      await graph.refreshCommits();
    });
    expect(graph.loadError).toBeNull();
    expect(host.textContent).toContain('Saved commit');
  });

  it('loads successfully when React replays mount effects', async () => {
    vi.spyOn(gitClient, 'getCommitLogPage').mockResolvedValue(page);
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Harness)));
    });
    expect(graph.loading).toBe(false);
    expect(host.textContent).toContain('Saved commit');
  });

  it('cancels a scheduled retry when the graph view is left', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const read = vi
      .spyOn(gitClient, 'getCommitLogPage')
      .mockRejectedValueOnce(new CancelledError({ revert: true }))
      .mockResolvedValueOnce(page);
    await render();
    act(() => root.render(null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(read).toHaveBeenCalledTimes(1);
    await render();
    expect(graph.loading).toBe(false);
    expect(host.textContent).toContain('Saved commit');
  });
});
