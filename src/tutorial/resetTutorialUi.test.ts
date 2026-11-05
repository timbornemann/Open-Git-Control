// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { TutorialHostApi } from '@/shared/tutorial/types';
import { usePublicationDraftState, newPublicationSelection } from '@/components/repository-publication/publicationDraftState';
import { allowlistDrafts } from '@/components/repository-security/allowlistDrafts';
import { getCommitFormDraft, updateCommitFormDraft, clearCommitFormDraftsForTests } from '@/components/staging-area/commitFormDraft';
import { DEMO_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO } from './demoRepository';
import { resetTutorialUi } from './resetTutorialUi';
import { queryClient } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import { prepareTutorialCache } from './prepareTutorialCache';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
beforeEach(() => {
  vi.stubGlobal('localStorage', { clear: vi.fn() });
  vi.stubGlobal('sessionStorage', { clear: vi.fn() });
});
afterEach(() => {
  queryClient.clear();
  delete window.tutorialHost;
  usePublicationDraftState.setState(usePublicationDraftState.getInitialState());
  allowlistDrafts.clear();
  clearCommitFormDraftsForTests();
  vi.unstubAllGlobals();
});
function seed() {
  usePublicationDraftState.getState().put('practice', newPublicationSelection(DEMO_REPO));
  allowlistDrafts.set(DEMO_REPO, { text: 'an unsaved practice rule', savedText: '', version: 'demo' });
  for (const path of [DEMO_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO]) updateCommitFormDraft(path, { commitMsg: 'docs: draft' });
}
it('restores fresh publication, allowlist and newly created repository drafts on a checkpoint jump', () => {
  window.tutorialHost = {} as TutorialHostApi;
  seed();
  resetTutorialUi();
  expect(usePublicationDraftState.getState().drafts).toEqual({});
  expect(allowlistDrafts.size).toBe(0);
  for (const path of [DEMO_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO]) expect(getCommitFormDraft(path, '').commitMsg).toBe('');
});
it('refuses a normal renderer before touching any drafts', () => {
  seed();
  expect(() => resetTutorialUi()).toThrow('isolated');
  expect(allowlistDrafts.size).toBe(1);
  expect(Object.keys(usePublicationDraftState.getState().drafts)).toEqual(['practice']);
  expect(getCommitFormDraft(DEMO_REPO, '').commitMsg).toBe('docs: draft');
});
it('seeds only fixed practice origins independently of background preloading', () => {
  window.tutorialHost = {} as TutorialHostApi;
  const { repo } = createDemoApi(
    { request: { chapterId: 'repositories' }, language: 'de', theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'repositories')!.steps[0],
  );
  resetTutorialUi();
  prepareTutorialCache(repo);
  expect(queryClient.getQueryData(resourceKey('git', 'getRepoOriginUrl', [DEMO_REPO]))).toMatchObject({ data: repo.originFor() });
  expect(queryClient.getQueryData(resourceKey('git', 'getRepoOriginUrl', [DEMO_NEW_REPO]))).toBeUndefined();
});
