import type { TutorialChapter, TutorialLaunchRequest } from './types';
import { step, nav } from './catalogSteps';
import { TUTORIAL_TOPIC_CHAPTERS } from './catalogTopics';

export const TUTORIAL_CHAPTERS: readonly TutorialChapter[] = [
  {
    id: 'basics',
    title: ['Dein erster Arbeitsablauf', 'Your first workflow'],
    description: ['Die Grundtour: Orientierung, Änderungen, Commit und Synchronisierung.', 'The basics: navigation, changes, a commit and synchronization.'],
    question: ['Wie fange ich an und erstelle meinen ersten Commit?', 'How do I get started and create my first commit?'],
    keywords: 'start anfänger beginner navigation stage staging commit push pull fetch branch repository grundtour',
    steps: [
      step(
        'orientation',
        ['Willkommen im Lernprojekt', 'Welcome to the learning project'],
        [
          'Hier kannst du gefahrlos üben. Die linke Symbolleiste wechselt zwischen den Hauptbereichen. Alle Daten dieser Einführung sind erfunden.',
          'Practice safely here. The activity bar on the left switches between the main areas. Every piece of data in this introduction is fictional.',
        ],
        'repo',
        '.activity-bar',
      ),
      step(
        'repositories',
        ['Wo sind meine Repositories?', 'Where are my repositories?'],
        [
          'Klicke links auf Lokale Repositories. Ein Repository ist ein Projektordner mit einer Git-Versionsgeschichte.',
          'Click Local repositories on the left. A repository is a project folder with a Git version history.',
        ],
        'repo',
        nav('localRepos'),
        { action: 'navigate:localRepos' },
      ),
      step(
        'workspace',
        ['Öffne den Arbeitsbereich', 'Open the workspace'],
        [
          'Öffne das OGC-Lernprojekt in der Liste. Im Arbeitsbereich findest du den Verlauf und deine noch nicht gespeicherten Git-Änderungen.',
          'Open OGC-Lernprojekt in the list. Its workspace contains the history and your uncommitted Git changes.',
        ],
        'localRepos',
        '.local-repositories-view',
        { action: 'navigate:repo' },
      ),
      step(
        'changes',
        ['Änderungen ansehen', 'Inspect changes'],
        [
          'Rechts zeigt Staging die geänderten Dateien. Klicke README.md an: Im Vergleich siehst du entfernte und hinzugefügte Zeilen.',
          'Staging on the right lists changed files. Click README.md: the comparison shows removed and added lines.',
        ],
        'repo',
        '[data-tutorial="staging"]',
        { action: 'inspect:diff' },
      ),
      step(
        'stage',
        ['Für den Commit vormerken', 'Stage your changes'],
        [
          'Stage README.md mit dem Plus oder nutze Alle stagen. Staging stellt die Änderungen zusammen, die dein nächster Commit enthalten soll.',
          'Stage README.md with the plus button, or use Stage all. Staging selects the changes your next commit will contain.',
        ],
        'repo',
        '[data-tutorial="staging"]',
        { action: 'staged' },
      ),
      step(
        'commit',
        ['Einen Commit erstellen', 'Create a commit'],
        [
          'Schreibe einen kurzen Titel und klicke Commit. Ein Commit speichert einen benannten Stand deiner vorgemerkten Änderungen in der lokalen Geschichte.',
          'Write a short title and click Commit. A commit saves a named snapshot of your staged changes in the local history.',
        ],
        'repo',
        '.staging-commit-area',
        { scenario: 'staged', action: 'committed' },
      ),
      step(
        'branch',
        ['Auf einem Branch arbeiten', 'Work on a branch'],
        [
          'Branches trennen Arbeitsstände. Lege über das Plus im Branch-Bereich einen Branch an, zum Beispiel feature/willkommen.',
          'Branches separate lines of work. Use the plus in the Branches section to create a branch, for example feature/welcome.',
        ],
        'repo',
        '[data-tutorial="branches"]',
        { scenario: 'clean', action: 'branch-created' },
      ),
      step(
        'sync',
        ['Mit einem Remote austauschen', 'Synchronize with a remote'],
        [
          'Fetch liest den Serverstand, Pull übernimmt Änderungen, Push veröffentlicht lokale Commits. Probiere oben Fetch aus. Auch dieser Server ist simuliert.',
          'Fetch reads the server state, Pull integrates changes, and Push publishes local commits. Try Fetch in the top bar. This server is simulated too.',
        ],
        'repo',
        '[data-tutorial="topbar"]',
        { scenario: 'clean', action: 'fetched' },
      ),
      step(
        'help',
        ['Du findest Hilfe jederzeit wieder', 'Help is always available'],
        [
          'Öffne links die Einstellungen. Unter Einführung & Hilfe kannst du die Grundtour wiederholen oder gezielt ein Thema auswählen.',
          'Open Settings on the left. Introduction & help lets you repeat this tour or choose a specific topic.',
        ],
        'repo',
        nav('settings'),
        { action: 'navigate:settings' },
      ),
    ],
  },
  {
    id: 'repositories',
    title: ['Repository-Verwaltung', 'Repository management'],
    description: ['Projekte finden, öffnen, anpinnen, klonen und initialisieren.', 'Find, open, pin, clone and initialize projects.'],
    question: ['Wie öffne oder klone ich ein Repository?', 'How do I open or clone a repository?'],
    keywords: 'repository repo projekt project öffnen open clone klonen init favoriten pin',
    steps: [
      step(
        'navigate',
        ['Lokale Projekte finden', 'Find local projects'],
        ['Öffne Lokale Repositories in der Symbolleiste.', 'Open Local repositories in the activity bar.'],
        'repo',
        nav('localRepos'),
        { action: 'navigate:localRepos' },
      ),
      step(
        'pin',
        ['Ein Projekt anpinnen', 'Pin a project'],
        [
          'Suche nach Lernprojekt und pinne es über das Sternsymbol an. Favoriten bleiben in der Liste oben.',
          'Search for Lernprojekt and pin it using the star. Favorites stay at the top of the list.',
        ],
        'localRepos',
        '.local-repositories-view',
        { action: 'repo-pinned' },
      ),
      step(
        'open',
        ['Öffnen, Klonen oder neu beginnen', 'Open, clone or start fresh'],
        [
          'Öffnen verwendet einen vorhandenen Ordner. Klonen kopiert eine Remote-Geschichte. Ein neuer Ordner kann initialisiert werden. Probiere Repository öffnen aus: Die Ordnerwahl verwendet hier nur das Lernprojekt.',
          'Open uses an existing folder. Clone copies a remote history. A new folder can be initialized. Try Open repository: the folder picker here only uses the learning project.',
        ],
        'localRepos',
        '.local-repositories-view',
        { action: 'repo-opened' },
      ),
    ],
  },
  {
    id: 'history',
    title: ['Verlauf und Dateien', 'History and files'],
    description: ['Commits, Vergleiche, Dateiansichten und Suche kennenlernen.', 'Explore commits, comparisons, file views and search.'],
    question: ['Wie sehe und bearbeite ich Dateiänderungen?', 'How do I inspect and edit file changes?'],
    keywords: 'history verlauf diff datei file editor blame suche search',
    steps: [
      step(
        'graph',
        ['Einen Commit untersuchen', 'Inspect a commit'],
        [
          'Klicke im Graphen einen Commit an. Der Inspector zeigt Nachricht, Autor und betroffene Dateien.',
          'Select a commit in the graph. The inspector shows its message, author and affected files.',
        ],
        'repo',
        '[data-tutorial="graph"]',
        { action: 'inspect:commit' },
      ),
      step(
        'diff',
        ['Eine Änderung vergleichen', 'Compare a change'],
        [
          'Wähle im Staging eine geänderte Datei aus. Rot markiert entfernte und Grün hinzugefügte Zeilen.',
          'Select a changed file in Staging. Red marks removed lines and green marks added lines.',
        ],
        'repo',
        '[data-tutorial="staging"]',
        { action: 'inspect:diff' },
      ),
      step(
        'files',
        ['Dateien und ihre Geschichte', 'Files and their history'],
        [
          'Der Datei-Modus im rechten Bereich öffnet den Projektbaum. Der Datei-Viewer bietet Bearbeiten, Verlauf und Blame: So findest du Inhalt und Herkunft einzelner Zeilen.',
          'File mode on the right opens the project tree. The file viewer offers editing, history and blame, helping you understand both content and the origin of individual lines.',
        ],
        'repo',
        '[data-tutorial="primary"]',
        { openView: 'files' },
      ),
    ],
  },
  {
    id: 'branches',
    title: ['Erweiterte Git-Arbeit', 'Advanced Git workflows'],
    description: ['Branches, Merge, Rebase, Worktrees, Tags und Submodule.', 'Branches, merge, rebase, worktrees, tags and submodules.'],
    question: ['Wie arbeite ich mit Branches und Versionen?', 'How do I work with branches and versions?'],
    keywords: 'branch merge rebase worktree tags submodule version',
    steps: [
      step(
        'create',
        ['Branch erstellen', 'Create a branch'],
        [
          'Erstelle über das Plus im Branch-Bereich einen eigenen Übungsbranch. Das Kontextmenü bietet Wechseln, Merge, Umbenennen und Löschen.',
          'Create a practice branch with the plus in the Branches section. Its context menu offers checkout, merge, rename and delete.',
        ],
        'repo',
        '[data-tutorial="branches"]',
        { scenario: 'clean', action: 'branch-created' },
      ),
      step(
        'merge',
        ['Merge und Rebase verstehen', 'Understand merge and rebase'],
        [
          'Merge verbindet Entwicklungsstände. Rebase setzt Commits auf eine andere Basis. Beide findest du an Branches beziehungsweise im Commit-Kontextmenü. Worktrees ermöglichen mehrere Arbeitsverzeichnisse für verschiedene Branches.',
          'Merge combines lines of development. Rebase replays commits on another base. Find them on branches and in the commit context menu. Worktrees provide separate working directories for different branches.',
        ],
        'repo',
        '[data-tutorial="branches"]',
        { scenario: 'clean' },
      ),
      step(
        'tags',
        ['Tags und Submodule finden', 'Find tags and submodules'],
        [
          'Tags benennen feste Versionen wie v1.0.0. Submodule binden andere Repositories ein. Beide haben eigene Bereiche in der Seitenleiste.',
          'Tags name fixed versions such as v1.0.0. Submodules embed other repositories. Both have their own sections in the sidebar.',
        ],
        'repo',
        '.sidebar',
        { scenario: 'clean' },
      ),
    ],
  },
  {
    id: 'conflicts',
    title: ['Stash und Konflikte', 'Stash and conflicts'],
    description: ['Änderungen zwischenlagern und einen Konflikt auflösen.', 'Set changes aside and resolve a conflict.'],
    question: ['Wie löse ich einen Konflikt oder parke Änderungen?', 'How do I resolve a conflict or set changes aside?'],
    keywords: 'stash konflikt conflict merge lösen resolve zwischenlagern',
    steps: [
      step(
        'stash',
        ['Änderungen parken', 'Set changes aside'],
        [
          'Über Stash im Staging kannst du unfertige Änderungen zwischenlagern und später wiederherstellen. Erstelle einen Stash für die Übungsänderung.',
          'Use Stash in Staging to set unfinished changes aside and restore them later. Create a stash for the practice change.',
        ],
        'repo',
        '[data-tutorial="staging"]',
        { action: 'stashed' },
      ),
      step(
        'resolve',
        ['Einen Konflikt lösen', 'Resolve a conflict'],
        [
          'README.md enthält einen vorbereiteten Konflikt. Öffne die Datei im Staging und wähle im Konfliktlöser den gewünschten Inhalt. Markiere sie anschließend als gelöst.',
          'README.md contains a prepared conflict. Open it from Staging and choose the desired content in the conflict resolver. Then mark it as resolved.',
        ],
        'repo',
        '[data-tutorial="staging"]',
        { scenario: 'conflict', action: 'conflict-resolved' },
      ),
      step(
        'continue',
        ['Den Vorgang abschließen', 'Finish the operation'],
        [
          'Nach dem Auflösen aller Konflikte kannst du den Merge fortsetzen oder bewusst abbrechen. Stash-Einträge lassen sich über ihr Menü wieder anwenden.',
          'After resolving all conflicts, continue the merge or deliberately abort it. Stash entries can be reapplied from their menu.',
        ],
        'repo',
        '[data-tutorial="staging"]',
        { scenario: 'stash' },
      ),
    ],
  },
  {
    id: 'recovery',
    title: ['Wiederherstellung', 'Recovery'],
    description: ['Verlorene Commits und frühere Zustände wiederfinden.', 'Find lost commits and earlier states.'],
    question: ['Wie finde ich einen verlorenen Commit wieder?', 'How do I find a lost commit?'],
    keywords: 'recovery wiederherstellung reflog forensic forensisch verloren lost reset',
    steps: [
      step(
        'find',
        ['Recovery-Center öffnen', 'Open the recovery center'],
        [
          'Öffne Recovery Center neben der Verlaufssuche; bei wenig Platz findest du es im ⋯-Menü. Der Reflog zeigt frühere HEAD-Stände, auch wenn sie nicht mehr im normalen Verlauf liegen.',
          'Open Recovery Center beside the history search; in smaller views, find it in the ⋯ menu. The reflog shows earlier HEAD positions, including ones no longer in the normal history.',
        ],
        'repo',
        '[data-tutorial="graph"]',
        { scenario: 'clean', action: 'inspect:recovery' },
      ),
      step(
        'restore',
        ['Einen Stand sichern', 'Recover a snapshot'],
        [
          'Wähle links den vorbereiteten verlorenen Commit aus. Nutze Neuen Branch erstellen, um ihn wieder erreichbar zu machen. Ein Reset verschiebt dagegen den aktuellen Branch.',
          'Select the prepared lost commit on the left. Use Create new branch to make it reachable again. A reset instead moves the current branch.',
        ],
        'repo',
        '[data-tutorial="graph"]',
        { scenario: 'clean', action: 'branch-created', openView: 'recovery' },
      ),
    ],
  },
  ...TUTORIAL_TOPIC_CHAPTERS,
];

export function resolveTutorialRequest(input: unknown): TutorialLaunchRequest {
  if (!input || typeof input !== 'object') throw new Error('Invalid tutorial request.');
  const { chapterId, stepId } = input as TutorialLaunchRequest;
  const chapter = TUTORIAL_CHAPTERS.find((item) => item.id === chapterId);
  if (!chapter || (stepId !== undefined && !chapter.steps.some((item) => item.id === stepId))) throw new Error('Unknown tutorial chapter or step.');
  return { chapterId, ...(stepId === undefined ? {} : { stepId }) };
}
