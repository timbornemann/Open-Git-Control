import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { StashPanel } from './StashPanel';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const stash = (name: string, subject: string) => ({
  index: Number(name.match(/\d+/)?.[0] || 0),
  name,
  hash: `${name}-hash`,
  branch: 'main',
  subject,
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

const renderPanel = (initialRepoPath: string) => {
  let repoPath = initialRepoPath;
  const container = document.getElementById('root')!;
  const root: Root = createRoot(container);
  const render = () => root.render(createElement(StashPanel, { repoPath }));
  act(render);
  return {
    container,
    rerender(nextRepoPath: string) {
      repoPath = nextRepoPath;
      act(render);
    },
    unmount() {
      act(() => root.unmount());
    },
  };
};

const flush = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

describe('StashPanel operation guards', () => {
  it('runs a confirmed drop only once when the confirmation is clicked twice', async () => {
    vi.spyOn(gitClient, 'getStashes').mockResolvedValue({ success: true, data: [stash('stash@{0}', 'first stash')] });
    const dropResult = deferred<{ success: true; data: string }>();
    const runGitCommand = vi.spyOn(gitClient, 'runGitCommand').mockImplementation(() => dropResult.promise);
    const panel = renderPanel('C:\\repos\\a');

    act(() => panel.container.querySelector<HTMLButtonElement>('[title="Show stashes"]')!.click());
    await flush();
    act(() => panel.container.querySelector<HTMLButtonElement>('[title="Delete stash"]')!.click());
    const confirm = panel.container.querySelector<HTMLButtonElement>('.stash-entry-confirm .staging-btn-danger')!;
    act(() => {
      confirm.click();
      confirm.click();
    });

    expect(runGitCommand).toHaveBeenCalledTimes(1);
    expect(runGitCommand).toHaveBeenCalledWith('stash', 'drop', 'stash@{0}');
    await act(async () => {
      dropResult.resolve({ success: true, data: '' });
      await dropResult.promise;
    });
    panel.unmount();
  });

  it('does not restore a late stash list from the previous repository', async () => {
    const repoAResult = deferred<{ success: true; data: ReturnType<typeof stash>[] }>();
    vi.spyOn(gitClient, 'getStashes')
      .mockImplementationOnce(() => repoAResult.promise)
      .mockResolvedValueOnce({ success: true, data: [stash('stash@{0}', 'repo B stash')] });
    const panel = renderPanel('C:\\repos\\a');

    act(() => panel.container.querySelector<HTMLButtonElement>('[title="Show stashes"]')!.click());
    await flush();
    panel.rerender('C:\\repos\\b');
    await flush();
    await act(async () => {
      repoAResult.resolve({ success: true, data: [stash('stash@{0}', 'repo A stale stash')] });
      await repoAResult.promise;
    });

    expect(panel.container.textContent).toContain('repo B stash');
    expect(panel.container.textContent).not.toContain('repo A stale stash');
    panel.unmount();
  });
});
