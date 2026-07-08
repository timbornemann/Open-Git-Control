import React from 'react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';
import { THEME_OPTIONS } from '../settingsShared';
import { useSettingsAiUpdater } from '../hooks/useSettingsAiUpdater';
import { ReleaseNotesContent } from '../ReleaseNotesContent';
import { appClient } from '../../../services/appClient';
import {
  formatCommitMessageStyleExample,
  getCommitMessageLanguageOptions,
  getCommitMessageStyleOptions,
} from '../../../utils/commitMessagePreferences';

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
  const [diagnosticsState, setDiagnosticsState] = React.useState<{
    loading: boolean;
    message: string | null;
    isError: boolean;
  }>({ loading: false, message: null, isError: false });

  const copyDiagnosticsReport = React.useCallback(async () => {
    if (!appClient.isAvailable()) {
      setDiagnosticsState({
        loading: false,
        message: tr('Diagnose-Report ist in diesem Build nicht verfuegbar.', 'Diagnostics report is not available in this build.'),
        isError: true,
      });
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setDiagnosticsState({
        loading: false,
        message: tr('Zwischenablage ist nicht verfuegbar.', 'Clipboard is not available.'),
        isError: true,
      });
      return;
    }

    setDiagnosticsState({ loading: true, message: null, isError: false });
    try {
      const result = await appClient.getDiagnosticsReport();
      if (!result.success) {
        setDiagnosticsState({
          loading: false,
          message: result.error,
          isError: true,
        });
        return;
      }
      if (!result.data.report) {
        setDiagnosticsState({
          loading: false,
          message: tr('Diagnose-Report konnte nicht erstellt werden.', 'Could not create diagnostics report.'),
          isError: true,
        });
        return;
      }

      await navigator.clipboard.writeText(result.data.report);
      setDiagnosticsState({
        loading: false,
        message: tr('Diagnose-Report kopiert.', 'Diagnostics report copied.'),
        isError: false,
      });
    } catch (error: any) {
      setDiagnosticsState({
        loading: false,
        message: error?.message || tr('Diagnose-Report konnte nicht kopiert werden.', 'Could not copy diagnostics report.'),
        isError: true,
      });
    }
  }, [tr]);

  return (
    <div className="ssc-root">
      {/* ── Allgemein ───────────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{tr('Allgemein', 'General')}</div>

        <label className="ssc-label">
          {tr('Theme', 'Theme')}
          <select
            className="ssc-input"
            value={settings.theme}
            onChange={(e) => onUpdateSettings({ theme: e.target.value as SettingsSidebarContentProps['settings']['theme'] })}
          >
            {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label className="ssc-label">
          {tr('Sprache', 'Language')}
          <select
            className="ssc-input"
            value={settings.language}
            onChange={(e) => onUpdateSettings({ language: e.target.value as 'de' | 'en' })}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="ssc-label">
          {tr('Auto-Fetch Intervall (Sekunden)', 'Auto-fetch interval (seconds)')}
          <input
            className="ssc-input"
            type="number"
            min={10}
            max={300}
            value={Math.floor(settings.autoFetchIntervalMs / 1000)}
            onChange={(e) => {
              const seconds = Math.max(10, Math.min(300, Number(e.target.value) || 60));
              onUpdateSettings({ autoFetchIntervalMs: seconds * 1000 });
            }}
          />
        </label>

        <label className="ssc-label">
          {tr('Default Branch', 'Default branch')}
          <input
            className="ssc-input"
            type="text"
            value={settings.defaultBranch}
            onChange={(e) => onUpdateSettings({ defaultBranch: e.target.value })}
          />
        </label>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.showSecondaryHistory}
            onChange={(e) => onUpdateSettings({ showSecondaryHistory: e.target.checked })}
          />
          {tr('Sekundäre Historie anzeigen', 'Show secondary history')}
        </label>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.commitSignoffByDefault}
            onChange={(e) => onUpdateSettings({ commitSignoffByDefault: e.target.checked })}
          />
          {tr('Commit Signoff standardmäßig', 'Commit signoff by default')}
        </label>

        <label className="ssc-label">
          {tr('Commit Template', 'Commit template')}
          <textarea
            className="ssc-input"
            rows={3}
            value={settings.commitTemplate}
            onChange={(e) => onUpdateSettings({ commitTemplate: e.target.value })}
            style={{ resize: 'vertical' }}
          />
        </label>
      </div>

      {/* ── Sicherheit ──────────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{tr('Sicherheit', 'Security')}</div>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.confirmDangerousOps}
            onChange={(e) => onUpdateSettings({ confirmDangerousOps: e.target.checked })}
          />
          {tr('Gefährliche Ops bestätigen', 'Confirm dangerous ops')}
        </label>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.secretScanBeforePushEnabled}
            onChange={(e) => onUpdateSettings({ secretScanBeforePushEnabled: e.target.checked })}
          />
          {tr('Secret-Scan vor Push', 'Secret scan before push')}
        </label>

        <label className="ssc-label">
          {tr('Strengegrad', 'Strictness')}
          <select
            className="ssc-input"
            value={settings.secretScanStrictness}
            onChange={(e) => onUpdateSettings({ secretScanStrictness: e.target.value as 'low' | 'medium' | 'high' })}
          >
            <option value="low">{tr('Niedrig', 'Low')}</option>
            <option value="medium">{tr('Mittel', 'Medium')}</option>
            <option value="high">{tr('Hoch', 'High')}</option>
          </select>
        </label>

        <label className="ssc-label">
          {tr('Allowlist', 'Allowlist')}
          <textarea
            className="ssc-input"
            rows={3}
            value={settings.secretScanAllowlist}
            onChange={(e) => onUpdateSettings({ secretScanAllowlist: e.target.value })}
            placeholder={tr('path:... / regex:...', 'path:... / regex:...')}
            style={{ resize: 'vertical' }}
          />
        </label>
      </div>

      {/* ── Integrationen ───────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{tr('Integrationen', 'Integrations')}</div>

        <label className="ssc-label">
          {tr('GitHub OAuth Client ID (Device Flow)', 'GitHub OAuth Client ID (Device flow)')}
          <input
            className="ssc-input"
            type="text"
            value={settings.githubOauthClientId}
            onChange={(e) => onUpdateSettings({ githubOauthClientId: e.target.value })}
            placeholder="Ov23li..."
          />
        </label>
        <div className="ssc-hint">
          {tr('Nur für Methode 2 (Device Flow). Methode 3 (1-Klick) braucht keine eigene Client ID.', 'Only for Method 2 (Device flow). Method 3 (one-click) does not need your own client ID.')}
        </div>
      </div>

      {/* ── KI Auto-Commit ──────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{tr('KI', 'AI')}</div>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.aiAutoCommitEnabled}
            onChange={(e) => onUpdateSettings({ aiAutoCommitEnabled: e.target.checked })}
          />
          {tr('KI Auto-Commit aktivieren', 'Enable AI auto-commit')}
        </label>

        <label className="ssc-label">
          {tr('Provider', 'Provider')}
          <select
            className="ssc-input"
            value={settings.aiProvider}
            onChange={(e) => onUpdateSettings({ aiProvider: e.target.value as 'ollama' | 'gemini' })}
          >
            <option value="ollama">Ollama</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>

        {settings.aiProvider === 'ollama' && (
          <label className="ssc-label">
            Ollama URL
            <input
              className="ssc-input"
              type="text"
              value={settings.ollamaBaseUrl}
              onChange={(e) => onUpdateSettings({ ollamaBaseUrl: e.target.value })}
              placeholder="http://127.0.0.1:11434"
            />
          </label>
        )}

        {settings.aiProvider === 'gemini' && (
          <>
            <label className="ssc-label">
              Gemini API Key
              <input
                className="ssc-input"
                type="password"
                value={geminiApiKeyInput}
                onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                placeholder={settings.hasGeminiApiKey ? tr('Bereits gespeichert', 'Already saved') : 'AIza...'}
              />
            </label>
            <div className="ssc-row">
              <button className="staging-tool-btn" onClick={async () => { if (!appClient.isAvailable()) return; await appClient.setGeminiApiKey(geminiApiKeyInput); setGeminiApiKeyInput(''); await onUpdateSettings({}); }}>
                {tr('API Key speichern', 'Save API key')}
              </button>
              <button className="staging-tool-btn" onClick={async () => { if (!appClient.isAvailable()) return; await appClient.clearGeminiApiKey(); setGeminiApiKeyInput(''); await onUpdateSettings({}); }} disabled={!settings.hasGeminiApiKey}>
                {tr('Entfernen', 'Remove')}
              </button>
            </div>
            <div className="ssc-hint">{tr('Status', 'Status')}: {settings.hasGeminiApiKey ? tr('gespeichert', 'saved') : tr('nicht gespeichert', 'not saved')}</div>
          </>
        )}

        <label className="ssc-label">
          {tr('Modell', 'Model')}
          <input
            className="ssc-input"
            list="ai-model-list-sc"
            type="text"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            placeholder={settings.aiProvider === 'gemini' ? 'gemini-2.0-flash' : 'llama3.1:8b'}
          />
          <datalist id="ai-model-list-sc">
            {mergedModelOptions.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>

        <label className="ssc-label">
          {tr('Commit-Message Stil', 'Commit message style')}
          <select
            className="ssc-input"
            value={settings.aiCommitMessageStyle}
            onChange={(e) => onUpdateSettings({ aiCommitMessageStyle: e.target.value as SettingsSidebarContentProps['settings']['aiCommitMessageStyle'] })}
          >
            {getCommitMessageStyleOptions(tr).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="ssc-label">
          {tr('Commit-Message Sprache', 'Commit message language')}
          <select
            className="ssc-input"
            value={settings.aiCommitMessageLanguage}
            onChange={(e) => onUpdateSettings({ aiCommitMessageLanguage: e.target.value as SettingsSidebarContentProps['settings']['aiCommitMessageLanguage'] })}
          >
            {getCommitMessageLanguageOptions(tr).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className="ssc-example-block">
          <span>{tr('Beispiel', 'Example')}</span>
          <pre>{formatCommitMessageStyleExample(settings.aiCommitMessageStyle, settings.aiCommitMessageLanguage, tr)}</pre>
        </div>

        <div className="ssc-row">
          <button className="staging-tool-btn" onClick={testConnection} disabled={isTestingAi}>
            {isTestingAi ? tr('Teste...', 'Testing...') : tr('Verbindung testen', 'Test connection')}
          </button>
          <button className="staging-tool-btn" onClick={loadModels} disabled={isLoadingModels}>
            {isLoadingModels ? tr('Lade...', 'Loading...') : tr('Modelle laden', 'Load models')}
          </button>
        </div>

        {aiStatus && <div className="ssc-hint" style={{ whiteSpace: 'pre-wrap' }}>{aiStatus}</div>}
      </div>

      {/* ── App-Updates ─────────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{tr('App-Updates', 'App updates')}</div>

        <div className="ssc-hint">{tr('Version', 'Version')}: {installedVersion}</div>
        <div className="ssc-hint">{tr('Status', 'Status')}: {updaterStatusLabel}</div>

        {updaterStatus?.availableVersion && (
          <div className="ssc-hint">{tr('Verfügbar', 'Available')}: {updaterStatus.availableVersion}</div>
        )}
        {updaterStatus?.lastCheckedAt && (
          <div className="ssc-hint">{tr('Geprüft', 'Checked')}: {new Date(updaterStatus.lastCheckedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        )}
        {updaterStatus?.state === 'downloading' && (
          <div className="ssc-hint">{tr('Download', 'Download')}: {(updaterStatus.downloadPercent || 0).toFixed(1)}% ({formatBytes(updaterStatus.transferred)} / {formatBytes(updaterStatus.total)})</div>
        )}
        {updaterStatus?.releaseNotes && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{tr('Release Notes', 'Release notes')}</summary>
            <div style={{ marginTop: '6px' }}>
              <ReleaseNotesContent className="ssc-hint ssc-release-notes" releaseNotes={updaterStatus.releaseNotes} />
            </div>
          </details>
        )}
        {updaterStatus?.error && <div className="ssc-hint" style={{ color: 'var(--status-danger)' }}>{updaterStatus.error}</div>}
        {updaterMessage && <div className="ssc-hint" style={{ whiteSpace: 'pre-wrap' }}>{updaterMessage}</div>}
        {!updaterSupported && <div className="ssc-hint">{tr('Nur in installierten Builds verfügbar.', 'Only available in installed builds.')}</div>}
        <label className="settings-switch-row settings-switch-row--compact">
          <input
            className="settings-switch-input"
            type="checkbox"
            checked={settings.autoUpdateEnabled}
            onChange={(e) => onUpdateSettings({ autoUpdateEnabled: e.target.checked })}
          />
          <span className="settings-switch-track" aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
          <span className="settings-switch-label">{tr('Updates automatisch suchen und herunterladen', 'Automatically check and download updates')}</span>
        </label>

        <div className="ssc-row">
          <button className="staging-tool-btn" onClick={handleRunOneClickUpdate} disabled={oneClickUpdateDisabled}>
            {oneClickUpdateLabel}
          </button>
        </div>
      </div>

      <div className="ssc-section">
        <div className="ssc-section-title">{tr('Diagnose', 'Diagnostics')}</div>
        <div className="ssc-row">
          <button className="staging-tool-btn" onClick={copyDiagnosticsReport} disabled={diagnosticsState.loading}>
            {diagnosticsState.loading
              ? tr('Kopiere...', 'Copying...')
              : tr('Diagnose-Report kopieren', 'Copy diagnostics report')}
          </button>
        </div>
        {diagnosticsState.message && (
          <div
            className="ssc-hint"
            style={{ color: diagnosticsState.isError ? 'var(--status-danger)' : undefined }}
          >
            {diagnosticsState.message}
          </div>
        )}
      </div>

      {/* ── Job Center ──────────────────────────────────────── */}
      <div className="ssc-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="ssc-section-title">{tr('Job Center', 'Job center')}</div>
          <button className="staging-tool-btn" onClick={onClearJobs}>{tr('Leeren', 'Clear')}</button>
        </div>

        {sortedJobs.length === 0 && (
          <div className="ssc-hint">{tr('Keine Jobs vorhanden.', 'No jobs available.')}</div>
        )}

        {sortedJobs.map((job) => (
          <div key={`${job.id}-${job.timestamp}-${job.status}`} className="ssc-job-item">
            <div className="ssc-job-header">
              <span className="ssc-job-op">{job.operation}</span>
              <span className={`ssc-job-status${job.status === 'failed' ? ' failed' : ''}`}>{job.status}</span>
            </div>
            {job.message && <div className="ssc-job-msg">{job.message}</div>}
            <div className="ssc-job-time">{new Date(job.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
