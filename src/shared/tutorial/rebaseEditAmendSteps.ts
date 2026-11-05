import type { TutorialStep } from './types';
import { rebaseStep as s } from './rebaseLessonHelpers';
import { rebasePauseRecipe as recipe } from './rebasePauseLessonHelpers';
import { REBASE_EDIT_MESSAGE, REBASE_EDIT_DESCRIPTION, rebaseOriginalMain } from './rebasePauseExamples';
import { REBASE_LICENSE_TITLE } from './rebaseLessonExamples';
import { mergeField as field, mergeHead } from './mergeLessonHelpers';
export function rebaseEditAmendSteps(): TutorialStep[] {
  const seed = (form = 0) => recipe('edit', 'amend', form);
  return [
    s(
      'edit-amend',
      ['Aktiviere Amend am angehaltenen Commit', 'Enable Amend for the stopped commit'],
      [
        'Aktiviere Amend. Warte auf die übernommene Nachricht des aktuellen losgelösten HEAD, nicht des noch unveränderten main-Branches.',
        'Enable Amend. Wait for the current detached HEAD’s message to load, rather than the still unchanged main branch’s message.',
      ],
      field('amend'),
      {
        prepare: recipe('edit', 'staged'),
        completion: {
          kind: 'all',
          conditions: [
            { kind: 'value', selector: field('amend') + ' input', value: ['true', 'true'] },
            {
              kind: 'value',
              selector: field('message'),
              value: REBASE_LICENSE_TITLE.map((value) => value.replace(/^docs: /, '')) as unknown as readonly [string, string],
            },
          ],
        },
      },
    ),
    s(
      'edit-type',
      ['docs ist bereits aus der alten Nachricht geladen', 'docs was loaded from the old message'],
      [
        'Der ursprüngliche Lizenzhinweis war als docs klassifiziert. Dieser Typ bleibt passend; er ist ein Teil des Titels und verändert selbst keinen Dateiinhalt.',
        'The original license note was classified as docs. This type still fits; it is part of the subject and does not change any file contents itself.',
      ],
      field('type'),
      { prepare: seed() },
    ),
    s(
      'edit-prefix',
      ['Setze den Bereich lernen', 'Set the scope to lernen'],
      [
        'Trage lernen als Präfix/Bereich ein. Die Vorschau wird daraus docs(lernen) bilden; ein Branchname wird dadurch nicht geändert.',
        'Enter lernen as the prefix/scope. The preview will form docs(lernen); this does not rename any branch.',
      ],
      field('prefix'),
      { prepare: seed(), completion: { kind: 'value', selector: field('prefix'), value: ['lernen', 'lernen'] } },
    ),
    s(
      'edit-message',
      ['Formuliere die präzisierte Nachricht', 'Write the clarified message'],
      [
        'Ersetze die kurze Nachricht durch „Projekthinweis präzisieren“. Typ und Bereich bleiben in ihren eigenen Feldern.',
        'Replace the short message with “clarify the project note”. Type and scope remain in their separate fields.',
      ],
      field('message'),
      { prepare: seed(1), completion: { kind: 'value', selector: field('message'), value: REBASE_EDIT_MESSAGE } },
    ),
    s(
      'edit-description',
      ['Erkläre die Bearbeitung der Pause', 'Explain the edit made during the pause'],
      [
        'Schreibe „Den vorhandenen Projekthinweis während der Edit-Pause ergänzen.“ als neue Beschreibung. Du ersetzt damit bewusst die bisherige Beschreibung dieses Commits.',
        'Enter “Extend the existing project note during the edit pause.” as the new description. This deliberately replaces this commit’s existing body.',
      ],
      field('description'),
      { prepare: seed(2), completion: { kind: 'value', selector: field('description'), value: REBASE_EDIT_DESCRIPTION } },
    ),
    s(
      'edit-signoff',
      ['Ein Signoff wäre eine zusätzliche bewusste Angabe', 'A signoff would be an additional deliberate statement'],
      [
        'Lass Signoff für diese Übung ausgeschaltet. Der ursprüngliche Autor bleibt Sam; ein optionaler Signoff würde zusätzlich deinen Namen im Nachrichtentext dokumentieren.',
        'Leave Signoff off for this exercise. Sam remains the original author; an optional signoff would additionally record your name in the message body.',
      ],
      field('signoff'),
      { prepare: seed(3) },
    ),
    s(
      'edit-amend-review',
      ['Prüfe Nachricht, Index und Amend vor dem Commit', 'Review the message, index and Amend before committing'],
      [
        'Amend ist aktiv, LICENSE liegt im Index und der neue Titel lautet docs(lernen): Projekthinweis präzisieren. Der Rebase ist noch nicht beendet; zunächst wird nur sein angehaltener Commit ersetzt.',
        'Amend is enabled, LICENSE is staged and the new subject is docs(lernen): clarify the project note. The rebase is not finished; first only its stopped commit is replaced.',
      ],
      '.staging-commit-area',
      { prepare: seed(3) },
    ),
    s(
      'edit-commit',
      ['Speichere das ausdrückliche Amend', 'Save the explicit amend'],
      [
        'Klicke Commit. Der angehaltene dritte Commit wird durch den neuen Commit 5 ersetzt. main bleibt währenddessen noch auf dem ursprünglichen vierten Commit.',
        'Click Commit. The stopped third commit is replaced by new commit 5. Meanwhile main still points to the original fourth commit.',
      ],
      '.staging-commit-btn',
      { prepare: seed(3), action: 'committed', completion: { kind: 'element', selector: mergeHead(5) } },
    ),
    s(
      'edit-amended',
      ['HEAD ist neu, der Rebase wartet weiter', 'HEAD is new and rebase is still waiting'],
      [
        'HEAD zeigt nun auf das korrigierte Objekt 5 mit Sams Urheberschaft. Die zweite Todo-Zeile wurde noch nicht angewendet.',
        'HEAD now points to corrected object 5 with Sam’s authorship. The second todo line has not been applied yet.',
      ],
      mergeHead(5),
      { prepare: recipe('edit', 'amended') },
    ),
    s(
      'edit-main-retained',
      ['main wird erst nach Fortsetzen aktualisiert', 'main moves only after continuation'],
      [
        'main ist weiterhin am ursprünglichen vierten Commit. Erst der erfolgreiche Rest des Rebase verschiebt diesen Branch auf das neue Gesamtergebnis.',
        'main still points to the original fourth commit. Only the successful remainder of the rebase moves this branch to the new overall result.',
      ],
      rebaseOriginalMain,
      { prepare: recipe('edit', 'amended') },
    ),
  ];
}
