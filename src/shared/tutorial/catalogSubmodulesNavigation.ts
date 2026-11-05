import type { TutorialChapter } from './types';
import {
  submoduleStep as s,
  submoduleRecipe as seed,
  submodulePanel as panel,
  submoduleToggle as toggle,
  submoduleRow as row,
  submoduleField as field,
  submoduleControl as c,
  submoduleConfigViewer as viewer,
} from './submoduleLessonHelpers';
import { branchControl, branchElement as element } from './branchLessonHelpers';
import { fileRow } from './fileLessonHelpers';
export const TUTORIAL_SUBMODULES_NAVIGATION: TutorialChapter = {
  id: 'submodules-navigation',
  section: 'repo',
  title: ['Submodule finden und ihren Status verstehen', 'Find submodules and understand their status'],
  description: [
    'Lerne Pfad, Commit, Status und .gitmodules kennen. Öffne den Submodulordner, ohne das übergeordnete Repository zu wechseln.',
    'Learn the path, commit, status and .gitmodules. Open the submodule folder without switching the parent repository.',
  ],
  question: ['Was bedeuten Pfad, Hash und Status in der Submodul-Karte?', 'What do the path, hash and status in the submodule card mean?'],
  keywords: 'submodule submodul untermodul gitmodules pfad hash zielcommit status sauber dirty ordner dateimanager öffnen navigation',
  steps: [
    s(
      'overview',
      ['Ein Repository im Repository', 'A repository inside a repository'],
      [
        'packages/design ist ein eigenes Git-Repository. Das übergeordnete Lernprojekt speichert seinen Pfad und einen bestimmten Commit, nicht die enthaltenen Dateien.',
        'packages/design is a separate Git repository. The parent learning project records its path and a specific commit, rather than the files inside it.',
      ],
      branchControl('sidebar-toggle'),
      { continue: false, prepare: seed({ sidebarCollapsed: true, collapsed: true }) },
    ),
    s(
      'sidebar',
      ['Öffne die Git-Seitenleiste', 'Open the Git sidebar'],
      ['Öffne oben links die Seitenleiste mit den Repository-Karten.', 'Open the sidebar with the repository cards at the upper left.'],
      branchControl('sidebar-toggle'),
      { prepare: seed({ sidebarCollapsed: true, collapsed: true }), completion: element(panel) },
    ),
    s(
      'expand',
      ['Klappe Submodule auf', 'Expand Submodules'],
      [
        'Öffne die Karte über ihre Überschrift. Ihre Schaltflächen sind vom Ein- und Ausklappen unabhängig.',
        'Open the card using its heading. Its action buttons are independent of expanding or collapsing.',
      ],
      toggle,
      { prepare: seed({ collapsed: true }), completion: element(toggle + '[aria-expanded="true"]') },
    ),
    s(
      'path',
      ['Der Pfad gehört zum übergeordneten Repository', 'The path is relative to the parent repository'],
      [
        'packages/design benennt den Unterordner im Lernprojekt. Er ist weder ein Branchname noch eine Internetadresse.',
        'packages/design identifies the child folder in the learning project. It is neither a branch name nor an Internet address.',
      ],
      row,
      { prepare: seed() },
    ),
    s(
      'commit',
      ['Der vollständige Hash benennt den ausgecheckten Commit', 'The full hash identifies the checked-out commit'],
      [
        'Bei einem initialisierten Submodul zeigt die Karte den tatsächlich ausgecheckten Commit. Derselbe Pfad kann nach einer Aktualisierung auf einen anderen Commit zeigen.',
        'For an initialized submodule, the card shows the commit actually checked out. The same path can point to a different commit after an update.',
      ],
      field('commit'),
      { prepare: seed() },
    ),
    s(
      'state',
      ['Zielcommit ausgecheckt bezieht sich auf den Index', 'Recorded commit checked out refers to the index'],
      [
        'Der ausgecheckte Submodul-Commit stimmt mit dem Ziel im Index des Lernprojekts überein. Diese Anzeige prüft nicht jede uncommittete Datei im Submodul.',
        'The checked-out submodule commit matches the target in the learning project’s index. This indicator does not inspect every uncommitted file inside the submodule.',
      ],
      field('state'),
      { prepare: seed() },
    ),
    s(
      'summary',
      ['v1.0.0 hilft beim Wiedererkennen', 'v1.0.0 helps identify the revision'],
      [
        'Der Zusatz beschreibt den bekannten Submodul-Stand. Er ist keine Aufforderung, automatisch die neueste Version zu installieren.',
        'The suffix describes the known submodule revision. It is not an instruction to automatically install the newest version.',
      ],
      field('state'),
      { prepare: seed() },
    ),
    s(
      'collapse',
      ['Klappe nur den Karteninhalt zu', 'Collapse just the card contents'],
      [
        'Klicke die Kartenüberschrift erneut. Das verändert weder Commit noch Repository-Dateien.',
        'Click the card heading again. This changes neither the commit nor repository files.',
      ],
      toggle,
      { prepare: seed(), completion: element(toggle + '[aria-expanded="false"]') },
    ),
    s(
      'reopen',
      ['Zeige die Details wieder an', 'Show the details again'],
      ['Klappe Submodule wieder auf. packages/design muss unverändert zurückkehren.', 'Expand Submodules again. packages/design should return unchanged.'],
      toggle,
      { prepare: seed({ collapsed: true }), completion: element(toggle + '[aria-expanded="true"]') },
    ),
    s(
      'files',
      ['Wechsle zu den Dateien', 'Switch to Files'],
      ['Öffne die Dateiansicht über die vorhandene Bereichsschaltfläche.', 'Open the file view using its area button.'],
      branchControl('open-files'),
      { prepare: seed(), completion: element(branchControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'configuration',
      ['Öffne .gitmodules', 'Open .gitmodules'],
      [
        'Wähle .gitmodules im Dateibaum. Die Datei beschreibt die Zuordnung für das übergeordnete Repository.',
        'Select .gitmodules in the file tree. This file describes the mapping for the parent repository.',
      ],
      fileRow('.gitmodules'),
      { prepare: seed({ files: true }), completion: element(viewer) },
    ),
    s(
      'mapping',
      ['Name, Pfad und URL erfüllen verschiedene Aufgaben', 'Name, path and URL serve different purposes'],
      [
        'design ist der Konfigurationsname. path nennt packages/design. url nennt die Quelle. Der festgelegte Commit steht im Git-Index und gehört nicht in diese Datei.',
        'design is the configuration name. path specifies packages/design. url identifies its source. The recorded commit lives in the Git index, rather than in this file.',
      ],
      viewer + ' [data-tutorial="file-editor"]',
      { prepare: seed({ config: true }) },
    ),
    s(
      'close-file',
      ['Schließe die Dateiansicht', 'Close the file viewer'],
      ['Schließe nur den Betrachter über das X. Die Konfiguration bleibt erhalten.', 'Close just the viewer using X. The configuration remains intact.'],
      branchControl('close-file'),
      { prepare: seed({ config: true }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'open-purpose',
      ['Der kleine Pfeil öffnet den Ordner', 'The small arrow opens the folder'],
      [
        'Im normalen Betrieb öffnet diese Schaltfläche den System-Dateimanager. Sie wählt kein anderes Repository in OGC aus. Im Übungsmodus wird nur die erfolgreiche Ordneröffnung simuliert.',
        'Normally this button opens the system file manager. It does not select a different repository in OGC. Practice mode only simulates a successful folder opening.',
      ],
      c('open'),
      { prepare: seed() },
    ),
    s(
      'open',
      ['Öffne den Beispielordner mit Enter', 'Open the example folder with Enter'],
      [
        'Fokussiere das Ordnersymbol und drücke Enter. Ein Klick führt dieselbe Aktion aus.',
        'Focus the folder icon and press Enter. Clicking performs the same action.',
      ],
      c('open'),
      { prepare: seed(), gesture: 'enter', action: 'submodule-opened' },
    ),
    s(
      'opened',
      ['Das Lernprojekt bleibt ausgewählt', 'The learning project stays selected'],
      [
        'Die simulierte Ordneröffnung ist bestätigt. main, Index und Dateien des übergeordneten Repositorys bleiben unverändert.',
        'The simulated folder opening is confirmed. main, the index and the parent repository’s files stay unchanged.',
      ],
      panel,
      { prepare: seed({ opened: true }) },
    ),
  ],
};
