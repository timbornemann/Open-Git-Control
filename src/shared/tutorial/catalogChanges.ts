import type { TutorialChapter, TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';

const scene = (id: string, title: TutorialText, text: TutorialText, target = '[data-tutorial="staging"]', extra: Partial<TutorialStep> = {}) =>
  step(id, title, text, 'repo', target, { scenario: 'mixed', continue: true, ...extra });
const readme = (section: string) => `[data-tutorial="${section}-files"] .staging-file-row[aria-label="README.md"]`;
const element = (selector: string) => ({ kind: 'element' as const, selector });

export const TUTORIAL_CHANGES_LESSON: TutorialChapter = {
  id: 'changes',
  section: 'repo',
  title: ['Dateiänderungen, Diff und Staging', 'File changes, diff and staging'],
  description: [
    'Die drei Dateibereiche verstehen, README vergleichen, Ansichten wechseln, gezielt vormerken und wieder aus dem Index nehmen.',
    'Understand the three file sections, compare README, switch views, stage a file and remove it from the index.',
  ],
  question: ['Was sind Änderungen, neue Dateien und Staging?', 'What are changes, untracked files and staging?'],
  keywords: 'staging stage diff vergleich untracked neue dateien änderungen index hinzufügen vormerken unstage zeilen',
  steps: [
    scene(
      'overview',
      ['Drei Zustände für deine Dateien', 'Three states for your files'],
      [
        'Im Arbeitsordner bearbeitest du Dateien. Der Index enthält die ausgewählte Version für den nächsten Commit. Die Geschichte enthält bereits gespeicherte Commits. In der Übung gibt es eine geänderte README, eine neue notes.txt und eine bereits vorgemerkte src/app.ts.',
        'Edit files in the working directory. The index holds selected versions for the next commit. History contains saved commits. Practice has a changed README, a new notes.txt and an already staged src/app.ts.',
      ],
      '[data-tutorial="staging"]',
      { continue: false },
    ),
    scene(
      'unstaged',
      ['Änderungen: bekannte Dateien im Arbeitsordner', 'Changes: known files in the working directory'],
      [
        'Hier stehen bereits bekannte Dateien, deren Arbeitsstand vom Index abweicht. README.md wurde bearbeitet. Das M kennzeichnet eine Änderung. Ein Klick auf den Dateinamen öffnet den Vergleich; das Plus merkt die Datei vor. Das X verwirft Änderungen und ist eine andere Aktion.',
        'This section contains tracked files whose working contents differ from the index. README.md was edited; M marks a modification. Click the name to compare, use plus to stage. X discards changes and is a different action.',
      ],
      '[data-tutorial="unstaged-files"]',
    ),
    scene(
      'untracked',
      ['Neue Dateien: Git kennt sie noch nicht', 'Untracked files: Git does not know them yet'],
      [
        'notes.txt liegt im Projektordner, gehört aber noch zu keinem Commit. Neue Dateien werden nicht automatisch aufgenommen. Erst Vormerken mit Plus entscheidet, dass eine Datei in den nächsten Commit soll. Ignorierte Dateien erscheinen hier normalerweise nicht.',
        'notes.txt exists in the project folder but belongs to no commit yet. New files are not included automatically. Staging with plus selects a file for the next commit. Ignored files normally do not appear here.',
      ],
      '[data-tutorial="untracked-files"]',
    ),
    scene(
      'index',
      ['Vorgemerkt: die Auswahl für den nächsten Commit', 'Staged: the selection for the next commit'],
      [
        'src/app.ts ist schon im Index. Nur vorgemerkte Inhalte werden mit einem normalen Commit gespeichert. Minus nimmt eine Datei wieder aus der Auswahl, ohne die Bearbeitung im Arbeitsordner zu löschen. In dieser Lektion bleibt src/app.ts als Vergleich erhalten.',
        'src/app.ts is already in the index. A normal commit saves only staged contents. Minus removes a file from the selection without deleting its working changes. We keep src/app.ts here as a comparison throughout this lesson.',
      ],
      '[data-tutorial="staged-files"]',
    ),
    scene(
      'open-diff',
      ['Öffne genau README.md', 'Open README.md specifically'],
      [
        'Klicke im Bereich Änderungen auf den Namen README.md. Klicke auf den Dateinamen, damit du zuerst prüfen kannst, was du später vormerkst. Plus oder X sind für diesen Schritt noch nicht nötig.',
        'Click the README.md name in Changes. Click the name so you can inspect what you will stage later. Plus and X are not needed for this step.',
      ],
      readme('unstaged'),
      { action: 'inspect:diff' },
    ),
    scene(
      'diff-viewer',
      ['Was vergleicht dieser Diff?', 'What does this diff compare?'],
      [
        'Ein Diff zeigt Unterschiede zwischen zwei Dateiständen. Hier vergleichst du die bisherige Version mit deiner Arbeitsdatei. Unveränderte Zeilen geben Kontext. Zeilennummern helfen, Änderungen in beiden Versionen zuzuordnen. Ein Diff ist zunächst eine Ansicht, kein Commit.',
        'A diff shows differences between two file versions. Here you compare the previous version with your working file. Unchanged lines provide context. Line numbers locate changes in both versions. Viewing a diff does not create a commit.',
      ],
      '.file-viewer',
      { openView: 'diff' },
    ),
    scene(
      'removed',
      ['Rot und Minus: was entfernt wurde', 'Red and minus: what was removed'],
      [
        'Die Zeile Hallo Welt! trägt ein Minus und ist rot markiert: Sie stammt aus dem bisherigen Stand und wurde ersetzt. Minus ist hier ein Kennzeichen im Vergleich, keine Schaltfläche. Daneben erkennst du, an welcher Stelle die Zeile vorher stand.',
        'The Hallo Welt! line has a minus and a red highlight: it belongs to the previous version and was replaced. Here minus is a diff marker, not a button. The line numbers show its previous position.',
      ],
      '.file-viewer-diff',
      { openView: 'diff' },
    ),
    scene(
      'added',
      ['Grün und Plus: was hinzugekommen ist', 'Green and plus: what was added'],
      [
        'Willkommen in deinem Lernprojekt! trägt ein Plus und ist grün markiert. Diese Zeile steht im neuen Inhalt. Prüfe sowohl entfernte als auch hinzugefügte Zeilen. So erkennst du versehentliche Löschungen ebenso wie die beabsichtigte Änderung.',
        'Willkommen in deinem Lernprojekt! has a plus and a green highlight. This line belongs to the new contents. Check removed and added lines so you notice accidental deletions as well as the intended change.',
      ],
      '.file-viewer-diff',
      { openView: 'diff' },
    ),
    scene(
      'split',
      ['Zeige beide Versionen nebeneinander', 'Show both versions side by side'],
      [
        'Wähle in der Diff-Werkzeugleiste die geteilte Ansicht. Links siehst du den alten, rechts den neuen Stand. Die Inhalte bleiben gleich; nur die Darstellung ändert sich. Das hilft bei längeren Zeilen und zusammengehörenden Änderungen.',
        'Choose the side-by-side view in the diff toolbar. The old version is on the left and the new one on the right. The contents stay the same; only the presentation changes. This helps with long lines and related changes.',
      ],
      '[data-tutorial="diff-split"]',
      { openView: 'diff', completion: element('[data-tutorial="diff-split"].active:not(:disabled)') },
    ),
    scene(
      'unified',
      ['Kehre zur gemeinsamen Ansicht zurück', 'Return to the unified view'],
      [
        'Wähle wieder die gemeinsame Ansicht. Entfernte und neue Zeilen stehen untereinander. Das spart Platz in schmalen Fenstern. Du kannst beide Darstellungen je nach Aufgabe verwenden; keine davon verändert die Datei.',
        'Choose the unified view again. Removed and added lines appear below each other, saving space in narrow windows. Use either presentation as needed; neither changes the file.',
      ],
      '[data-tutorial="diff-unified"]',
      {
        openView: 'diff',
        prepare: { click: ['[data-tutorial="diff-split"]:not(:disabled)'] },
        completion: element('[data-tutorial="diff-unified"].active:not(:disabled)'),
      },
    ),
    scene(
      'close-diff',
      ['Schließe den Diff-Viewer', 'Close the diff viewer'],
      [
        'Du hast die Änderung geprüft. Schließe den Viewer über das X oben rechts. Dadurch wird keine Datei gelöscht und keine Änderung verworfen. Du kehrst zur Übersicht zurück, um README.md gezielt vorzumerken.',
        'You have checked the change. Close the viewer with the X in the top right. Closing does not delete files or discard changes. Return to the workspace to stage README.md specifically.',
      ],
      '.file-viewer',
      { openView: 'diff', action: 'diff-closed' },
    ),
    scene(
      'stage',
      ['Merke nur README.md vor', 'Stage only README.md'],
      [
        'Klicke auf das kleine Plus in der Zeile README.md im Bereich Änderungen. Dadurch wird genau diese Dateiversion in den Index übernommen. notes.txt bleibt neu und unvorgemerkt; src/app.ts bleibt wie vorher vorgemerkt.',
        'Click the small plus in the README.md row in Changes. This copies that file version into the index. notes.txt remains untracked and unstaged; src/app.ts remains staged as before.',
      ],
      readme('unstaged'),
      { completion: element(readme('staged')) },
    ),
    scene(
      'staged',
      ['Die Datei ist in den Index gewandert', 'The file has moved into the index'],
      [
        'README.md steht jetzt gemeinsam mit src/app.ts im Bereich Vorgemerkt. Ein Commit würde diese Auswahl speichern. Wenn du nach dem Vormerken weiter editierst, können Arbeitsordner und Index wieder voneinander abweichen. Prüfe deine Auswahl deshalb vor jedem Commit.',
        'README.md is now staged alongside src/app.ts. A commit would save this selection. Editing again after staging can make the working directory differ from the index. Check your selection before each commit.',
      ],
      '[data-tutorial="staged-files"]',
      { scenario: 'mixed-staged' },
    ),
    scene(
      'unstage',
      ['Nimm README.md wieder aus der Auswahl', 'Remove README.md from the selection'],
      [
        'Klicke in der vorgemerkten README-Zeile auf Minus. Die Änderung bleibt im Arbeitsordner erhalten und erscheint wieder unter Änderungen. Die andere vorgemerkte Datei src/app.ts soll im Index bleiben.',
        'Click minus in the staged README row. The change stays in the working directory and returns to Changes. The other staged file, src/app.ts, should remain in the index.',
      ],
      readme('staged'),
      { scenario: 'mixed-staged', completion: element(readme('unstaged')) },
    ),
    scene(
      'bulk',
      ['Datei, Bereich und Repository haben verschiedene Umfänge', 'File, section and repository have different scopes'],
      [
        'Plus an einer Datei betrifft nur diese Datei. Alle in einem Bereich berücksichtigt die dort angezeigten Dateien und deinen Suchfilter. Gesamtes Repository hinzufügen umfasst auch andere Bereiche und ausgeblendete Änderungen. Wähle den Umfang bewusst; Verwerfen ist keine Staging-Aktion.',
        'Plus on a file affects only that file. All in a section uses the displayed files and your search filter. Stage whole repository also includes other sections and hidden changes. Choose the scope deliberately; Discard is not a staging action.',
      ],
    ),
    scene(
      'finish',
      ['Bereit für die Commit-Felder', 'Ready for the commit fields'],
      [
        'Du kannst jetzt Änderungen unterscheiden, einen Diff lesen und die Auswahl im Index verändern. In der nächsten Lektion füllst du Typ, Präfix/Bereich, Nachricht und Beschreibung einzeln aus. Dort wird README.md für den Einstieg bereits vorgemerkt bereitgestellt.',
        'You can now distinguish changes, read a diff and edit the index selection. The next lesson walks through type, prefix/scope, message and description individually. It starts with README.md already staged.',
      ],
    ),
  ],
};
