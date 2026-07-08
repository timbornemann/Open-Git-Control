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
  const { t, tr, locale } = useI18n();
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
  } = useSettingsAiUpdater({ settings, onUpdateSettings, t, tr });
  const [diagnosticsState, setDiagnosticsState] = React.useState<{
    loading: boolean;
    message: string | null;
    isError: boolean;
  }>({ loading: false, message: null, isError: false });

  const copyDiagnosticsReport = React.useCallback(async () => {
    if (!appClient.isAvailable()) {
      setDiagnosticsState({
        loading: false,
        message: t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_report_is_not_available_in_this_build_1da3b3a7'),
        isError: true,
      });
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setDiagnosticsState({
        loading: false,
        message: t('generated.components.layout.sidebar.settingssidebarcontent.clipboard_is_not_available_a62a50d3'),
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
          message: t('generated.components.layout.sidebar.settingssidebarcontent.could_not_create_diagnostics_report_34e4b708'),
          isError: true,
        });
        return;
      }

      await navigator.clipboard.writeText(result.data.report);
      setDiagnosticsState({
        loading: false,
        message: t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_report_copied_c5edd6fd'),
        isError: false,
      });
    } catch (error: any) {
      setDiagnosticsState({
        loading: false,
        message: error?.message || t('generated.components.layout.sidebar.settingssidebarcontent.could_not_copy_diagnostics_report_90e044b2'),
        isError: true,
      });
    }
  }, [tr]);

  return (
    <div className="ssc-root">
      {/* ── Allgemein ───────────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{t('generated.components.layout.sidebar.containers.settingssidebarnav.general_c71a04d3')}</div>

        <label className="ssc-label">
          {t('generated.components.layout.settingsmaincontent.theme_60c4ba00')}
          <select
            className="ssc-input"
            value={settings.theme}
            onChange={(e) => onUpdateSettings({ theme: e.target.value as SettingsSidebarContentProps['settings']['theme'] })}
          >
            {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label className="ssc-label">
          {t('generated.components.layout.settingsmaincontent.language_738d5882')}
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
          {t('generated.components.layout.settingsmaincontent.auto_fetch_interval_seconds_af13e47c')}
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
          {t('generated.components.layout.settingsmaincontent.default_branch_889997a3')}
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
          {t('generated.components.layout.sidebar.settingssidebarcontent.show_secondary_history_d3e9e815')}
        </label>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.commitSignoffByDefault}
            onChange={(e) => onUpdateSettings({ commitSignoffByDefault: e.target.checked })}
          />
          {t('generated.components.layout.sidebar.settingssidebarcontent.commit_signoff_by_default_e423bed1')}
        </label>

        <label className="ssc-label">
          {t('generated.components.layout.settingsmaincontent.commit_template_c4f13929')}
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
        <div className="ssc-section-title">{t('generated.components.layout.sidebar.containers.settingssidebarnav.security_5d4ed0ec')}</div>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.confirmDangerousOps}
            onChange={(e) => onUpdateSettings({ confirmDangerousOps: e.target.checked })}
          />
          {t('generated.components.layout.sidebar.settingssidebarcontent.confirm_dangerous_ops_f820c096')}
        </label>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.secretScanBeforePushEnabled}
            onChange={(e) => onUpdateSettings({ secretScanBeforePushEnabled: e.target.checked })}
          />
          {t('generated.components.layout.sidebar.settingssidebarcontent.secret_scan_before_push_27689746')}
        </label>

        <label className="ssc-label">
          {t('generated.components.layout.sidebar.settingssidebarcontent.strictness_abada95e')}
          <select
            className="ssc-input"
            value={settings.secretScanStrictness}
            onChange={(e) => onUpdateSettings({ secretScanStrictness: e.target.value as 'low' | 'medium' | 'high' })}
          >
            <option value="low">{t('generated.components.layout.sidebar.settingssidebarcontent.low_2022a61e')}</option>
            <option value="medium">{t('generated.components.layout.sidebar.settingssidebarcontent.medium_6e6180fd')}</option>
            <option value="high">{t('generated.components.layout.sidebar.settingssidebarcontent.high_6d0c6aff')}</option>
          </select>
        </label>

        <label className="ssc-label">
          {t('generated.components.layout.sidebar.settingssidebarcontent.allowlist_c0b9c2b4')}
          <textarea
            className="ssc-input"
            rows={3}
            value={settings.secretScanAllowlist}
            onChange={(e) => onUpdateSettings({ secretScanAllowlist: e.target.value })}
            placeholder={t('generated.components.layout.sidebar.settingssidebarcontent.path_regex_da8488ca')}
            style={{ resize: 'vertical' }}
          />
        </label>
      </div>

      {/* ── Integrationen ───────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{t('generated.components.layout.sidebar.containers.settingssidebarnav.integrations_872375c4')}</div>

        <label className="ssc-label">
          {t('generated.components.layout.settingsmaincontent.github_oauth_client_id_device_flow_f6e1ae7f')}
          <input
            className="ssc-input"
            type="text"
            value={settings.githubOauthClientId}
            onChange={(e) => onUpdateSettings({ githubOauthClientId: e.target.value })}
            placeholder="Ov23li..."
          />
        </label>
        <div className="ssc-hint">
          {t('generated.components.layout.sidebar.settingssidebarcontent.only_for_method_2_device_flow_method_3_one_click_does_no_fc1b81d4')}
        </div>
      </div>

      {/* ── KI Auto-Commit ──────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{t('generated.components.layout.settingsmaincontent.ai_294e8d00')}</div>

        <label className="ssc-label-inline">
          <input
            type="checkbox"
            checked={settings.aiAutoCommitEnabled}
            onChange={(e) => onUpdateSettings({ aiAutoCommitEnabled: e.target.checked })}
          />
          {t('generated.components.layout.settingsmaincontent.enable_ai_auto_commit_0468df6a')}
        </label>

        <label className="ssc-label">
          {t('generated.components.layout.settingsmaincontent.provider_e52086d7')}
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
                placeholder={settings.hasGeminiApiKey ? t('generated.components.layout.sidebar.settingssidebarcontent.already_saved_2fd8aac0') : 'AIza...'}
              />
            </label>
            <div className="ssc-row">
              <button className="staging-tool-btn" onClick={async () => { if (!appClient.isAvailable()) return; await appClient.setGeminiApiKey(geminiApiKeyInput); setGeminiApiKeyInput(''); await onUpdateSettings({}); }}>
                {t('generated.components.layout.settingsmaincontent.save_api_key_5cb25ffc')}
              </button>
              <button className="staging-tool-btn" onClick={async () => { if (!appClient.isAvailable()) return; await appClient.clearGeminiApiKey(); setGeminiApiKeyInput(''); await onUpdateSettings({}); }} disabled={!settings.hasGeminiApiKey}>
                {t('generated.components.layout.sidebar.settingssidebarcontent.remove_d54fc957')}
              </button>
            </div>
            <div className="ssc-hint">{t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}: {settings.hasGeminiApiKey ? t('generated.components.layout.settingsmaincontent.saved_e74d9834') : t('generated.components.layout.settingsmaincontent.not_saved_d99fcb70')}</div>
          </>
        )}

        <label className="ssc-label">
          {t('generated.components.layout.settingsmaincontent.model_83e8c02e')}
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
          {t('generated.components.layout.settingsmaincontent.commit_message_style_7c33ede9')}
          <select
            className="ssc-input"
            value={settings.aiCommitMessageStyle}
            onChange={(e) => onUpdateSettings({ aiCommitMessageStyle: e.target.value as SettingsSidebarContentProps['settings']['aiCommitMessageStyle'] })}
          >
            {getCommitMessageStyleOptions(t).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="ssc-label">
          {t('generated.components.layout.settingsmaincontent.commit_message_language_5815363d')}
          <select
            className="ssc-input"
            value={settings.aiCommitMessageLanguage}
            onChange={(e) => onUpdateSettings({ aiCommitMessageLanguage: e.target.value as SettingsSidebarContentProps['settings']['aiCommitMessageLanguage'] })}
          >
            {getCommitMessageLanguageOptions(t).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className="ssc-example-block">
          <span>{t('generated.components.layout.sidebar.settingssidebarcontent.example_54306967')}</span>
          <pre>{formatCommitMessageStyleExample(settings.aiCommitMessageStyle, settings.aiCommitMessageLanguage, t)}</pre>
        </div>

        <div className="ssc-row">
          <button className="staging-tool-btn" onClick={testConnection} disabled={isTestingAi}>
            {isTestingAi ? t('generated.components.layout.settingsmaincontent.testing_cead0ff0') : t('generated.components.layout.settingsmaincontent.test_connection_c981b874')}
          </button>
          <button className="staging-tool-btn" onClick={loadModels} disabled={isLoadingModels}>
            {isLoadingModels ? t('generated.components.layout.sidebar.settingssidebarcontent.loading_7f8a8587') : t('generated.components.layout.settingsmaincontent.load_models_a363b3f8')}
          </button>
        </div>

        {aiStatus && <div className="ssc-hint" style={{ whiteSpace: 'pre-wrap' }}>{aiStatus}</div>}
      </div>

      {/* ── App-Updates ─────────────────────────────────────── */}
      <div className="ssc-section">
        <div className="ssc-section-title">{t('generated.components.layout.settingsmaincontent.app_updates_c9f65ab0')}</div>

        <div className="ssc-hint">{t('generated.components.layout.sidebar.settingssidebarcontent.version_10b7f1cc')}: {installedVersion}</div>
        <div className="ssc-hint">{t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}: {updaterStatusLabel}</div>

        {updaterStatus?.availableVersion && (
          <div className="ssc-hint">{t('generated.components.layout.sidebar.settingssidebarcontent.available_d7ca5b14')}: {updaterStatus.availableVersion}</div>
        )}
        {updaterStatus?.lastCheckedAt && (
          <div className="ssc-hint">{t('generated.components.layout.sidebar.settingssidebarcontent.checked_16535227')}: {new Date(updaterStatus.lastCheckedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        )}
        {updaterStatus?.state === 'downloading' && (
          <div className="ssc-hint">{t('generated.components.layout.settingsmaincontent.download_d9eb7f3e')}: {(updaterStatus.downloadPercent || 0).toFixed(1)}% ({formatBytes(updaterStatus.transferred)} / {formatBytes(updaterStatus.total)})</div>
        )}
        {updaterStatus?.releaseNotes && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{t('generated.components.layout.settingsmaincontent.release_notes_0b482d7f')}</summary>
            <div style={{ marginTop: '6px' }}>
              <ReleaseNotesContent className="ssc-hint ssc-release-notes" releaseNotes={updaterStatus.releaseNotes} />
            </div>
          </details>
        )}
        {updaterStatus?.error && <div className="ssc-hint" style={{ color: 'var(--status-danger)' }}>{updaterStatus.error}</div>}
        {updaterMessage && <div className="ssc-hint" style={{ whiteSpace: 'pre-wrap' }}>{updaterMessage}</div>}
        {!updaterSupported && <div className="ssc-hint">{t('generated.components.layout.sidebar.settingssidebarcontent.only_available_in_installed_builds_eacd8bec')}</div>}
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
          <span className="settings-switch-label">{t('generated.components.layout.sidebar.settingssidebarcontent.automatically_check_and_download_updates_6ffcd411')}</span>
        </label>

        <div className="ssc-row">
          <button className="staging-tool-btn" onClick={handleRunOneClickUpdate} disabled={oneClickUpdateDisabled}>
            {oneClickUpdateLabel}
          </button>
        </div>
      </div>

      <div className="ssc-section">
        <div className="ssc-section-title">{t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_b0b2e360')}</div>
        <div className="ssc-row">
          <button className="staging-tool-btn" onClick={copyDiagnosticsReport} disabled={diagnosticsState.loading}>
            {diagnosticsState.loading
              ? t('generated.components.layout.sidebar.settingssidebarcontent.copying_097f00a2')
              : t('generated.components.layout.sidebar.settingssidebarcontent.copy_diagnostics_report_428a213f')}
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
          <div className="ssc-section-title">{t('generated.components.layout.settingsmaincontent.job_center_a5f9bea9')}</div>
          <button className="staging-tool-btn" onClick={onClearJobs}>{t('generated.components.layout.settingsmaincontent.clear_156e0575')}</button>
        </div>

        {sortedJobs.length === 0 && (
          <div className="ssc-hint">{t('generated.components.layout.settingsmaincontent.no_jobs_available_87989fb1')}</div>
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
