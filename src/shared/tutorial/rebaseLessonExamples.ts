import type { TutorialText } from './types';
import { practiceCommitHash as hash } from './exampleGitIds';
import { REWORD_ORIGINAL_TITLE } from './rewordLessonExamples';
import { AMEND_ORIGINAL_SUBJECT } from './amendLessonExamples';
export type RebaseLessonMode = 'review' | 'reword' | 'squash' | 'fixup' | 'drop' | 'reorder';
export const REBASE_REWORD_TITLE: TutorialText = ['docs: Zweck des Lernprojekts präzisieren', 'docs: clarify the learning project’s purpose'];
export const REBASE_LICENSE_TITLE: TutorialText = ['docs: Projekthinweis ergänzen', 'docs: add project note'];
export function rebaseTodo(mode: RebaseLessonMode, original = false): TutorialText {
  return ([0, 1] as const).map((language) => {
    const source = mode === 'reorder' ? REBASE_LICENSE_TITLE[language] : REWORD_ORIGINAL_TITLE[language];
    const first =
      (mode === 'reword' && !original ? 'reword' : 'pick') + ' ' + hash(3) + ' ' + (mode === 'reword' && !original ? REBASE_REWORD_TITLE[language] : source);
    const second = (!original && ['squash', 'fixup', 'drop'].includes(mode) ? mode : 'pick') + ' ' + hash(4) + ' ' + AMEND_ORIGINAL_SUBJECT[language];
    return mode === 'reorder' && !original ? second + '\n' + first : first + '\n' + second;
  }) as unknown as TutorialText;
}
export const rebaseResultNumber = (mode: RebaseLessonMode) => (mode === 'review' ? 4 : mode === 'drop' ? 3 : ['squash', 'fixup'].includes(mode) ? 5 : 6);
