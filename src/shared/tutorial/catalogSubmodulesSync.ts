import type { TutorialChapter } from './types';
import {
  submoduleStep as s,
  submoduleRecipe as seed,
  submodulePanel as panel,
  submoduleField as field,
  submoduleControl as c,
  submoduleConfigViewer as viewer,
} from './submoduleLessonHelpers';
import { branchControl, branchElement as element } from './branchLessonHelpers';
import { fileRow } from './fileLessonHelpers';
export const TUTORIAL_SUBMODULES_SYNC: TutorialChapter = {
  id: 'submodules-sync',
  section: 'repo',
  title: ['Geänderte Submodul-URLs abgleichen', 'Synchronize changed submodule URLs'],
  description: [
    'Lies die Quelle in .gitmodules und gleiche die lokale Konfiguration ab. Unterscheide URL-Abgleich und Commit-Aktualisierung.',
    'Read the source in .gitmodules and synchronize local configuration. Distinguish URL synchronization from commit updating.',
  ],
  question: ['Wann brauche ich Sync statt Init / Update für Submodule?', 'When do I need Sync instead of Init / Update for submodules?'],
  keywords: 'submodule sync synchronisieren url quelle umgezogen gitmodules konfiguration remote origin',
  steps: [
    s(
      'overview',
      ['Eine Quelle kann umziehen', 'A source can move'],
      [
        'Im Lernprojekt wurde die neue URL bereits in .gitmodules übernommen. Die lokale Konfiguration des initialisierten Submoduls kennt noch die alte Quelle. Beide sind ausschließlich Beispieldaten.',
        'The learning project has already adopted the new URL in .gitmodules. The initialized submodule’s local configuration still knows the old source. Both are sample data only.',
      ],
      branchControl('sidebar-toggle'),
      { continue: false, prepare: seed({ state: 'changed-url', sidebarCollapsed: true }) },
    ),
    s(
      'sidebar',
      ['Finde die Git-Seitenleiste', 'Find the Git sidebar'],
      ['Öffne die Seitenleiste des Lernprojekts.', 'Open the learning project’s sidebar.'],
      branchControl('sidebar-toggle'),
      { prepare: seed({ state: 'changed-url', sidebarCollapsed: true }), completion: element(panel) },
    ),
    s(
      'status',
      ['Ein passender Commit beweist keine aktuelle URL', 'A matching commit does not prove the URL is current'],
      [
        'Der ausgecheckte Commit stimmt mit dem Index überein. Die Statuszeile zeigt nicht, ob lokale URLs schon aus .gitmodules übernommen wurden.',
        'The checked-out commit matches the index. The status line does not indicate whether local URLs have already been adopted from .gitmodules.',
      ],
      field('state'),
      { prepare: seed({ state: 'changed-url' }) },
    ),
    s(
      'files',
      ['Öffne die Dateiansicht', 'Open the file view'],
      ['Wechsle über die Bereichsschaltfläche zu Dateien.', 'Switch to Files using the area button.'],
      branchControl('open-files'),
      { prepare: seed({ state: 'changed-url' }), completion: element(branchControl('open-files') + '[aria-pressed="true"]') },
    ),
    s(
      'configuration',
      ['Lies die übernommene Konfiguration', 'Read the adopted configuration'],
      ['Öffne .gitmodules im Dateibaum.', 'Open .gitmodules in the file tree.'],
      fileRow('.gitmodules'),
      { prepare: seed({ state: 'changed-url', files: true }), completion: element(viewer) },
    ),
    s(
      'url',
      ['url benennt die neue Quelle', 'url identifies the new source'],
      [
        'Die URL endet jetzt auf design-moved.git. Name design und Pfad packages/design sind gleich geblieben. Die .invalid-Adresse wird im Übungsmodus nie angefragt.',
        'The URL now ends in design-moved.git. The name design and path packages/design are unchanged. Practice mode never requests this .invalid address.',
      ],
      viewer + ' [data-tutorial="file-editor"]',
      { prepare: seed({ state: 'changed-url', config: true }) },
    ),
    s(
      'local',
      ['Datei und lokale Konfiguration sind getrennt', 'The file and local configuration are separate'],
      [
        '.gitmodules gehört zum gespeicherten Projekt. Initialisierte Submodule haben zusätzliche lokale URL-Einstellungen. Ein übernommener Dateiinhalt allein gleicht diese nicht ab.',
        '.gitmodules belongs to the saved project. Initialized submodules also have local URL settings. Adopting the file contents alone does not synchronize those settings.',
      ],
      viewer + ' [data-tutorial="file-editor"]',
      { prepare: seed({ state: 'changed-url', config: true }) },
    ),
    s(
      'close-file',
      ['Schließe die Konfigurationsansicht', 'Close the configuration viewer'],
      ['Schließe den Betrachter mit X. Es ist keine Dateiänderung erforderlich.', 'Close the viewer with X. No file edit is required.'],
      branchControl('close-file'),
      { prepare: seed({ state: 'changed-url', config: true }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'scope',
      ['Sync gleicht bekannte URLs rekursiv ab', 'Sync synchronizes known URLs recursively'],
      [
        'Die Schaltfläche übernimmt die Zuordnung aus .gitmodules in die lokale Konfiguration initialisierter Submodule, auch verschachtelter. Sie initialisiert kein fehlendes Kind-Repository.',
        'The button copies the mapping from .gitmodules into initialized submodules’ local configuration, including nested modules. It does not initialize a missing child repository.',
      ],
      c('sync'),
      { prepare: seed({ state: 'changed-url' }) },
    ),
    s(
      'sync',
      ['Gleiche die Beispiel-URL ab', 'Synchronize the example URL'],
      [
        'Klicke Sync. Die Übung bestätigt den erfolgreichen Konfigurationsabgleich ohne Netzwerkzugriff.',
        'Click Sync. The exercise confirms successful configuration synchronization without network access.',
      ],
      c('sync'),
      { prepare: seed({ state: 'changed-url' }), action: 'submodules-synced' },
    ),
    s(
      'result',
      ['Der Commit bleibt gleich', 'The commit stays the same'],
      [
        'Hash und v1.0.0 sind unverändert. Sync verschiebt weder HEAD im Kind noch main im Lernprojekt und schreibt keinen neuen Eltern-Commit.',
        'The hash and v1.0.0 are unchanged. Sync moves neither the child’s HEAD nor main in the learning project and creates no new parent commit.',
      ],
      field('commit'),
      { prepare: seed({ state: 'changed-url', synced: true }) },
    ),
    s(
      'update',
      ['Aktualisiere anschließend den Zielstand', 'Update the target revision afterward'],
      [
        'Nach einem URL-Umzug kann Init / Update die bekannte Quelle zum Einrichten des Zielstands verwenden. Probiere die simulierte Aktualisierung aus.',
        'After a URL move, Init / Update can use the known source to set up the target revision. Try the simulated update.',
      ],
      c('update'),
      { prepare: seed({ state: 'changed-url', synced: true }), action: 'submodules-updated' },
    ),
    s(
      'done',
      ['Quelle abgeglichen, Zielcommit beibehalten', 'Source synchronized, target commit retained'],
      [
        'Die vorbereitete URL wurde abgeglichen und der aufgezeichnete Commit bleibt eingerichtet. Neue Durchläufe beginnen wieder mit der ursprünglichen lokalen Beispielkonfiguration.',
        'The prepared URL has been synchronized and the recorded commit remains checked out. New runs start again with the original local sample configuration.',
      ],
      panel,
      { prepare: seed({ state: 'changed-url', synced: true, updated: true }) },
    ),
  ],
};
