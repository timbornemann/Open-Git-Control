import type { TutorialStep } from './types';
import { rebaseStep as s } from './rebaseLessonHelpers';
import { rebasePauseRecipe as recipe, rebaseControl } from './rebasePauseLessonHelpers';
import { REBASE_LICENSE_EDIT, type RebasePauseKind } from './rebasePauseExamples';
import { fileControl as c, fileRow, fileTab } from './fileLessonHelpers';
import { historyViewer } from './historyLessonHelpers';
import { stagingRow, tree } from './stagingLessonHelpers';
import { element } from './mergeLessonHelpers';
export function rebaseEditFileSteps(kind: RebasePauseKind): TutorialStep[] {
  const viewer = historyViewer('unstaged', 'LICENSE');
  return [
    s(
      'edit-tree',
      ['Wechsle zum Working Directory', 'Switch to the working directory'],
      [
        'Öffne Working Directory. Die Dateiansicht zeigt den übernommenen dritten Stand der Edit-Pause; die spätere Begrüßung wird erst beim Fortsetzen wieder angewendet.',
        'Open Working Directory. The file view shows the third revision at the edit pause; the later greeting is replayed only when you continue.',
      ],
      c('open-files'),
      { prepare: recipe(kind, 'staging'), completion: element(c('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'edit-open',
      ['Öffne LICENSE zum Bearbeiten', 'Open LICENSE for editing'],
      [
        'Klicke LICENSE. Der Projekthinweis stammt aus Sams drittem Commit. Wir ergänzen eine unabhängige Zeile, ohne den späteren Begrüßungspatch zu überschreiben.',
        'Click LICENSE. Its project note belongs to Sam’s third commit. We will add an independent line without overwriting the later greeting patch.',
      ],
      fileRow('LICENSE'),
      { prepare: recipe(kind, 'tree'), completion: element(viewer) },
    ),
    s(
      'edit-text',
      ['Wähle die Textansicht', 'Select the Text view'],
      [
        'Wähle Text. Du bearbeitest die Arbeitsdatei der Pause; die gespeicherte Commit-Datei und der Index bleiben bis zu den nächsten Aktionen getrennt.',
        'Choose Text. You are editing the paused working file; the saved commit file and index stay separate until later actions.',
      ],
      fileTab('text'),
      { prepare: recipe(kind, 'file'), completion: element(viewer + '[data-tab="text"]') },
    ),
    s(
      'edit-file',
      ['Ergänze die gezielte Korrektur', 'Add the intended correction'],
      [
        'Füge am Ende eine Leerzeile und „Edit-Übung: Hinweis präzisiert.“ hinzu. Behalte alle vorhandenen Lizenzzeilen und den Projekthinweis. Speichere zunächst noch nicht.',
        'Append a blank line and “Edit practice: clarified the note.” Keep all existing license lines and the project note. Do not save yet.',
      ],
      c('file-editor'),
      { prepare: recipe(kind, 'file'), completion: { kind: 'value', selector: c('file-editor'), value: REBASE_LICENSE_EDIT } },
    ),
    s(
      'edit-draft',
      ['Der Stern ist bisher nur ein Editorentwurf', 'The asterisk still marks only an editor draft'],
      [
        'Die Ergänzung steht bisher nur im Editor. Weder Rebase-Fortsetzen noch ein Commit darf voraussetzen, dass ein solcher ungespeicherter Entwurf bereits eine Git-Dateiänderung ist.',
        'The addition is still only in the editor. Neither rebase continuation nor a commit can assume that this unsaved draft is already a Git file change.',
      ],
      viewer + '[data-dirty="true"]',
      { prepare: recipe(kind, 'draft') },
    ),
    s(
      'edit-save',
      ['Speichere die Arbeitsdatei', 'Save the working file'],
      [
        'Klicke Speichern. Die gespeicherte Ergänzung erscheint anschließend unter Änderungen und ist noch nicht im Index.',
        'Click Save. The saved addition appears under Changes and is not staged yet.',
      ],
      c('save-file'),
      {
        prepare: recipe(kind, 'draft'),
        completion: tree([], ['LICENSE'], [], { content: [{ path: 'LICENSE', source: 'worktree', value: REBASE_LICENSE_EDIT }] }),
      },
    ),
    s(
      'edit-saved',
      ['Speichern allein setzt den Rebase nicht fort', 'Saving alone does not continue the rebase'],
      [
        'Der Stern ist verschwunden. Die Datei wurde gespeichert, doch der laufende Rebase wartet weiterhin auf Vormerken und Fortsetzen beziehungsweise dein ausdrückliches Amend.',
        'The asterisk is gone. The file was saved, but the pending rebase still awaits staging and continuation or your explicit amend.',
      ],
      viewer + '[data-dirty="false"]',
      { prepare: recipe(kind, 'saved') },
    ),
    s(
      'edit-close',
      ['Schließe die gespeicherte Datei', 'Close the saved file'],
      ['Schließe den Dateibetrachter. Die gespeicherte Arbeitsänderung bleibt vorhanden.', 'Close the file viewer. The saved working change remains.'],
      c('close-file'),
      { prepare: recipe(kind, 'saved'), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'edit-staging',
      ['Kehre zur Staging Area zurück', 'Return to the staging area'],
      [
        'Wähle Staging Area. LICENSE steht unter Änderungen; die Rebase-Aktionsgruppe ist weiterhin sichtbar.',
        'Choose Staging Area. LICENSE appears under Changes; the Rebase action group is still visible.',
      ],
      c('open-staging'),
      {
        prepare: recipe(kind, 'changed'),
        completion: { kind: 'all', conditions: [element(c('open-staging') + '[aria-pressed="true"]'), element(stagingRow('unstaged', 'LICENSE'))] },
      },
    ),
    s(
      'edit-index',
      ['Merke genau die korrigierte Lizenz vor', 'Stage precisely the corrected license'],
      [
        'Klicke das Plus an LICENSE. Nur die gespeicherte Fassung gelangt in den Index; dadurch wurde noch kein Commit ersetzt und der Rebase noch nicht abgeschlossen.',
        'Click the plus beside LICENSE. Only the saved contents enter the index; this has not replaced a commit or finished the rebase.',
      ],
      stagingRow('unstaged', 'LICENSE') + ' ' + c('stage-file'),
      {
        prepare: recipe(kind, 'changed'),
        completion: tree(['LICENSE'], [], [], { content: [{ path: 'LICENSE', source: 'index', value: REBASE_LICENSE_EDIT }] }),
      },
    ),
    s(
      'edit-staged',
      ['Der Index enthält die geplante Korrektur', 'The index contains the intended correction'],
      [
        kind === 'edit'
          ? 'Die vorgemerkte Ergänzung soll zusammen mit einer bewusst geänderten Nachricht den übernommenen Commit ersetzen. Aktiviere dazu im nächsten Schritt Amend.'
          : 'Die Ergänzung ist vorgemerkt. In dieser Variante verwenden wir Fortsetzen direkt: Git übernimmt die vorgemerkte Korrektur mit der bestehenden Nachricht des angehaltenen Commits.',
        kind === 'edit'
          ? 'The staged addition should replace the replayed commit together with a deliberately edited message. Enable Amend in the next step.'
          : 'The addition is staged. In this variant we use Continue directly: Git includes the staged correction with the stopped commit’s existing message.',
      ],
      stagingRow('staged', 'LICENSE'),
      { prepare: recipe(kind, 'staged') },
    ),
    ...(kind === 'staged'
      ? [
          s(
            'staged-message',
            ['Die bisherige Commit-Nachricht wird weiterverwendet', 'The existing commit message is reused'],
            [
              'Die normalen neuen Commit-Felder sind für diesen Fortsetzen-Aufruf nicht erforderlich. Die Nachricht des angehaltenen Lizenzcommits bleibt erhalten; eine eigene neue Nachricht braucht ein ausdrückliches Amend.',
              'The normal new-commit fields are not required for this Continue action. The stopped license commit keeps its message; a deliberately new message needs an explicit amend.',
            ],
            rebaseControl('continue'),
            { prepare: recipe(kind, 'staged') },
          ),
        ]
      : []),
  ];
}
