import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import { branchStep as s, branchControl as c, branchPanel as panel, branchRow as row, branchElement as element } from './branchLessonHelpers';
import { branchSwitchRecipe as seed } from './branchSwitchHelpers';
import { graphRow, fileRow, historyViewer as viewer } from './historyLessonHelpers';
const feature = 'feature/begruessung';
const closed = { kind: 'absent' as const, selector: '.file-viewer' };

export const TUTORIAL_BRANCHES_SWITCH: TutorialChapter = {
  id: 'branches-switch',
  section: 'repo',
  title: ['Branch wechseln: Dateien und HEAD', 'Switch branches: files and HEAD'],
  description: [
    'Zwei unterschiedliche gespeicherte Stände vergleichen, die Arbeitsdatei vor und nach dem Wechsel lesen und Branches mit Maus, Enter und Leertaste wechseln.',
    'Compare two different saved states, read the working file before and after checkout, and switch branches with mouse, Enter and Space.',
  ],
  question: ['Was passiert mit meinen Dateien beim Branchwechsel?', 'What happens to my files when I switch branches?'],
  keywords: 'branch checkout switch wechseln head arbeitsdatei working tree dateistand main tastatur enter space leere leer sauber clean',
  steps: [
    s(
      'overview',
      ['Ein Wechsel betrifft den aktiven Projektstand', 'Checkout changes the active project state'],
      [
        'main und feature/begruessung zeigen hier auf unterschiedliche gespeicherte Commits. Wir lesen dieselbe Arbeitsdatei vor und nach dem Wechsel. Die Übung startet ohne offene Änderungen; den Umgang damit behandeln eigene Lektionen.',
        'Here main and feature/begruessung point to different saved commits. We will read the same working file before and after switching. This exercise starts without unfinished changes; separate lessons cover those.',
      ],
      panel,
      { continue: false, prepare: seed() },
    ),
    s(
      'starting-refs',
      ['main ist aktiv, der andere Name bleibt vorhanden', 'main is active; the other name is still present'],
      [
        'HEAD steht zunächst bei main. Der lokale Beispielbranch besitzt einen älteren README-Stand. Ein Klick auf eine Commit-Zeile würde nur den Inspector öffnen; für einen Branchwechsel verwenden wir die Branch-Liste.',
        'HEAD initially belongs to main. The sample local branch has an older README. Clicking a commit row would only open its inspector; checkout uses the branch list.',
      ],
      row('main', true),
      { prepare: seed() },
    ),
    s(
      'open-inspector',
      ['Öffne den rechten Arbeitsbereich', 'Open the right workspace pane'],
      [
        'Klicke oben den Schalter für den rechten Bereich. Dort wählen wir anschließend die Dateiansicht. Dieser Schalter ändert die Darstellung, nicht den aktiven Branch.',
        'Click the top-bar toggle for the right pane. We will choose the file view there next. This toggle changes the layout, not the active branch.',
      ],
      c('inspector-toggle'),
      { prepare: seed(), completion: element(c('open-files')) },
    ),
    s(
      'choose-files',
      ['Wechsle zur Arbeitsverzeichnis-Ansicht', 'Switch to Working Directory'],
      [
        'Wähle Working Directory rechts. Der Dateibaum zeigt die Dateien des ausgecheckten Projektstands. Wir beginnen mit main und verändern den Inhalt nicht.',
        'Choose Working Directory on the right. The tree shows files from the checked-out project state. We start with main and will leave the contents unchanged.',
      ],
      c('open-files'),
      { prepare: seed('main', 'inspector'), completion: element(`${c('open-files')}[aria-pressed="true"]`) },
    ),
    s(
      'open-main',
      ['Öffne die aktuelle README von main', 'Open main’s current README'],
      [
        'Klicke README.md im Dateibaum. Es soll die Arbeitsdatei geöffnet werden. Damit lesen wir den tatsächlich ausgecheckten Inhalt und keinen beliebig ausgewählten historischen Commit.',
        'Click README.md in the tree. This opens the working file, so we read the actual checked-out content rather than an arbitrary historical commit.',
      ],
      fileRow(),
      { prepare: seed('main', 'tree'), completion: element(viewer()) },
    ),
    s(
      'main-text',
      ['Merke dir Begrüßung und Status', 'Notice the greeting and status'],
      [
        'Die aktuelle README enthält eine Begrüßung und die Statuszeile. Dieses Dokument gehört zum neueren Stand von main. Wir lesen es nur; es entsteht weder ein Entwurf noch eine vorgemerkte Änderung.',
        'The current README contains a greeting and status line. This document belongs to main’s newer state. We only read it; no draft or staged change is created.',
      ],
      c('file-editor'),
      { prepare: seed('main', 'file') },
    ),
    s(
      'close-main',
      ['Schließe die Arbeitsdatei', 'Close the working file'],
      [
        'Schließe den Viewer über sein X. Anschließend wechseln wir den Branch. Da nichts bearbeitet wurde, ist keine Speichern- oder Verwerfen-Entscheidung nötig.',
        'Close the viewer with its X. We will switch branches next. Because nothing was edited, there is no Save or Discard decision.',
      ],
      c('close-file'),
      { prepare: seed('main', 'file'), completion: closed },
    ),
    s(
      'choose-feature',
      ['Wechsle zum lokalen Beispielbranch', 'Switch to the local sample branch'],
      [
        'Klicke feature/begruessung in der Branch-Liste. Dieser lokale Branch soll die HEAD-Markierung erhalten. Ein Remote-Eintrag ist dafür nicht erforderlich.',
        'Click feature/begruessung in the branch list. This local branch should receive the HEAD badge. No remote entry is required for this switch.',
      ],
      row(feature),
      { prepare: seed('main', 'tree'), completion: element(row(feature, true)) },
    ),
    s(
      'current-feature',
      ['Die aktive Branch-Zeile hat gewechselt', 'The active branch row has changed'],
      [
        'HEAD steht nun bei feature/begruessung. main ist weiterhin ein eigener lokaler Branch. Der Wechsel hat seinen gespeicherten Commit nicht verschoben.',
        'HEAD now belongs to feature/begruessung. main remains a separate local branch. Checkout did not move main’s saved commit.',
      ],
      row(feature, true),
      { prepare: seed(feature, 'tree') },
    ),
    s(
      'feature-reference',
      ['HEAD steht im Graphen am älteren Commit', 'HEAD is at the older commit in the graph'],
      [
        'Die Referenz HEAD → feature/begruessung steht jetzt am früheren Commit. Der Graph darf darüber weiterhin neuere Commits anderer Branches zeigen. HEAD muss deshalb nicht in der ersten sichtbaren Zeile stehen.',
        'HEAD → feature/begruessung now labels an earlier commit. The graph can still show newer commits from other branches above it. HEAD therefore need not be in the first visible row.',
      ],
      `${graphRow(3)} .commit-refs`,
      { prepare: seed(feature, 'tree') },
    ),
    s(
      'retained-main',
      ['main zeigt weiterhin auf seinen neueren Stand', 'main still points to its newer state'],
      [
        'Der Name main bleibt am neueren Commit. Ein Branchwechsel setzt nicht alle Branches auf denselben Commit. Diese getrennten Referenzen ermöglichen später unabhängige Entwicklungen und Zusammenführungen.',
        'main remains on the newer commit. Checkout does not set every branch to the same commit. These separate references allow independent work and later merges.',
      ],
      `${graphRow(4)} .commit-refs`,
      { prepare: seed(feature, 'tree') },
    ),
    s(
      'older-tree',
      ['Der Dateibaum gehört jetzt zum anderen Stand', 'The tree now belongs to the other state'],
      [
        'README.md heißt weiterhin gleich. Derselbe Pfad kann je Branch einen anderen gespeicherten Inhalt besitzen. Der Dateiname allein sagt deshalb noch nicht, welche Version du gerade liest.',
        'The file is still named README.md. The same path can contain different saved contents on different branches. Its name alone does not tell you which version you are reading.',
      ],
      fileRow(),
      { prepare: seed(feature, 'tree') },
    ),
    s(
      'open-older',
      ['Öffne dieselbe Arbeitsdatei erneut', 'Open the same working file again'],
      [
        'Klicke wieder README.md. Der Viewer muss diesmal den ausgecheckten Inhalt von feature/begruessung laden und darf nicht die zuvor geöffnete main-Version zeigen.',
        'Click README.md again. The viewer must load feature/begruessung’s checked-out contents, rather than the main version you opened before.',
      ],
      fileRow(),
      { prepare: seed(feature, 'tree'), completion: element(viewer()) },
    ),
    s(
      'older-text',
      ['Hier steht die frühere Projektbeschreibung', 'This contains the earlier project overview'],
      [
        'Diese Version enthält die frühere Projektbeschreibung. Die spätere Begrüßungs- und Statusfassung von main ist hier noch nicht gespeichert. Der Wechsel hat also tatsächlich den Arbeitsdateiinhalt aktualisiert.',
        'This version contains the earlier project overview. main’s later greeting and status revision is not saved here yet. Checkout therefore really changed the working-file contents.',
      ],
      c('file-editor'),
      { prepare: seed(feature, 'file') },
    ),
    s(
      'close-older',
      ['Schließe den älteren Inhalt', 'Close the older contents'],
      [
        'Schließe den Viewer wieder. Die Datei bleibt unverändert. Nun probieren wir denselben Branchwechsel mit der Tastatur.',
        'Close the viewer again. The file remains unchanged. Next we will try checkout with the keyboard.',
      ],
      c('close-file'),
      { prepare: seed(feature, 'file'), completion: closed },
    ),
    s(
      'keyboard-main',
      ['Aktiviere main mit Enter', 'Activate main with Enter'],
      [
        'Fokussiere den lokalen main-Eintrag mit Tab und drücke Enter. Die Tastatur führt dieselbe Checkout-Aktion aus wie ein Klick; main soll wieder HEAD tragen.',
        'Focus the local main entry with Tab and press Enter. The keyboard runs the same checkout action as a click; main should receive HEAD again.',
      ],
      row('main'),
      { prepare: seed(feature, 'tree'), gesture: 'enter', completion: element(row('main', true)) },
    ),
    s(
      'main-reference',
      ['HEAD ist wieder am neueren Commit', 'HEAD is back at the newer commit'],
      [
        'Im Graphen steht wieder HEAD → main am neueren Commit. Der Beispielbranch bleibt am älteren Commit. Keine der beiden Referenzen wurde durch das Hin- und Herwechseln gelöscht.',
        'The graph again labels the newer commit HEAD → main. The sample branch remains on the older commit. Switching back and forth deleted neither reference.',
      ],
      `${graphRow(4)} .commit-refs`,
      { prepare: seed('main', 'tree') },
    ),
    s(
      'open-again',
      ['Prüfe die zurückgekehrte Datei', 'Check the restored working file'],
      [
        'Öffne README.md ein drittes Mal. Auch nach einer bereits angezeigten älteren Version muss die Dateiansicht den nun aktuellen main-Inhalt liefern.',
        'Open README.md a third time. Even after showing an older version, the file view must display the now-current main contents.',
      ],
      fileRow(),
      { prepare: seed('main', 'tree'), completion: element(viewer()) },
    ),
    s(
      'restored-text',
      ['Begrüßung und Status sind wieder vorhanden', 'The greeting and status are back'],
      [
        'Die Begrüßungs- und Statusfassung ist zurück. Das ist die Arbeitsdatei des erneut ausgecheckten main-Standes. Wir haben dafür keinen Commit erstellt, keinen Reset ausgeführt und nichts heruntergeladen.',
        'The greeting and status revision is back. This is the working file from main’s checked-out state. We created no commit, ran no reset and downloaded nothing.',
      ],
      c('file-editor'),
      { prepare: seed('main', 'file') },
    ),
    s(
      'close-again',
      ['Kehre zur Branch-Liste zurück', 'Return to the branch list'],
      [
        'Schließe die Datei. Als zweite Tastaturvariante probieren wir gleich die Leertaste auf einem fokussierten Branch-Eintrag.',
        'Close the file. Next we will try Space as another keyboard action on a focused branch entry.',
      ],
      c('close-file'),
      { prepare: seed('main', 'file'), completion: closed },
    ),
    s(
      'keyboard-feature',
      ['Aktiviere den Beispielbranch mit der Leertaste', 'Activate the sample branch with Space'],
      [
        'Fokussiere feature/begruessung und drücke die Leertaste. Auch diese Bedienung soll den Branch wechseln und dessen gespeicherten Stand aktivieren.',
        'Focus feature/begruessung and press Space. This should also switch branches and activate its saved state.',
      ],
      row(feature),
      { prepare: seed('main', 'tree'), gesture: 'space', completion: element(row(feature, true)) },
    ),
    s(
      'keyboard-state',
      ['Die Eingabeart ändert das Ergebnis nicht', 'The input method does not change the result'],
      [
        'HEAD steht erneut am Beispielbranch. Klick, Enter und Leertaste nutzen dieselbe Aktion. In einem Textfeld behalten die Pfeiltasten dagegen ihre normale Bedeutung für den Cursor.',
        'HEAD is back at the sample branch. Click, Enter and Space use the same action. Inside a text field, arrow keys retain their normal cursor behavior.',
      ],
      row(feature, true),
      { prepare: seed(feature, 'tree') },
    ),
    s(
      'return-main',
      ['Beende die Übung wieder auf main', 'Finish back on main'],
      [
        'Klicke main. Wir lassen das Lernprojekt am Ende wieder auf seinem neueren Ausgangsstand.',
        'Click main. We will leave the learning project on its newer starting state.',
      ],
      row('main'),
      { prepare: seed(feature, 'tree'), completion: element(row('main', true)) },
    ),
    s(
      'preserved-history',
      ['Die vier gespeicherten Commits bleiben erhalten', 'The four saved commits remain'],
      [
        'Der Graph enthält weiterhin dieselben vier Commits. Branchwechsel bewegen HEAD und die Arbeitsansicht; sie erstellen für sich allein keine zusätzlichen Commits.',
        'The graph still contains the same four commits. Checkout moves HEAD and the working view; it does not create additional commits by itself.',
      ],
      c('graph'),
      { prepare: seed('main', 'tree') },
    ),
    s(
      'open-staging',
      ['Prüfe den Änderungsbereich', 'Check the changes area'],
      [
        'Wähle rechts Staging Area. Hier kontrollieren wir abschließend, ob das reine Lesen und Wechseln Änderungen hinterlassen hat.',
        'Choose Staging Area on the right. We will check whether reading and switching left any changes behind.',
      ],
      c('open-staging'),
      { prepare: seed('main', 'tree'), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'clean',
      ['Das Arbeitsverzeichnis ist sauber', 'The working tree is clean'],
      [
        'Es gibt keine geänderten, neuen oder vorgemerkten Dateien. Unterschiedliche Inhalte in gespeicherten Branches sind keine offenen Änderungen. Wir haben bei jedem Wechsel einen vollständigen gespeicherten Stand ausgecheckt.',
        'There are no modified, new or staged files. Differing contents in saved branches are not unfinished changes. Each checkout selected a complete saved state.',
      ],
      c('staging'),
      { prepare: seed('main', 'inspector') },
    ),
    s(
      'finish',
      ['Du kannst den aktiven Stand bewusst wechseln', 'You can switch the active state deliberately'],
      [
        'Du hast Arbeitsdateien vor und nach mehreren Wechseln gelesen, HEAD und getrennte Referenzen geprüft und Maus sowie Tastatur ausprobiert. Weiter schließt diese Lektion ab. Offene Änderungen und andere Git-Vorgänge folgen in eigenen Übungen.',
        'You read working files before and after several checkouts, inspected HEAD and separate references, and used mouse and keyboard. Next completes this lesson. Separate exercises cover unfinished changes and other Git operations.',
      ],
      panel,
      { prepare: seed('main', 'inspector') },
    ),
  ].flatMap(withTextViewSteps({ 'open-main': 'README.md', 'open-older': 'README.md', 'open-again': 'README.md' })),
};
