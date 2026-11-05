// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryTree } from '@/components/working-directory/WorkingDirectoryTree';
import { useConflictBlockCounts } from '@/components/staging-area/useConflictBlockCounts';
import { cachedClient, invalidateResources } from '@/data/clientCache';
import { gitClient } from '@/services/gitClient';
import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';
import type { IpcResult } from '@/types/ipc';
import { useWorkingTreeSnapshot, type WorkingTreeState } from '../useWorkingTreeSnapshot';
import type { WorkingTreeStatusDto } from '@/types/gitDtos';

const { repository, ui } = vi.hoisted(() => ({ repository: { onToast: vi.fn() }, ui: { setConfirmDialog: vi.fn(), setInputDialog: vi.fn() } }));
const { onToast } = repository;
vi.mock('@/contexts/AppStateContext', () => ({ useUIContext: () => ui, useOptionalRepositoryContext: () => repository }));

const repo = 'c:/repos/cancelled-working-tree';
const entry = (name: string): WorkingDirectoryEntryDto => ({ name, path: name, kind: 'file' });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const nextTurn = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
const treeProps = {
  repoPath: repo,
  refreshTrigger: 0,
  expandedPaths: new Set<string>(),
  onExpandedPathsChange: vi.fn(),
  onOpenFile: vi.fn(),
  onRepoChanged: vi.fn(),
};
let root: Root;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.getElementById('root')!);
  onToast.mockClear();
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('working tree invalidation during cold file reads', () => {
  it('confirms the replacement file status when a mutation invalidates a cold status read', async () => {
    const pending = deferred<IpcResult<WorkingTreeStatusDto>>();
    const fresh: IpcResult<WorkingTreeStatusDto> = {
      success: true,
      data: { repoPath: repo, statusRaw: 'M  current.txt', changeCount: 1, checkedAt: Date.now() },
    };
    const read = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(fresh);
    const client = cachedClient('git', { getWorkingTreeStatus: read });
    vi.spyOn(gitClient, 'getWorkingTreeStatus').mockImplementation(client.getWorkingTreeStatus);
    let current!: WorkingTreeState;
    function Harness() {
      current = useWorkingTreeSnapshot(repo);
      return null;
    }
    await act(async () => root.render(createElement(Harness)));
    expect(read).toHaveBeenCalledOnce();
    const refreshed = current.refresh();
    const confirmation = expect(refreshed).resolves.toBeUndefined();
    await act(async () => {
      invalidateResources('git', repo, ['getWorkingTreeStatus']);
      await confirmation;
    });
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(current.statusRaw).toBe('M  current.txt');
    expect(current.dataRepoPath).toBe(repo);
    await act(async () => pending.resolve({ success: true, data: { ...fresh.data, statusRaw: ' M stale.txt' } }));
    expect(current.statusRaw).toBe('M  current.txt');
  });
  it.each([false, true])('restarts a cancelled initial directory read after the working-tree snapshot changes (Strict Mode: %s)', async (strict) => {
    const pending = deferred<IpcResult<WorkingDirectoryEntryDto[]>>();
    const read = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ success: true, data: [entry('current.txt')] });
    const client = cachedClient('git', { listWorkingDirectory: read });
    vi.spyOn(gitClient, 'listWorkingDirectory').mockImplementation(client.listWorkingDirectory);
    let snapshotId = 'before';
    let quickRaw = '';
    vi.spyOn(gitClient, 'getWorkingTreeStatus').mockImplementation(async () => ({
      success: true,
      data: { repoPath: repo, statusRaw: quickRaw, changeCount: quickRaw ? 1 : 0, checkedAt: Date.now() },
    }));
    vi.spyOn(gitClient, 'getWorkingTreeSnapshot').mockImplementation(async () => ({
      success: true,
      data: { repoPath: repo, snapshotId, statusRaw: '', changeCount: 0, durationMs: 1, largeMode: false, isBare: false },
    }));
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    vi.spyOn(gitClient, 'getWorkingTreeStats').mockResolvedValue({
      success: true,
      data: { snapshotId: 'after', staged: { additions: 0, deletions: 0 }, unstaged: { additions: 0, deletions: 0 } },
    });
    let workingTree!: WorkingTreeState;
    function Harness() {
      workingTree = useWorkingTreeSnapshot(repo);
      return createElement(WorkingDirectoryTree, treeProps);
    }
    try {
      await act(async () => root.render(strict ? createElement(StrictMode, null, createElement(Harness)) : createElement(Harness)));
      expect(workingTree.statusRaw).toBe('');
      expect(read).toHaveBeenCalledOnce();
      snapshotId = 'after';
      quickRaw = ' M current.txt';
      await act(async () => workingTree.refresh());
      expect(read).toHaveBeenCalledTimes(2);
      expect(document.querySelector('.working-tree-row__label')?.textContent).toBe('current.txt');
      await act(async () => pending.resolve({ success: true, data: [entry('stale.txt')] }));
      expect(document.querySelector('.working-tree-row__label')?.textContent).toBe('current.txt');
      expect(onToast).not.toHaveBeenCalled();
    } finally {
      pending.resolve({ success: true, data: [] });
    }
  });

  it('does not restart cancelled directory reads after the tree unmounts', async () => {
    const pending = deferred<IpcResult<WorkingDirectoryEntryDto[]>>();
    const read = vi.fn(() => pending.promise);
    const client = cachedClient('git', { listWorkingDirectory: read });
    vi.spyOn(gitClient, 'listWorkingDirectory').mockImplementation(client.listWorkingDirectory);
    await act(async () => root.render(createElement(WorkingDirectoryTree, treeProps)));
    await act(async () => root.render(null));
    await act(async () => {
      invalidateResources('git', repo, ['listWorkingDirectory']);
    });
    pending.resolve({ success: true, data: [entry('stale.txt')] });
    await nextTurn();
    expect(read).toHaveBeenCalledOnce();
    expect(onToast).not.toHaveBeenCalled();
  });

  it('reports genuine directory failures even when their message is CancelledError', async () => {
    vi.spyOn(gitClient, 'listWorkingDirectory').mockRejectedValue(new Error('CancelledError'));
    await act(async () => root.render(createElement(WorkingDirectoryTree, treeProps)));
    await nextTurn();
    expect(onToast).toHaveBeenCalledWith('CancelledError', true);
  });

  it('finishes conflict counts when a file read is cancelled by invalidation', async () => {
    const pending = deferred<IpcResult<string>>();
    const read = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ success: true, data: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> topic\n' });
    const client = cachedClient('git', { readRepoFile: read });
    vi.spyOn(gitClient, 'readRepoFile').mockImplementation(client.readRepoFile);
    const status = { staged: [], unstaged: [], untracked: [], conflicts: [{ path: 'conflict.txt', x: 'U', y: 'U', code: 'UU' }] };
    let counts!: ReturnType<typeof useConflictBlockCounts>;
    function Harness() {
      counts = useConflictBlockCounts({ repoPath: repo, status });
      return null;
    }
    try {
      await act(async () => root.render(createElement(Harness)));
      expect(counts.isConflictBlockCountPending).toBe(true);
      await act(async () => {
        invalidateResources('git', repo, ['readRepoFile']);
      });
      expect(read).toHaveBeenCalledTimes(2);
      expect(counts.isConflictBlockCountPending).toBe(false);
      expect(counts.conflictBlockCountsByPath).toEqual({ 'conflict.txt': 1 });
    } finally {
      pending.resolve({ success: true, data: '' });
    }
  });

  it('handles failed conflict reads and retries on a subsequent status update', async () => {
    const read = vi
      .spyOn(gitClient, 'readRepoFile')
      .mockRejectedValueOnce(new Error('IPC transport failed'))
      .mockResolvedValue({ success: true, data: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> topic\n' });
    let status = { staged: [], unstaged: [], untracked: [], conflicts: [{ path: 'conflict.txt', x: 'U', y: 'U', code: 'UU' }] };
    let counts!: ReturnType<typeof useConflictBlockCounts>;
    function Harness() {
      counts = useConflictBlockCounts({ repoPath: repo, status });
      return null;
    }
    await act(async () => root.render(createElement(Harness)));
    await nextTurn();
    expect(counts.isConflictBlockCountPending).toBe(false);
    expect(counts.conflictBlockCountsByPath).toEqual({});
    status = { ...status };
    await act(async () => root.render(createElement(Harness)));
    expect(read).toHaveBeenCalledTimes(2);
    expect(counts.conflictBlockCountsByPath).toEqual({ 'conflict.txt': 1 });
  });
});
