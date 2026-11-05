import type { TutorialChapter, TutorialText } from './types';
import { resetStep as s, resetRecipe, type ResetMode } from './resetLessonHelpers';
import { resetStartingSteps } from './resetStartingSteps';
import { resetReviewSteps } from './resetReviewSteps';
import { resetSafetySteps } from './resetSafetySteps';
import { resetResultSteps } from './resetResultSteps';
const titles: Record<ResetMode, TutorialText> = {
  soft: ['Soft Reset: Commit zurücknehmen und Index behalten', 'Soft reset: move back while keeping the index'],
  mixed: ['Mixed Reset: Index zurücksetzen und Arbeitsdateien behalten', 'Mixed reset: reset the index and keep working files'],
  hard: ['Hard Reset: erfasste Entwürfe bewusst verwerfen', 'Hard reset: deliberately discard tracked drafts'],
};
const descriptions: Record<ResetMode, TutorialText> = {
  soft: [
    'Drei Dateifassungen, Ziel und Bestätigung prüfen; HEAD zurücksetzen und beide offenen Entwürfe getrennt erhalten.',
    'Inspect three file versions, the target and confirmation; move HEAD back while retaining both open drafts separately.',
  ],
  mixed: [
    'Index und Arbeitsdatei vergleichen, den Index bewusst zurücksetzen und die erhaltenen Arbeitsänderungen untersuchen.',
    'Compare index and working file, deliberately reset the index and inspect the retained working changes.',
  ],
  hard: [
    'Vorgemerkten und späteren Entwurf lesen, die Verlustwarnung prüfen, bestätigen und den Zielinhalt samt erhaltener neuer Notiz untersuchen.',
    'Read the staged and later drafts, review the loss warning, confirm and inspect target contents and the retained new note.',
  ],
};
const questions: Record<ResetMode, TutorialText> = {
  soft: ['Wie nehme ich einen Commit zurück und behalte meine Vormerkungen?', 'How do I move back a commit while keeping my staged contents?'],
  mixed: ['Wie setze ich den Index zurück, ohne meine Arbeitsdateien zu ändern?', 'How do I reset the index without changing my working files?'],
  hard: ['Wie verwerfe ich erfasste Änderungen gezielt mit Hard Reset?', 'How do I deliberately discard tracked changes with hard reset?'],
};
function buildResetLesson(mode: ResetMode): TutorialChapter {
  return {
    id: 'reset-' + mode,
    section: 'repo',
    title: titles[mode],
    description: descriptions[mode],
    question: questions[mode],
    keywords: 'reset ' + mode + ' head index staging arbeitsdateien working tree zurücknehmen zurücksetzen entwurf staged unstaged untracked',
    steps: [
      s('scope', titles[mode], descriptions[mode], '[data-tutorial="graph"]', { prepare: resetRecipe(mode) }),
      ...resetStartingSteps(mode),
      ...resetReviewSteps(mode),
      ...resetSafetySteps(mode),
      ...resetResultSteps(mode),
    ],
  };
}
export const TUTORIAL_RESET_SOFT = buildResetLesson('soft');
export const TUTORIAL_RESET_MIXED = buildResetLesson('mixed');
export const TUTORIAL_RESET_HARD = buildResetLesson('hard');
