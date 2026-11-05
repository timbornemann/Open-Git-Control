import type { TutorialArea, TutorialChapter, TutorialText } from './types';
import { nav, step } from './catalogSteps';

function visit(id: string, from: TutorialArea, to: TutorialArea, title: TutorialText, description: TutorialText) {
  return [
    step(
      id,
      title,
      [
        `Klicke links auf ${title[0]}. Danach schauen wir uns an, wofür dieser Bereich da ist.`,
        `Click ${title[1]} in the left activity bar. Then we will look at what this area is for.`,
      ],
      from,
      nav(to),
      { action: `navigate:${to}` },
    ),
    step(`${id}-overview`, title, description, to, '[data-tutorial="primary"]', to === 'settings' ? { settingsTab: 'help' } : {}),
  ];
}

export const TUTORIAL_OVERVIEW: TutorialChapter = {
  id: 'basics',
  section: 'overview',
  title: ['Übersicht: Wo finde ich was?', 'Overview: where do I find things?'],
  description: [
    'Besuche alle sechs Bereiche der linken Navigation. Danach entscheidest du, ob du mit den Detaillektionen weitermachen möchtest.',
    'Visit all six areas in the activity bar, then decide whether to continue with the detailed lessons.',
  ],
  question: ['Wo finde ich die verschiedenen Bereiche?', 'Where do I find the different areas?'],
  keywords: 'start anfänger beginner navigation overview übersicht bereiche grundtour einführung',
  steps: [
    step(
      'orientation',
      ['Willkommen: erst orientieren, dann üben', 'Welcome: explore first, then practice'],
      [
        'Diese kurze Übersicht zeigt dir nur, wo du was findest. Du klickst dich durch die sechs Hauptbereiche links. Alle Daten gehören zum Lernprojekt. Die ausführlichen Übungen kannst du anschließend freiwillig beginnen. Weiter und Zurück funktionieren auch mit → und ←, solange du nicht in einem Eingabefeld arbeitest.',
        'This short overview shows you where things are. Click through the six main areas on the left. All data belongs to the learning project. Afterwards, you can choose detailed practice lessons. You can also use → and ← for Next and Back while outside an input field.',
      ],
      'localRepos',
      '.activity-bar',
    ),
    ...visit(
      'workspace',
      'localRepos',
      'repo',
      ['Aktuelles Repository', 'Current repository'],
      [
        'Hier arbeitest du an einem geöffneten Projekt. In der Mitte liegt die Commit-Geschichte, rechts stehen Dateien und Staging, links findest du Branches, Tags und Stashes. In eigenen Lektionen übst du später Diffs, Staging, die Commit-Felder und weitere Git-Aktionen einzeln.',
        'This is where you work on an open project. The commit history is in the center, files and staging on the right, and branches, tags and stashes on the left. Separate lessons will guide you through diffs, staging, each commit field and further Git actions.',
      ],
    ),
    ...visit(
      'analytics',
      'repo',
      'analytics',
      ['Statistik & Analyse', 'Statistics & analytics'],
      [
        'Statistiken helfen dir, die Entwicklung eines Projekts zu verstehen: Wer hat wann woran gearbeitet, welche Dateien ändern sich häufig und welche hängen zusammen? Filter grenzen Zeitraum und Umfang ein. Diese Übersicht verändert keine Projektdateien.',
        'Analytics helps you understand how a project develops: who worked on what and when, which files change often, and which files are related? Filters narrow the time range and scope. These views do not modify project files.',
      ],
    ),
    ...visit(
      'planning',
      'analytics',
      'planner',
      ['Projektplanung', 'Project planning'],
      [
        'Hier organisierst du Aufgaben unabhängig vom Dateiverlauf. Du erfasst eine Idee, ergänzt Details, priorisierst und verschiebst Aufgaben durch ihren Arbeitsablauf. Später verbinden wir eine Aufgabe mit einem Branch, Änderungen und einem Pull Request.',
        'Organize tasks separately from file history here. Capture an idea, add details, set priorities and move tasks through their workflow. Later lessons connect a task to a branch, changes and a pull request.',
      ],
    ),
    ...visit(
      'repositories',
      'planner',
      'localRepos',
      ['Lokale Repositories', 'Local repositories'],
      [
        'Der Katalog verwaltet deine Projektordner. Du kannst Projekte suchen, wechseln, anpinnen und aus der Liste entfernen. Öffnen verwendet einen vorhandenen Ordner; Klonen holt ein Remote-Projekt; Initialisieren beginnt eine neue Geschichte. Hier geht es zunächst nur um die Orientierung.',
        'The catalog manages your project folders. Search, switch, pin or remove entries. Open uses an existing folder, Clone gets a remote project, and Initialize starts a new history. For now, just become familiar with this area.',
      ],
    ),
    ...visit(
      'hosting',
      'localRepos',
      'hosting',
      ['Hosting', 'Hosting'],
      [
        'Hosting verbindet Konten und Server mit deinen Projekten. Hier findest du Remote-Repositories, Pull Requests, CI-Läufe und Releases. Die Übung zeigt ein erfundenes Konto und Beispieldaten; eine Anmeldung ist nicht nötig. Jede dieser Funktionen erhält eigene praktische Lektionen.',
        'Hosting connects accounts and servers to your projects. Find remote repositories, pull requests, CI runs and releases here. Practice uses a fictional account and sample data without a sign-in. Each function has its own practical lessons.',
      ],
    ),
    ...visit(
      'settings',
      'hosting',
      'settings',
      ['Einstellungen', 'Settings'],
      [
        'In den Einstellungen passt du Identität, Darstellung, Tastenkürzel, Git, KI und Schutzfunktionen an. Unter Einführung & Hilfe findest du den Lernpfad und gezielte Hilfefragen wieder. Änderungen in dieser Übung betreffen ausschließlich Beispieldaten.',
        'Settings contains identity, appearance, shortcuts, Git, AI and protection options. Introduction & help brings you back to this learning path and specific questions. Changes made during practice affect sample data only.',
      ],
    ),
    step(
      'help',
      ['Die Übersicht ist geschafft', 'You have finished the overview'],
      [
        'Du kennst jetzt die sechs Hauptbereiche. Mit Weiter entscheidest du: direkt zur App zurückkehren oder mit ausführlichen Lektionen weiterlernen. Dort führen wir jede Handlung einzeln aus, einschließlich Diffs, Staging und aller Felder eines Commits. Du kannst alle Lektionen später jederzeit hier wieder öffnen.',
        'You now know the six main areas. Next lets you choose: return to the app or continue with detailed lessons. Those guide you through each action, including diffs, staging and every commit field. You can reopen any lesson here at any time.',
      ],
      'settings',
      '[data-tutorial="help"]',
      { settingsTab: 'help' },
    ),
  ],
};
