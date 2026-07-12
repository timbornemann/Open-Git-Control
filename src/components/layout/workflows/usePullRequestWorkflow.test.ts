import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import type { RepoOwnerRef } from '@/types/git';
import { usePullRequestWorkflow } from './usePullRequestWorkflow';

const renderWorkflow = (setGitActionToast = vi.fn()) => {
  let hook: ReturnType<typeof usePullRequestWorkflow> | null = null;
  const root = createRoot(document.createElement('div'));
  const params = {
    activeRepo: 'C:/repo',
    githubHost: 'github.com',
    ownerRepo: { owner: 'acme', repo: 'project' } as RepoOwnerRef,
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
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getRepoOriginUrl').mockResolvedValue({ success: true, data: 'https://github.com/acme/project.git' });
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('usePullRequestWorkflow merge guards', () => {
  it('fetches a PR, creates a review branch without force-resetting it, and configures its pull upstream', async () => {
    const rendered = renderWorkflow();

    await act(async () => {
      await rendered.hook.handleCheckoutPR(42, 'feature/new thing');
    });

    expect(rendered.params.runGitCommand).toHaveBeenNthCalledWith(1, ['fetch', 'origin', 'pull/42/head'], 'Loaded branch for PR #42.', 'Loading PR #42...', {
      skipDirtyGuard: true,
    });
    expect(rendered.params.runGitCommand).toHaveBeenNthCalledWith(
      2,
      ['checkout', '-b', 'pr-42-feature-new-thing', 'FETCH_HEAD'],
      'Checked out PR branch pr-42-feature-new-thing.',
    );
    expect(gitClient.runGitCommandForRepo).toHaveBeenNthCalledWith(1, 'C:/repo', 'branch', '--list', 'pr-42-feature-new-thing');
    expect(gitClient.runGitCommandForRepo).toHaveBeenNthCalledWith(2, 'C:/repo', 'config', '--local', 'branch.pr-42-feature-new-thing.remote', 'origin');
    expect(gitClient.runGitCommandForRepo).toHaveBeenNthCalledWith(
      3,
      'C:/repo',
      'config',
      '--local',
      'branch.pr-42-feature-new-thing.merge',
      'refs/pull/42/head',
    );
    rendered.unmount();
  });

  it('reuses an existing review branch without resetting local changes', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repoPath, commandName, ..._args) => {
      if (commandName === 'branch') return { success: true, data: '* pr-42-feature\n' } as any;
      return { success: true, data: '' } as any;
    });
    const rendered = renderWorkflow();

    await act(async () => {
      await rendered.hook.handleCheckoutPR(42, 'feature');
    });

    expect(rendered.params.runGitCommand).toHaveBeenNthCalledWith(2, ['checkout', 'pr-42-feature'], 'Checked out PR branch pr-42-feature.');
    expect(rendered.params.runGitCommand.mock.calls.flat()).not.toContain('-B');
    rendered.unmount();
  });

  it('fetches fork PR refs from the upstream repository rather than the fork origin', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({
      success: true,
      data: 'origin\thttps://github.com/me/project-fork.git (fetch)\nupstream\tgit@github.com:acme/project.git (fetch)',
    });
    const rendered = renderWorkflow();
    rendered.params.ownerRepo = { owner: 'acme', repo: 'project', headOwner: 'me', headRepo: 'project-fork' };
    rendered.unmount();

    let hook: ReturnType<typeof usePullRequestWorkflow> | null = null;
    const root = createRoot(document.createElement('div'));
    const TestComponent = () => {
      hook = usePullRequestWorkflow(rendered.params);
      return null;
    };
    act(() => root.render(createElement(TestComponent)));
    await act(async () => hook!.handleCheckoutPR(42, 'feature'));

    expect(rendered.params.runGitCommand).toHaveBeenNthCalledWith(1, ['fetch', 'upstream', 'pull/42/head'], expect.any(String), expect.any(String), {
      skipDirtyGuard: true,
    });
    act(() => root.unmount());
  });

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
      await vi.waitFor(() => expect(merge).toHaveBeenCalledTimes(1));
      if (!resolveMerge) throw new Error('Merge request did not start.');
      resolveMerge({ success: true, data: { sha: 'abc', merged: true, message: 'Merged' } });
      await Promise.all([first, second]);
    });

    expect(merge).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});
