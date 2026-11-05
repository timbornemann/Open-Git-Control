import type { TutorialChapter, TutorialText } from './types';
import { rebaseStep as s, rebaseRecipe } from './rebaseLessonHelpers';
import type { RebaseLessonMode } from './rebaseLessonExamples';
import { rebaseStartingSteps } from './rebaseStartingSteps';
import { rebaseReviewSteps } from './rebaseReviewSteps';
import { rebaseResultSteps } from './rebaseResultSteps';
type Copy = { title: TutorialText; description: TutorialText; question: TutorialText };
const copy: Record<RebaseLessonMode, Copy> = {
  review: {
    title: ['Interaktiven Rebase prüfen und sicher starten', 'Review and safely start interactive rebase'],
    description: [
      'Bereich, Basis, Todo-Spalten, Ausführungsreihenfolge und Abbrechen lernen; unveränderte pick-Zeilen bewusst ausführen.',
      'Learn the range, base, todo columns, execution order and cancellation; deliberately execute unchanged pick lines.',
    ],
    question: ['Wie öffne und prüfe ich den interaktiven Rebase?', 'How do I open and review interactive rebase?'],
  },
  reword: {
    title: ['Rebase: einen älteren Titel mit reword ändern', 'Rebase: change an older subject with reword'],
    description: [
      'Eine Todo-Zeile gezielt bearbeiten, Beschreibung bewahren und die neuen Hashes des Commits und seines Nachfolgers prüfen.',
      'Edit one todo line deliberately, preserve the description and inspect the new hashes of the commit and its descendant.',
    ],
    question: ['Wie benenne ich einen Commit im Rebase-Todo um?', 'How do I rename a commit in the rebase todo?'],
  },
  squash: {
    title: ['Rebase: Commits mit squash samt Nachrichten verbinden', 'Rebase: combine commits and messages with squash'],
    description: [
      'Den zweiten Commit an den ersten anhängen und gemeinsame Dateien, kombinierten Nachrichtentext, Autor und Vorgänger prüfen.',
      'Fold the second commit into the first and inspect combined files, the combined message, author and parent.',
    ],
    question: ['Wie fasse ich zwei Commits und ihre Nachrichten mit squash zusammen?', 'How do I combine two commits and their messages with squash?'],
  },
  fixup: {
    title: ['Rebase: eine Korrektur mit fixup einklappen', 'Rebase: fold in a correction with fixup'],
    description: [
      'Änderungen beider Commits übernehmen, die zweite Nachricht bewusst verwerfen und die gemeinsame Dateiänderung lesen.',
      'Include both commits’ changes, deliberately discard the second message and read the combined file change.',
    ],
    question: ['Wie nehme ich eine Korrektur mit fixup in den vorherigen Commit auf?', 'How do I fold a correction into its preceding commit with fixup?'],
  },
  drop: {
    title: ['Rebase: eine lokale Änderung mit drop auslassen', 'Rebase: omit a local change with drop'],
    description: [
      'Eine Todo-Zeile auslassen, den erhaltenen Commit und den zurückgekehrten Dateiinhalt prüfen und drop von revert unterscheiden.',
      'Omit a todo line, inspect the retained commit and restored file contents and distinguish drop from revert.',
    ],
    question: ['Wie lasse ich einen lokalen Commit beim Rebase weg?', 'How do I omit a local commit during rebase?'],
  },
  reorder: {
    title: ['Rebase: unabhängige Commits umordnen', 'Rebase: reorder independent commits'],
    description: [
      'Ganze Todo-Zeilen vertauschen, neue Vorgänger und Hashes prüfen und Lizenzhinweis sowie Begrüßung ihren Autoren zuordnen.',
      'Swap complete todo lines, inspect new parents and hashes and match the license note and greeting to their authors.',
    ],
    question: ['Wie ändere ich die Reihenfolge lokaler Commits?', 'How do I change the order of local commits?'],
  },
};
function build(mode: RebaseLessonMode): TutorialChapter {
  return {
    id: 'rebase-' + mode,
    section: 'repo',
    ...copy[mode],
    keywords:
      'rebase interaktiv interactive todo pick reword squash fixup drop reorder umordnen basis parent vorgänger nachricht titel beschreibung abbrechen hash',
    steps: [
      s('scope', copy[mode].title, copy[mode].description, '[data-tutorial="graph"]', { prepare: rebaseRecipe(mode) }),
      ...rebaseStartingSteps(mode),
      ...rebaseReviewSteps(mode),
      ...rebaseResultSteps(mode),
    ],
  };
}
export const TUTORIAL_REBASE_LESSONS = (['review', 'reword', 'squash', 'fixup', 'drop', 'reorder'] as const).map(build);
