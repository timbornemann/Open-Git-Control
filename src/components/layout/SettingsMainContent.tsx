import React, { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import type { AppSettingsDto, GitJobEventDto } from '../../global';
import { useI18n } from '../../i18n';
import { SettingsTabId } from './sidebar/AppSidebar.types';
import { useSettingsAiUpdater } from './hooks/useSettingsAiUpdater';
import { ReleaseNotesContent } from './ReleaseNotesContent';
import { THEME_OPTIONS } from './settingsShared';
import { ApiMcpSettingsPanel } from './ApiMcpSettingsPanel';
import { appClient } from '../../services/appClient';
import {
  formatCommitMessageStyleExample,
  getCommitMessageLanguageOptions,
  getCommitMessageStyleOptions,
} from '../../utils/commitMessagePreferences';

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
  const { t, tr, locale } = useI18n();
  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20), [jobs]);

  const {
    isTestingAi,
    isLoadingModels,
    aiStatus,
    modelOptions,
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

  return (
    <div className="settings-main">
      <div className="settings-content">
        {activeTab === 'general' && (
          <div className="settings-general-page">
            <section className="settings-general-section">
              <div className="settings-general-heading">
                <h3>{t('generated.components.layout.settingsmaincontent.appearance_e9b2d451')}</h3>
              </div>
              <div className="settings-general-controls">
                <label className="settings-field">
                  {t('generated.components.layout.settingsmaincontent.theme_60c4ba00')}
                  <select value={settings.theme} onChange={(e) => void onUpdateSettings({ theme: e.target.value as AppSettingsDto['theme'] })}>
                    {THEME_OPTIONS.map((themeOption) => <option key={themeOption.value} value={themeOption.value}>{themeOption.label}</option>)}
                  </select>
                </label>
                <label className="settings-field">
                  {t('generated.components.layout.settingsmaincontent.language_738d5882')}
                  <select value={settings.language} onChange={(e) => void onUpdateSettings({ language: e.target.value as 'de' | 'en' })}>
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <div className="settings-general-actions settings-field--full">
                  <button className="staging-tool-btn settings-reset-layout-btn" onClick={onResetLayout}>
                    <RotateCcw size={14} />
                    <span>{t('generated.components.layout.settingsmaincontent.reset_layout_3308dbf7')}</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="settings-general-section">
              <div className="settings-general-heading">
                <h3>{t('generated.components.layout.settingsmaincontent.workflow_3d911688')}</h3>
              </div>
              <div className="settings-general-controls">
                <label className="settings-field">
                  {t('generated.components.layout.settingsmaincontent.default_branch_889997a3')}
                  <input type="text" value={settings.defaultBranch} onChange={(e) => void onUpdateSettings({ defaultBranch: e.target.value })} />
                </label>
                <label className="settings-switch-row settings-general-switch settings-field--full">
                  <input
                    className="settings-switch-input"
                    type="checkbox"
                    checked={settings.showSecondaryHistory}
                    onChange={(e) => void onUpdateSettings({ showSecondaryHistory: e.target.checked })}
                  />
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                  <span className="settings-switch-label">{t('generated.components.layout.settingsmaincontent.show_secondary_history_all_branches_e9193581')}</span>
                </label>
                <label className="settings-switch-row settings-general-switch settings-field--full">
                  <input
                    className="settings-switch-input"
                    type="checkbox"
                    checked={settings.commitSignoffByDefault}
                    onChange={(e) => void onUpdateSettings({ commitSignoffByDefault: e.target.checked })}
                  />
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                  <span className="settings-switch-label">{t('generated.components.layout.settingsmaincontent.enable_commit_signoff_by_default_fc09a7fe')}</span>
                </label>
                <label className="settings-field settings-field--full">
                  {t('generated.components.layout.settingsmaincontent.commit_template_c4f13929')}
                  <textarea rows={5} value={settings.commitTemplate} onChange={(e) => void onUpdateSettings({ commitTemplate: e.target.value })} />
                </label>
              </div>
            </section>

            <section className="settings-general-section">
              <div className="settings-general-heading">
                <h3>{t('generated.components.layout.settingsmaincontent.synchronization_6635b4ca')}</h3>
              </div>
              <div className="settings-general-controls settings-general-controls--single">
                <label className="settings-field">
                  {t('generated.components.layout.settingsmaincontent.auto_fetch_interval_seconds_af13e47c')}
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
              </div>
            </section>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="settings-grid">
            <section className="settings-card">
              <h3>{t('generated.components.layout.settingsmaincontent.ai_294e8d00')}</h3>
              <label className="settings-switch-row">
                <input
                  className="settings-switch-input"
                  type="checkbox"
                  checked={settings.aiAutoCommitEnabled}
                  onChange={(e) => void onUpdateSettings({ aiAutoCommitEnabled: e.target.checked })}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">{t('generated.components.layout.settingsmaincontent.enable_ai_auto_commit_0468df6a')}</span>
              </label>
              <label>
                {t('generated.components.layout.settingsmaincontent.provider_e52086d7')}
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
                      placeholder={settings.hasGeminiApiKey ? t('generated.components.layout.settingsmaincontent.already_saved_enter_again_to_replace_fe7e9790') : 'AIza...'}
                    />
                  </label>
                  <div className="settings-inline-actions">
                    <button
                      className="staging-tool-btn"
                      onClick={async () => {
                        if (!appClient.isAvailable()) return;
                        await appClient.setGeminiApiKey(geminiApiKeyInput);
                        setGeminiApiKeyInput('');
                        await onUpdateSettings({});
                      }}
                    >
                      {t('generated.components.layout.settingsmaincontent.save_api_key_5cb25ffc')}
                    </button>
                    <button
                      className="staging-tool-btn"
                      onClick={async () => {
                        if (!appClient.isAvailable()) return;
                        await appClient.clearGeminiApiKey();
                        setGeminiApiKeyInput('');
                        await onUpdateSettings({});
                      }}
                      disabled={!settings.hasGeminiApiKey}
                    >
                      {t('generated.components.layout.settingsmaincontent.remove_api_key_fe7c209e')}
                    </button>
                  </div>
                  <p>{t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}: {settings.hasGeminiApiKey ? t('generated.components.layout.settingsmaincontent.saved_e74d9834') : t('generated.components.layout.settingsmaincontent.not_saved_d99fcb70')}</p>
                </>
              )}

              <div className="settings-inline-actions">
                <button className="staging-tool-btn" onClick={testConnection} disabled={isTestingAi}>
                  {isTestingAi ? t('generated.components.layout.settingsmaincontent.testing_cead0ff0') : t('generated.components.layout.settingsmaincontent.test_connection_c981b874')}
                </button>
                <button className="staging-tool-btn" onClick={loadModels} disabled={isLoadingModels}>
                  {isLoadingModels ? t('generated.components.layout.settingsmaincontent.loading_models_5bd9bbf8') : t('generated.components.layout.settingsmaincontent.load_models_a363b3f8')}
                </button>
              </div>
              {aiStatus && <p>{aiStatus}</p>}

              <label>
                {t('generated.components.layout.settingsmaincontent.model_83e8c02e')}
                {modelOptions.length > 0 ? (
                  <select
                    value={selectedModel || ''}
                    onChange={(e) => void setSelectedModel(e.target.value)}
                  >
                    {!selectedModel && <option value="" disabled>{t('generated.components.layout.settingsmaincontent.select_a_model_315c6c35')}</option>}
                    {mergedModelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      list="ai-model-list-settings"
                      type="text"
                      value={selectedModel}
                      onChange={(e) => void setSelectedModel(e.target.value)}
                      placeholder={settings.aiProvider === 'gemini' ? t('generated.components.layout.settingsmaincontent.e_g_gemini_3_flash_preview_a0298c24') : t('generated.components.layout.settingsmaincontent.e_g_llama3_1_8b_4b26492e')}
                    />
                    <datalist id="ai-model-list-settings">
                      {mergedModelOptions.map((model) => <option key={model} value={model} />)}
                    </datalist>
                  </>
                )}
              </label>

              <label>
                {t('generated.components.layout.settingsmaincontent.commit_message_style_7c33ede9')}
                <select
                  value={settings.aiCommitMessageStyle}
                  onChange={(e) => void onUpdateSettings({ aiCommitMessageStyle: e.target.value as AppSettingsDto['aiCommitMessageStyle'] })}
                >
                  {getCommitMessageStyleOptions(t).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                {t('generated.components.layout.settingsmaincontent.commit_message_language_5815363d')}
                <select
                  value={settings.aiCommitMessageLanguage}
                  onChange={(e) => void onUpdateSettings({ aiCommitMessageLanguage: e.target.value as AppSettingsDto['aiCommitMessageLanguage'] })}
                >
                  {getCommitMessageLanguageOptions(t).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="settings-example-block">
                <span>{t('generated.components.layout.settingsmaincontent.example_for_this_style_de3f82d9')}</span>
                <pre>{formatCommitMessageStyleExample(settings.aiCommitMessageStyle, settings.aiCommitMessageLanguage, t)}</pre>
              </div>
            </section>

            <section className="settings-card">
              <h3>{t('generated.components.layout.settingsmaincontent.github_6d98f785')}</h3>
              <label>
                {t('generated.components.layout.settingsmaincontent.github_oauth_client_id_device_flow_f6e1ae7f')}
                <input
                  type="text"
                  value={settings.githubOauthClientId}
                  onChange={(e) => void onUpdateSettings({ githubOauthClientId: e.target.value })}
                  placeholder="Ov23li..."
                />
              </label>
              <p>{t('generated.components.layout.settingsmaincontent.only_for_method_2_device_flow_oauth_app_client_id_requir_5bff0e93')}</p>
            </section>
          </div>
        )}

        {activeTab === 'api' && <ApiMcpSettingsPanel />}

        {activeTab === 'security' && (
          <div className="settings-grid">
            <section className="settings-card">
              <h3>{t('generated.components.layout.settingsmaincontent.security_checks_9469a375')}</h3>
              <label className="settings-switch-row">
                <input
                  className="settings-switch-input"
                  type="checkbox"
                  checked={settings.confirmDangerousOps}
                  onChange={(e) => void onUpdateSettings({ confirmDangerousOps: e.target.checked })}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">{t('generated.components.layout.settingsmaincontent.confirm_dangerous_git_operations_29652f4d')}</span>
              </label>
              <label className="settings-switch-row">
                <input
                  className="settings-switch-input"
                  type="checkbox"
                  checked={settings.secretScanBeforePushEnabled}
                  onChange={(e) => void onUpdateSettings({ secretScanBeforePushEnabled: e.target.checked })}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">{t('generated.components.layout.settingsmaincontent.enable_secret_scan_before_push_f9ff2883')}</span>
              </label>
              <label>
                {t('generated.components.layout.settingsmaincontent.secret_scan_strictness_34aaf7f3')}
                <select
                  value={settings.secretScanStrictness}
                  onChange={(e) => void onUpdateSettings({ secretScanStrictness: e.target.value as 'low' | 'medium' | 'high' })}
                >
                  <option value="low">{t('generated.components.layout.settingsmaincontent.low_high_confidence_patterns_only_4d72cd4c')}</option>
                  <option value="medium">{t('generated.components.layout.settingsmaincontent.medium_recommended_08564bd2')}</option>
                  <option value="high">{t('generated.components.layout.settingsmaincontent.high_more_hits_more_false_positives_edf2e5b1')}</option>
                </select>
              </label>
            </section>

            <section className="settings-card">
              <h3>{t('generated.components.layout.settingsmaincontent.secret_scan_allowlist_b605de67')}</h3>
              <label>
                {t('generated.components.layout.settingsmaincontent.project_allowlist_for_secret_scan_1a0883fd')}
                <textarea
                  rows={8}
                  value={settings.secretScanAllowlist}
                  onChange={(e) => void onUpdateSettings({ secretScanAllowlist: e.target.value })}
                  placeholder={t('generated.components.layout.settingsmaincontent.one_rule_per_line_e_g_path_docs_example_env_or_regex_dum_ecc58f86')}
                />
              </label>
              <p>{t('generated.components.layout.settingsmaincontent.allowlist_formats_path_regex_or_plain_text_comment_lines_50352f69')}</p>
            </section>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="settings-grid">
            <section className="settings-card">
              <h3>{t('generated.components.layout.settingsmaincontent.app_updates_c9f65ab0')}</h3>
              <p>{t('generated.components.layout.settingsmaincontent.installed_version_56ac4ebd')}: {installedVersion}</p>
              <p>{t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}: {updaterStatusLabel}</p>
              {updaterStatus?.availableVersion && <p>{t('generated.components.layout.settingsmaincontent.available_version_9754cbd3')}: {updaterStatus.availableVersion}</p>}
              {updaterStatus?.lastCheckedAt && (
                <p>
                  {t('generated.components.layout.settingsmaincontent.last_checked_bd036721')}: {new Date(updaterStatus.lastCheckedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
              {updaterStatus?.state === 'downloading' && (
                <p>
                  {t('generated.components.layout.settingsmaincontent.download_d9eb7f3e')}: {(updaterStatus.downloadPercent || 0).toFixed(1)}% ({formatBytes(updaterStatus.transferred)} / {formatBytes(updaterStatus.total)})
                </p>
              )}
              {updaterStatus?.error && <p className="settings-danger">{updaterStatus.error}</p>}
              {updaterMessage && <p>{updaterMessage}</p>}
              {!updaterSupported && (
                <p>{t('generated.components.layout.settingsmaincontent.auto_updates_are_only_available_in_installed_production_abb1a98e')}</p>
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
                <span className="settings-switch-label">{t('generated.components.layout.settingsmaincontent.automatically_check_and_download_updates_in_the_backgrou_dbe47c67')}</span>
              </label>
              <div className="settings-inline-actions">
                <button className="staging-tool-btn" onClick={handleRunOneClickUpdate} disabled={oneClickUpdateDisabled}>
                  {oneClickUpdateLabel}
                </button>
              </div>
            </section>

            {updaterStatus?.releaseNotes && (
              <section className="settings-card">
                <h3>{t('generated.components.layout.settingsmaincontent.release_notes_0b482d7f')}</h3>
                <ReleaseNotesContent className="settings-release-notes" releaseNotes={updaterStatus.releaseNotes} />
              </section>
            )}

            <section className="settings-card settings-card-full">
              <div className="settings-card-header-row">
                <h3>{t('generated.components.layout.settingsmaincontent.job_center_a5f9bea9')}</h3>
                <button className="staging-tool-btn" onClick={onClearJobs}>{t('generated.components.layout.settingsmaincontent.clear_156e0575')}</button>
              </div>
              {sortedJobs.length === 0 && <p>{t('generated.components.layout.settingsmaincontent.no_jobs_available_87989fb1')}</p>}
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
