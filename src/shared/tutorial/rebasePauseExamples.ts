import type { TutorialText } from './types';
import { practiceCommitHash as hash } from './exampleGitIds';
import { rebaseTodo } from './rebaseLessonExamples';
import { mergeLicenseNote } from './mergeExamples';
export type RebasePauseKind = 'edit' | 'staged' | 'conflict' | 'abort';
export const isConflictRebaseLesson = (kind: RebasePauseKind) => kind === 'conflict' || kind === 'abort';
export function rebasePauseTodo(kind: RebasePauseKind): TutorialText {
  const original = rebaseTodo(isConflictRebaseLesson(kind) ? 'review' : 'reorder', true);
  return original.map((value) => value.replace(/^pick /, isConflictRebaseLesson(kind) ? 'drop ' : 'edit ')) as unknown as TutorialText;
}
const license =
  'MIT License\n\nCopyright (c) 2026 OGC-Lernprojekt\n\nBeispieldatei für die interaktive Einführung. / Sample file for the interactive introduction.\n';
export const REBASE_LICENSE_EDIT: TutorialText = [
  license + mergeLicenseNote[0] + '\nEdit-Übung: Hinweis präzisiert.\n',
  license + mergeLicenseNote[1] + '\nEdit practice: clarified the note.\n',
];
export const REBASE_EDIT_MESSAGE: TutorialText = ['Projekthinweis präzisieren', 'clarify the project note'];
export const REBASE_EDIT_DESCRIPTION: TutorialText = [
  'Den vorhandenen Projekthinweis während der Edit-Pause ergänzen.',
  'Extend the existing project note during the edit pause.',
];
export const REBASE_EDIT_TITLE: TutorialText = REBASE_EDIT_MESSAGE.map((value) => 'docs(lernen): ' + value) as unknown as TutorialText;
export const REBASE_ABORT_DRAFT: TutorialText = [
  '# OGC-Lernprojekt\n\nAbbruch-Entwurf: Diese Lösung wird bewusst verworfen.\n',
  '# OGC-Lernprojekt\n\nAbort draft: This resolution will deliberately be discarded.\n',
];
export const rebaseOriginalMain = '.commit-row[data-commit-hash="' + hash(4) + '"] .commit-refs';
