import { useI18n } from '@/i18n';
import { fieldClass, hintClass, inputClass, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsGithubSection = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  const content = (
    <>
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
