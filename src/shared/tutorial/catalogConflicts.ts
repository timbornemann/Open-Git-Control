import type { TutorialChapter, TutorialCompletion } from './types';
import {
  conflictStep as s,
  conflictRecipe as seed,
  conflictControl as c,
  conflictOpen,
  conflictContent,
  conflictDraft,
  conflictResolved,
  conflictStage,
} from './conflictLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
const opened = () => seed({ stage: 'open' });
const chosen = () => seed({ stage: 'chosen' });
const saved = () => seed({ stage: 'saved' });
const resolved = () => seed({ stage: 'resolved' });
const result = (options: { commit?: boolean; diff?: boolean } = {}) => seed({ stage: 'continued', ...options });
const savedOnly: TutorialCompletion = {
  kind: 'all',
  conditions: [
    element(conflictStage('false')),
    element(c('section') + '[data-conflict-files="1"]'),
    { kind: 'working-tree', staged: [], unstaged: ['README.md'], content: [{ path: 'README.md', source: 'worktree', value: conflictContent }] },
  ],
};
export const TUTORIAL_CONFLICTS: TutorialChapter = {
  id: 'conflicts',
  section: 'repo',
  title: ['Konflikte: Inhalt wählen, speichern und Merge fortsetzen', 'Conflicts: choose content, save and continue the merge'],
  description: [
    'Untersuche einen vorbereiteten Konflikt. Übernimm eine Seite als Entwurf, speichere sie zunächst ohne Auflösung und schließe dann Datei und Merge getrennt ab.',
    'Inspect a prepared conflict. Take one side as a draft, save it without resolving first, then finish the file and the merge separately.',
  ],
  question: ['Wie löse ich einen Merge-Konflikt Schritt für Schritt?', 'How do I resolve a merge conflict step by step?'],
  keywords: 'konflikt conflict merge ours theirs aktuell eingehend speichern auflösen fortsetzen marker index stash',
  steps: [
    s(
      'stash',
      ['Ein vorbereiteter Merge mit widersprüchlichen Änderungen', 'A prepared merge with conflicting edits'],
      [
        'Beide Branches haben seit ihrer gemeinsamen Basis die README geändert. Der Versuch, sie zusammenzuführen, ist bereits vorbereitet. main bleibt am alten Commit. Eigene unfertige Arbeit würdest du vorher committen oder zwischenlagern; Stash hat eigene Lektionen.',
        'Both branches changed the README since their common base. Their attempted merge is already prepared. main remains on its old commit. You would commit or stash unfinished work beforehand; Stash has separate lessons.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'target',
      ['HEAD bleibt zunächst auf main', 'HEAD initially stays on main'],
      [
        'Dieser gespeicherte Stand ist die aktuelle Seite des Konflikts: Hallo Welt. Der fehlgeschlagene automatische Merge hat keinen neuen Commit erzeugt.',
        'This saved revision is the current side of the conflict: Hello world. The failed automatic merge created no new commit.',
      ],
      mergeHead(4),
      { prepare: seed() },
    ),
    s(
      'source',
      ['Der andere Branch begrüßt das Team', 'The other branch greets the team'],
      [
        'feature/begruessung hat eine eigene Änderung seit der gemeinsamen Basis. Seine eingehende Fassung soll diesmal übernommen werden. Der Quellbranch bleibt dabei erhalten.',
        'feature/begruessung has its own change since the common base. This time we will take its incoming version. The source branch is retained.',
      ],
      graphRow(5),
      { prepare: seed() },
    ),
    s(
      'base',
      ['Die gemeinsame Basis liegt vor beiden Änderungen', 'The common base precedes both edits'],
      [
        'Beide Entwicklungslinien beginnen hier. Git vergleicht jede Seite mit diesem gemeinsamen Stand. Änderungen am selben Textbereich benötigen deine Entscheidung.',
        'Both lines of development start here. Git compares each side with this common revision. Edits in the same text region need your decision.',
      ],
      graphRow(3),
      { prepare: seed() },
    ),
    s(
      'summary',
      ['Konflikte stehen getrennt von normalen Änderungen', 'Conflicts are separate from ordinary changes'],
      [
        'Im Staging gibt es einen eigenen Konfliktbereich. Die Kennzeichnung UU bedeutet: Beide Seiten haben diese Datei verändert. Die Anzahl der Blöcke ist etwas anderes als die Anzahl der Dateien.',
        'Staging has a separate conflict section. UU means both sides modified this file. The number of blocks differs from the number of files.',
      ],
      c('section'),
      { prepare: seed() },
    ),
    s(
      'open',
      ['Öffne README.md im Konfliktlöser', 'Open README.md in the conflict resolver'],
      [
        'Klicke auf die Konfliktdatei. Im großen Arbeitsbereich öffnet sich der Vergleich mit einem bearbeitbaren Entwurf darunter.',
        'Click the conflict file. The main area opens its comparison with an editable draft below.',
      ],
      conflictOpen,
      { prepare: seed(), completion: element(c('editor')) },
    ),
    s(
      'layout',
      ['Dateiauswahl, Vergleich und Entwurf', 'File selection, comparison and draft'],
      [
        'Links wählst du Konfliktdateien. Oben vergleichst du den gewählten Konfliktblock. Darunter steht die gesamte Datei im manuellen Editor. Eine Auswahl verändert zunächst nur diesen Entwurf.',
        'Select conflict files on the left. Compare the selected block above. The manual editor below contains the whole file. A choice initially changes only this draft.',
      ],
      c('editor'),
      { prepare: opened() },
    ),
    s(
      'ours',
      ['Aktuell bedeutet hier main', 'Current means main here'],
      [
        'Die aktuelle Version stammt vom aktiven Zielbranch main. HEAD bezeichnet dessen gespeicherten Stand. Übernehmen auf dieser Seite würde den gewählten Block auf Hallo Welt setzen.',
        'The current version comes from active target main. HEAD names its saved revision. Apply on this side would set the selected block to Hello world.',
      ],
      c('ours'),
      { prepare: opened() },
    ),
    s(
      'theirs',
      ['Eingehend stammt von feature/begruessung', 'Incoming comes from feature/begruessung'],
      [
        'Die eingehende Version ist die andere Seite dieses Merge. Hier steht Hallo Team. Diese Zuordnung gilt für den gerade ausgeführten Vorgang; prüfe immer die angezeigten Bezeichnungen.',
        'The incoming version is the other side of this merge. It says Hello team. This relationship belongs to the current operation; always check the displayed labels.',
      ],
      c('theirs'),
      { prepare: opened() },
    ),
    s(
      'markers',
      ['Die Marker begrenzen die widersprüchlichen Fassungen', 'Markers delimit the conflicting versions'],
      [
        '<<<<<<< beginnt die aktuelle Seite, ======= trennt beide Fassungen und >>>>>>> beendet die eingehende Seite. Titel und gemeinsame Zeilen außerhalb des Blocks bleiben bestehen.',
        '<<<<<<< starts the current side, ======= separates the versions and >>>>>>> ends the incoming side. The title and common lines outside the block remain.',
      ],
      c('content'),
      { prepare: opened() },
    ),
    s(
      'guard',
      ['Mit offenen Markern ist Als gelöst markieren gesperrt', 'Mark as resolved is disabled with open markers'],
      [
        'Der Konfliktlöser lässt dich die Datei erst als gelöst vormerken, wenn der Entwurf keine offenen Konfliktmarker mehr enthält. Speichern allein bleibt eine getrennte Aktion.',
        'The resolver enables marking the file as resolved only after the draft has no open conflict markers. Saving alone remains a separate action.',
      ],
      c('mark'),
      { prepare: opened() },
    ),
    s(
      'resolve',
      ['Übernimm die eingehende Fassung dieses Blocks', 'Take the incoming version of this block'],
      [
        'Klicke Übernehmen bei der eingehenden Version. Der Block wird durch die Team-Begrüßung ersetzt; der übrige Dateiinhalt bleibt bestehen.',
        'Click Apply on the incoming version. The block is replaced by the team greeting; the rest of the file remains.',
      ],
      c('take-theirs'),
      { prepare: opened(), completion: conflictDraft },
    ),
    s(
      'draft',
      ['Die Wahl ist zunächst ein ungespeicherter Entwurf', 'The choice is initially an unsaved draft'],
      [
        'Der Editor enthält jetzt die Team-Begrüßung ohne Marker. Die Beispieldatei auf dem Arbeitsbaum und der Konflikt im Index sind noch unverändert. Prüfe den vollständigen Entwurf vor dem Speichern.',
        'The editor now contains the team greeting without markers. The working file and the conflict in the index are still unchanged. Check the whole draft before saving.',
      ],
      c('content'),
      { prepare: chosen() },
    ),
    s(
      'save',
      ['Speichere zunächst nur den Dateiinhalt', 'First save only the file contents'],
      [
        'Klicke Speichern in den Editor-Aktionen. So landet die gewählte Fassung im Arbeitsbaum, ohne dass die Datei bereits als gelöst im Index markiert wird.',
        'Click Save in the editor actions. This writes the chosen version to the working tree without yet marking the file resolved in the index.',
      ],
      c('save'),
      { prepare: chosen(), completion: savedOnly },
    ),
    s(
      'still-unresolved',
      ['Gespeichert und gelöst sind verschiedene Zustände', 'Saved and resolved are different states'],
      [
        'Der Entwurf ist gespeichert und zeigt keine Marker mehr. Die Datei steht trotzdem noch als Konflikt in der Liste. Erst Als gelöst markieren übernimmt diese Fassung in den Index.',
        'The draft is saved and has no markers. The file still appears as a conflict in the list. Mark as resolved is what copies this version into the index.',
      ],
      c('editor'),
      { prepare: saved() },
    ),
    s(
      'mark-resolved',
      ['Markiere die gespeicherte Datei als gelöst', 'Mark the saved file as resolved'],
      [
        'Klicke Als gelöst markieren. Der Dateiinhalt wird geprüft und vorgemerkt. Sobald keine Konfliktdatei mehr offen ist, kehrt die Ansicht zum Graphen zurück.',
        'Click Mark as resolved. The file contents are checked and staged. Once no conflict file remains, the view returns to the graph.',
      ],
      c('mark'),
      { prepare: saved(), completion: conflictResolved },
    ),
    s(
      'index',
      ['Die gelöste Team-Begrüßung ist jetzt vorgemerkt', 'The resolved team greeting is now staged'],
      [
        'README.md steht unter Vorgemerkte Änderungen. Sie unterscheidet sich vom bisherigen main, wurde aber noch nicht als neuer Commit gespeichert.',
        'README.md is in Staged changes. It differs from the old main but has not yet been saved as a new commit.',
      ],
      '[data-tutorial="staged-files"]',
      { prepare: resolved() },
    ),
    s(
      'operation',
      ['Der Merge bleibt nach der Dateiauflösung aktiv', 'The merge stays active after resolving the file'],
      [
        'Die Schaltflächen Fortsetzen und Abbrechen gehören zum gesamten Merge. Es gibt keine offene Konfliktdatei mehr, aber beide Entwicklungslinien sind noch nicht durch einen Commit verbunden.',
        'Continue and Abort belong to the whole merge. No conflict file remains, but the two lines of development have not yet been joined by a commit.',
      ],
      c('section'),
      { prepare: resolved() },
    ),
    s(
      'continue',
      ['Schließe den Merge mit Fortsetzen ab', 'Finish the merge with Continue'],
      [
        'Klicke beim Merge auf Fortsetzen. Die App speichert den gelösten Index als Merge-Commit mit beiden bisherigen Branch-Spitzen als Vorgänger.',
        'Click Continue for the merge. The app saves the resolved index as a merge commit with both previous branch tips as parents.',
      ],
      c('continue'),
      { prepare: resolved(), completion: element(mergeHead(6)) },
    ),
    s(
      'parents',
      ['Der neue Commit verbindet beide Entwicklungslinien', 'The new commit joins both lines of development'],
      [
        'main und HEAD stehen jetzt am sechsten Commit. Er besitzt zwei Vorgänger: den bisherigen main und feature/begruessung. Der Quellbranch bleibt an seinem eigenen Commit.',
        'main and HEAD now point at the sixth commit. It has two parents: the previous main and feature/begruessung. The source branch stays at its own commit.',
      ],
      mergeHead(6),
      { prepare: result() },
    ),
    s(
      'select-commit',
      ['Wähle den abgeschlossenen Merge', 'Select the completed merge'],
      [
        'Klicke die neue Zeile im Graphen. Kontrolliere anschließend den tatsächlichen Unterschied zum ersten Vorgänger, dem bisherigen main.',
        'Click the new graph row. Then inspect the actual difference from its first parent, the old main.',
      ],
      graphRow(6),
      { prepare: result(), completion: element(commitPanel(6)) },
    ),
    s(
      'comparison',
      ['Die Dateiliste zeigt die endgültige Auflösung', 'The file list shows the final resolution'],
      [
        'Hier erscheint README.md, weil der gespeicherte Merge gegenüber main die Team-Begrüßung enthält. Das ist der endgültige Dateiinhalt nach deiner Entscheidung.',
        'README.md appears because the saved merge contains the team greeting relative to main. This is the final file content after your choice.',
      ],
      commitPanel(6),
      { prepare: result({ commit: true }) },
    ),
    s(
      'open-diff',
      ['Öffne den gespeicherten README-Diff', 'Open the saved README diff'],
      [
        'Klicke README.md im Commit-Inspektor. Der Viewer zeigt den gespeicherten Merge, unabhängig von späteren Arbeitsdateien.',
        'Click README.md in the commit inspector. The viewer shows the saved merge independently of later working files.',
      ],
      commitPanel(6) + ' ' + commitFile(),
      { prepare: result({ commit: true }), completion: element(historyViewer(6)) },
    ),
    s(
      'read-diff',
      ['Aus Hallo Welt wurde Hallo Team', 'Hello world became Hello team'],
      [
        'Rot zeigt die bisherige Welt-Begrüßung, Grün die übernommene Team-Begrüßung. Es sind keine Konfliktmarker im gespeicherten Ergebnis enthalten.',
        'Red shows the old world greeting, green the accepted team greeting. The saved result contains no conflict markers.',
      ],
      historyViewer(6),
      { prepare: result({ diff: true }) },
    ),
    s(
      'close-diff',
      ['Schließe den Viewer nach der Prüfung', 'Close the viewer after inspecting'],
      [
        'Schließe den Dateivergleich und kehre zum Verlauf zurück. Der Merge und der geprüfte Dateiinhalt bleiben gespeichert.',
        'Close the file comparison and return to history. The merge and its checked file contents remain saved.',
      ],
      fileControl('close-file'),
      { prepare: result({ diff: true }), completion: { kind: 'absent', selector: historyViewer(6) } },
    ),
    s(
      'finish',
      ['Datei und Merge sind getrennt abgeschlossen', 'The file and merge are finished separately'],
      [
        'Du hast beide Seiten geprüft, einen Entwurf gewählt, den Unterschied zwischen Speichern und Auflösen ausprobiert und erst danach den Merge fortgesetzt. Weitere Lektionen behandeln andere Entscheidungen und den Abbruch.',
        'You checked both sides, chose a draft, tried the difference between saving and resolving, and only then continued the merge. Other lessons cover different choices and aborting.',
      ],
      '[data-tutorial="graph"]',
      { prepare: result() },
    ),
  ],
};
