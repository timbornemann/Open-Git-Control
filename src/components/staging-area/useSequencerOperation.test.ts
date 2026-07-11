import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import type { GitSequencerStateDto } from '@/types/gitDtos';
import type { IpcResult } from '@/types/ipc';
import { useSequencerOperation } from './useSequencerOperation';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useSequencerOperation', () => {
  it('ignores a late operation state from the previously selected repository', async () => {
    const repoAResult = deferred<IpcResult<GitSequencerStateDto>>();
    const repoBResult = deferred<IpcResult<GitSequencerStateDto>>();
    vi.spyOn(gitClient, 'getSequencerState').mockImplementation((repoPath) => (repoPath === 'C:/a' ? repoAResult.promise : repoBResult.promise));
    let repoPath = 'C:/a';
    let current: ReturnType<typeof useSequencerOperation> = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useSequencerOperation(repoPath);
      return null;
    };
    const render = () => root.render(createElement(Harness));
    act(render);
    repoPath = 'C:/b';
    act(render);

    await act(async () => repoBResult.resolve({ success: true, data: { operation: 'cherry-pick' } }));
    expect(current).toBe('cherry-pick');
    await act(async () => repoAResult.resolve({ success: true, data: { operation: 'merge' } }));
    expect(current).toBe('cherry-pick');
    expect(gitClient.getSequencerState).toHaveBeenCalledWith('C:/a');
    expect(gitClient.getSequencerState).toHaveBeenCalledWith('C:/b');
    act(() => root.unmount());
  });
});
