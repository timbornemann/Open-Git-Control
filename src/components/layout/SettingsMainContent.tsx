import React, { useMemo } from 'react';
import type { AppSettingsDto, GitJobEventDto } from '../../global';
import { useI18n } from '../../i18n';
import { SettingsTabId } from './sidebar/AppSidebar.types';
import { useSettingsAiUpdater } from './hooks/useSettingsAiUpdater';
import { ReleaseNotesContent } from './ReleaseNotesContent';
import { THEME_OPTIONS } from './settingsShared';
import { ApiMcpSettingsPanel } from './ApiMcpSettingsPanel';

type SettingsMainContentProps = {
  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
  activeTab: SettingsTabId;
  onResetLayout: () => void;
};

export const SettingsMainContent: React.FC<SettingsMainContentProps> = ({
  settings,
  onUpdateSettings,
  jobs,
  onClearJobs,
  activeTab,
  onResetLayout,
}) => {
  const { tr, locale } = useI18n();
  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20), [jobs]);

  const {
    isTestingAi,
    isLoadingModels,
    aiStatus,
    geminiApiKeyInput,
    setGeminiApiKeyInput,
    updaterStatus,
    updaterMessage,
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
  } = useSettingsAiUpdater({ settings, onUpdateSettings, tr });

  return (
    <div className="settings-main">
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
              <div className="settings-inline-actions">
                <button className="staging-tool-btn" onClick={onResetLayout}>
                  {tr('Layout zuruecksetzen', 'Reset layout')}
                </button>
              </div>
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
              <h3>{tr('KI', 'AI')}</h3>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.aiAutoCommitEnabled}
                  onChange={(e) => void onUpdateSettings({ aiAutoCommitEnabled: e.target.checked })}
                />
                {tr('KI Auto-Commit aktivieren', 'Enable AI auto-commit')}
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

              <label>
                {tr('Commit-Message Stil', 'Commit message style')}
                <select
                  value={settings.aiCommitMessageStyle}
                  onChange={(e) => void onUpdateSettings({ aiCommitMessageStyle: e.target.value as AppSettingsDto['aiCommitMessageStyle'] })}
                >
                  <option value="conventional">Conventional Commits</option>
                  <option value="plain">{tr('Plain', 'Plain')}</option>
                  <option value="detailed">{tr('Detailliert', 'Detailed')}</option>
                </select>
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

        {activeTab === 'api' && <ApiMcpSettingsPanel />}

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
              <label className="settings-switch-row">
                <input
                  className="settings-switch-input"
                  type="checkbox"
                  checked={settings.autoUpdateEnabled}
                  onChange={(e) => void onUpdateSettings({ autoUpdateEnabled: e.target.checked })}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">{tr('Updates im Hintergrund automatisch suchen und herunterladen', 'Automatically check and download updates in the background')}</span>
              </label>
              <div className="settings-inline-actions">
                <button className="staging-tool-btn" onClick={handleRunOneClickUpdate} disabled={oneClickUpdateDisabled}>
                  {oneClickUpdateLabel}
                </button>
              </div>
            </section>

            {updaterStatus?.releaseNotes && (
              <section className="settings-card">
                <h3>{tr('Release Notes', 'Release notes')}</h3>
                <ReleaseNotesContent className="settings-release-notes" releaseNotes={updaterStatus.releaseNotes} />
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
