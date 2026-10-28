// @vitest-environment jsdom
import { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryBranches } from '../useRepositoryBranches';
import { useCommitGraphData } from '@/components/commit-graph/useCommitGraphData';
import { branchChangeClient } from '@/services/branchChangeClient';
import { requestBranchChange } from '@/components/branch-change/branchChangeDialogState';
import { gitClient } from '@/services/gitClient';
import { plannerClient } from '@/services/plannerClient';
import { notifyRemoteSyncSuccess } from '@/data/remoteSyncEvents';
import { freshRead, setActiveResourceRepository } from '@/data/clientCache';
import { useRepoScopedNavigationState } from '@/app/state/useRepoScopedNavigationState';
import * as graphLayout from '@/data/graphLayout';
import { computeGraphLayout } from '@/utils/graphLayout';
import { parseGitLog } from '@/utils/gitParsing';
import { backgroundQueue } from '@/data/backgroundQueue';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import type { CommitLogPageDto } from '@/types/gitDtos';
import type { IpcResult } from '@/types/ipc';
import type { ConfirmDialogState, InputDialogState } from '@/app/state/contracts';
import type { BranchChangeTarget, InspectBranchChangeRequest } from '@/shared/ipc/branchChange';

const repoPath = 'C:/mutation-refresh';
const oldHash = 'a'.repeat(40);
const newHash = 'b'.repeat(40);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('repository views after confirmed Git mutations', () => {
  let root: Root;
  let host: HTMLDivElement;
  let graph: ReturnType<typeof useCommitGraphData>;
  let branch: string;
  let subject: string;
  let head: string;
  let refresh: ReturnType<typeof useRepoScopedNavigationState>;
  const refreshWorkingTree = vi.fn().mockResolvedValue(undefined);
  const readPage = vi.fn<() => Promise<IpcResult<CommitLogPageDto>>>();
  const runCommand = vi.fn();
  const executeBranchChange = vi.fn();
  const page = (): IpcResult<CommitLogPageDto> => ({
    success: true,
    data: {
      repoPath,
      raw: [head, head.slice(0, 7), 'Author', '2026-10-28T10:00:00Z', subject, head === newHash ? oldHash : '', `HEAD -> ${branch}`].join('\x1f') + '\x00',
      hasMore: true,
      stats: {},
      refs: { [head]: [`HEAD -> ${branch}`] },
    },
  });
  const advanceHead = () => {
    head = newHash;
    subject = 'New commit';
  };

  function Harness() {
    const [, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
    const [, setInputDialog] = useState<InputDialogState | null>(null);
    refresh = useRepoScopedNavigationState({ setConfirmDialog, setInputDialog });
    const branches = useRepositoryBranches({
      activeRepo: repoPath,
      refreshTrigger: refresh.refreshTrigger,
      hasRemoteOrigin: true,
      language: 'en',
      runGitCommand: vi.fn(),
      triggerRefresh: vi.fn(),
      setGitActionToast: vi.fn(),
      setConfirmDialog: vi.fn(),
      setInputDialog: vi.fn(),
    });
    const logContainerRef = useRef<HTMLDivElement>(null);
    graph = useCommitGraphData({
      repoPath,
      showSecondaryHistory: false,
      refreshTrigger: refresh.refreshTrigger,
      commitRefreshTrigger: refresh.commitRefreshTrigger,
      logContainerRef,
      externalWorkingTreeStatus: null,
      onRefreshWorkingTree: refreshWorkingTree,
    });
    return createElement(
      'div',
      null,
      createElement('header', null, branches.currentBranch),
      createElement(
        'aside',
        null,
        branches.branches
          .filter((entry) => entry.isHead)
          .map((entry) => entry.name)
          .join(', '),
      ),
      createElement('main', { ref: logContainerRef }, graph.layout?.nodes.map((node) => `${node.commit.subject}: ${node.commit.refs.join(', ')}`).join('\n')),
    );
  }

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    branch = 'main';
    subject = 'Old commit';
    head = oldHash;
    vi.resetAllMocks();
    readPage.mockImplementation(async () => page());
    runCommand.mockImplementation(async (repo: string, command: string) => {
      if (command === 'branch') return { success: true, data: `* ${branch}\n` };
      if (command === 'merge' && repo === repoPath) advanceHead();
      return { success: true, data: 'main\n' };
    });
    executeBranchChange.mockImplementation(async () => {
      branch = 'feature';
      return { success: true, data: { switched: true, restored: false, conflicts: [] } };
    });
    window.electronAPI = {
      planner: {
        plannerStartWork: vi.fn(async () => {
          branch = 'task/work';
          return { success: true, data: {} };
        }),
      },
      git: {
        runGitCommandForRepo: runCommand,
        getCommitLogPage: readPage,
        inspectBranchChange: vi.fn(async (request: InspectBranchChangeRequest) => ({
          success: true,
          data: {
            planId: 'reviewed',
            repoPath,
            sourceBranch: branch,
            sourceHead: head,
            target: request.target,
            targetSha: oldHash,
            files: [],
            blocks: [],
            suggestedName: 'Switch',
          },
        })),
        executeBranchChange,
        createCommit: vi.fn(async () => {
          advanceHead();
          return { success: true, data: '' };
        }),
        stagePaths: vi.fn(async () => ({ success: true, data: '' })),
        requestCommitStats: vi.fn(async () => ({ success: true, data: {} })),
        onCommitStats: () => () => {},
      },
    } as unknown as ElectronAPI;
    setActiveResourceRepository(repoPath);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(Harness)));
    expect(host.querySelector('header')?.textContent).toBe('main');
    expect(host.querySelector('main')?.textContent).toContain('Old commit: HEAD -> main');
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    backgroundQueue.setPaused(false);
    vi.restoreAllMocks();
  });

  it.each([
    { kind: 'existing', branch: 'feature' },
    { kind: 'create', branch: 'feature', startPoint: 'HEAD' },
  ] satisfies BranchChangeTarget[])(
    'updates the title, sidebar and graph immediately after a guided $kind branch change with fresh cached reads',
    async (target) => {
      await act(async () => {
        await requestBranchChange(repoPath, target);
      });
      expect(window.electronAPI.git.inspectBranchChange).toHaveBeenCalledWith(expect.objectContaining({ repoPath, target }));
      expect(host.querySelector('header')?.textContent).toBe('feature');
      expect(host.querySelector('aside')?.textContent).toBe('feature');
      expect(host.querySelector('main')?.textContent).toContain('HEAD -> feature');
      expect(readPage).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['commit', 'merge', 'pull'] as const)('refreshes graph history after %s without a parent refresh callback or cache timeout', async (operation) => {
    await act(async () => {
      if (operation === 'commit') await gitClient.createCommit({ repoPath, title: 'New commit', description: '' });
      else if (operation === 'merge') await gitClient.runGitCommandForRepo(repoPath, 'merge', 'feature');
      else {
        advanceHead();
        notifyRemoteSyncSuccess(repoPath, 'origin', 'pull');
      }
    });
    expect(host.querySelector('main')?.textContent).toContain('New commit: HEAD -> main');
    expect(graph.layout?.nodes[0].commit.hash).toBe(newHash);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('updates all branch views when task setup checks out its branch through the planner API', async () => {
    await act(async () => {
      await plannerClient.startWork({ repoPath, itemId: 'task', planId: 'plan', branchName: 'task/work', baseRef: 'refs/heads/main', acceptChanges: false });
    });
    expect(host.querySelector('header')?.textContent).toBe('task/work');
    expect(host.querySelector('aside')?.textContent).toBe('task/work');
    expect(host.querySelector('main')?.textContent).toContain('HEAD -> task/work');
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it.each(['commit', 'merge'] as const)('coalesces the cache invalidation and existing UI callback after %s', async (operation) => {
    await act(async () => {
      if (operation === 'commit') {
        await gitClient.createCommit({ repoPath, title: 'New commit', description: '' });
        refresh.triggerCommitRefresh();
      } else {
        await gitClient.runGitCommandForRepo(repoPath, 'merge', 'feature');
        refresh.triggerRefresh();
      }
    });
    expect(host.querySelector('main')?.textContent).toContain('New commit: HEAD -> main');
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('scrolls to the new commit without another log read when the UI callback arrives after the refreshed layout', async () => {
    const scrollContainer = host.querySelector('main')!.parentElement!;
    scrollContainer.scrollTop = 200;
    await act(async () => {
      await gitClient.createCommit({ repoPath, title: 'New commit', description: '' });
    });
    await act(async () => {
      refresh.triggerCommitRefresh();
    });
    expect(scrollContainer.scrollTop).toBe(0);
    expect(host.querySelector('main')?.textContent).toContain('New commit: HEAD -> main');
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('keeps the actual branch after a rejected checkout instead of displaying the requested target', async () => {
    executeBranchChange.mockResolvedValueOnce({ success: false, error: 'Checkout rejected' });
    await act(async () => {
      await branchChangeClient.executeBranchChange({ repoPath, planId: 'stale', mode: 'carry', name: 'Switch' });
    });
    expect(host.querySelector('header')?.textContent).toBe('main');
    expect(host.querySelector('aside')?.textContent).toBe('main');
    expect(host.querySelector('main')?.textContent).toContain('HEAD -> main');
  });

  it('rejects a late branch-list response started before checkout', async () => {
    const pending = deferred<IpcResult<string>>();
    runCommand.mockReturnValueOnce(pending.promise);
    let read!: Promise<unknown>;
    await act(async () => {
      read = freshRead(() => gitClient.runGitCommandForRepo(repoPath, 'branch', '-a')).catch(() => undefined);
    });
    await act(async () => {
      await branchChangeClient.executeBranchChange({ repoPath, planId: 'reviewed', mode: 'park', name: 'Switch' });
    });
    expect(host.querySelector('header')?.textContent).toBe('feature');
    await act(async () => {
      pending.resolve({ success: true, data: '* main\n' });
      await read;
    });
    expect(host.querySelector('header')?.textContent).toBe('feature');
    expect(host.querySelector('aside')?.textContent).toBe('feature');
  });

  it('discards a late worker layout after a new commit while preserving the usable graph during refresh', async () => {
    const oldPage = page();
    const pendingLayout = deferred<ReturnType<typeof computeGraphLayout>>();
    const pendingRead = deferred<IpcResult<CommitLogPageDto>>();
    vi.spyOn(graphLayout, 'prepareGraphLayout')
      .mockReturnValueOnce(pendingLayout.promise)
      .mockImplementation(async (_repo, commits) => computeGraphLayout(commits));
    let previousRefresh!: Promise<void>;
    await act(async () => {
      previousRefresh = graph.refreshCommits('sync');
    });
    readPage.mockReturnValueOnce(pendingRead.promise);
    await act(async () => {
      await gitClient.createCommit({ repoPath, title: 'New commit', description: '' });
    });
    expect(host.querySelector('main')?.textContent).toContain('Old commit');
    expect(graph.loading).toBe(false);
    const newPage = page();
    await act(async () => {
      pendingRead.resolve(newPage);
    });
    expect(host.querySelector('main')?.textContent).toContain('New commit');
    await act(async () => {
      pendingLayout.resolve(computeGraphLayout(parseGitLog(oldPage.success ? oldPage.data.raw : '')));
      await previousRefresh;
    });
    expect(graph.layout?.nodes[0].commit.hash).toBe(newHash);
  });

  it('does not refresh history for staging, unchanged fetches or a mutation in another repository', async () => {
    await act(async () => {
      await gitClient.stagePaths(['file.txt'], repoPath);
      notifyRemoteSyncSuccess(repoPath, 'origin', 'fetch', false);
      await gitClient.runGitCommandForRepo('C:/other-repo', 'merge', 'feature');
    });
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(host.querySelector('header')?.textContent).toBe('main');
  });

  it('refreshes the new head without waiting for an older history page and discards its late result', async () => {
    const pending = deferred<IpcResult<CommitLogPageDto>>();
    const oldPage = page();
    readPage.mockReturnValueOnce(pending.promise);
    let append!: Promise<void>;
    await act(async () => {
      append = graph.loadMoreCommits();
    });
    expect(graph.loadingMore).toBe(true);
    await act(async () => {
      await gitClient.createCommit({ repoPath, title: 'New commit', description: '' });
    });
    expect(host.querySelector('main')?.textContent).toContain('New commit: HEAD -> main');
    await act(async () => {
      pending.resolve(oldPage);
      await append;
    });
    expect(graph.layout?.nodes[0].commit.hash).toBe(newHash);
    expect(graph.loadingMore).toBe(false);
  });
});
