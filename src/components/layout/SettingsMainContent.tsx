import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettingsDto, GitJobEventDto, UpdaterStatusDto } from '../../global';
import { useI18n } from '../../i18n';

type SettingsMainContentProps = {
  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
};

type SettingsTabId = 'general' | 'integrations' | 'security' | 'system';

const THEME_OPTIONS: Array<{
  value: AppSettingsDto['theme'];
  label: string;
}> = [
  { value: 'copper-night', label: 'Copper Night' },
  { value: 'midnight-teal', label: 'Midnight Teal' },
  { value: 'graphite-blue', label: 'Graphite Blue' },
  { value: 'forest-copper', label: 'Forest Copper' },
  { value: 'porcelain-light', label: 'Porcelain Light' },
  { value: 'ember-slate', label: 'Ember Slate' },
  { value: 'arctic-mint', label: 'Arctic Mint' },
];

export const SettingsMainContent: React.FC<SettingsMainContentProps> = ({
  settings,
  onUpdateSettings,
  jobs,
  onClearJobs,
}) => {
  const { tr, locale } = useI18n();
  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20), [jobs]);

  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatusDto | null>(null);
  const [updaterMessage, setUpdaterMessage] = useState<string | null>(null);
  const [isRunningUpdate, setIsRunningUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

  const selectedModel = settings.aiProvider === 'gemini' ? settings.geminiModel : settings.ollamaModel;

  const mergedModelOptions = useMemo(() => {
    const values = [...modelOptions, selectedModel].filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [modelOptions, selectedModel]);

  const tabs = useMemo<Array<{ id: SettingsTabId; label: string }>>(() => ([
    { id: 'general', label: tr('Allgemein', 'General') },
    { id: 'integrations', label: tr('Integrationen', 'Integrations') },
    { id: 'security', label: tr('Sicherheit', 'Security') },
    { id: 'system', label: tr('System', 'System') },
  ]), [tr]);

  const updaterStatusLabel = useMemo(() => {
    if (!updaterStatus) return tr('Lade Update-Status...', 'Loading updater status...');

    switch (updaterStatus.state) {
      case 'checking':
        return tr('Suche nach Updates...', 'Checking for updates...');
      case 'update-available':
        return tr('Update verfuegbar', 'Update available');
      case 'no-update':
        return tr('App ist aktuell', 'App is up to date');
      case 'downloading':
        return tr('Update wird heruntergeladen...', 'Downloading update...');
      case 'downloaded':
        return tr('Update bereit zur Installation', 'Update ready to install');
      case 'error':
        return tr('Update-Fehler', 'Updater error');
      case 'idle':
      default:
        return tr('Bereit', 'Ready');
    }
  }, [updaterStatus, tr]);

  const updaterSupported = Boolean(updaterStatus?.isSupported);
  const installedVersion = appVersion || updaterStatus?.currentVersion || tr('unbekannt', 'unknown');

  const oneClickUpdateLabel = useMemo(() => {
    if (isRunningUpdate || updaterStatus?.state === 'checking') return tr('1/2 Suche nach Update...', '1/2 Checking for update...');
    if (updaterStatus?.state === 'downloading') return tr('1/2 Lade Update herunter...', '1/2 Downloading update...');
    if (updaterStatus?.state === 'downloaded') return tr('1/2 Download abgeschlossen', '1/2 Download complete');
    if (updaterStatus?.state === 'update-available') return tr('1/2 Update jetzt herunterladen', '1/2 Download update now');
    return tr('1/2 Nach Update suchen', '1/2 Check for update');
  }, [isRunningUpdate, updaterStatus?.state, tr]);

  const oneClickUpdateDisabled =
    !updaterSupported
    || isRunningUpdate
    || isInstallingUpdate
    || updaterStatus?.state === 'checking'
    || updaterStatus?.state === 'downloading'
    || updaterStatus?.state === 'downloaded';

  const setSelectedModel = async (model: string) => {
    if (settings.aiProvider === 'gemini') {
      await onUpdateSettings({ geminiModel: model });
      return;
    }
    await onUpdateSettings({ ollamaModel: model });
  };

  const formatBytes = (bytes: number | null): string => {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const testConnection = async () => {
    if (!window.electronAPI) return;
    setIsTestingAi(true);
    setAiStatus(null);
    try {
      const result = await window.electronAPI.aiTestConnection();
      if (!result.success) {
        setAiStatus(tr(`Verbindung fehlgeschlagen: ${result.error}`, `Connection failed: ${result.error}`));
        return;
      }
      setAiStatus(tr(`Verbunden: ${result.data.provider} / ${result.data.model} (${result.data.detail})`, `Connected: ${result.data.provider} / ${result.data.model} (${result.data.detail})`));
    } catch (error: unknown) {
      setAiStatus(error instanceof Error ? error.message : tr('Verbindung fehlgeschlagen.', 'Connection failed.'));
    } finally {
      setIsTestingAi(false);
    }
  };

  const loadModels = async () => {
    if (!window.electronAPI) return;
    setIsLoadingModels(true);
    setAiStatus(null);
    try {
      const result = await window.electronAPI.aiListModels();
      if (!result.success) {
        setAiStatus(tr(`Modelle konnten nicht geladen werden: ${result.error}`, `Could not load models: ${result.error}`));
        return;
      }
      setModelOptions(result.data);
      if (!selectedModel && result.data.length > 0) {
        await setSelectedModel(result.data[0]);
      }
      setAiStatus(tr(`${result.data.length} Modell(e) geladen.`, `${result.data.length} model(s) loaded.`));
    } catch (error: unknown) {
      setAiStatus(error instanceof Error ? error.message : tr('Modelle konnten nicht geladen werden.', 'Could not load models.'));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleRunOneClickUpdate = async () => {
    if (!window.electronAPI) return;
    setIsRunningUpdate(true);
    setUpdaterMessage(null);
    try {
      const result = await window.electronAPI.runOneClickAppUpdate();
      if (!result.success) {
        setUpdaterMessage(result.error || tr('Update konnte nicht gestartet werden.', 'Could not start update.'));
        return;
      }
      if (result.action === 'downloaded') {
        setUpdaterMessage(tr('Update heruntergeladen. Bitte installieren.', 'Update downloaded. Please install.'));
        return;
      }
      if (result.action === 'no-update') {
        setUpdaterMessage(tr('App ist bereits aktuell.', 'App is already up to date.'));
        return;
      }
      setUpdaterMessage(tr('Update-Pruefung abgeschlossen.', 'Update check completed.'));
    } catch (error: unknown) {
      setUpdaterMessage(error instanceof Error ? error.message : tr('Update konnte nicht gestartet werden.', 'Could not start update.'));
    } finally {
      setIsRunningUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.electronAPI) return;
    setIsInstallingUpdate(true);
    setUpdaterMessage(null);
    try {
      const result = await window.electronAPI.installAppUpdate();
      if (!result.success) {
        setUpdaterMessage(result.error || tr('Update-Installation konnte nicht gestartet werden.', 'Could not start update installation.'));
        return;
      }
      setUpdaterMessage(tr('App wird fuer das Update neu gestartet...', 'Restarting app to install update...'));
    } catch (error: unknown) {
      setUpdaterMessage(error instanceof Error ? error.message : tr('Update-Installation konnte nicht gestartet werden.', 'Could not start update installation.'));
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  useEffect(() => {
    if (!window.electronAPI) return;
    let active = true;

    const bootstrapUpdater = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        if (active) setAppVersion(version);
      } catch {
        if (active) setUpdaterMessage(tr('App-Version konnte nicht geladen werden.', 'Could not load app version.'));
      }

      try {
        const status = await window.electronAPI.getUpdaterStatus();
        if (!active) return;
        setUpdaterStatus(status);
        if (status.currentVersion) setAppVersion((current) => current || status.currentVersion);
      } catch {
        if (!active) return;
        setUpdaterMessage((current) => current || tr('Update-Status konnte nicht geladen werden.', 'Could not load updater status.'));
      }
    };

    void bootstrapUpdater();

    const unsubscribe = window.electronAPI.onUpdaterEvent((status) => {
      if (!active) return;
      setUpdaterStatus(status);
      if (status.currentVersion) setAppVersion((current) => current || status.currentVersion);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [tr]);

  return (
    <div className="settings-main">
      <div className="settings-tabs" role="tablist" aria-label={tr('Einstellungsbereiche', 'Settings sections')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        {activeTab === 'general' && (
          <div className="settings-grid">
            <section className="settings-card">
              <h3>{tr('Darstellung', 'Appearance')}</h3>
              <label>
                {tr('Theme', 'Theme')}
                <select value={settings.theme} onChange={(e) => void onUpdateSettings({ theme: e.target.value as AppSettingsDto['theme'] })}>
                  {THEME_OPTIONS.map((themeOption) => <option key={themeOption.value} value={themeOption.value}>{themeOption.label}</option>)}
                </select>
              </label>
              <label>
                {tr('Sprache', 'Language')}
                <select value={settings.language} onChange={(e) => void onUpdateSettings({ language: e.target.value as 'de' | 'en' })}>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </select>
              </label>
            </section>

            <section className="settings-card">
              <h3>{tr('Workflow', 'Workflow')}</h3>
              <label>
                {tr('Default Branch', 'Default branch')}
                <input type="text" value={settings.defaultBranch} onChange={(e) => void onUpdateSettings({ defaultBranch: e.target.value })} />
              </label>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.showSecondaryHistory}
                  onChange={(e) => void onUpdateSettings({ showSecondaryHistory: e.target.checked })}
                />
                {tr('Sekundaere Historie anzeigen (alle Branches)', 'Show secondary history (all branches)')}
              </label>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.commitSignoffByDefault}
                  onChange={(e) => void onUpdateSettings({ commitSignoffByDefault: e.target.checked })}
                />
                {tr('Commit Signoff standardmaessig aktiv', 'Enable commit signoff by default')}
              </label>
              <label>
                {tr('Commit Template', 'Commit template')}
                <textarea rows={5} value={settings.commitTemplate} onChange={(e) => void onUpdateSettings({ commitTemplate: e.target.value })} />
              </label>
            </section>

            <section className="settings-card">
              <h3>{tr('Synchronisation', 'Synchronization')}</h3>
              <label>
                {tr('Auto-Fetch Intervall (Sekunden)', 'Auto-fetch interval (seconds)')}
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={Math.floor(settings.autoFetchIntervalMs / 1000)}
                  onChange={(e) => {
                    const seconds = Math.max(10, Math.min(300, Number(e.target.value) || 60));
                    void onUpdateSettings({ autoFetchIntervalMs: seconds * 1000 });
                  }}
                />
              </label>
            </section>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="settings-grid">
            <section className="settings-card">
              <h3>{tr('KI Auto-Commit', 'AI auto-commit')}</h3>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.aiAutoCommitEnabled}
                  onChange={(e) => void onUpdateSettings({ aiAutoCommitEnabled: e.target.checked })}
                />
                {tr('Feature aktivieren', 'Enable feature')}
              </label>
              <label>
                {tr('Provider', 'Provider')}
                <select value={settings.aiProvider} onChange={(e) => void onUpdateSettings({ aiProvider: e.target.value as 'ollama' | 'gemini' })}>
                  <option value="ollama">Ollama</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </label>

              {settings.aiProvider === 'ollama' && (
                <label>
                  Ollama URL
                  <input
                    type="text"
                    value={settings.ollamaBaseUrl}
                    onChange={(e) => void onUpdateSettings({ ollamaBaseUrl: e.target.value })}
                    placeholder="http://127.0.0.1:11434"
                  />
                </label>
              )}

              {settings.aiProvider === 'gemini' && (
                <>
                  <label>
                    Gemini API Key
                    <input
                      type="password"
                      value={geminiApiKeyInput}
                      onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                      placeholder={settings.hasGeminiApiKey ? tr('Bereits gespeichert (neu eingeben zum Ersetzen)', 'Already saved (enter again to replace)') : 'AIza...'}
                    />
                  </label>
                  <div className="settings-inline-actions">
                    <button
                      className="staging-tool-btn"
                      onClick={async () => {
                        if (!window.electronAPI) return;
                        await window.electronAPI.setGeminiApiKey(geminiApiKeyInput);
                        setGeminiApiKeyInput('');
                        await onUpdateSettings({});
                      }}
                    >
                      {tr('API Key speichern', 'Save API key')}
                    </button>
                    <button
                      className="staging-tool-btn"
                      onClick={async () => {
                        if (!window.electronAPI) return;
                        await window.electronAPI.clearGeminiApiKey();
                        setGeminiApiKeyInput('');
                        await onUpdateSettings({});
                      }}
                      disabled={!settings.hasGeminiApiKey}
                    >
                      {tr('API Key entfernen', 'Remove API key')}
                    </button>
                  </div>
                  <p>{tr('Status', 'Status')}: {settings.hasGeminiApiKey ? tr('gespeichert', 'saved') : tr('nicht gespeichert', 'not saved')}</p>
                </>
              )}

              <label>
                {tr('Modell', 'Model')}
                <input
                  list="ai-model-list-settings"
                  type="text"
                  value={selectedModel}
                  onChange={(e) => void setSelectedModel(e.target.value)}
                  placeholder={settings.aiProvider === 'gemini' ? tr('z.B. gemini-3-flash-preview', 'e.g. gemini-3-flash-preview') : tr('z.B. llama3.1:8b', 'e.g. llama3.1:8b')}
                />
                <datalist id="ai-model-list-settings">
                  {mergedModelOptions.map((model) => <option key={model} value={model} />)}
                </datalist>
              </label>

              <div className="settings-inline-actions">
                <button className="staging-tool-btn" onClick={testConnection} disabled={isTestingAi}>
                  {isTestingAi ? tr('Teste...', 'Testing...') : tr('Verbindung testen', 'Test connection')}
                </button>
                <button className="staging-tool-btn" onClick={loadModels} disabled={isLoadingModels}>
                  {isLoadingModels ? tr('Lade Modelle...', 'Loading models...') : tr('Modelle laden', 'Load models')}
                </button>
              </div>
              {aiStatus && <p>{aiStatus}</p>}
            </section>

            <section className="settings-card">
              <h3>{tr('GitHub', 'GitHub')}</h3>
              <label>
                {tr('GitHub OAuth Client ID (Device Flow)', 'GitHub OAuth Client ID (Device flow)')}
                <input
                  type="text"
                  value={settings.githubOauthClientId}
                  onChange={(e) => void onUpdateSettings({ githubOauthClientId: e.target.value })}
                  placeholder="Ov23li..."
                />
              </label>
              <p>{tr('Nur fuer Methode 2 (Device Flow): OAuth App Client ID erforderlich. Methode 3 (1-Klick) braucht keine eigene Client ID.', 'Only for Method 2 (Device flow): OAuth app client ID required. Method 3 (one-click) does not need your own client ID.')}</p>
            </section>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="settings-grid">
            <section className="settings-card">
              <h3>{tr('Sicherheits-Checks', 'Security checks')}</h3>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.confirmDangerousOps}
                  onChange={(e) => void onUpdateSettings({ confirmDangerousOps: e.target.checked })}
                />
                {tr('Gefaehrliche Git-Operationen bestaetigen', 'Confirm dangerous Git operations')}
              </label>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.secretScanBeforePushEnabled}
                  onChange={(e) => void onUpdateSettings({ secretScanBeforePushEnabled: e.target.checked })}
                />
                {tr('Secret-Scan vor Push aktivieren', 'Enable secret scan before push')}
              </label>
              <label>
                {tr('Secret-Scan Strengegrad', 'Secret scan strictness')}
                <select
                  value={settings.secretScanStrictness}
                  onChange={(e) => void onUpdateSettings({ secretScanStrictness: e.target.value as 'low' | 'medium' | 'high' })}
                >
                  <option value="low">{tr('Niedrig (nur klare Muster)', 'Low (high-confidence patterns only)')}</option>
                  <option value="medium">{tr('Mittel (empfohlen)', 'Medium (recommended)')}</option>
                  <option value="high">{tr('Hoch (mehr Treffer, mehr False Positives)', 'High (more hits, more false positives)')}</option>
                </select>
              </label>
            </section>

            <section className="settings-card">
              <h3>{tr('Secret-Scan Ausnahmen', 'Secret scan allowlist')}</h3>
              <label>
                {tr('Projekt-Allowlist fuer Secret-Scan', 'Project allowlist for secret scan')}
                <textarea
                  rows={8}
                  value={settings.secretScanAllowlist}
                  onChange={(e) => void onUpdateSettings({ secretScanAllowlist: e.target.value })}
                  placeholder={tr('Eine Regel pro Zeile. z.B. path:docs/example.env oder regex:^DUMMY_', 'One rule per line. e.g. path:docs/example.env or regex:^DUMMY_')}
                />
              </label>
              <p>{tr('Allowlist-Formate: "path:", "regex:" oder freier Text. Kommentarzeilen mit "#".', 'Allowlist formats: "path:", "regex:", or plain text. Comment lines start with "#".')}</p>
            </section>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="settings-grid">
            <section className="settings-card">
              <h3>{tr('App-Updates', 'App updates')}</h3>
              <p>{tr('Installierte Version', 'Installed version')}: {installedVersion}</p>
              <p>{tr('Status', 'Status')}: {updaterStatusLabel}</p>
              {updaterStatus?.availableVersion && <p>{tr('Verfuegbare Version', 'Available version')}: {updaterStatus.availableVersion}</p>}
              {updaterStatus?.lastCheckedAt && (
                <p>
                  {tr('Zuletzt geprueft', 'Last checked')}: {new Date(updaterStatus.lastCheckedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
              {updaterStatus?.state === 'downloading' && (
                <p>
                  {tr('Download', 'Download')}: {(updaterStatus.downloadPercent || 0).toFixed(1)}% ({formatBytes(updaterStatus.transferred)} / {formatBytes(updaterStatus.total)})
                </p>
              )}
              {updaterStatus?.error && <p className="settings-danger">{updaterStatus.error}</p>}
              {updaterMessage && <p>{updaterMessage}</p>}
              {!updaterSupported && (
                <p>{tr('Auto-Updates sind nur in der installierten Produktions-App verfuegbar.', 'Auto updates are only available in installed production builds.')}</p>
              )}
              <div className="settings-inline-actions">
                <button className="staging-tool-btn" onClick={handleRunOneClickUpdate} disabled={oneClickUpdateDisabled}>
                  {oneClickUpdateLabel}
                </button>
                <button
                  className="staging-tool-btn"
                  onClick={handleInstallUpdate}
                  disabled={!updaterSupported || updaterStatus?.state !== 'downloaded' || isInstallingUpdate}
                >
                  {isInstallingUpdate ? tr('2/2 Installiere heruntergeladenes Update...', '2/2 Installing downloaded update...') : tr('2/2 Heruntergeladenes Update installieren', '2/2 Install downloaded update')}
                </button>
              </div>
            </section>

            {updaterStatus?.releaseNotes && (
              <section className="settings-card">
                <h3>{tr('Release Notes', 'Release notes')}</h3>
                <pre className="settings-release-notes">{updaterStatus.releaseNotes}</pre>
              </section>
            )}

            <section className="settings-card settings-card-full">
              <div className="settings-card-header-row">
                <h3>{tr('Job Center', 'Job center')}</h3>
                <button className="staging-tool-btn" onClick={onClearJobs}>{tr('Leeren', 'Clear')}</button>
              </div>
              {sortedJobs.length === 0 && <p>{tr('Keine Jobs vorhanden.', 'No jobs available.')}</p>}
              {sortedJobs.map((job) => (
                <article key={`${job.id}-${job.timestamp}-${job.status}`} className="settings-job-row">
                  <div className="settings-job-top-row">
                    <span>{job.operation}</span>
                    <span className={job.status === 'failed' ? 'settings-danger' : ''}>{job.status}</span>
                  </div>
                  {job.message && <div className="settings-job-message">{job.message}</div>}
                  <div className="settings-job-time">
                    {new Date(job.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
