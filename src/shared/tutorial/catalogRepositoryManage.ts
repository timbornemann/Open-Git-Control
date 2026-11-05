import type { TutorialChapter } from './types';
import { repoStep as s, repoRow, repoControl as c, repoMenu, recipe, lessonElement as element } from './repositoryLessonHelpers';
const action = (name: string) => c(`action-${name}`);
const menu = '[role="menu"].local-repository-context-menu';
const second = repoRow('Notizbuch');
export const REPOSITORY_MANAGE_LESSON: TutorialChapter = {
  id: 'repository-manage',
  section: 'localRepos',
  title: ['Repository-Aktionen: Pfade, Links und Listeneinträge', 'Repository actions: paths, links and entries'],
  description: [
    'Das Kontextmenü bedienen, Pfad und Ursprung unterscheiden und einen Listeneintrag entfernen.',
    'Use the context menu, distinguish path and origin, and remove a catalog entry.',
  ],
  question: ['Welche Aktionen bietet ein Repository in der Liste?', 'Which actions are available for a repository in the list?'],
  keywords: 'kontextmenü context menu pfad path copy clipboard browser dateimanager folder entfernen remove pin',
  steps: [
    s(
      'overview',
      ['Aktionen gelten für den gewählten Eintrag', 'Actions apply to the chosen entry'],
      [
        'Jede Zeile hat ein Drei-Punkte-Menü. Dessen Aktionen beziehen sich auf den Pfad dieser Zeile, auch wenn ein anderes Projekt aktiv ist. Wir verwenden zunächst das Lernprojekt, später den zweiten Eintrag Notizbuch.',
        'Each row has a three-dot menu. Its actions apply to that row’s path, even if another project is active. We use the learning project first, then the second entry Notizbuch.',
      ],
      repoMenu,
      { continue: false },
    ),
    s(
      'open',
      ['Öffne das Aktionsmenü', 'Open the action menu'],
      [
        'Klicke auf die drei Punkte beim Lernprojekt. Ein Rechtsklick auf den Eintrag öffnet dasselbe Menü. Escape schließt es wieder.',
        'Click the three dots on the learning project. Right-clicking the entry opens the same menu. Escape closes it.',
      ],
      repoMenu,
      { completion: element(menu) },
    ),
    s(
      'menu',
      ['Die Gruppen im Menü erkennen', 'Recognize the menu groups'],
      [
        'Oben führen Links in Repo-Tab, Statistik und Konfigurationsansichten. Danach folgen Ordner, Pfad und Remote-Link. Unten stehen Logo, Anheften und Entfernen aus der Liste. Ein Remote-Link erscheint nur bei einer unterstützten gespeicherten Adresse.',
        'The top links open the repository tab, statistics and configuration views. Folder, path and remote links follow. Logo, pinning and removal appear at the bottom. A remote link appears only for a supported saved address.',
      ],
      menu,
      { prepare: recipe({}, [repoMenu]) },
    ),
    s(
      'copy',
      ['Kopiere den lokalen Pfad', 'Copy the local path'],
      [
        'Klicke Pfad kopieren. Gemeint ist /tutorial/OGC-Lernprojekt, nicht die Git-Adresse des Hostings. Die Übung legt den Text in eine simulierte Zwischenablage; deine echte Zwischenablage bleibt erhalten.',
        'Click Copy path. This means /tutorial/OGC-Lernprojekt, not the hosting Git address. Practice stores the text in a simulated clipboard; your actual clipboard is preserved.',
      ],
      action('copy'),
      { prepare: recipe({}, [repoMenu]), action: 'clipboard-copied' },
    ),
    s(
      'folder',
      ['Probiere den Dateimanager-Aufruf', 'Try opening the file manager'],
      [
        'Öffne das Drei-Punkte-Menü erneut und wähle Im Dateimanager öffnen. Normalerweise zeigt dein System dann den Projektordner. Die Übung bestätigt den Aufruf ohne ein externes Fenster zu öffnen.',
        'Open the three-dot menu again and choose Open in file manager. Normally your system shows the project folder. Practice confirms the action without opening an external window.',
      ],
      repoMenu,
      { prepare: recipe({}, [repoMenu]), action: 'folder-opened' },
    ),
    s(
      'browser',
      ['Öffne den Beispiel-Ursprung', 'Open the sample origin'],
      [
        'Öffne das Menü erneut und wähle Remote im Browser öffnen. Das ist die Webansicht des Hostings, nicht der lokale Ordner. Auch dieser Aufruf bleibt in der Übung simuliert und erzeugt keine Netzwerkanfrage.',
        'Open the menu again and choose Open remote in browser. This is the hosting web page, not the local folder. Practice simulates this action too, without any network request.',
      ],
      repoMenu,
      { prepare: recipe({}, [repoMenu]), action: 'external-opened' },
    ),
    s(
      'pin',
      ['Hefte über das Menü an', 'Pin through the menu'],
      [
        'Öffne das Menü erneut und wähle Repo anheften. Es ist dieselbe Favoritenfunktion wie die Stecknadel direkt in der Zeile.',
        'Open the menu again and choose Pin repository. This is the same favorite setting as the pin directly on the row.',
      ],
      repoMenu,
      { prepare: recipe({}, [repoMenu]), completion: element(`${repoRow()} ${c('pin')}[aria-pressed="true"]`) },
    ),
    s(
      'unpin',
      ['Entferne die Anheftung', 'Remove the pin'],
      [
        'Im Menü des angehefteten Lernprojekts heißt die Aktion jetzt Pin entfernen. Probiere sie aus. Der Katalogeintrag und sein Ordner bleiben bestehen.',
        'In the pinned learning project’s menu, the action now reads Remove pin. Try it. The catalog entry and its folder remain.',
      ],
      repoMenu,
      { prepare: recipe({ pinned: true }, [repoMenu]), completion: element(`${repoRow()} ${c('pin')}[aria-pressed="false"]`) },
    ),
    s(
      'remove-explained',
      ['Entfernen betrifft nur den Katalog', 'Removal affects the catalog only'],
      [
        'Wir entfernen den zweiten Eintrag Notizbuch aus der App-Liste. Die Funktion löscht keinen Projektordner und keine Git-Geschichte. Das aktive Lernprojekt bleibt geöffnet. Ein entferntes Projekt kann später wieder über Hinzufügen geöffnet werden.',
        'We will remove the second entry Notizbuch from the app list. This does not delete its folder or Git history. The active learning project stays open. A removed project can be opened again with Add.',
      ],
      second,
    ),
    s(
      'remove',
      ['Entferne Notizbuch aus der Liste', 'Remove Notizbuch from the list'],
      [
        'Öffne die drei Punkte bei Notizbuch und wähle Aus Liste entfernen. Achte auf den Projektnamen im Menü, damit die Aktion am richtigen Eintrag erfolgt.',
        'Open Notizbuch’s three-dot menu and choose Remove from list. Check the project name in the menu to apply the action to the correct entry.',
      ],
      `${second} ${c('menu')}`,
      { prepare: recipe({}, [`${second} ${c('menu')}`]), completion: { kind: 'absent', selector: second } },
    ),
    s(
      'finish',
      ['Der Arbeitsbereich bleibt erhalten', 'The workspace is preserved'],
      [
        'Das Lernprojekt ist weiterhin aktiv. Suche, Filter und Katalogaktionen organisieren den Zugriff auf Projekte. Die folgenden Detaillektionen zeigen die verlinkten Arbeitsansichten und das Repository-Logo.',
        'The learning project remains active. Search, filters and catalog actions organize access to projects. Further detail lessons explain the linked workspace views and repository logo.',
      ],
      repoRow(),
      { prepare: recipe({ entries: 'one' }) },
    ),
  ],
};
