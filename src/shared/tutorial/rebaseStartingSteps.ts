import type { TutorialStep } from './types';
import type { RebaseLessonMode } from './rebaseLessonExamples';
import { rebaseStep as s, rebaseRecipe as recipe, rebaseMenu } from './rebaseLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { fileControl } from './fileLessonHelpers';
export function rebaseStartingSteps(mode: RebaseLessonMode): TutorialStep[] {
  const path = mode === 'reorder' ? 'LICENSE' : 'README.md';
  return [
    s(
      'head',
      ['main zeigt auf den vierten Commit', 'main points to the fourth commit'],
      [
        'Die beiden neuesten Commits sind lokale Arbeiten auf main. Die Reihenfolge im Graphen zeigt den neuesten oben; der Todo-Dialog wird sie später umgekehrt, vom ältesten zum neuesten, auflisten.',
        'The two newest commits are local work on main. The graph puts the newest first; the todo dialog will list them in reverse order, from oldest to newest.',
      ],
      mergeHead(4),
      { prepare: recipe(mode) },
    ),
    s(
      'publication',
      ['Prüfe die veröffentlichten Referenzen', 'Check the published references'],
      [
        'origin/main und v1.0.0 stehen auf dem zweiten Commit. Wir üben ausschließlich mit den zwei darauf folgenden lokalen Commits. Ein Rebase veröffentlicht nichts; eine später nötige Abstimmung mit anderen ersetzt er nicht.',
        'origin/main and v1.0.0 point to the second commit. We will use only the two local commits after it. A rebase publishes nothing and does not replace later coordination with collaborators.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe(mode) },
    ),
    s(
      'select',
      ['Wähle den älteren der beiden lokalen Commits', 'Select the older of the two local commits'],
      [
        'Klicke den dritten Commit an. „Interaktiver Rebase bis …“ bezieht diesen ausgewählten Commit und alle seine Nachfolger bis zum aktuellen HEAD ein.',
        'Click the third commit. “Interactive rebase through …” includes this selected commit and all its descendants through the current HEAD.',
      ],
      graphRow(3),
      { prepare: recipe(mode), completion: element(commitPanel(3)) },
    ),
    s(
      'original-message',
      ['Lies die ursprüngliche Nachricht', 'Read the original message'],
      [
        'Titel und Beschreibung gehören zum gespeicherten Commit. Behalte beide im Blick: reword ändert den Titel, squash kombiniert Nachrichten und fixup verwirft die Nachricht des eingeklappten Commits.',
        'The subject and description belong to the saved commit. Keep both in mind: reword changes the subject, squash combines messages and fixup discards the folded commit’s message.',
      ],
      '.commit-details-description',
      { prepare: recipe(mode, 'selected') },
    ),
    s(
      'source-file',
      ['Öffne die ursprüngliche Dateiänderung', 'Open the original file change'],
      [
        mode === 'reorder'
          ? 'Klicke LICENSE. Der dritte Commit ergänzt nur einen Projekthinweis; die spätere Begrüßung ist eine andere, unabhängige Änderung.'
          : 'Klicke README.md. Der ursprüngliche Diff erklärt, welche Dateiänderung zu diesem Commit gehört, unabhängig von seiner Nachricht.',
        mode === 'reorder'
          ? 'Click LICENSE. The third commit adds only a project note; the later greeting is a separate, independent change.'
          : 'Click README.md. The original diff shows which file change belongs to this commit, independently of its message.',
      ],
      commitPanel(3) + ' ' + commitFile(path),
      { prepare: recipe(mode, 'selected'), completion: element(historyViewer(3, path)) },
    ),
    s(
      'source-diff',
      ['Der Diff zeigt die Wirkung dieses Commits', 'The diff shows this commit’s effect'],
      [
        'Grüne Zeilen wurden gegenüber dem Vorgänger ergänzt, rote entfernt. Beim Rebase wird jeweils diese Änderung auf die neue Vorgängerversion angewendet; die Commit-Dateiliste allein ist kein Arbeitsentwurf.',
        'Green lines were added relative to the parent, red lines removed. Rebase applies this change to the new parent version; the commit file list itself is not a working draft.',
      ],
      historyViewer(3, path),
      { prepare: recipe(mode, 'source-diff') },
    ),
    s(
      'close-source',
      ['Schließe den gespeicherten Diff', 'Close the saved diff'],
      [
        'Schließe den Dateibetrachter mit dem Kreuz. Die gespeicherte Datei wird dadurch nicht geändert; du kehrst zum Graphen zurück.',
        'Close the file viewer with its cross. This does not edit the saved file; you return to the graph.',
      ],
      fileControl('close-file'),
      { prepare: recipe(mode, 'source-diff'), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'select-again',
      ['Wähle erneut den dritten Commit', 'Select the third commit again'],
      [
        'Die Auswahl bestimmt den Anfang des umzuschreibenden Bereichs. Klicke erneut den dritten Commit, bevor du sein Kontextmenü öffnest.',
        'The selection determines the start of the range to rewrite. Click the third commit again before opening its context menu.',
      ],
      graphRow(3),
      { prepare: recipe(mode), completion: element(commitPanel(3)) },
    ),
    s(
      'menu',
      ['Öffne das Kontextmenü der Auswahl', 'Open the selection’s context menu'],
      [
        'Öffne das Menü mit Rechtsklick oder Umschalt+F10 auf dem dritten Commit. Die Aktion gilt für diesen Commit, auch wenn main auf dem vierten steht.',
        'Open the menu with a right-click or Shift+F10 on the third commit. The action applies to this commit even though main points to the fourth.',
      ],
      graphRow(3),
      { prepare: recipe(mode, 'selected'), gesture: 'contextmenu', completion: element(rebaseMenu) },
    ),
    s(
      'open',
      ['Öffne den interaktiven Rebase', 'Open interactive rebase'],
      [
        'Wähle „Interaktiver Rebase bis …“. Der Dialog erstellt eine Todo-Zeile je Commit des ausgewählten Bereichs; der Vorgänger der Auswahl wird die unveränderte Basis.',
        'Choose “Interactive rebase through …”. The dialog creates one todo line per commit in the selected range; the selection’s parent becomes the unchanged base.',
      ],
      rebaseMenu,
      { prepare: recipe(mode, 'menu'), completion: element('[data-dialog-field="todo"] textarea') },
    ),
  ];
}
