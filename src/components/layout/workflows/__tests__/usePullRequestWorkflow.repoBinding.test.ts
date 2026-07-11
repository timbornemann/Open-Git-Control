import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import { usePullRequestWorkflow } from '../usePullRequestWorkflow';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('usePullRequestWorkflow repository binding', () => {
  it('does not merge a PR when the captured repository is no longer active', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getRepoOriginUrl').mockResolvedValue({
      success: false,
      error: 'Requested repository is not the active repository.',
    });
    vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
    const mergePullRequest = vi.spyOn(githubClient, 'mergePullRequest').mockResolvedValue({ success: true, data: { merged: true } as any });
    const setGitActionToast = vi.fn();
    let workflow: ReturnType<typeof usePullRequestWorkflow> | null = null;
    const Harness = () => {
      workflow = usePullRequestWorkflow({
        activeRepo: 'C:/repos/a',
        githubHost: 'github.com',
        ownerRepo: { owner: 'octo', repo: 'repo-a' },
        createPullRequest: vi.fn(),
        currentBranch: 'main',
        newPRTitle: '',
        newPRBody: '',
        newPRHead: '',
        newPRBase: 'main',
        runGitCommand: vi.fn(),
        refreshRemoteState: vi.fn(),
        confirmDangerousOps: false,
        setConfirmDialog: vi.fn(),
        setGitActionToast,
        triggerRefresh: vi.fn(),
        language: 'en',
      });
      return null;
    };

    const root = createRoot(document.getElementById('root')!);
    act(() => root.render(createElement(Harness)));
    await act(async () => workflow!.handleMergePR(12));

    expect(gitClient.getRepoOriginUrl).toHaveBeenCalledWith('C:/repos/a');
    expect(mergePullRequest).not.toHaveBeenCalled();
    expect(setGitActionToast).toHaveBeenCalledWith({
      msg: 'Requested repository is not the active repository.',
      isError: true,
    });
    act(() => root.unmount());
  });
});
