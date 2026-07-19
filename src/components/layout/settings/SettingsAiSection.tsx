import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { formatCommitMessageStyleExample, getCommitMessageLanguageOptions, getCommitMessageStyleOptions } from '@/utils/commitMessagePreferences';
import type { SettingsAiUpdaterState } from '../hooks/useSettingsAiUpdater';
import type { SettingsUpdateResult } from '@/app/state/contracts';
import { actionRowClass, fieldClass, hintClass, inputClass, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

type BaseUrlInputProps = {
  label: string;
  value: string;
  placeholder: string;
  className?: string;
  fieldClassName?: string;
  onCommit: (value: string) => Promise<SettingsUpdateResult | void>;
  validate: (value: string) => string | null;
};

const BaseUrlInput = ({ label, value, placeholder, className, fieldClassName, onCommit, validate }: BaseUrlInputProps) => {
  const [draft, setDraft] = useState(value);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inFlightValueRef = useRef<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setValidationError(null);
    inFlightValueRef.current = null;
  }, [value]);

  const commit = useCallback(async () => {
    const nextValue = draft.trim();
    if (nextValue === value) {
      setDraft(value);
      setValidationError(null);
      return;
    }
    const nextError = validate(nextValue);
    if (nextError) {
      setValidationError(nextError);
      return;
    }
    if (inFlightValueRef.current === nextValue) return;
    inFlightValueRef.current = nextValue;
    setValidationError(null);
    try {
      const result = await onCommit(nextValue);
      if (result && !result.success) {
        setDraft(value);
        setValidationError(result.error);
      }
    } catch (error: unknown) {
      setDraft(value);
      setValidationError(error instanceof Error ? error.message : 'Could not save the URL.');
    } finally {
      if (inFlightValueRef.current === nextValue) inFlightValueRef.current = null;
    }
  }, [draft, onCommit, validate, value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void commit();
    event.currentTarget.blur();
  };

  return (
    <>
      <label className={fieldClassName}>
        {label}
        <input
          className={className}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setValidationError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-invalid={Boolean(validationError)}
        />
      </label>
      {validationError && <p style={{ color: 'var(--status-danger)', margin: 0, fontSize: '0.78rem' }}>{validationError}</p>}
    </>
  );
};

const validateBaseUrl = (value: string, requireHttps: boolean): string | null => {
  if (!value) return 'Enter a complete URL.';
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return 'Credentials are not allowed in the URL.';
    if (requireHttps ? parsed.protocol !== 'https:' : parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return requireHttps ? 'The OpenAI URL must use HTTPS.' : 'The URL must use HTTP or HTTPS.';
    }
    return null;
  } catch {
    return 'Enter a complete, valid URL.';
  }
};

export const SettingsAiSection = ({ settings, onUpdateSettings, variant, ai }: SettingsSectionProps & { ai: SettingsAiUpdaterState }) => {
  const { t, tr } = useI18n();
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
          onChange={(event) => void onUpdateSettings({ aiProvider: event.target.value as 'ollama' | 'gemini' | 'openai' })}
        >
          <option value="ollama">Ollama</option>
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>

      {settings.aiProvider === 'ollama' && (
        <BaseUrlInput
          label="Ollama URL"
          value={settings.ollamaBaseUrl || 'http://127.0.0.1:11434'}
          placeholder="http://127.0.0.1:11434"
          className={inputClass(variant)}
          fieldClassName={fieldClass(variant)}
          onCommit={(ollamaBaseUrl) => onUpdateSettings({ ollamaBaseUrl })}
          validate={(value) => validateBaseUrl(value, false)}
        />
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
                const keyToSave = ai.geminiApiKeyInput;
                try {
                  const next = await appClient.setGeminiApiKey(keyToSave);
                  ai.setGeminiApiKeyInput('');
                  await onUpdateSettings({});
                  if (keyToSave.trim() && !next.hasGeminiApiKey) {
                    ai.showToast(t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad'), true);
                  }
                } catch (error: unknown) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad');
                  ai.showToast(message, true);
                }
              }}
            >
              {t('generated.components.layout.settingsmaincontent.save_api_key_5cb25ffc')}
            </button>
            <button
              className="staging-tool-btn"
              onClick={async () => {
                if (!appClient.isAvailable()) return;
                try {
                  await appClient.clearGeminiApiKey();
                  ai.setGeminiApiKeyInput('');
                  await onUpdateSettings({});
                } catch (error: unknown) {
                  ai.showToast(error instanceof Error ? error.message : 'The Gemini API key could not be removed.', true);
                }
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

      {settings.aiProvider === 'openai' && (
        <>
          <BaseUrlInput
            label="OpenAI Base URL"
            value={settings.openAiBaseUrl || 'https://api.openai.com/v1'}
            placeholder="https://api.openai.com/v1"
            className={inputClass(variant)}
            fieldClassName={fieldClass(variant)}
            onCommit={(openAiBaseUrl) => onUpdateSettings({ openAiBaseUrl })}
            validate={(value) => validateBaseUrl(value, true)}
          />
          <label className={fieldClass(variant)}>
            OpenAI API Key
            <input
              className={inputClass(variant)}
              type="password"
              value={ai.openAiApiKeyInput}
              onChange={(event) => ai.setOpenAiApiKeyInput(event.target.value)}
              placeholder={
                settings.hasOpenAiApiKey ? t('generated.components.layout.settingsmaincontent.already_saved_enter_again_to_replace_fe7e9790') : 'sk-...'
              }
            />
          </label>
          <div className={actionRowClass(variant)}>
            <button
              className="staging-tool-btn"
              onClick={async () => {
                if (!appClient.isAvailable()) return;
                const keyToSave = ai.openAiApiKeyInput;
                try {
                  const next = await appClient.setOpenAiApiKey(keyToSave);
                  ai.setOpenAiApiKeyInput('');
                  await onUpdateSettings({});
                  if (keyToSave.trim() && !next.hasOpenAiApiKey) {
                    ai.showToast(t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad'), true);
                  }
                } catch (error: unknown) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad');
                  ai.showToast(message, true);
                }
              }}
            >
              {t('generated.components.layout.settingsmaincontent.save_api_key_5cb25ffc')}
            </button>
            <button
              className="staging-tool-btn"
              onClick={async () => {
                if (!appClient.isAvailable()) return;
                try {
                  await appClient.clearOpenAiApiKey();
                  ai.setOpenAiApiKeyInput('');
                  await onUpdateSettings({});
                } catch (error: unknown) {
                  ai.showToast(error instanceof Error ? error.message : 'The OpenAI API key could not be removed.', true);
                }
              }}
              disabled={!settings.hasOpenAiApiKey}
            >
              {variant === 'sidebar'
                ? t('generated.components.layout.sidebar.settingssidebarcontent.remove_d54fc957')
                : t('generated.components.layout.settingsmaincontent.remove_api_key_fe7c209e')}
            </button>
          </div>
          <p className={hintClass(variant)}>
            {t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}:{' '}
            {settings.hasOpenAiApiKey
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
                  : settings.aiProvider === 'openai'
                    ? 'gpt-4.1-mini'
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
        {tr('KI-Ausgabesprache', 'AI output language')}
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
