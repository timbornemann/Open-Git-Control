import type { TutorialStep } from './types';
import { rebaseStep as s } from './rebaseLessonHelpers';
import { rebasePauseRecipe as recipe, rebaseControl } from './rebasePauseLessonHelpers';
import { conflictControl as c, conflictStage } from './conflictLessonHelpers';
import { element } from './mergeLessonHelpers';
import { tree } from './stagingLessonHelpers';
const incoming = { example: 'history-readme' as const, version: 'latest' as const };
export function rebaseConflictSteps(): TutorialStep[] {
  return [
    s(
      'conflict-open',
      ['Öffne den Konflikt der README', 'Open the README conflict'],
      [
        'Klicke die Konfliktdatei README.md. Diese Rebase-Aktion öffnet den Konflikteditor nicht automatisch; der Navigationsweg gehört zur Übung.',
        'Click conflicted README.md. This rebase action does not automatically open the conflict editor; navigating to it is part of the exercise.',
      ],
      c('open') + '[data-conflict-path="README.md"]',
      { prepare: recipe('conflict', 'staging'), completion: element(c('editor')) },
    ),
    s(
      'conflict-ours',
      ['Aktuell ist der neu aufgebaute Stand auf Basis 2', 'Current is the replayed state at base 2'],
      [
        'Aktuell/ours enthält hier die kleine Projektbeschreibung von Basis 2. Bei diesem Rebase bezeichnet es den neu aufgebauten Stand; main bewahrt währenddessen noch den früheren vierten Commit.',
        'Current/ours contains base 2’s small project description here. In this rebase it means the replayed state; meanwhile main still retains the earlier fourth commit.',
      ],
      c('ours'),
      { prepare: recipe('conflict', 'conflicts') },
    ),
    s(
      'conflict-theirs',
      ['Eingehend gehört zum erneut angewendeten Patch', 'Incoming belongs to the replayed patch'],
      [
        'Eingehend/theirs enthält die Begrüßung des vierten Commits. Der ausgelassene dritte Commit war sein ursprünglicher Vorgänger. Dieser fehlende Dokumentationsstand erklärt den Konflikt.',
        'Incoming/theirs contains the fourth commit’s greeting. Omitted commit 3 was its original parent. That missing documentation revision explains the conflict.',
      ],
      c('theirs'),
      { prepare: recipe('conflict', 'conflicts') },
    ),
    s(
      'conflict-markers',
      ['Die Arbeitsdatei enthält noch Konfliktmarker', 'The working file still contains conflict markers'],
      [
        'Der manuelle Text enthält beide widersprüchlichen Seiten. Diese Marker müssen aus der gewünschten Lösung verschwinden; sie sind noch kein fertiger Commit-Inhalt.',
        'The manual text contains both conflicting sides. These markers must be removed from the intended resolution; they are not finished commit contents.',
      ],
      c('content'),
      { prepare: recipe('conflict', 'conflicts') },
    ),
    s(
      'conflict-choose',
      ['Übernimm die eingehende Begrüßung', 'Take the incoming greeting'],
      [
        'Klicke Übernehmen auf der eingehenden Seite. Das lädt die Begrüßung zunächst nur als Editorentwurf.',
        'Click Apply on the incoming side. This initially loads the greeting only as an editor draft.',
      ],
      c('take-theirs'),
      { prepare: recipe('conflict', 'conflicts'), completion: { kind: 'value', selector: c('content'), value: incoming } },
    ),
    s(
      'conflict-draft',
      ['Der neue Entwurf ist noch nicht gespeichert', 'The new draft is not saved yet'],
      [
        'Der Editor enthält jetzt die gewünschte Begrüßung ohne Marker. Das Sternchen beziehungsweise die Entwurfsanzeige zeigt noch ungespeicherte Änderungen.',
        'The editor now contains the intended greeting without markers. Its draft indicator still shows unsaved changes.',
      ],
      conflictStage('true'),
      { prepare: recipe('conflict', 'chosen') },
    ),
    s(
      'conflict-save-purpose',
      ['Speichern schreibt zuerst nur die Arbeitsdatei', 'Save first writes only the working file'],
      [
        'Speichern und Als gelöst markieren sind getrennte Aktionen. Eine gespeicherte Arbeitsdatei bleibt so lange ein offener Indexkonflikt, bis du ihre Lösung ausdrücklich vormerkst.',
        'Save and Mark resolved are separate actions. A saved working file remains an unresolved index conflict until you explicitly stage its resolution.',
      ],
      c('save'),
      { prepare: recipe('conflict', 'chosen') },
    ),
    s(
      'conflict-save',
      ['Speichere die gewünschte Lösung', 'Save the intended resolution'],
      [
        'Klicke Speichern. Der schon konfliktfreie App-Patch ist bereits vorgemerkt; README bleibt zunächst als ungelöste Datei erfasst.',
        'Click Save. The already clean app patch is staged; README initially remains recorded as unresolved.',
      ],
      c('save'),
      {
        prepare: recipe('conflict', 'chosen'),
        completion: {
          kind: 'all',
          conditions: [
            element(conflictStage('false')),
            element(c('section') + '[data-conflict-files="1"]'),
            tree(['src/app.ts'], ['README.md'], [], { content: [{ path: 'README.md', source: 'worktree', value: incoming }] }),
          ],
        },
      },
    ),
    s(
      'conflict-saved',
      ['Die Arbeitslösung ist gespeichert, der Vorgang wartet', 'The working resolution is saved and the operation waits'],
      [
        'Die README enthält die Begrüßung. HEAD bleibt auf Basis 2 und main auf dem ursprünglichen vierten Commit; noch wurde kein Ergebniscommit gespeichert.',
        'README contains the greeting. HEAD stays at base 2 and main at the original fourth commit; no result commit has been saved yet.',
      ],
      c('editor'),
      { prepare: recipe('conflict', 'resolution-saved') },
    ),
    s(
      'conflict-mark-purpose',
      ['Markieren übernimmt die Lösung in den Index', 'Marking stages the resolution'],
      [
        'Prüfe die gespeicherten Zeilen. Als gelöst markieren wählt genau diese Fassung für den späteren Rebase-Commit aus.',
        'Review the saved lines. Mark resolved selects precisely these contents for the later rebase commit.',
      ],
      c('mark'),
      { prepare: recipe('conflict', 'resolution-saved') },
    ),
    s(
      'conflict-mark',
      ['Markiere README als gelöst', 'Mark README resolved'],
      [
        'Klicke Als gelöst markieren. Danach liegen README und die automatisch übernommene App-Änderung gemeinsam im Index.',
        'Click Mark resolved. README and the automatically replayed app change are then staged together.',
      ],
      c('mark'),
      {
        prepare: recipe('conflict', 'resolution-saved'),
        completion: {
          kind: 'all',
          conditions: [
            { kind: 'absent', selector: c('editor') },
            element(rebaseControl('continue')),
            tree(['README.md', 'src/app.ts'], [], [], { content: [{ path: 'README.md', source: 'index', value: incoming }] }),
          ],
        },
      },
    ),
    s(
      'conflict-resolved',
      ['Gelöste Dateien beenden den Rebase noch nicht', 'Resolved files do not finish the rebase'],
      [
        'Die Konfliktliste ist leer, die Rebase-Aktionsgruppe bleibt erhalten. Fortsetzen speichert erst jetzt den aufgelösten Patch und beendet den Neuaufbau.',
        'The conflict list is empty and the Rebase action group remains. Only Continue now saves the resolved patch and finishes replay.',
      ],
      rebaseControl('actions'),
      { prepare: recipe('conflict', 'resolved') },
    ),
  ];
}
