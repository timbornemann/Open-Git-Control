import type { AppSettingsDto } from '@/types/appDtos';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { formatCommitMessageStyleExample, getCommitMessageLanguageOptions, getCommitMessageStyleOptions } from '@/utils/commitMessagePreferences';
import type { SettingsAiUpdaterState } from '../hooks/useSettingsAiUpdater';
import { actionRowClass, fieldClass, hintClass, inputClass, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsAiSection = ({ settings, onUpdateSettings, variant, ai }: SettingsSectionProps & { ai: SettingsAiUpdaterState }) => {
  const { t } = useI18n();
  const modelListId = variant === 'sidebar' ? 'ai-model-list-sc' : 'ai-model-list-settings';
  const content = (
    <>
      <SettingsSwitch
        variant={variant}
        checked={settings.aiAutoCommitEnabled}
        label={t('generated.components.layout.settingsmaincontent.enable_ai_auto_commit_0468df6a')}
        onChange={(checked) => void onUpdateSettings({ aiAutoCommitEnabled: checked })}
      />
      <label className={fieldClass(variant)}>
        {t('generated.components.layout.settingsmaincontent.provider_e52086d7')}
        <select
          className={inputClass(variant)}
          value={settings.aiProvider}
          onChange={(event) => void onUpdateSettings({ aiProvider: event.target.value as 'ollama' | 'gemini' })}
        >
          <option value="ollama">Ollama</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </label>

      {settings.aiProvider === 'ollama' && (
        <label className={fieldClass(variant)}>
          Ollama URL
          <input
            className={inputClass(variant)}
            type="text"
            value={settings.ollamaBaseUrl}
            onChange={(event) => void onUpdateSettings({ ollamaBaseUrl: event.target.value })}
            placeholder="http://127.0.0.1:11434"
          />
        </label>
      )}

      {settings.aiProvider === 'gemini' && (
        <>
          <label className={fieldClass(variant)}>
            Gemini API Key
            <input
              className={inputClass(variant)}
              type="password"
              value={ai.geminiApiKeyInput}
              onChange={(event) => ai.setGeminiApiKeyInput(event.target.value)}
              placeholder={
                settings.hasGeminiApiKey ? t('generated.components.layout.settingsmaincontent.already_saved_enter_again_to_replace_fe7e9790') : 'AIza...'
              }
            />
          </label>
          <div className={actionRowClass(variant)}>
            <button
              className="staging-tool-btn"
              onClick={async () => {
                if (!appClient.isAvailable()) return;
                await appClient.setGeminiApiKey(ai.geminiApiKeyInput);
                ai.setGeminiApiKeyInput('');
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
                ai.setGeminiApiKeyInput('');
                await onUpdateSettings({});
              }}
              disabled={!settings.hasGeminiApiKey}
            >
              {variant === 'sidebar'
                ? t('generated.components.layout.sidebar.settingssidebarcontent.remove_d54fc957')
                : t('generated.components.layout.settingsmaincontent.remove_api_key_fe7c209e')}
            </button>
          </div>
          <p className={hintClass(variant)}>
            {t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}:{' '}
            {settings.hasGeminiApiKey
              ? t('generated.components.layout.settingsmaincontent.saved_e74d9834')
              : t('generated.components.layout.settingsmaincontent.not_saved_d99fcb70')}
          </p>
        </>
      )}

      <div className={actionRowClass(variant)}>
        <button className="staging-tool-btn" onClick={ai.testConnection} disabled={ai.isTestingAi}>
          {ai.isTestingAi
            ? t('generated.components.layout.settingsmaincontent.testing_cead0ff0')
            : t('generated.components.layout.settingsmaincontent.test_connection_c981b874')}
        </button>
        <button className="staging-tool-btn" onClick={ai.loadModels} disabled={ai.isLoadingModels}>
          {ai.isLoadingModels
            ? variant === 'sidebar'
              ? t('generated.components.layout.sidebar.settingssidebarcontent.loading_7f8a8587')
              : t('generated.components.layout.settingsmaincontent.loading_models_5bd9bbf8')
            : t('generated.components.layout.settingsmaincontent.load_models_a363b3f8')}
        </button>
      </div>
      {ai.aiStatus && (
        <p className={hintClass(variant)} style={variant === 'sidebar' ? { whiteSpace: 'pre-wrap' } : undefined}>
          {ai.aiStatus}
        </p>
      )}

      <label className={fieldClass(variant)}>
        {t('generated.components.layout.settingsmaincontent.model_83e8c02e')}
        {variant === 'main' && ai.modelOptions.length > 0 ? (
          <select value={ai.selectedModel || ''} onChange={(event) => void ai.setSelectedModel(event.target.value)}>
            {!ai.selectedModel && (
              <option value="" disabled>
                {t('generated.components.layout.settingsmaincontent.select_a_model_315c6c35')}
              </option>
            )}
            {ai.mergedModelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              className={inputClass(variant)}
              list={modelListId}
              type="text"
              value={ai.selectedModel}
              onChange={(event) => void ai.setSelectedModel(event.target.value)}
              placeholder={
                settings.aiProvider === 'gemini'
                  ? variant === 'sidebar'
                    ? 'gemini-2.0-flash'
                    : t('generated.components.layout.settingsmaincontent.e_g_gemini_3_flash_preview_a0298c24')
                  : variant === 'sidebar'
                    ? 'llama3.1:8b'
                    : t('generated.components.layout.settingsmaincontent.e_g_llama3_1_8b_4b26492e')
              }
            />
            <datalist id={modelListId}>
              {ai.mergedModelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </>
        )}
      </label>

      <label className={fieldClass(variant)}>
        {t('generated.components.layout.settingsmaincontent.commit_message_style_7c33ede9')}
        <select
          className={inputClass(variant)}
          value={settings.aiCommitMessageStyle}
          onChange={(event) => void onUpdateSettings({ aiCommitMessageStyle: event.target.value as AppSettingsDto['aiCommitMessageStyle'] })}
        >
          {getCommitMessageStyleOptions(t).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={fieldClass(variant)}>
        {t('generated.components.layout.settingsmaincontent.commit_message_language_5815363d')}
        <select
          className={inputClass(variant)}
          value={settings.aiCommitMessageLanguage}
          onChange={(event) => void onUpdateSettings({ aiCommitMessageLanguage: event.target.value as AppSettingsDto['aiCommitMessageLanguage'] })}
        >
          {getCommitMessageLanguageOptions(t).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className={variant === 'sidebar' ? 'ssc-example-block' : 'settings-example-block'}>
        <span>
          {variant === 'sidebar'
            ? t('generated.components.layout.sidebar.settingssidebarcontent.example_54306967')
            : t('generated.components.layout.settingsmaincontent.example_for_this_style_de3f82d9')}
        </span>
        <pre>{formatCommitMessageStyleExample(settings.aiCommitMessageStyle, settings.aiCommitMessageLanguage, t)}</pre>
      </div>
    </>
  );

  return variant === 'sidebar' ? (
    <div className="ssc-section">
      <div className="ssc-section-title">{t('generated.components.layout.settingsmaincontent.ai_294e8d00')}</div>
      {content}
    </div>
  ) : (
    <section className="settings-card">
      <h3>{t('generated.components.layout.settingsmaincontent.ai_294e8d00')}</h3>
      {content}
    </section>
  );
};
