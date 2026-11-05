import type { TutorialChapter } from './types';
import {
  submoduleStep as s,
  submoduleRecipe as seed,
  submodulePanel as panel,
  submoduleToggle as toggle,
  submoduleRow as row,
  submoduleField as field,
  submoduleControl as c,
} from './submoduleLessonHelpers';
import { branchControl, branchElement as element } from './branchLessonHelpers';
export const TUTORIAL_SUBMODULES_INITIALIZE: TutorialChapter = {
  id: 'submodules-initialize',
  section: 'repo',
  title: ['Ein vorhandenes Submodul initialisieren', 'Initialize an existing submodule'],
  description: [
    'Erkenne einen noch nicht initialisierten Eintrag und richte seinen gespeicherten Stand über Init / Update ein.',
    'Recognize an uninitialized entry and set up its recorded revision using Init / Update.',
  ],
  question: ['Wie initialisiere ich Submodule nach dem Klonen?', 'How do I initialize submodules after cloning?'],
  keywords: 'submodule initialisieren klonen init update recursive rekursiv nicht initialisiert eingerichtet',
  steps: [
    s(
      'overview',
      ['Klonen und Submodule einrichten sind getrennte Schritte', 'Cloning and setting up submodules are separate steps'],
      [
        'Der Klon kennt packages/design bereits, hat das Kind-Repository aber noch nicht initialisiert. Die Übung benötigt weder Git noch eine Anmeldung oder Internet.',
        'The clone already knows packages/design, but has not initialized the child repository. This exercise requires neither Git nor a login or Internet access.',
      ],
      branchControl('sidebar-toggle'),
      { continue: false, prepare: seed({ state: 'uninitialized', sidebarCollapsed: true, collapsed: true }) },
    ),
    s(
      'sidebar',
      ['Finde die Repository-Karten', 'Find the repository cards'],
      ['Öffne die Git-Seitenleiste.', 'Open the Git sidebar.'],
      branchControl('sidebar-toggle'),
      { prepare: seed({ state: 'uninitialized', sidebarCollapsed: true, collapsed: true }), completion: element(panel) },
    ),
    s('expand', ['Öffne die Submodul-Karte', 'Open the submodule card'], ['Klappe Submodule auf.', 'Expand Submodules.'], toggle, {
      prepare: seed({ state: 'uninitialized', collapsed: true }),
      completion: element(toggle + '[aria-expanded="true"]'),
    }),
    s(
      'state',
      ['Nicht initialisiert ist ein eigener Zustand', 'Not initialized is a distinct state'],
      [
        'Der Eintrag ist bekannt. Die Anzeige bedeutet nicht, dass alle Submodul-Dateien geprüft und sauber sind.',
        'The entry is known. The indicator does not mean that all submodule files were checked and found clean.',
      ],
      field('state'),
      { prepare: seed({ state: 'uninitialized' }) },
    ),
    s(
      'target',
      ['Vor der Initialisierung zeigt der Hash das Ziel', 'Before initialization the hash shows the target'],
      [
        'Solange das Kind nicht initialisiert ist, stammt dieser Hash aus dem Index des übergeordneten Repositorys. Er benennt den einzurichtenden Stand.',
        'Until the child is initialized, this hash comes from the parent repository’s index. It identifies the revision to set up.',
      ],
      field('commit'),
      { prepare: seed({ state: 'uninitialized' }) },
    ),
    s(
      'scope',
      ['Init / Update arbeitet rekursiv', 'Init / Update works recursively'],
      [
        'Die Schaltfläche richtet bekannte Submodule ein und aktualisiert ihre aufgezeichneten Zielcommits, einschließlich verschachtelter Submodule. Sie erstellt keinen neuen Submodul-Eintrag.',
        'The button sets up known submodules and updates their recorded target commits, including nested submodules. It does not create a new submodule entry.',
      ],
      c('update'),
      { prepare: seed({ state: 'uninitialized' }) },
    ),
    s(
      'update',
      ['Initialisiere das Beispielsubmodul', 'Initialize the example submodule'],
      [
        'Klicke Init / Update. Warte, bis der Eintrag Zielcommit ausgecheckt anzeigt.',
        'Click Init / Update. Wait for the entry to show Recorded commit checked out.',
      ],
      c('update'),
      { prepare: seed({ state: 'uninitialized' }), completion: element(row + '[data-submodule-state="clean"]') },
    ),
    s(
      'result',
      ['Der bekannte Zielcommit ist eingerichtet', 'The known target commit is set up'],
      [
        'Der Hash ist derselbe wie vorher. Jetzt existiert der simulierte ausgecheckte Stand; das übergeordnete Lernprojekt erhält keinen zusätzlichen Commit.',
        'The hash is the same as before. The simulated checked-out revision now exists; the parent learning project receives no additional commit.',
      ],
      field('state'),
      { prepare: seed({ state: 'uninitialized', updated: true }) },
    ),
    s(
      'repeat',
      ['Eine erneute Aktualisierung bleibt beim Ziel', 'Updating again stays at the target'],
      [
        'Klicke Init / Update noch einmal. Erfolg bedeutet den gespeicherten Zielstand, nicht automatisch den neuesten Commit einer Kind-Branch.',
        'Click Init / Update again. Success means the recorded target revision, rather than automatically the newest commit on a child branch.',
      ],
      c('update'),
      { prepare: seed({ state: 'uninitialized', updated: true }), action: 'submodules-update-repeated' },
    ),
    s(
      'open',
      ['Probiere den eingerichteten Ordner aus', 'Try the initialized folder'],
      [
        'Öffne den Beispielordner über sein kleines Ordnersymbol. Im Übungsmodus bleibt diese Aktion simuliert.',
        'Open the example folder using its small folder icon. In practice mode this action remains simulated.',
      ],
      c('open'),
      { prepare: seed({ state: 'uninitialized', updated: true }), action: 'submodule-opened' },
    ),
    s(
      'done',
      ['Das übergeordnete Repository bleibt erhalten', 'The parent repository is preserved'],
      [
        'Die Initialisierung verändert weder die Branch-Auswahl noch die aufgezeichnete Submodul-Version des Lernprojekts.',
        'Initialization changes neither the branch selection nor the learning project’s recorded submodule version.',
      ],
      panel,
      { prepare: seed({ state: 'uninitialized', updated: true, opened: true }) },
    ),
  ],
};
export const TUTORIAL_SUBMODULES_UPDATE: TutorialChapter = {
  id: 'submodules-update',
  section: 'repo',
  title: ['Ein Submodul auf den aufgezeichneten Commit bringen', 'Bring a submodule to its recorded commit'],
  description: [
    'Unterscheide den tatsächlich ausgecheckten Kind-Commit vom Ziel im übergeordneten Index und stelle das Ziel wieder her.',
    'Distinguish the child commit actually checked out from the target in the parent index and restore that target.',
  ],
  question: ['Was bedeutet Anderer Commit ausgecheckt bei einem Submodul?', 'What does Different commit checked out mean for a submodule?'],
  keywords: 'submodule anderer commit ausgecheckt aktualisieren update dirty ziel index latest version',
  steps: [
    s(
      'overview',
      ['Der ausgecheckte Stand kann vom Ziel abweichen', 'The checkout can differ from the target'],
      [
        'Das Lernprojekt erwartet v1.0.0, aber packages/design steht auf v1.1.0. Wir stellen das aufgezeichnete Ziel wieder her.',
        'The learning project expects v1.0.0, but packages/design is at v1.1.0. We will restore the recorded target.',
      ],
      branchControl('sidebar-toggle'),
      { continue: false, prepare: seed({ state: 'different-commit', sidebarCollapsed: true }) },
    ),
    s(
      'sidebar',
      ['Öffne die Git-Seitenleiste', 'Open the Git sidebar'],
      ['Öffne die Repository-Karten, um das abweichende Submodul zu untersuchen.', 'Open the repository cards to inspect the differing submodule.'],
      branchControl('sidebar-toggle'),
      { prepare: seed({ state: 'different-commit', sidebarCollapsed: true }), completion: element(panel) },
    ),
    s(
      'state',
      ['Anderer Commit ausgecheckt ist keine Dateiprüfung', 'Different commit checked out is not a file check'],
      [
        'Der Warnhinweis vergleicht Commit-IDs mit dem Index des übergeordneten Repositorys. Er sagt nicht, welche Textdatei im Kind verändert wurde.',
        'The warning compares commit IDs with the parent repository’s index. It does not say which text file was changed inside the child.',
      ],
      field('state'),
      { prepare: seed({ state: 'different-commit' }) },
    ),
    s(
      'commit',
      ['Der Hash gehört zum tatsächlichen Kind-Checkout', 'The hash belongs to the actual child checkout'],
      [
        'Der angezeigte Hash und v1.1.0 beschreiben den momentan ausgecheckten Stand. Im Index des Lernprojekts steht weiterhin v1.0.0.',
        'The displayed hash and v1.1.0 describe the revision currently checked out. The learning project’s index still records v1.0.0.',
      ],
      field('commit'),
      { prepare: seed({ state: 'different-commit' }) },
    ),
    s(
      'purpose',
      ['Update folgt dem Index', 'Update follows the index'],
      [
        'Init / Update checkt den aufgezeichneten Zielcommit aus. Ein neuerer Kind-Commit wird dabei nicht automatisch zum Ziel des übergeordneten Repositorys.',
        'Init / Update checks out the recorded target commit. A newer child commit does not automatically become the parent repository’s target.',
      ],
      c('update'),
      { prepare: seed({ state: 'different-commit' }) },
    ),
    s(
      'update',
      ['Stelle v1.0.0 wieder her', 'Restore v1.0.0'],
      ['Klicke Init / Update und beobachte den Wechsel von Hash und Status.', 'Click Init / Update and watch the hash and status change.'],
      c('update'),
      { prepare: seed({ state: 'different-commit' }), completion: element(row + '[data-submodule-state="clean"]') },
    ),
    s(
      'target',
      ['Jetzt stimmt der ausgecheckte Commit überein', 'The checked-out commit now matches'],
      [
        'Hash und Zusatz zeigen wieder v1.0.0. Die Abweichung im Arbeitsbaum des Lernprojekts ist beseitigt.',
        'The hash and suffix show v1.0.0 again. The discrepancy in the learning project’s working tree is resolved.',
      ],
      field('state'),
      { prepare: seed({ state: 'different-commit', updated: true }) },
    ),
    s(
      'parent',
      ['Es wurde kein neuer Eltern-Commit erstellt', 'No new parent commit was created'],
      [
        'Aktualisieren stellt den erwarteten Kind-Checkout her. main und der aufgezeichnete Zielcommit im Index wurden nicht verschoben.',
        'Updating restores the expected child checkout. main and the target commit recorded in the index did not move.',
      ],
      panel,
      { prepare: seed({ state: 'different-commit', updated: true }) },
    ),
    s(
      'sync',
      ['URL-Abgleich erfüllt eine andere Aufgabe', 'URL synchronization serves a different purpose'],
      [
        'Sync gleicht bekannte Quellen aus .gitmodules ab. Es ersetzt Init / Update nicht und wählt keinen anderen Kind-Commit aus.',
        'Sync synchronizes known sources from .gitmodules. It does not replace Init / Update or select another child commit.',
      ],
      c('sync'),
      { prepare: seed({ state: 'different-commit', updated: true }) },
    ),
  ],
};
