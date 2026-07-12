import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { fieldClass, hintClass, inputClass, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsGithubSection = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t, tr } = useI18n();
  const [githubHostDraft, setGithubHostDraft] = useState(settings.githubHost);
  const persistedGithubHostRef = useRef(settings.githubHost);
  persistedGithubHostRef.current = settings.githubHost;
  const githubHostHintId = variant === 'sidebar' ? 'github-host-hint-sidebar' : 'github-host-hint-settings';

  useEffect(() => {
    setGithubHostDraft(persistedGithubHostRef.current);
  }, [settings.githubHost]);

  const saveGithubHost = useCallback(async () => {
    const nextHost = githubHostDraft.trim() || 'github.com';
    if (nextHost === settings.githubHost) {
      setGithubHostDraft(settings.githubHost);
      return;
    }

    const result = await onUpdateSettings({ githubHost: nextHost });
    // The settings owner reports failures via its toast and deliberately keeps
    // the previous settings object. Reset this local draft; on success the
    // ensuing settings prop update immediately supplies the persisted host.
    setGithubHostDraft(result?.success ? result.settings.githubHost : persistedGithubHostRef.current);
  }, [githubHostDraft, onUpdateSettings, settings.githubHost]);

  const content = (
    <>
      <label className={fieldClass(variant)}>
        {tr('GitHub-Host (GitHub Enterprise)', 'GitHub host (GitHub Enterprise)')}
        <input
          className={inputClass(variant)}
          type="text"
          inputMode="url"
          value={githubHostDraft}
          onChange={(event) => setGithubHostDraft(event.target.value)}
          onBlur={() => void saveGithubHost()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          placeholder="github.com"
          aria-describedby={githubHostHintId}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <p id={githubHostHintId} className={hintClass(variant)}>
        {tr(
          'Nur den Hostnamen eingeben, z. B. github.example.com. Eine Aenderung meldet die aktuelle GitHub-Sitzung ab.',
          'Enter the host name only, for example github.example.com. Changing it signs out the current GitHub session.',
        )}
      </p>
      <label className={fieldClass(variant)}>
        {t('generated.components.layout.settingsmaincontent.github_oauth_client_id_device_flow_f6e1ae7f')}
        <input
          className={inputClass(variant)}
          type="text"
          value={settings.githubOauthClientId}
          onChange={(event) => void onUpdateSettings({ githubOauthClientId: event.target.value })}
          placeholder="Ov23li..."
        />
      </label>
      <p className={hintClass(variant)}>
        {variant === 'sidebar'
          ? t('generated.components.layout.sidebar.settingssidebarcontent.only_for_method_2_device_flow_method_3_one_click_does_no_fc1b81d4')
          : t('generated.components.layout.settingsmaincontent.only_for_method_2_device_flow_oauth_app_client_id_requir_5bff0e93')}
      </p>
    </>
  );

  return variant === 'sidebar' ? (
    <div className="ssc-section">
      <div className="ssc-section-title">{t('generated.components.layout.sidebar.containers.settingssidebarnav.integrations_872375c4')}</div>
      {content}
    </div>
  ) : (
    <section className="settings-card">
      <h3>{t('generated.components.layout.settingsmaincontent.github_6d98f785')}</h3>
      {content}
    </section>
  );
};
