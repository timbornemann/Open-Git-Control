import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/legacy/github/githubClient';
import { DEFAULT_RELEASE_NOTES_OPTIONS } from '@/types/releaseNotes';
import type { GitHubReleaseTargetDto } from '@/types/githubDtos';
import type { GitJobEventDto } from '@/types/aiDtos';
import type { ConfirmDialogState } from '@/app/state/contracts';
import { useReleaseWorkflow } from '../useReleaseWorkflow';

export async function releaseWorkflowFixture(target: Partial<GitHubReleaseTargetDto> = {}, body = 'Release notes') {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(githubClient, 'isAvailable').mockReturnValue(true);
  let progress!: (event: GitJobEventDto) => void;
  vi.spyOn(gitClient, 'onJobEvent').mockImplementation((callback) => {
    progress = callback;
    return () => {};
  });
  vi.spyOn(gitClient, 'getRepoOriginUrl').mockResolvedValue({ success: true, data: 'https://github.com/acme/project.git' });
  const context = { existingTags: [], lastReleaseTag: null, commitsSinceLastRelease: [], commitsTarget: 'main', fallbackUsed: false };
  vi.spyOn(githubClient, 'getReleaseContext').mockResolvedValue({ success: true, data: context });
  const inspect = vi.spyOn(githubClient, 'inspectReleaseTarget').mockResolvedValue({
    success: true,
    data: {
      inspectionId: 'inspection-1',
      target: 'main',
      targetBranch: 'main',
      localSha: 'b'.repeat(40),
      remoteSha: 'a'.repeat(40),
      ahead: 1,
      behind: 0,
      canPush: true,
      canReleaseRemote: true,
      pushBlockedReason: null,
      ...target,
    },
  });
  const create = vi
    .spyOn(githubClient, 'createRelease')
    .mockResolvedValue({ success: true, data: { id: 1, tagName: 'v1.0.0', name: 'Release', draft: false, prerelease: false, htmlUrl: '', publishedAt: null } });
  const noop = vi.fn();
  let dialog: ConfirmDialogState | null = null;
  const setConfirmDialog = vi.fn((next: any) => {
    dialog = next;
  });
  const setReleaseFormState = vi.fn();
  const setGitActionToast = vi.fn();
  const setReleaseSubmitting = vi.fn();
  let workflow!: ReturnType<typeof useReleaseWorkflow>;
  let state = {
    activeRepo: 'C:/repos/project',
    ownerRepo: { owner: 'acme', repo: 'project' },
    currentBranch: 'main',
    releaseForm: { owner: 'acme', repo: 'project', tagName: 'v1.0.0', releaseName: 'Release', targetCommitish: 'main', body },
  };
  const Harness = () => {
    workflow = useReleaseWorkflow({
      ...state,
      isGithubAuthenticated: true,
      setReleaseFormState,
      releaseContext: context,
      setReleaseContext: noop,
      setReleaseContextError: noop,
      setReleaseContextLoading: noop,
      setReleaseError: noop,
      setReleaseSuccess: noop,
      setReleaseSubmitting,
      showReleaseCreator: false,
      setShowReleaseCreator: noop,
      releaseNotesGenerating: false,
      setReleaseNotesGenerating: noop,
      releaseNotesLanguage: 'en',
      releaseNotesOptions: DEFAULT_RELEASE_NOTES_OPTIONS,
      setConfirmDialog,
      setGitActionToast,
      setActiveTab: noop,
      triggerRefresh: noop,
      language: 'en',
    });
    return null;
  };
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(createElement(Harness)));
  setReleaseFormState.mockClear();
  return {
    get workflow() {
      return workflow;
    },
    get dialog() {
      return dialog;
    },
    inspect,
    create,
    setReleaseFormState,
    setGitActionToast,
    setReleaseSubmitting,
    emit: (phase: string) =>
      act(() =>
        progress({ id: 'inspection-1', operation: 'github:createRelease', status: 'progress', timestamp: Date.now(), details: { releasePhase: phase } }),
      ),
    update: async (next: Partial<typeof state>) => {
      state = { ...state, ...next };
      await act(async () => root.render(createElement(Harness)));
    },
    close: () => {
      act(() => root.unmount());
      dom.window.close();
    },
  };
}
