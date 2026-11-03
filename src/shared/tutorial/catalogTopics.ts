import type { TutorialChapter } from './types';
import { step, nav } from './catalogSteps';

export const TUTORIAL_TOPIC_CHAPTERS: readonly TutorialChapter[] = [
  {
    id: 'planning',
    title: ['Projektplanung', 'Project planning'],
    description: ['Aufgaben, Status und den Weg zum Pull Request ausprobieren.', 'Try tasks, statuses and the path to a pull request.'],
    question: ['Wie plane ich Aufgaben und starte deren Bearbeitung?', 'How do I plan tasks and start working on them?'],
    keywords: 'planning planner planung todo aufgabe task board workflow pr',
    steps: [
      step(
        'navigate',
        ['Planung öffnen', 'Open planning'],
        [
          'Klicke links auf Projektplanung. Das Board gehört zum ausgewählten Projekt.',
          'Click Project planning on the left. The board belongs to the selected project.',
        ],
        'repo',
        nav('planner'),
        { action: 'navigate:planner' },
      ),
      step(
        'create',
        ['Eine Aufgabe hinzufügen', 'Add a task'],
        [
          'Erstelle eine Aufgabe mit Titel, Priorität und Status. Die Beispieldaten enthalten bereits Aufgaben in mehreren Spalten.',
          'Create a task with a title, priority and status. The sample data already contains tasks in several columns.',
        ],
        'planner',
        '[data-tutorial="primary"]',
        { action: 'task-created' },
      ),
      step(
        'move',
        ['Den Fortschritt festhalten', 'Record progress'],
        [
          'Verschiebe oder bearbeite eine Aufgabe und ändere ihren Status. Über Bearbeitung starten und Aufgaben-Workflow öffnen führt die App von Branch und Commit bis zum Pull Request.',
          'Move or edit a task and change its status. Start work and Open task workflow guide you from branch and commit to a pull request.',
        ],
        'planner',
        '[data-tutorial="primary"]',
        { action: 'task-updated' },
      ),
    ],
  },
  {
    id: 'hosting',
    title: ['Hosting und Veröffentlichung', 'Hosting and publishing'],
    description: ['Konten, Repositories, Pull Requests, CI und Releases erkunden.', 'Explore accounts, repositories, pull requests, CI and releases.'],
    question: ['Wie verbinde ich Hosting und finde Pull Requests?', 'How do I connect hosting and find pull requests?'],
    keywords: 'hosting github gitlab forgejo bitbucket konto account login pull request pr ci release veröffentlichen publish',
    steps: [
      step(
        'navigate',
        ['Hosting öffnen', 'Open hosting'],
        [
          'Öffne Hosting links in der Symbolleiste. Das Beispielkonto ist bereits verbunden und benötigt keine Anmeldung.',
          'Open Hosting in the activity bar. The sample account is already connected and needs no sign-in.',
        ],
        'repo',
        nav('hosting'),
        { action: 'navigate:hosting' },
      ),
      step(
        'repositories',
        ['Ein Hosting-Projekt öffnen', 'Open a hosted project'],
        [
          'Wähle das Lernprojekt aus. Die Repository-Ansicht bietet Übersicht, Pull Requests, Workflows und Releases. Öffne einen Pull Request, um Beschreibung und Prüfungen zu lesen.',
          'Select the learning project. Its view offers an overview, pull requests, workflows and releases. Open a pull request to read its description and checks.',
        ],
        'hosting',
        '[data-tutorial="primary"]',
        { action: 'hosting-inspected' },
      ),
      step(
        'publish',
        ['Veröffentlichen und Releases', 'Publishing and releases'],
        [
          'Im lokalen Arbeitsbereich findest du Repository veröffentlichen und Release erstellen in der oberen Aktionsleiste. Eine Veröffentlichung richtet ein Remote ein; ein Release benennt eine fertige Version und kann Dateien enthalten.',
          'In the local workspace, find Publish repository and Create release in the top action bar. Publishing sets up a remote; a release identifies a finished version and can include files.',
        ],
        'repo',
        '[data-tutorial="topbar"]',
        { scenario: 'clean' },
      ),
    ],
  },
  {
    id: 'analytics',
    title: ['Statistik und Timeline', 'Statistics and timeline'],
    description: ['Projektentwicklung filtern und frühere Stände untersuchen.', 'Filter project evolution and inspect earlier snapshots.'],
    question: ['Wo finde ich Statistiken und die Projekt-Timeline?', 'Where do I find statistics and the project timeline?'],
    keywords: 'analytics analyse statistik statistics timeline churn hotspots coupling',
    steps: [
      step(
        'navigate',
        ['Statistik öffnen', 'Open statistics'],
        [
          'Klicke links auf Statistik & Analyse. Die Übung enthält vorberechnete Daten, die auch offline funktionieren.',
          'Click Statistics & analytics on the left. This exercise contains precomputed data that works offline.',
        ],
        'repo',
        nav('analytics'),
        { action: 'navigate:analytics' },
      ),
      step(
        'filters',
        ['Fragen an die Geschichte stellen', 'Explore the history'],
        [
          'Wähle Zeitraum, Bereich oder Dateifilter. Übersichten, Hotspots und Dateikopplung zeigen unterschiedliche Blickwinkel auf dieselbe Geschichte.',
          'Choose a time range, scope or file filter. Overviews, hotspots and file coupling provide different views of the same history.',
        ],
        'analytics',
        '[data-tutorial="primary"]',
        { action: 'analytics-filtered' },
      ),
      step(
        'timeline',
        ['Frühere Projektstände', 'Earlier project snapshots'],
        [
          'Die Timeline im Repository-Verlauf spielt Dateistände entlang der Commits ab. Nutze sie, um Entwicklung und Zusammenhänge zeitlich nachzuvollziehen.',
          'The timeline in repository history replays file snapshots across commits. Use it to understand how the project developed over time.',
        ],
        'repo',
        '[data-tutorial="graph"]',
        { scenario: 'clean' },
      ),
    ],
  },
  {
    id: 'run',
    title: ['Run-Funktionen', 'Run commands'],
    description: ['Projektbefehle konfigurieren und Ausgaben untersuchen.', 'Configure project commands and inspect their output.'],
    question: ['Wie starte ich einen Build oder Test aus der App?', 'How do I run a build or test from the app?'],
    keywords: 'run build test console konsole ausgabe command befehl',
    steps: [
      step(
        'config',
        ['Run-Konfiguration finden', 'Find run configuration'],
        [
          'Öffne oben ⋯ → Run → Run-Konfiguration. Bei breiten Fenstern ist das Run-Menü direkt in der Aktionsleiste sichtbar. Die Übung enthält einen Testbefehl; es wird kein echter Prozess gestartet.',
          'Open ⋯ → Run → Run configuration at the top. In wider windows, the Run menu is directly visible in the action bar. This exercise includes a test command; no real process is started.',
        ],
        'repo',
        '[data-tutorial="topbar"]',
      ),
      step(
        'start',
        ['Einen Testlauf starten', 'Start a test run'],
        [
          'Starte den vorbereiteten Testlauf über ⋯ → Run → Test. Bei breiten Fenstern kannst du auch das Run-Menü direkt verwenden. Die Konsole zeigt simulierte Ausgabe und das Ergebnis.',
          'Start the prepared test run through ⋯ → Run → Test. In wider windows, you can also use the Run menu directly. The console shows simulated output and the result.',
        ],
        'repo',
        '[data-tutorial="topbar"]',
        { action: 'run-started' },
      ),
    ],
  },
  {
    id: 'ai',
    title: ['KI und Schnittstellen', 'AI and interfaces'],
    description: ['Commit-Hilfen, Planning API und MCP kennenlernen.', 'Learn about commit assistance, the Planning API and MCP.'],
    question: ['Wie nutze ich KI und verbinde einen Agenten?', 'How do I use AI and connect an agent?'],
    keywords: 'ki ai ollama gemini openai api mcp agent commit nachricht message',
    steps: [
      step(
        'message',
        ['Eine Commit-Nachricht vorschlagen', 'Suggest a commit message'],
        [
          'Stage deine Änderungen und nutze die KI-Schaltfläche im Commit-Bereich. Der Vorschlag wird hier lokal simuliert und lässt sich anschließend bearbeiten.',
          'Stage your changes and use the AI button in the commit area. The suggestion is simulated locally here and can be edited afterwards.',
        ],
        'repo',
        '.staging-commit-area',
        { scenario: 'staged', action: 'ai-generated' },
      ),
      step(
        'interfaces',
        ['KI & API öffnen', 'Open AI & API'],
        [
          'In den Einstellungen unter KI & API findest du Anbieter, Ausgabeoptionen, die lokale Planning API und die MCP-Konfiguration für Agenten. Alle hier sichtbaren Tokens und Verbindungen sind Beispiele.',
          'Settings → AI & API contains providers, output options, the local Planning API and MCP configuration for agents. All tokens and connections shown here are samples.',
        ],
        'settings',
        '[data-tutorial="primary"]',
        { settingsTab: 'api' },
      ),
    ],
  },
  {
    id: 'settings',
    title: ['Einstellungen und Schutz', 'Settings and safeguards'],
    description: ['Identität, Tastenkürzel, Sicherheit, Diagnose und Hilfe finden.', 'Find identity, shortcuts, security, diagnostics and help.'],
    question: ['Wo ändere ich meine Einstellungen und Schutzfunktionen?', 'Where do I change settings and safeguards?'],
    keywords: 'settings einstellungen sprache language theme identität identity shortcut tastenkürzel security secret scan diagnose diagnose update jobs',
    steps: [
      step(
        'general',
        ['Darstellung und Identität', 'Appearance and identity'],
        [
          'Allgemein enthält Sprache, Farbschema, Git-Vorgaben und Commit-Identität. Probiere eine Einstellung aus: Sie gilt hier nur für die Übung.',
          'General contains language, theme, Git defaults and commit identity. Try changing a setting: it applies only to this exercise.',
        ],
        'settings',
        '[data-tutorial="primary"]',
        { settingsTab: 'general', action: 'setting-changed' },
      ),
      step(
        'shortcuts',
        ['Tastenkürzel und Navigation', 'Shortcuts and navigation'],
        [
          'Tastenkürzel zeigt alle verfügbaren Aktionen und ihre Belegung. Hier kannst du beispielsweise Commit, Repository-Wechsel und die Befehlspalette finden.',
          'Keyboard shortcuts lists available actions and their bindings. Find commit, repository switching and the command palette here.',
        ],
        'settings',
        '[data-tutorial="primary"]',
        { settingsTab: 'shortcuts' },
      ),
      step(
        'security',
        ['Schutz vor Fehlern', 'Safeguards'],
        [
          'Sicherheit steuert Bestätigungen und Secret-Scans. Ein Scan prüft auf versehentlich veröffentlichte Zugangsdaten. Ausnahmen werden bewusst im jeweiligen Repository gepflegt.',
          'Security controls confirmations and secret scans. A scan checks for accidentally published credentials. Exceptions are deliberately managed in each repository.',
        ],
        'settings',
        '[data-tutorial="primary"]',
        { settingsTab: 'security' },
      ),
      step(
        'system',
        ['Diagnose und Vorgänge', 'Diagnostics and operations'],
        [
          'App & Diagnose enthält Updates, Werkzeuge, Speicherpflege, Feedback und den Vorgangsverlauf. Hier findest du Ergebnisse und Hilfe zur Fehlersuche.',
          'App & diagnostics contains updates, tools, storage maintenance, feedback and operation history. Find results and troubleshooting help here.',
        ],
        'settings',
        '[data-tutorial="primary"]',
        { settingsTab: 'system' },
      ),
    ],
  },
];
