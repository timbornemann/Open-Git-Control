import type { TutorialChapter, TutorialText } from './types';
import { rebaseStep as s } from './rebaseLessonHelpers';
import { rebasePauseRecipe } from './rebasePauseLessonHelpers';
import { rebasePauseStartingSteps } from './rebasePauseStartingSteps';
import { rebaseEditFileSteps } from './rebaseEditFileSteps';
import { rebaseEditAmendSteps } from './rebaseEditAmendSteps';
import { rebaseConflictSteps } from './rebaseConflictSteps';
import { rebasePauseResultSteps } from './rebasePauseResultSteps';
import { TUTORIAL_REBASE_ABORT } from './catalogRebaseAbort';
type Kind = 'edit' | 'staged' | 'conflict';
const copy: Record<Kind, { title: TutorialText; description: TutorialText; question: TutorialText }> = {
  edit: {
    title: ['Rebase mit edit: Datei und Nachricht bewusst ändern', 'Rebase with edit: deliberately change files and message'],
    description: [
      'Am älteren Commit pausieren, die Lizenz bearbeiten, speichern und vormerken; Amend-Felder einzeln ausfüllen und anschließend fortsetzen.',
      'Pause at an older commit, edit, save and stage the license; fill every Amend field separately and then continue.',
    ],
    question: ['Wie bearbeite ich einen älteren Commit während einer Rebase-Edit-Pause?', 'How do I edit an older commit during a rebase edit pause?'],
  },
  staged: {
    title: ['Rebase-Edit: vorgemerkte Änderungen direkt fortsetzen', 'Rebase edit: continue staged changes directly'],
    description: [
      'Eine Datei während der Pause bearbeiten und vormerken; mit Fortsetzen die bestehende Nachricht erhalten und den neu aufgebauten Verlauf prüfen.',
      'Edit and stage a file during the pause; use Continue to retain the existing message and inspect the replayed history.',
    ],
    question: [
      'Kann ich vorgemerkte Änderungen einer Rebase-Pause mit der bestehenden Nachricht übernehmen?',
      'Can I include staged changes during a rebase pause with the existing message?',
    ],
  },
  conflict: {
    title: ['Rebase-Konflikt: Seiten verstehen, lösen und fortsetzen', 'Rebase conflict: understand the sides, resolve and continue'],
    description: [
      'Eine abhängige Todo-Änderung starten, den Konflikt gezielt öffnen, aktuell und eingehend zuordnen, speichern, vormerken und den Replay abschließen.',
      'Start a dependent todo change, navigate to its conflict, identify current and incoming, save, stage and complete replay.',
    ],
    question: ['Wie löse und beende ich einen Konflikt beim interaktiven Rebase?', 'How do I resolve and finish a conflict during interactive rebase?'],
  },
};
function build(kind: Kind): TutorialChapter {
  return {
    id: 'rebase-' + kind,
    section: 'repo',
    ...copy[kind],
    keywords:
      'rebase ' +
      kind +
      ' edit pause staged vormerken index arbeitsdatei speichern amend nachricht beschreibung fortsetzen continue konflikt ours theirs aktuell eingehend',
    steps: [
      s('scope', copy[kind].title, copy[kind].description, '[data-tutorial="graph"]', { prepare: rebasePauseRecipe(kind) }),
      ...rebasePauseStartingSteps(kind),
      ...(kind === 'conflict' ? rebaseConflictSteps() : rebaseEditFileSteps(kind)),
      ...(kind === 'edit' ? rebaseEditAmendSteps() : []),
      ...rebasePauseResultSteps(kind),
    ],
  };
}
export const TUTORIAL_REBASE_PAUSES = [...(['edit', 'staged', 'conflict'] as const).map(build), TUTORIAL_REBASE_ABORT];
