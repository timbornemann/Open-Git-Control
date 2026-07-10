import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitStatusDetailed } from '@/utils/gitParsing';
import { gitClient } from '@/services/gitClient';
import { useFileOperations } from './useFileOperations';

const repoA = 'C:\\repos\\a';
const repoB = 'C:\\repos\\b';
const stalePath = 'Website/ProductPage/assets/fonts/barlow_condensed_black.ttf';

const statusA: GitStatusDetailed = {
  staged: [],
  unstaged: [{ path: stalePath, x: ' ', y: 'M' }],
  untracked: [{ path: 'new-file.txt', x: '?', y: '?' }],
};

type HookParams = Parameters<typeof useFileOperations>[0];

const createParams = (repoPath: string, externalRepoPath: string | null): HookParams => ({
  repoPath,
  setToast: vi.fn(),
  setConfirmDialog: vi.fn(),
  setInputDialog: vi.fn(),
  externalRepoPath,
  externalStatus: statusA,
  externalStatusRaw: '',
  externalStats: null,
  externalRefresh: vi.fn().mockResolvedValue(undefined),
});

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

describe('useFileOperations repository switch isolation', () => {
  it('pins stage requests to the displayed repository and rejects stale file lists after a switch', async () => {
    let params = createParams(repoA, repoA);
    let current: ReturnType<typeof useFileOperations> | null = null;
    const container = document.getElementById('root')!;
    const root: Root = createRoot(container);
    const stagePaths = vi.spyOn(gitClient, 'stagePaths').mockResolvedValue({ success: true, data: '' });
    const runGitCommandForRepo = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    const HookHarness = () => {
      current = useFileOperations(params);
      return null;
    };

    const render = () => {
      root.render(createElement(HookHarness));
    };

    act(render);
    expect(current?.status?.unstaged.map((entry) => entry.path)).toEqual([stalePath]);

    await act(async () => {
      await current!.stageFile(stalePath);
    });
    expect(stagePaths).toHaveBeenCalledWith([stalePath], repoA);

    stagePaths.mockClear();
    runGitCommandForRepo.mockClear();
    params = createParams(repoB, repoA);
    act(render);

    expect(current?.status).toBeNull();
    await act(async () => {
      await current!.stageFile(stalePath);
      await current!.stageAll();
      await current!.stageAllUntracked();
    });

    expect(stagePaths).not.toHaveBeenCalled();
    expect(runGitCommandForRepo).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
