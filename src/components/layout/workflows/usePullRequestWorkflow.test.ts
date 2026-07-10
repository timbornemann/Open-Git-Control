import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { githubClient } from '@/services/githubClient';
import { usePullRequestWorkflow } from './usePullRequestWorkflow';

const renderWorkflow = (setGitActionToast = vi.fn()) => {
  let hook: ReturnType<typeof usePullRequestWorkflow> | null = null;
  const root = createRoot(document.createElement('div'));
  const params = {
    ownerRepo: { owner: 'acme', repo: 'project' },
    createPullRequest: vi.fn().mockResolvedValue(true),
    currentBranch: 'feature',
    newPRTitle: '',
    newPRBody: '',
    newPRHead: 'feature',
    newPRBase: 'main',
    runGitCommand: vi.fn().mockResolvedValue(true),
    refreshRemoteState: vi.fn(),
    confirmDangerousOps: false,
    setConfirmDialog: vi.fn(),
    setGitActionToast,
    triggerRefresh: vi.fn(),
    language: 'en' as const,
  };

  const TestComponent = () => {
    hook = usePullRequestWorkflow(params);
    return null;
  };

  act(() => {
    root.render(createElement(TestComponent));
  });

  return {
    get hook() {
      if (!hook) throw new Error('Hook did not render.');
      return hook;
    },
    params,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('usePullRequestWorkflow merge guards', () => {
  it('reports a successful HTTP response with merged=false as a failed merge', async () => {
    vi.spyOn(githubClient, 'mergePullRequest').mockResolvedValue({
      success: true,
      data: { sha: '', merged: false, message: 'Required checks have not passed.' },
    });
    const rendered = renderWorkflow();

    await act(async () => {
      await rendered.hook.handleMergePR(42, 'squash');
    });

    expect(rendered.params.setGitActionToast).toHaveBeenCalledWith({
      msg: 'Required checks have not passed.',
      isError: true,
    });
    expect(rendered.params.refreshRemoteState).not.toHaveBeenCalled();
    expect(rendered.params.triggerRefresh).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it('coalesces repeated merge clicks while the same PR request is running', async () => {
    let resolveMerge: ((value: { success: true; data: { sha: string; merged: boolean; message: string } }) => void) | null = null;
    const merge = vi.spyOn(githubClient, 'mergePullRequest').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMerge = resolve;
        }),
    );
    const rendered = renderWorkflow();

    await act(async () => {
      const first = rendered.hook.handleMergePR(42, 'merge');
      const second = rendered.hook.handleMergePR(42, 'merge');
      expect(merge).toHaveBeenCalledTimes(1);
      if (!resolveMerge) throw new Error('Merge request did not start.');
      resolveMerge({ success: true, data: { sha: 'abc', merged: true, message: 'Merged' } });
      await Promise.all([first, second]);
    });

    expect(merge).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});
