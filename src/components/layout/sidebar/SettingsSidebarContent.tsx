import React from 'react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';
import { THEME_OPTIONS } from '../settingsShared';
import { useSettingsAiUpdater } from '../hooks/useSettingsAiUpdater';

type SettingsSidebarContentProps = Pick<
  AppSidebarProps,
  'settings' | 'onUpdateSettings' | 'jobs' | 'onClearJobs'
>;

export const SettingsSidebarContent: React.FC<SettingsSidebarContentProps> = ({
  settings,
  onUpdateSettings,
  jobs,
  onClearJobs,
}) => {
  const sortedJobs = [...jobs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  const { tr, locale } = useI18n();
  const {
    isTestingAi,
    isLoadingModels,
    aiStatus,
    geminiApiKeyInput,
    setGeminiApiKeyInput,
    updaterStatus,
    updaterMessage,
    isInstallingUpdate,
    selectedModel,
    mergedModelOptions,
    updaterStatusLabel,
    updaterSupported,
    installedVersion,
    oneClickUpdateLabel,
    oneClickUpdateDisabled,
    setSelectedModel,
    formatBytes,
    testConnection,
    loadModels,
    handleRunOneClickUpdate,
    handleInstallUpdate,
  } = useSettingsAiUpdater({ settings, onUpdateSettings, tr });

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
          {tr('Gefährliche Git-Operationen bestätigen', 'Confirm dangerous Git operations')}
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.secretScanBeforePushEnabled}
            onChange={(e) => onUpdateSettings({ secretScanBeforePushEnabled: e.target.checked })}
          />
          {tr('Secret-Scan vor Push aktivieren', 'Enable secret scan before push')}
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Secret-Scan Strengegrad', 'Secret scan strictness')}
          <select
            value={settings.secretScanStrictness}
            onChange={(e) => onUpdateSettings({ secretScanStrictness: e.target.value as 'low' | 'medium' | 'high' })}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
          >
            <option value="low">{tr('Niedrig (nur klare Muster)', 'Low (high-confidence patterns only)')}</option>
            <option value="medium">{tr('Mittel (empfohlen)', 'Medium (recommended)')}</option>
            <option value="high">{tr('Hoch (mehr Treffer, mehr False Positives)', 'High (more hits, more false positives)')}</option>
          </select>
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tr('Projekt-Allowlist fuer Secret-Scan', 'Project allowlist for secret scan')}
          <textarea
            rows={4}
            value={settings.secretScanAllowlist}
            onChange={(e) => onUpdateSettings({ secretScanAllowlist: e.target.value })}
            placeholder={tr('Eine Regel pro Zeile. z.B. path:docs/example.env oder regex:^DUMMY_', 'One rule per line. e.g. path:docs/example.env or regex:^DUMMY_')}
            style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', resize: 'vertical' }}
          />
        </label>

        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {tr('Allowlist-Formate: "path:", "regex:" oder freier Text. Kommentarzeilen mit "#".', 'Allowlist formats: "path:", "regex:", or plain text. Comment lines start with "#".')}
        </div>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.showSecondaryHistory}
            onChange={(e) => onUpdateSettings({ showSecondaryHistory: e.target.checked })}
          />
          {tr('Sekundäre Historie anzeigen (alle Branches)', 'Show secondary history (all branches)')}
        </label>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={settings.commitSignoffByDefault}
            onChange={(e) => onUpdateSettings({ commitSignoffByDefault: e.target.checked })}
          />
          {tr('Commit Signoff standardmäßig aktiv', 'Enable commit signoff by default')}
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
            {isInstallingUpdate ? tr('2/2 Installiere heruntergeladenes Update...', '2/2 Installing downloaded update...') : tr('2/2 Heruntergeladenes Update installieren', '2/2 Install downloaded update')}
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
