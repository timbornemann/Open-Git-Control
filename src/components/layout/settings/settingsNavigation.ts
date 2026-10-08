import type { SettingsTabId } from '@/app/state/contracts';

type Translate = (de: string, en: string) => string;

export const getSettingsCategories = (tr: Translate) => [
  { id: 'general' as const, label: tr('Allgemein', 'General'), description: tr('Darstellung und Git-Verhalten', 'Appearance and Git workflow') },
  {
    id: 'integrations' as const,
    label: tr('Konten & Server', 'Accounts & servers'),
    description: tr('Hosting-Verbindungen und Anmeldung', 'Hosting connections and sign-in'),
  },
  { id: 'api' as const, label: tr('KI & API', 'AI & API'), description: tr('Modelle und lokale Schnittstellen', 'Models and local interfaces') },
  { id: 'security' as const, label: tr('Sicherheit', 'Security'), description: tr('Bestätigungen und Secret-Scans', 'Confirmations and secret scans') },
  {
    id: 'system' as const,
    label: tr('App & Diagnose', 'App & diagnostics'),
    description: tr('Updates, Feedback und Vorgänge', 'Updates, feedback and operations'),
  },
];

export const getSettingsGroups = (tr: Translate) =>
  [
    {
      id: 'appearance',
      tab: 'general',
      title: tr('Darstellung', 'Appearance'),
      description: tr('Farbschema, Sprache und Fensteraufteilung.', 'Theme, language and window layout.'),
      keywords: 'theme language layout design farbe sprache fenster',
    },
    {
      id: 'workflow',
      tab: 'general',
      title: tr('Git & Commits', 'Git & commits'),
      description: tr('Vorgaben für Branches, Verlauf und Commit-Nachrichten.', 'Defaults for branches, history and commit messages.'),
      keywords: 'default branch standardbranch history template signoff sign-off vorlage verlauf commit',
    },
    {
      id: 'synchronization',
      tab: 'general',
      title: tr('Synchronisierung', 'Synchronization'),
      description: tr('Remote-Änderungen im Hintergrund abrufen.', 'Fetch remote changes in the background.'),
      keywords: 'auto fetch interval background sekunden intervall remote',
    },
    {
      id: 'accounts',
      tab: 'integrations',
      title: tr('Hosting-Verbindungen', 'Hosting connections'),
      description: tr('Konten für GitHub, Forgejo, GitLab und Bitbucket verwalten.', 'Manage accounts for GitHub, Forgejo, GitLab and Bitbucket.'),
      keywords: 'github forgejo gitlab bitbucket token oauth login account server konto anmeldung pat',
    },
    {
      id: 'ai-provider',
      tab: 'api',
      title: tr('KI-Verbindung', 'AI connection'),
      description: tr('Anbieter verbinden, ein Modell wählen und die Verbindung prüfen.', 'Connect a provider, choose a model and test the connection.'),
      keywords: 'ollama gemini openai model modell provider api key schlüssel url connection verbindung',
    },
    {
      id: 'ai-output',
      tab: 'api',
      title: tr('KI-Ausgabe', 'AI output'),
      description: tr('Stil und Sprache generierter Commit-Nachrichten.', 'Style and language of generated commit messages.'),
      keywords: 'commit message style language conventional stil sprache nachricht',
    },
    {
      id: 'ai-automation',
      tab: 'api',
      title: tr('KI-Auto-Commit', 'AI auto-commit'),
      description: tr('Automatisches Aufteilen und Committen von Änderungen freischalten.', 'Enable automatic splitting and committing of changes.'),
      keywords: 'automatic auto commit automatisch',
    },
    {
      id: 'local-api',
      tab: 'api',
      title: tr('Lokale API', 'Local API'),
      description: tr('Verbindung zum lokalen Planning-Dienst und Zugriffstokens.', 'Local planning service connection and access tokens.'),
      keywords: 'planning ip port base url access token validity api local lokal zugriff gültigkeit',
    },
    {
      id: 'api-agent',
      tab: 'api',
      title: tr('Agenten verbinden', 'Connect agents'),
      description: tr('MCP-Konfiguration und Beispiele für externe Werkzeuge.', 'MCP configuration and examples for external tools.'),
      keywords: 'mcp agent curl json rpc config configuration tools',
    },
    {
      id: 'api-reference',
      tab: 'api',
      title: tr('API-Referenz', 'API reference'),
      description: tr('Verfügbare Planning- und MCP-Endpunkte nachschlagen.', 'Look up available planning and MCP endpoints.'),
      keywords: 'mcp rest api endpoint openapi reference endpunkte referenz tools',
    },
    {
      id: 'safeguards',
      tab: 'security',
      title: tr('Git-Schutz', 'Git safeguards'),
      description: tr('Bestätigungen für riskante Git-Aktionen.', 'Confirmations for dangerous Git operations.'),
      keywords: 'confirm dangerous force reset delete risky bestätigen gefährlich gefährliche gefaehrliche',
    },
    {
      id: 'secret-scan',
      tab: 'security',
      title: tr('Secret-Scan', 'Secret scan'),
      description: tr('Commits und Pushes vor der Veröffentlichung prüfen.', 'Check commits and pushes before publishing.'),
      keywords: 'secret scan strictness commit push low medium high streng strenge strengegrad',
    },
    {
      id: 'allowlist',
      tab: 'security',
      title: tr('Repository-Allowlist', 'Repository allowlist'),
      description: tr('Ausnahmen werden im jeweiligen Repository verwaltet und geteilt.', 'Exceptions are managed and shared in each repository.'),
      keywords: 'secret scan allow list allowlist ausnahmen exceptions repository',
    },
    {
      id: 'updates',
      tab: 'system',
      title: tr('App-Updates', 'App updates'),
      description: tr('Installierte Version und Aktualisierungen.', 'Installed version and updates.'),
      keywords: 'update download install version automatic automatisch aktualisierung',
    },
    {
      id: 'feedback',
      tab: 'system',
      title: tr('Feedback & Fehlerberichte', 'Feedback & issue reports'),
      description: tr('Fehler, Ideen und Fragen zum Programm melden.', 'Report bugs, ideas and questions about the app.'),
      keywords: 'feedback bug issue report idea question fehler idee frage',
    },
    {
      id: 'diagnostics',
      tab: 'system',
      title: tr('Diagnose', 'Diagnostics'),
      description: tr('Einen bereinigten Diagnosebericht für die Fehlersuche kopieren.', 'Copy a redacted diagnostic report for troubleshooting.'),
      keywords: 'diagnostics report copy diagnose bericht kopieren troubleshooting',
    },
    {
      id: 'jobs',
      tab: 'system',
      title: tr('Vorgangsverlauf', 'Operation history'),
      description: tr('Letzte Git-Vorgänge und ihre Ergebnisse.', 'Recent Git operations and their results.'),
      keywords: 'jobs operations history log clear verlauf vorgänge löschen',
    },
  ] as const satisfies ReadonlyArray<{ id: string; tab: SettingsTabId; title: string; description: string; keywords: string }>;

export type SettingsGroupId = ReturnType<typeof getSettingsGroups>[number]['id'];

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-–—/&]+/g, ' ');

export const searchSettingsGroups = (query: string, tr: Translate) => {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const categories = getSettingsCategories(tr);
  return getSettingsGroups(tr).filter((group) => {
    const category = categories.find((item) => item.id === group.tab)!;
    const text = normalize(`${group.title} ${group.description} ${group.keywords} ${category.label}`);
    return terms.every((term) => text.includes(term));
  });
};
