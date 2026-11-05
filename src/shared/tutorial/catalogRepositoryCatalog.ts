import type { TutorialChapter } from './types';
import { repoStep as s, repoControl as c, repoRow, recipe, lessonValue as value, lessonElement as element } from './repositoryLessonHelpers';
const search = c('search');
const filtered = recipe({}, [], [{ selector: search, value: ['Lernprojekt', 'Lernprojekt'] }]);
export const REPOSITORY_CATALOG_LESSON: TutorialChapter = {
  id: 'repositories',
  section: 'localRepos',
  title: ['Repository-Katalog: finden, ordnen und wechseln', 'Repository catalog: find, organize and switch'],
  description: [
    'Suche, Suchergebnis, Favoritenfilter, Sortierung und Wechsel zwischen zwei Beispielprojekten einzeln üben.',
    'Practice searching, results, pinned filtering, sorting and switching between two sample projects.',
  ],
  question: ['Wie finde und organisiere ich meine lokalen Projekte?', 'How do I find and organize local projects?'],
  keywords: 'repository katalog catalog search suchen sort sortieren pin favoriten wechseln switch',
  steps: [
    s(
      'overview',
      ['Die Liste ist kein Dateimanager', 'This list is not a file manager'],
      [
        'Ein Eintrag verweist auf einen Projektordner. Die Liste enthält hier OGC-Lernprojekt und Notizbuch. Aktiv kennzeichnet den gerade geöffneten Arbeitsbereich. Entfernen aus der Liste löscht den Ordner nicht. Wir üben zunächst die Suche und Ordnung.',
        'An entry refers to a project folder. This list contains OGC-Lernprojekt and Notizbuch. Active marks the currently open workspace. Removing an entry does not delete its folder. First, practice finding and organizing entries.',
      ],
      undefined,
      { continue: false },
    ),
    s(
      'search-explained',
      ['Suche nach Name oder Pfad', 'Search by name or path'],
      [
        'Das Suchfeld filtert nur diese Liste. Du kannst einen Projektnamen oder einen Teil des gespeicherten Pfads eingeben. Die Suchergebnis-Zeile zeigt, wie viele Einträge sichtbar sind; ausgeblendete Repositories sind weiterhin gespeichert.',
        'The search field only filters this list. Enter a project name or part of its stored path. The results line shows how many entries are visible; hidden repositories remain saved.',
      ],
      search,
    ),
    s(
      'search',
      ['Finde das Lernprojekt', 'Find the learning project'],
      [
        'Tippe Lernprojekt in die Suche. Achte darauf, dass nur der passende Katalogeintrag übrig bleibt. Es wird noch kein Repository geöffnet.',
        'Type Lernprojekt into Search. Notice that only the matching catalog entry remains. Searching does not open a repository.',
      ],
      search,
      { completion: value(search, ['Lernprojekt', 'Lernprojekt']) },
    ),
    s(
      'result',
      ['Das Suchergebnis lesen', 'Read the search result'],
      [
        'Jetzt bleibt OGC-Lernprojekt sichtbar. Unter dem Namen stehen der lokale Pfad und gegebenenfalls der Ursprung. Rechts erkennst du den Zeitpunkt der letzten Öffnung und die Aktionsschaltflächen. Notizbuch ist nur durch den Filter ausgeblendet.',
        'Only OGC-Lernprojekt remains visible. The local path and, when available, origin appear below its name. The last-opened time and action buttons are on the right. Notizbuch is merely filtered out.',
      ],
      repoRow(),
      { prepare: filtered },
    ),
    s(
      'clear-search',
      ['Zeige wieder alle Projekte', 'Show all projects again'],
      [
        'Leere das Suchfeld vollständig. Dadurch werden beide gespeicherten Einträge wieder sichtbar. Ein leerer Suchfilter ist keine Löschung.',
        'Clear the search field completely. Both saved entries become visible again. Clearing a filter does not delete anything.',
      ],
      search,
      { prepare: filtered, completion: value(search, ['', '']) },
    ),
    s(
      'pin-explained',
      ['Anheften erleichtert häufige Wechsel', 'Pinning helps with frequent switching'],
      [
        'Die Stecknadel am Eintrag markiert ein Projekt als Favorit. Angeheftete Projekte werden bei der Ordnung bevorzugt. Das beeinflusst nur die App-Liste und verändert weder Git-Geschichte noch Dateien.',
        'The pin on an entry marks a favorite. Pinned projects are prioritized when ordering entries. This affects the app list, not Git history or files.',
      ],
      `${repoRow()} ${c('pin')}`,
    ),
    s(
      'pin',
      ['Hefte OGC-Lernprojekt an', 'Pin OGC-Lernprojekt'],
      [
        'Klicke auf die Stecknadel beim Lernprojekt. Das Symbol zeigt danach die aktive Anheftung.',
        'Click the pin on the learning project. The icon then indicates that it is pinned.',
      ],
      `${repoRow()} ${c('pin')}`,
      { completion: element(`${repoRow()} ${c('pin')}[aria-pressed="true"]`) },
    ),
    s(
      'pinned-only',
      ['Zeige nur angeheftete Projekte', 'Show pinned projects only'],
      [
        'Aktiviere Angeheftet in der Werkzeugleiste. Dies ist ein Filter für alle Favoriten, nicht die Stecknadel eines einzelnen Eintrags.',
        'Enable Pinned in the toolbar. This filters all favorites; it is different from an individual entry’s pin.',
      ],
      c('pinned-filter'),
      { prepare: recipe({ pinned: true }), completion: element(`${c('pinned-filter')}[aria-pressed="true"]`) },
    ),
    s(
      'pinned-result',
      ['Favoritenfilter und Suche kombinieren', 'Combine pinned filtering and search'],
      [
        'Mit aktivem Favoritenfilter bleibt das angeheftete Lernprojekt sichtbar. Ein zusätzlicher Suchbegriff würde diese Auswahl weiter einschränken. Wenn du ein Projekt vermisst, prüfe deshalb beide Filter.',
        'With the pinned filter active, the learning project remains visible. An additional search term would narrow this selection further. Check both filters when a project appears to be missing.',
      ],
      '.local-repositories-view__toolbar',
      { prepare: recipe({ pinned: true }, [`${c('pinned-filter')}[aria-pressed="false"]`]) },
    ),
    s(
      'all-again',
      ['Schalte den Favoritenfilter aus', 'Turn off the pinned filter'],
      [
        'Klicke erneut auf Angeheftet. Beide Projekte sind wieder sichtbar; die Stecknadel des Lernprojekts bleibt erhalten.',
        'Click Pinned again. Both projects reappear; the learning project remains pinned.',
      ],
      c('pinned-filter'),
      {
        prepare: recipe({ pinned: true }, [`${c('pinned-filter')}[aria-pressed="false"]`]),
        completion: element(`${c('pinned-filter')}[aria-pressed="false"]`),
      },
    ),
    s(
      'sort',
      ['Probiere Name Z–A aus', 'Try Name Z–A'],
      [
        'Die Sortierung kann nach Namen, letzter Öffnung oder Erstellungszeit ordnen. Wähle jetzt Name Z–A. Favoriten bleiben vorrangig; die gewählte Sortierung ordnet Einträge innerhalb dieser Gruppen.',
        'Sort by name, last opened or creation time. Choose Name Z–A now. Pinned entries retain priority; the chosen order applies within those groups.',
      ],
      c('sort'),
      { prepare: recipe({ pinned: true }), completion: value(c('sort'), ['nameDesc', 'nameDesc']) },
    ),
    s(
      'switch',
      ['Öffne das zweite Projekt Notizbuch', 'Open the second project, Notizbuch'],
      [
        'Klicke auf den Namen Notizbuch. Der Arbeitsbereich wechselt zum anderen Beispielordner. Deine Git-Dateien werden durch einen solchen Wechsel nicht verschoben oder zusammengeführt.',
        'Click the Notizbuch name. The workspace switches to the other sample folder. Switching does not move or merge your Git files.',
      ],
      `${repoRow('Notizbuch')} .local-repositories-view__row-main`,
      { prepare: recipe({ pinned: true }), action: 'repo-second-selected' },
    ),
    s(
      'switched',
      ['Den aktiven Arbeitsbereich erkennen', 'Identify the active workspace'],
      [
        'Du arbeitest jetzt in Notizbuch. Projektname, Dateien und Verlauf gehören zu diesem Ordner. Die linke Repository-Leiste und der Katalog helfen beim Zurückwechseln. Klicke links Lokale Repositories, um die Liste wieder zu sehen.',
        'You are now working in Notizbuch. Its name, files and history belong to that folder. The repository rail and catalog help you switch back. Click Local repositories on the left to return to the list.',
      ],
      '[data-tutorial="nav-localRepos"]',
      { area: 'repo', prepare: recipe({ active: 'second' }), action: 'navigate:localRepos' },
    ),
    s(
      'finish',
      ['Katalog und Projektordner unterscheiden', 'Distinguish the catalog from project folders'],
      [
        'Du kannst jetzt suchen, Filter prüfen, sortieren, anheften und zwischen Projekten wechseln. Die folgenden Lektionen behandeln das Hinzufügen vorhandener Ordner, Initialisieren neuer Projekte, Klonen und die Verwaltungsaktionen.',
        'You can now search, check filters, sort, pin and switch projects. The following lessons cover adding existing folders, initializing projects, cloning and management actions.',
      ],
    ),
  ],
};
