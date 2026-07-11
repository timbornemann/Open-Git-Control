import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RELEASE_NOTES_OPTIONS } from '@/types/releaseNotes';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import { useReleaseWorkflow } from '../useReleaseWorkflow';

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

describe('useReleaseWorkflow repository binding', () => {
  it('does not publish when the main process no longer authorizes the captured repository', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getRepoOriginUrl').mockResolvedValue({
      success: false,
      error: 'Requested repository is not the active repository.',
    });
    vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
    const createRelease = vi.spyOn(githubClient, 'createRelease').mockResolvedValue({ success: true, data: {} as any });
    const setReleaseError = vi.fn();
    let workflow: ReturnType<typeof useReleaseWorkflow> | null = null;
    const noop = vi.fn();

    const Harness = () => {
      workflow = useReleaseWorkflow({
        activeRepo: 'C:/repos/a',
        isGithubAuthenticated: true,
        ownerRepo: { owner: 'octo', repo: 'repo-a' },
        currentBranch: 'main',
        releaseForm: {
          owner: 'octo',
          repo: 'repo-a',
          tagName: 'v1.2.3',
          releaseName: 'Release v1.2.3',
          targetCommitish: 'main',
          body: 'Release notes',
          draft: false,
          prerelease: false,
        },
        setReleaseFormState: noop,
        releaseContext: {
          existingTags: [],
          lastReleaseTag: null,
          repositoryHtmlUrl: null,
          commitsSinceLastRelease: [],
          commitsTarget: 'main',
          fallbackUsed: false,
        },
        setReleaseContext: noop,
        setReleaseContextError: noop,
        setReleaseContextLoading: noop,
        setReleaseError,
        setReleaseSuccess: noop,
        setReleaseSubmitting: noop,
        showReleaseCreator: false,
        setShowReleaseCreator: noop,
        releaseNotesGenerating: false,
        setReleaseNotesGenerating: noop,
        releaseNotesLanguage: 'en',
        releaseNotesOptions: DEFAULT_RELEASE_NOTES_OPTIONS,
        setConfirmDialog: noop,
        setGitActionToast: noop,
        setActiveTab: noop,
        triggerRefresh: noop,
        language: 'en',
      });
      return null;
    };

    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(createElement(Harness)));
    await act(async () => workflow!.handleCreateRelease());

    expect(gitClient.getRepoOriginUrl).toHaveBeenCalledWith('C:/repos/a');
    expect(createRelease).not.toHaveBeenCalled();
    expect(setReleaseError).toHaveBeenCalledWith('Requested repository is not the active repository.');
    act(() => root.unmount());
  });
});
