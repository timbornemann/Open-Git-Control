import React, { useEffect, useMemo, useState } from 'react';
import { AppSidebarProps } from './AppSidebar.types';
import type { UpdaterStatusDto } from '../../../global';
import { useI18n } from '../../../i18n';

type SettingsSidebarContentProps = Pick<
  AppSidebarProps,
  'settings' | 'onUpdateSettings' | 'jobs' | 'onClearJobs'
>;

const THEME_OPTIONS: Array<{
  value: SettingsSidebarContentProps['settings']['theme'];
  label: string;
}> = [
  { value: 'copper-night', label: 'Copper Night' },
  { value: 'midnight-teal', label: 'Midnight Teal' },
  { value: 'graphite-blue', label: 'Graphite Blue' },
  { value: 'forest-copper', label: 'Forest Copper' },
  { value: 'porcelain-light', label: 'Porcelain Light' },
];

export const SettingsSidebarContent: React.FC<SettingsSidebarContentProps> = ({
  settings,
  onUpdateSettings,
  jobs,
  onClearJobs,
}) => {
  const sortedJobs = [...jobs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
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
  const { tr, locale } = useI18n();

  const selectedModel = settings.aiProvider === 'gemini' ? settings.geminiModel : settings.ollamaModel;

  const mergedModelOptions = useMemo(() => {
    const values = [...modelOptions, selectedModel].filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [modelOptions, selectedModel]);

  const updaterStatusLabel = useMemo(() => {
    if (!updaterStatus) {
      return tr('Lade Update-Status...', 'Loading updater status...');
    }

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

  const setSelectedModel = async (model: string) => {
    if (settings.aiProvider === 'gemini') {
      await onUpdateSettings({ geminiModel: model });
      return;
    }
    await onUpdateSettings({ ollamaModel: model });
  };

  const formatBytes = (bytes: number | null): string => {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

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

  useEffect(() => {
    if (!window.electronAPI) return;

    let active = true;

    const bootstrapUpdater = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        if (active) {
          setAppVersion(version);
        }
      } catch {
        if (active) {
          setUpdaterMessage(tr('App-Version konnte nicht geladen werden.', 'Could not load app version.'));
        }
      }

      try {
        const status = await window.electronAPI.getUpdaterStatus();
        if (!active) return;
        setUpdaterStatus(status);
        if (status.currentVersion) {
          setAppVersion((current) => current || status.currentVersion);
        }
      } catch {
        if (!active) return;
        setUpdaterMessage((current) => current || tr('Update-Status konnte nicht geladen werden.', 'Could not load updater status.'));
      }
    };

    void bootstrapUpdater();

    const unsubscribe = window.electronAPI.onUpdaterEvent((status) => {
      if (!active) return;
      setUpdaterStatus(status);
      if (status.currentVersion) {
        setAppVersion((current) => current || status.currentVersion);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [tr]);

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

  const updaterSupported = Boolean(updaterStatus?.isSupported);
  const installedVersion = appVersion || updaterStatus?.currentVersion || tr('unbekannt', 'unknown');

  const oneClickUpdateLabel = useMemo(() => {
    if (isRunningUpdate || updaterStatus?.state === 'checking') {
      return tr('Pruefe...', 'Checking...');
    }

    if (updaterStatus?.state === 'downloading') {
      return tr('Lade...', 'Downloading...');
    }

    if (updaterStatus?.state === 'downloaded') {
      return tr('Update heruntergeladen', 'Update downloaded');
    }

    if (updaterStatus?.state === 'update-available') {
      return tr('Update herunterladen', 'Download update');
    }

    return tr('Jetzt aktualisieren', 'Update now');
  }, [isRunningUpdate, updaterStatus?.state, tr]);

  const oneClickUpdateDisabled =
    !updaterSupported
    || isRunningUpdate
    || isInstallingUpdate
    || updaterStatus?.state === 'checking'
    || updaterStatus?.state === 'downloading'
    || updaterStatus?.state === 'downloaded';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{tr('Allgemein', 'General')}</div>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Theme', 'Theme')}
          <select
            value={settings.theme}
            onChange={(e) => onUpdateSettings({ theme: e.target.value as SettingsSidebarContentProps['settings']['theme'] })}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          >
            {THEME_OPTIONS.map((themeOption) => (
              <option key={themeOption.value} value={themeOption.value}>{themeOption.label}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Sprache', 'Language')}
          <select
            value={settings.language}
            onChange={(e) => onUpdateSettings({ language: e.target.value as 'de' | 'en' })}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Auto-Fetch Intervall (Sekunden)', 'Auto-fetch interval (seconds)')}
          <input
            type="number"
            min={10}
            max={300}
            value={Math.floor(settings.autoFetchIntervalMs / 1000)}
            onChange={(e) => {
              const seconds = Math.max(10, Math.min(300, Number(e.target.value) || 60));
              onUpdateSettings({ autoFetchIntervalMs: seconds * 1000 });
            }}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          />
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Default Branch', 'Default branch')}
          <input
            type="text"
            value={settings.defaultBranch}
            onChange={(e) => onUpdateSettings({ defaultBranch: e.target.value })}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          />
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('GitHub OAuth Client ID (Device Flow)', 'GitHub OAuth Client ID (Device flow)')}
          <input
            type="text"
            value={settings.githubOauthClientId}
            onChange={(e) => onUpdateSettings({ githubOauthClientId: e.target.value })}
            placeholder="Ov23li..."
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          />
        </label>

        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {tr('Nur fuer Methode 2 (Device Flow): OAuth App Client ID erforderlich. Methode 3 (1-Klick) braucht keine eigene Client ID.', 'Only for Method 2 (Device flow): OAuth app client ID required. Method 3 (one-click) does not need your own client ID.')}
        </div>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.confirmDangerousOps}
            onChange={(e) => onUpdateSettings({ confirmDangerousOps: e.target.checked })}
          />
          {tr('GefÃƒÂ¤hrliche Git-Operationen bestÃƒÂ¤tigen', 'Confirm dangerous Git operations')}
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.showSecondaryHistory}
            onChange={(e) => onUpdateSettings({ showSecondaryHistory: e.target.checked })}
          />
          {tr('SekundÃƒÂ¤re Historie anzeigen (alle Branches)', 'Show secondary history (all branches)')}
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.commitSignoffByDefault}
            onChange={(e) => onUpdateSettings({ commitSignoffByDefault: e.target.checked })}
          />
          {tr('Commit Signoff standardmÃƒÂ¤ÃƒÅ¸ig aktiv', 'Enable commit signoff by default')}
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Commit Template', 'Commit template')}
          <textarea
            rows={4}
            value={settings.commitTemplate}
            onChange={(e) => onUpdateSettings({ commitTemplate: e.target.value })}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', resize: 'vertical' }}
          />
        </label>
      </div>

      <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{tr('KI Auto-Commit', 'AI Auto-Commit')}</div>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.aiAutoCommitEnabled}
            onChange={(e) => onUpdateSettings({ aiAutoCommitEnabled: e.target.checked })}
          />
          {tr('Feature aktivieren', 'Enable feature')}
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Provider', 'Provider')}
          <select
            value={settings.aiProvider}
            onChange={(e) => onUpdateSettings({ aiProvider: e.target.value as 'ollama' | 'gemini' })}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          >
            <option value="ollama">Ollama</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>

        {settings.aiProvider === 'ollama' && (
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            Ollama URL
            <input
              type="text"
              value={settings.ollamaBaseUrl}
              onChange={(e) => onUpdateSettings({ ollamaBaseUrl: e.target.value })}
              placeholder="http://127.0.0.1:11434"
              style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
            />
          </label>
        )}

        {settings.aiProvider === 'gemini' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Gemini API Key
              <input
                type="password"
                value={geminiApiKeyInput}
                onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                placeholder={settings.hasGeminiApiKey ? tr('Bereits gespeichert (neu eingeben zum Ersetzen)', 'Already saved (enter again to replace)') : 'AIza...'}
                style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {tr('Status', 'Status')}: {settings.hasGeminiApiKey ? tr('gespeichert', 'saved') : tr('nicht gespeichert', 'not saved')}
            </div>
          </div>
        )}

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Modell', 'Model')}
          <input
            list="ai-model-list"
            type="text"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            placeholder={settings.aiProvider === 'gemini' ? tr('z.B. gemini-3-flash-preview', 'e.g. gemini-3-flash-preview') : tr('z.B. llama3.1:8b', 'e.g. llama3.1:8b')}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          />
          <datalist id="ai-model-list">
            {mergedModelOptions.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="staging-tool-btn" onClick={testConnection} disabled={isTestingAi}>
            {isTestingAi ? tr('Teste...', 'Testing...') : tr('Verbindung testen', 'Test connection')}
          </button>
          <button className="staging-tool-btn" onClick={loadModels} disabled={isLoadingModels}>
            {isLoadingModels ? tr('Lade Modelle...', 'Loading models...') : tr('Modelle laden', 'Load models')}
          </button>
        </div>

        {aiStatus && (
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {aiStatus}
          </div>
        )}
      </div>

      <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{tr('App-Updates', 'App updates')}</div>

        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          {tr('Installierte Version', 'Installed version')}: {installedVersion}
        </div>

        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          {tr('Status', 'Status')}: {updaterStatusLabel}
        </div>

        {updaterStatus?.availableVersion && (
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            {tr('Verfuegbare Version', 'Available version')}: {updaterStatus.availableVersion}
          </div>
        )}

        {updaterStatus?.lastCheckedAt && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {tr('Zuletzt geprueft', 'Last checked')}: {new Date(updaterStatus.lastCheckedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}

        {updaterStatus?.state === 'downloading' && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {tr('Download', 'Download')}: {(updaterStatus.downloadPercent || 0).toFixed(1)}% ({formatBytes(updaterStatus.transferred)} / {formatBytes(updaterStatus.total)})
          </div>
        )}

        {updaterStatus?.releaseNotes && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {tr('Release Notes anzeigen', 'Show release notes')}
            </summary>
            <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {updaterStatus.releaseNotes}
            </div>
          </details>
        )}

        {updaterStatus?.error && (
          <div style={{ fontSize: '0.74rem', color: 'var(--status-danger)', whiteSpace: 'pre-wrap' }}>
            {updaterStatus.error}
          </div>
        )}

        {updaterMessage && (
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {updaterMessage}
          </div>
        )}

        {!updaterSupported && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {tr('Auto-Updates sind nur in der installierten Produktions-App verfuegbar.', 'Auto updates are only available in installed production builds.')}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="staging-tool-btn"
            onClick={handleRunOneClickUpdate}
            disabled={oneClickUpdateDisabled}
          >
            {oneClickUpdateLabel}
          </button>
          <button
            className="staging-tool-btn"
            onClick={handleInstallUpdate}
            disabled={!updaterSupported || updaterStatus?.state !== 'downloaded' || isInstallingUpdate}
          >
            {isInstallingUpdate ? tr('Installiere...', 'Installing...') : tr('Update installieren', 'Install update')}
          </button>
        </div>
      </div>

      <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{tr('Job Center', 'Job center')}</div>
          <button className="staging-tool-btn" onClick={onClearJobs}>{tr('Leeren', 'Clear')}</button>
        </div>

        {sortedJobs.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{tr('Keine Jobs vorhanden.', 'No jobs available.')}</div>
        )}

        {sortedJobs.map((job) => (
          <div key={`${job.id}-${job.timestamp}-${job.status}`} style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '6px 8px', backgroundColor: 'var(--bg-dark)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)' }}>{job.operation}</span>
              <span style={{ fontSize: '0.72rem', color: job.status === 'failed' ? 'var(--status-danger)' : 'var(--text-secondary)' }}>{job.status}</span>
            </div>
            {job.message && (
              <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {job.message}
              </div>
            )}
            <div style={{ marginTop: '4px', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {new Date(job.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
