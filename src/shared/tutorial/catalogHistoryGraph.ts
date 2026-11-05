import type { TutorialChapter } from './types';
import {
  historyStep as s,
  historyRecipe as seed,
  graphRow as row,
  commitPanel as panel,
  commitFile as file,
  historyViewer as viewer,
  fileTab as tab,
  c,
  element,
} from './historyLessonHelpers';
export const TUTORIAL_HISTORY_GRAPH: TutorialChapter = {
  id: 'history',
  section: 'repo',
  title: ['Commits im Graphen untersuchen', 'Inspect commits in the graph'],
  description: [
    'Hash, Nachricht, Autor, Zeit, Referenzen, Statistik und Dateiänderungen eines gespeicherten Commits lesen.',
    'Read a saved commit’s hash, message, author, time, references, statistics and file changes.',
  ],
  question: ['Wie untersuche ich einen Commit und seinen Diff?', 'How do I inspect a commit and its diff?'],
  keywords: 'history verlauf graph commit inspector hash autor author datum date statistics statistik parent wurzel root diff',
  steps: [
    s(
      'overview',
      ['Der Graph zeigt gespeicherte Projektstände', 'The graph shows saved project states'],
      [
        'Jede Zeile ist ein Commit. Die Verbindungslinien zeigen seine Vorgänger. Das Beispiel enthält vier aufeinander aufbauende Commits; zunächst lesen wir den neuesten Stand, ohne Dateien zu verändern.',
        'Each row is a commit. Connecting lines show its parents. This example contains four successive commits; first we will read the newest state without changing files.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'hash',
      ['Ein Hash identifiziert einen Commit', 'A hash identifies a commit'],
      [
        'Diese Kurzform gehört zum neuesten Commit. Ein Hash ist eine Inhaltskennung, keine laufende Nummer. In Dialogen und Befehlen hilft er, genau denselben gespeicherten Stand wiederzufinden.',
        'This abbreviation belongs to the newest commit. A hash is a content identifier, not a sequence number. It helps locate exactly the same saved state in dialogs and commands.',
      ],
      `${row(4)} .commit-hash`,
      { prepare: seed() },
    ),
    s(
      'subject',
      ['Die erste Nachrichtzeile beschreibt die Änderung', 'The first message line describes the change'],
      [
        'Die Betreffzeile beschreibt hier die ergänzte Begrüßung. Präfix und Typ gehören zur Commit-Nachricht. Eine ausführlichere Beschreibung steht getrennt im Inspector.',
        'Here the subject describes the updated greeting. Prefix and type are part of the commit message. A longer description appears separately in the inspector.',
      ],
      `${row(4)} .commit-subject`,
      { prepare: seed() },
    ),
    s(
      'author',
      ['Der Autor ist Teil des gespeicherten Commits', 'The author belongs to the saved commit'],
      [
        'Alex Beispiel hat diesen Commit verfasst. Ältere Zeilen stammen teilweise von Sam Beispiel. Der Autor eines Commits ist nicht automatisch der Urheber jeder Zeile in seinem gesamten Dateibaum.',
        'Alex Beispiel authored this commit. Some older lines came from Sam Beispiel. A commit’s author is not automatically the author of every line in its entire file tree.',
      ],
      `${row(4)} .commit-author`,
      { prepare: seed() },
    ),
    s(
      'date',
      ['Der Zeitpunkt hilft bei der Einordnung', 'The timestamp provides context'],
      [
        'Die Datumsanzeige ordnet den Commit zeitlich ein. Für die genaue Auswahl verwendest du den Hash; mehrere Commits können am selben Tag entstehen.',
        'The date helps place the commit in time. Use its hash for exact selection; several commits may be created on the same day.',
      ],
      `${row(4)} .commit-date`,
      { prepare: seed() },
    ),
    s(
      'references',
      ['HEAD und Branch-Namen zeigen auf Commits', 'HEAD and branch names point to commits'],
      [
        'HEAD → main kennzeichnet den ausgecheckten Branch und seinen aktuellen Commit. Weitere Namensmarkierungen können Branches oder Tags sein. Ein Klick auf einen Branch-Namen hebt seinen Verlauf hervor.',
        'HEAD → main marks the checked-out branch and its current commit. Other labels can represent branches or tags. Clicking a branch label highlights its history.',
      ],
      `${row(4)} .commit-refs`,
      { prepare: seed() },
    ),
    s(
      'statistics',
      ['Dateien und Zeilen sind verschiedene Größen', 'Files and lines measure different things'],
      [
        'Die Statistik nennt betroffene Dateien sowie hinzugefügte und entfernte Zeilen gegenüber dem Vorgänger. Eine geänderte Zeile zählt oft als Entfernung plus Hinzufügung. Diese Zahlen bedeuten nicht, dass ganze Dateien neu angelegt wurden.',
        'The statistics count affected files and added or removed lines relative to the parent. Editing a line often counts as one removal and one addition. These numbers do not mean entire files were created.',
      ],
      `${row(4)} .commit-stats`,
      { prepare: seed() },
    ),
    s(
      'graph',
      ['Wähle den neuesten Commit', 'Select the newest commit'],
      [
        'Klicke die Betreffzeile des neuesten Commits. Rechts soll sich der Commit-Inspector öffnen. Das wählt einen gespeicherten Stand aus und wechselt keinen Branch.',
        'Click the newest commit’s subject. The commit inspector should open on the right. This selects a saved state without checking out another branch.',
      ],
      `${row(4)} .commit-subject`,
      { prepare: seed(), completion: element(`${panel(4)} ${file()}`) },
    ),
    s(
      'description',
      ['Die Beschreibung erklärt das Warum', 'The description explains why'],
      [
        'Unter der Commit-Kennung steht die ausführliche Nachricht. Sie ergänzt die kurze Betreffzeile aus dem Graphen. Im Beispiel beschreibt sie die Aktualisierung des gespeicherten Projektinhalts.',
        'The longer message appears below the commit identifier. It adds context to the graph’s short subject. Here it describes the update to the saved project contents.',
      ],
      `${panel(4)} .commit-details-description`,
      { prepare: seed({ commit: 4 }) },
    ),
    s(
      'changed-files',
      ['Der Inspector listet die Änderungen dieses Commits', 'The inspector lists this commit’s changes'],
      [
        'Hier stehen README.md und src/app.ts. Die Liste ist der Unterschied zum Vorgänger, nicht der vollständige Projektbaum. Unveränderte Dateien wie LICENSE fehlen deshalb.',
        'This list contains README.md and src/app.ts. It shows differences from the parent, not the full project tree. Unchanged files such as LICENSE are therefore absent.',
      ],
      `${panel(4)} .commit-details-files`,
      { prepare: seed({ commit: 4 }) },
    ),
    s(
      'file-status',
      ['Der Dateistatus beschreibt die Art der Änderung', 'File status describes the kind of change'],
      [
        'Das Änderungssymbol bei README.md bedeutet, dass die Datei schon vorher vorhanden war. Andere Commits können Dateien hinzufügen, löschen oder umbenennen. Der Status bezieht sich auf diesen Commit-Vergleich.',
        'The modification icon beside README.md means the file existed before. Other commits may add, delete or rename files. The status refers to this commit comparison.',
      ],
      `${panel(4)} ${file()}`,
      { prepare: seed({ commit: 4 }) },
    ),
    s(
      'diff',
      ['Öffne README.md aus dem Commit', 'Open README.md from the commit'],
      [
        'Klicke README.md in der Änderungsliste. In der Mitte öffnet sich ihr Diff. Rechts bleiben Dateidetails und der Verlauf dieser Datei verfügbar.',
        'Click README.md in the changed-file list. Its diff opens in the center. File details and that file’s history remain available on the right.',
      ],
      `${panel(4)} ${file()}`,
      { prepare: seed({ commit: 4 }), completion: element(`${viewer(4)}[data-tab="diff"] .file-viewer-diff`) },
    ),
    s(
      'source',
      ['Die Quelle ist ein schreibgeschützter Commit', 'The source is a read-only commit'],
      [
        'Die Quellenangabe nennt den ausgewählten Commit. Du liest dessen gespeicherte Datei, nicht die aktuelle Arbeitsdatei und nicht den Index. Beim Betrachten wird dein Projekt nicht zurückgesetzt.',
        'The source label names the selected commit. You are reading its saved file, not the current working file or index. Viewing it does not reset the project.',
      ],
      c('file-source'),
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'diff' }) },
    ),
    s(
      'removed',
      ['Rot zeigt den Inhalt des Vorgängers', 'Red shows content from the parent'],
      [
        'Die roten Zeilen stammen aus der vorherigen README-Version. Sie wurden durch diesen Commit entfernt oder ersetzt. Der Vergleich erfolgt hier mit dem direkten Vorgänger dieses Commits.',
        'Red lines come from the previous README version. This commit removed or replaced them. Here the comparison is against this commit’s direct parent.',
      ],
      '.file-viewer-diff .del .diff-code',
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'diff' }) },
    ),
    s(
      'added',
      ['Grün zeigt den neuen Inhalt', 'Green shows new content'],
      [
        'Die grünen Zeilen enthalten jetzt Begrüßung und Status. Unveränderte Zeilen liefern Kontext. Das Minus/Plus und die Zeilennummern helfen zusätzlich zur Farbe bei der Zuordnung.',
        'Green lines now contain the greeting and status. Unchanged lines provide context. Minus/plus markers and line numbers identify the sides in addition to color.',
      ],
      '.file-viewer-diff .add .diff-code',
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'diff' }) },
    ),
    s(
      'text',
      ['Lies die vollständige gespeicherte Datei', 'Read the complete saved file'],
      [
        'Wechsle zu Text. Dort siehst du den vollständigen Dateiinhalt dieses Commits, während Diff nur den Vergleich zum Vorgänger darstellt.',
        'Switch to Text. It shows the complete file in this commit, while Diff shows its comparison with the parent.',
      ],
      tab('text'),
      {
        prepare: seed({ commit: 4, file: 'README.md', tab: 'diff' }),
        completion: element(`${viewer(4)}[data-tab="text"] .cm-content[contenteditable="false"]`),
      },
    ),
    s(
      'read-only',
      ['Historische Inhalte bleiben unverändert', 'Historical contents remain unchanged'],
      [
        'Dieser Editor ist schreibgeschützt; es gibt hier keine Speichern-Schaltfläche. Zum Bearbeiten öffnest du später die Arbeitsdatei. Ein historischer Commit wird durch bloßes Öffnen oder Lesen nicht umgeschrieben.',
        'This editor is read-only and has no Save button. Open the working file later to edit it. Opening or reading a historical commit does not rewrite it.',
      ],
      `${viewer(4)} .cm-content`,
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'text' }) },
    ),
    s(
      'close-file',
      ['Kehre zum Graphen zurück', 'Return to the graph'],
      [
        'Schließe den Datei-Viewer mit X. Danach ist der Graph wieder sichtbar und du kannst einen anderen Commit untersuchen.',
        'Close the file viewer with X. The graph returns so you can inspect another commit.',
      ],
      c('close-file'),
      { prepare: seed({ commit: 4, file: 'README.md', tab: 'text' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'root',
      ['Wähle den ersten Commit', 'Select the first commit'],
      [
        'Klicke die unterste Commit-Zeile. Dieser erste Commit hat keinen Vorgänger. Er legt README und Lizenz an.',
        'Click the bottom commit row. This first commit has no parent. It creates the README and license.',
      ],
      `${row(1)} .commit-subject`,
      { prepare: seed(), completion: element(`${panel(1)} ${file('LICENSE')}`) },
    ),
    s(
      'root-files',
      ['Hinzugefügte Dateien haben noch keine alte Version', 'Added files have no previous version'],
      [
        'README und LICENSE tragen den Status Hinzugefügt. Bei einem ersten Commit werden seine Dateien mit einem leeren Ausgangsbaum verglichen.',
        'README and LICENSE have Added status. A first commit’s files are compared with an empty starting tree.',
      ],
      `${panel(1)} .commit-details-files`,
      { prepare: seed({ commit: 1 }) },
    ),
    s(
      'root-diff',
      ['Öffne den ersten README-Diff', 'Open the first README diff'],
      [
        'Klicke README.md. Diesmal soll nur die hinzugefügte Überschrift erscheinen: Es gab zuvor keinen Dateiinhalt zu entfernen.',
        'Click README.md. This time only the added heading should appear: there was no previous file content to remove.',
      ],
      `${panel(1)} ${file()}`,
      { prepare: seed({ commit: 1 }), completion: element(`${viewer(1)} .file-viewer-diff .add .diff-code`) },
    ),
    s(
      'close-root',
      ['Schließe den historischen Vergleich', 'Close the historical comparison'],
      ['Schließe den Viewer wieder. Die aktuelle Arbeitskopie bleibt unverändert.', 'Close the viewer again. The current working copy stays unchanged.'],
      c('close-file'),
      { prepare: seed({ commit: 1, file: 'README.md', tab: 'diff' }), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'files',
      ['Wechsle zum vollständigen Projektbaum', 'Switch to the complete project tree'],
      [
        'Klicke Working Directory. Dieser Baum enthält alle aktuellen Projektdateien. In der nächsten Lektion vergleichen wir den Verlauf einzelner Dateien mit dem gesamten Commit-Graphen.',
        'Click Working Directory. This tree contains all current project files. The next lesson compares each file’s history with the full commit graph.',
      ],
      c('open-files'),
      { prepare: seed(), completion: element(`${c('open-files')}[aria-pressed="true"]`) },
    ),
    s(
      'finish',
      ['Commit, Dateibaum und Diff beantworten verschiedene Fragen', 'Commit, file tree and diff answer different questions'],
      [
        'Du hast einen Commit identifiziert, seine Beschreibung und Statistik gelesen und Änderungen zum Vorgänger betrachtet. Der Dateiverlauf zeigt als Nächstes nur die Commits, die eine bestimmte Datei tatsächlich verändern.',
        'You identified a commit, read its description and statistics, and inspected changes against its parent. File history next shows only the commits that actually change a particular file.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed() },
    ),
  ],
};
