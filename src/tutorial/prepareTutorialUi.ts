import { updateCommitFormDraft } from '@/components/staging-area/commitFormDraft';
import { tutorialText, type TutorialStep } from '@/shared/tutorial/types';
import { DEMO_REPO } from './demoRepository';

/** Only seed the transient renderer, never a personal repository's draft. */
export function prepareTutorialUi(step: TutorialStep, language: 'de' | 'en') {
  if (!window.tutorialHost || window.electronAPI) throw new Error('An isolated tutorial renderer is required.');
  const commit = step.prepare?.commit;
  if (commit)
    updateCommitFormDraft(DEMO_REPO, {
      commitMsg: step.scenario === 'committed' ? '' : tutorialText(commit.subject, language),
      commitDescription: step.scenario === 'committed' ? '' : commit.description ? tutorialText(commit.description, language) : '',
    });
}
