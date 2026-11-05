// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { getCommitFormDraft, updateCommitFormDraft, clearCommitFormDraftsForTests } from '@/components/staging-area/commitFormDraft';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialHostApi } from '@/shared/tutorial/types';
import { prepareTutorialUi } from './prepareTutorialUi';
import { DEMO_REPO } from './demoRepository';

const commit = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'commit')!;
beforeEach(() => {
  window.tutorialHost = {} as TutorialHostApi;
  clearCommitFormDraftsForTests();
});
afterEach(() => {
  delete window.tutorialHost;
  clearCommitFormDraftsForTests();
});

it('restores only the fields completed before a direct entry in either language', () => {
  for (const language of ['de', 'en'] as const) {
    prepareTutorialUi(
      commit.steps.find((step) => step.id === 'message')!,
      language,
    );
    expect(getCommitFormDraft(DEMO_REPO, '').subject).toEqual({ type: 'docs', scope: 'lernen', message: '' });
    prepareTutorialUi(
      commit.steps.find((step) => step.id === 'commit')!,
      language,
    );
    const draft = getCommitFormDraft(DEMO_REPO, '');
    expect(draft.subject.message).toBe(language === 'de' ? 'Lernprojekt dokumentieren' : 'Document the learning project');
    expect(draft.commitDescription.length).toBeGreaterThan(20);
    prepareTutorialUi(
      commit.steps.find((step) => step.id === 'result')!,
      language,
    );
    expect(getCommitFormDraft(DEMO_REPO, '').commitMsg).toBe('');
    expect(getCommitFormDraft(DEMO_REPO, '').commitDescription).toBe('');
  }
});
it('keeps unrelated drafts unchanged and refuses normal renderers', () => {
  updateCommitFormDraft('C:/personal', { commitMsg: 'Unfinished personal draft' });
  prepareTutorialUi(commit.steps[0], 'de');
  expect(getCommitFormDraft('C:/personal', '').commitMsg).toBe('Unfinished personal draft');
  delete window.tutorialHost;
  expect(() => prepareTutorialUi(commit.steps[0], 'de')).toThrow('isolated');
});
