import type { TutorialArea, TutorialChapter, TutorialStep, TutorialText } from './types';
import { repoStep as s, repoMenu, lessonElement } from './repositoryLessonHelpers';

type Destination = { id: string; name: TutorialText; area: TutorialArea; route: string; openView?: TutorialStep['openView']; description: TutorialText };
const destinations: readonly Destination[] = [
  {
    id: 'open',
    name: ['Repo-Tab öffnen', 'Open repository tab'],
    area: 'repo',
    route: 'graph',
    description: [
      'Der Repo-Tab zeigt die Git-Arbeit am gewählten Projekt: links Branches und weitere Git-Bereiche, in der Mitte den Commit-Verlauf und daneben Dateien beziehungsweise Staging. Der Katalogeintrag bestimmt, für welchen Ordner diese Ansichten gelten.',
      'The repository tab shows Git work for the selected project: branches and other Git sections on the left, commit history in the center, and files or staging alongside it. The catalog entry determines which folder these views belong to.',
    ],
  },
  {
    id: 'analytics',
    name: ['Statistik & Analyse', 'Statistics & analytics'],
    area: 'analytics',
    route: 'analytics',
    description: [
      'Diese Ansicht wertet die Geschichte des ausgewählten Repositories aus. Zeitraum, Autoren und Dateien begrenzen die Analyse. Die Zahlen beschreiben gespeicherte Commits; sie ersetzen weder die Dateiliste noch die Prüfung deiner aktuellen Änderungen. Eigene Lektionen erklären die einzelnen Auswertungen.',
      'This view analyzes the selected repository’s history. Date, author and file filters narrow the analysis. Its numbers describe saved commits; they do not replace the file list or review of current changes. Separate lessons explain each analysis.',
    ],
  },
  {
    id: 'run',
    name: ['Run-Konfiguration', 'Run configuration'],
    area: 'repo',
    route: 'runConfig',
    openView: 'runConfig',
    description: [
      'Hier beschreibst du Befehle, Arbeitsverzeichnisse und Startbedingungen für dieses Projekt. Eine Konfiguration zu öffnen startet noch keinen Prozess. In der Run-Lektion erstellst du später einen Beispielbefehl, startest ihn simuliert und prüfst seine Ausgabe.',
      'Here you configure commands, working directories and start conditions for this project. Opening a configuration does not start a process. The Run lessons later create a sample command, start it in simulation and inspect its output.',
    ],
  },
  {
    id: 'allowlist',
    name: ['Secret-Scan-Allowlist', 'Secret-scan allowlist'],
    area: 'repo',
    route: 'secretScanAllowlist',
    openView: 'secretScanAllowlist',
    description: [
      'Die Allowlist hält begründete Ausnahmen für den Secret-Scan im Projekt fest. Ein Treffer sollte zuerst geprüft werden; echte Zugangsdaten gehören nicht als Ausnahme freigegeben. Die Ansicht zeigt Pfad, Inhalt und Speichern. Jetzt suchen wir nur den Bereich; eine eigene Schutz-Lektion erklärt die Regeln und ihre Prüfung.',
      'The allowlist records justified exceptions to the project’s secret scan. Review a finding first; actual credentials should not be allowed as exceptions. This view shows the file path, contents and Save. For now, locate the area; a dedicated protection lesson explains rules and validation.',
    ],
  },
  {
    id: 'remote',
    name: ['Remote-Konfiguration', 'Remote configuration'],
    area: 'repo',
    route: 'remoteConfig',
    openView: 'remoteConfig',
    description: [
      'Remotes ordnen Namen wie origin den Git-Adressen eines Projekts zu. Diese Ansicht zeigt Verbindungen sowie Vorgaben für Fetch, Pull und Push. Eine Remote-Adresse ist vom lokalen Projektpfad zu unterscheiden. Das Öffnen der Konfiguration überträgt noch keine Änderungen.',
      'Remotes map names such as origin to a project’s Git addresses. This view shows connections and defaults for Fetch, Pull and Push. A remote address is different from the local project path. Opening the configuration does not transfer changes.',
    ],
  },
  {
    id: 'publish',
    name: ['Repository veröffentlichen', 'Publish repository'],
    area: 'repo',
    route: 'repositoryPublication',
    openView: 'repositoryPublication',
    description: [
      'Dieser Assistent verbindet ein vorhandenes lokales Projekt mit einem neu angelegten Hosting-Repository. Er führt durch Konto und Ziel, Verbindung, Branches beziehungsweise Tags und Prüfung. Das bloße Öffnen veröffentlicht nichts. Spätere Hosting-Lektionen üben den gesamten Ablauf mit dem Beispielkonto.',
      'This wizard connects an existing local project to a newly created hosted repository. It walks through account and destination, connection, branches or tags and review. Opening it publishes nothing. Later hosting lessons practice the entire flow with the sample account.',
    ],
  },
];
const routeTarget = (route: string) => `[data-tutorial="primary"][data-tutorial-route="${route}"]`;
export const REPOSITORY_SHORTCUTS_LESSON: TutorialChapter = {
  id: 'repository-shortcuts',
  section: 'localRepos',
  title: ['Vom Katalog in die Arbeitsansichten', 'From the catalog to workspace views'],
  description: [
    'Jede Verknüpfung des Repository-Menüs einzeln öffnen, ihren Zweck erkennen und den Rückweg üben.',
    'Open every workspace shortcut in the repository menu, understand its purpose and practice returning.',
  ],
  question: ['Wie komme ich vom Repository-Katalog zu Konfiguration und Analyse?', 'How do I reach configuration and analysis from the repository catalog?'],
  keywords: 'kontextmenü navigation shortcut verknüpfung analyse analytics run allowlist remotes veröffentlichen publication',
  steps: [
    s(
      'overview',
      ['Ein Projekt, mehrere Arbeitsansichten', 'One project, several workspace views'],
      [
        'Das Drei-Punkte-Menü einer Repository-Zeile enthält Verknüpfungen zu sechs Arbeitsansichten. Wir öffnen jede am Lernprojekt, lesen ihre Erklärung und kehren zur Liste zurück. Für die eigentlichen Vorgänge gibt es danach eigene Detaillektionen.',
        'A repository row’s three-dot menu links to six workspace views. We will open each for the learning project, read its explanation and return to the list. Dedicated lessons then explain the actual operations in detail.',
      ],
      repoMenu,
      { continue: false },
    ),
    ...destinations.flatMap((destination) => [
      s(
        `open-${destination.id}`,
        [`Öffne „${destination.name[0]}“`, `Open “${destination.name[1]}”`],
        [
          `Öffne die drei Punkte beim OGC-Lernprojekt und wähle „${destination.name[0]}“. Der Eintrag bezieht sich auf dieses Repository, auch wenn zuvor ein anderes Projekt aktiv war.`,
          `Open OGC-Lernprojekt’s three-dot menu and choose “${destination.name[1]}”. The entry applies to this repository, even if a different project was previously active.`,
        ],
        repoMenu,
        { completion: lessonElement(routeTarget(destination.route)) },
      ),
      s(`inspect-${destination.id}`, destination.name, destination.description, routeTarget(destination.route), {
        area: destination.area,
        openView: destination.openView,
      }),
      s(
        `return-${destination.id}`,
        ['Gehe über das linke Menü zurück', 'Return through the left menu'],
        [
          'Klicke links auf Lokale Repositories. Du kehrst zum Katalog zurück; der Projektordner bleibt unverändert. Anschließend öffnen wir die nächste Verknüpfung beziehungsweise schließen diese Lektion ab.',
          'Click Local repositories on the left. You return to the catalog; the project folder remains unchanged. Next we open another shortcut or finish this lesson.',
        ],
        '[data-tutorial="nav-localRepos"]',
        { area: destination.area, openView: destination.openView, action: 'navigate:localRepos' },
      ),
    ]),
    s(
      'finish',
      ['Die Einstiege sind jetzt bekannt', 'The entry points are now familiar'],
      [
        'Du hast alle sechs Arbeitsansichten über das Menü geöffnet und den Rückweg ausprobiert. Verwende die Suche in Einführung & Hilfe, um die passende Detaillektion zu einem Vorgang zu starten. Jeder Einstieg beginnt wieder mit vorbereiteten Beispieldaten.',
        'You opened all six workspace views through the menu and practiced returning. Search Introduction & help to start the detailed lesson for an operation. Every entry starts again with prepared sample data.',
      ],
    ),
  ],
};
