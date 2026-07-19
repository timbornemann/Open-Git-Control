import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RELEASE_NOTES_OPTIONS } from '@/types/releaseNotes';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import { useReleaseWorkflow } from '../useReleaseWorkflow';
import {
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  resetWorkingDirectoryNavigationGuardForTests();
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
    const setGitActionToast = vi.fn();
    let workflow: ReturnType<typeof useReleaseWorkflow> | null = null;
    const noop = vi.fn();
    const setActiveTab = vi.fn();
    const setShowReleaseCreator = vi.fn();

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
        setShowReleaseCreator,
        releaseNotesGenerating: false,
        setReleaseNotesGenerating: noop,
        releaseNotesLanguage: 'en',
        releaseNotesOptions: DEFAULT_RELEASE_NOTES_OPTIONS,
        setConfirmDialog: noop,
        setGitActionToast,
        setActiveTab,
        triggerRefresh: noop,
        language: 'en',
      });
      return null;
    };

    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(createElement(Harness)));
    let proceed: (() => void) | undefined;
    setActiveWorkingDirectoryNavigationGuard((_target, next) => (proceed = next));
    act(() => workflow!.openReleaseCreator());
    expect(setShowReleaseCreator).not.toHaveBeenCalledWith(true);
    act(() => proceed?.());
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(setShowReleaseCreator).toHaveBeenCalledWith(true);
    await act(async () => workflow!.handleCreateRelease());

    expect(gitClient.getRepoOriginUrl).toHaveBeenCalledWith('C:/repos/a');
    expect(createRelease).not.toHaveBeenCalled();
    expect(setReleaseError).toHaveBeenCalledWith(null);
    expect(setGitActionToast).toHaveBeenCalledWith({ msg: 'Requested repository is not the active repository.', isError: true });
    act(() => root.unmount());
  });

  it('invalidates an empty-notes confirmation when the repository changes before confirmation', async () => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const authorizeRepository = vi.spyOn(gitClient, 'getRepoOriginUrl').mockResolvedValue({ success: true, data: 'https://github.com/octo/repo-a.git' });
    vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
    const createRelease = vi.spyOn(githubClient, 'createRelease').mockResolvedValue({ success: true, data: {} as any });
    const noop = vi.fn();
    let workflow: ReturnType<typeof useReleaseWorkflow> | null = null;
    let capturedDialog: any = null;
    let repoState = {
      activeRepo: 'C:/repos/a',
      ownerRepo: { owner: 'octo', repo: 'repo-a' },
      releaseForm: {
        owner: 'octo',
        repo: 'repo-a',
        tagName: 'v1.0.0',
        releaseName: 'Release v1.0.0',
        targetCommitish: 'main',
        body: '',
        draft: false,
        prerelease: false,
      },
    };
    const setConfirmDialog = vi.fn((dialog) => {
      if (dialog) capturedDialog = dialog;
    });

    const Harness = () => {
      workflow = useReleaseWorkflow({
        ...repoState,
        isGithubAuthenticated: true,
        currentBranch: 'main',
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
        setReleaseError: noop,
        setReleaseSuccess: noop,
        setReleaseSubmitting: noop,
        showReleaseCreator: false,
        setShowReleaseCreator: noop,
        releaseNotesGenerating: false,
        setReleaseNotesGenerating: noop,
        releaseNotesLanguage: 'en',
        releaseNotesOptions: DEFAULT_RELEASE_NOTES_OPTIONS,
        setConfirmDialog,
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
    expect(capturedDialog?.onConfirm).toBeTypeOf('function');
    const firstDialog = capturedDialog;

    repoState = {
      ...repoState,
      releaseForm: {
        ...repoState.releaseForm,
        tagName: 'v1.0.1',
        releaseName: 'Release v1.0.1',
      },
    };
    await act(async () => root.render(createElement(Harness)));
    await act(async () => firstDialog.onConfirm());
    expect(authorizeRepository).not.toHaveBeenCalled();
    expect(createRelease).not.toHaveBeenCalled();

    await act(async () => workflow!.handleCreateRelease());
    expect(capturedDialog).not.toBe(firstDialog);

    repoState = {
      activeRepo: 'C:/repos/b',
      ownerRepo: { owner: 'octo', repo: 'repo-b' },
      releaseForm: {
        ...repoState.releaseForm,
        owner: 'octo',
        repo: 'repo-b',
        tagName: 'v2.0.0',
        releaseName: 'Release v2.0.0',
      },
    };
    await act(async () => root.render(createElement(Harness)));
    await act(async () => capturedDialog.onConfirm());

    expect(authorizeRepository).not.toHaveBeenCalled();
    expect(createRelease).not.toHaveBeenCalled();
    expect(setConfirmDialog).toHaveBeenLastCalledWith(null);
    act(() => root.unmount());
  });
});
