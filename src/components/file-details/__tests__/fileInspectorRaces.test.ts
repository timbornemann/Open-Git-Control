import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingTreeFileDetails } from '@/components/WorkingTreeFileDetails';
import { useCommitDetailsData } from '@/components/commit-details/useCommitDetailsData';
import { gitClient } from '@/services/gitClient';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('file inspector request generations', () => {
  it('does not let late history from the previous working-tree path overwrite the current path', async () => {
    const repoPath = 'C:/repo';
    const a = deferred<any>();
    const b = deferred<any>();
    vi.spyOn(gitClient, 'getFileHistory').mockImplementation((path) => (path === 'a.ts' ? a.promise : b.promise));
    const root = createRoot(document.getElementById('root')!);

    await act(async () => {
      root.render(createElement(WorkingTreeFileDetails, { repoPath, path: 'a.ts', source: 'unstaged' }));
    });
    await vi.waitFor(() => expect(gitClient.getFileHistory).toHaveBeenCalledWith('a.ts', undefined, 80, repoPath));

    await act(async () => {
      root.render(createElement(WorkingTreeFileDetails, { repoPath, path: 'b.ts', source: 'unstaged' }));
    });
    await vi.waitFor(() => expect(gitClient.getFileHistory).toHaveBeenCalledWith('b.ts', undefined, 80, repoPath));

    await act(async () => {
      b.resolve({ success: true, data: [{ hash: 'b'.repeat(40), abbrevHash: 'bbbbbbb', author: 'B', date: '', subject: 'history-b' }] });
      await b.promise;
    });
    await act(async () => {
      a.resolve({ success: true, data: [{ hash: 'a'.repeat(40), abbrevHash: 'aaaaaaa', author: 'A', date: '', subject: 'history-a' }] });
      await a.promise;
    });

    expect(document.body.textContent).toContain('history-b');
    expect(document.body.textContent).not.toContain('history-a');
    act(() => root.unmount());
  });

  it('does not let late history from a previous file in the same commit overwrite the selection', async () => {
    const commitHash = 'c'.repeat(40);
    const repoPath = 'C:/repo';
    const a = deferred<any>();
    const b = deferred<any>();
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (requestedRepo, command, ...args) => {
      expect(requestedRepo).toBe(repoPath);
      if (command === 'commitDetails') return { success: true, data: 'M\x00a.ts\x00M\x00b.ts\x00' } as any;
      if (args.includes('--format=%P')) return { success: true, data: '' } as any;
      return { success: true, data: 'subject' } as any;
    });
    vi.spyOn(gitClient, 'getFileHistory').mockImplementation((path) => (path === 'a.ts' ? a.promise : b.promise));

    let state: ReturnType<typeof useCommitDetailsData> | null = null;
    const Harness = () => {
      state = useCommitDetailsData({ repoPath, hash: commitHash });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(createElement(Harness));
    });
    await vi.waitFor(() => expect(state?.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']));

    act(() => {
      state?.setSelectedFileCommitHash(commitHash);
      state?.setSelectedFilePath('a.ts');
    });
    await vi.waitFor(() => expect(gitClient.getFileHistory).toHaveBeenCalledWith('a.ts', commitHash, 80, repoPath));
    act(() => state?.setSelectedFilePath('b.ts'));
    await vi.waitFor(() => expect(gitClient.getFileHistory).toHaveBeenCalledWith('b.ts', commitHash, 80, repoPath));

    await act(async () => {
      b.resolve({ success: true, data: [{ hash: 'b'.repeat(40), abbrevHash: 'bbbbbbb', author: 'B', date: '', subject: 'history-b' }] });
      await b.promise;
    });
    await act(async () => {
      a.resolve({ success: true, data: [{ hash: 'a'.repeat(40), abbrevHash: 'aaaaaaa', author: 'A', date: '', subject: 'history-a' }] });
      await a.promise;
    });

    expect(state?.historyEntries.map((entry) => entry.subject)).toEqual(['history-b']);
    act(() => root.unmount());
  });
});
