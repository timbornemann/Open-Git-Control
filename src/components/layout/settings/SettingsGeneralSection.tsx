import { RotateCcw } from 'lucide-react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useI18n } from '@/i18n';
import { THEME_OPTIONS } from '../settingsShared';
import { fieldClass, inputClass, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

const ThemeField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  return (
    <label className={fieldClass(variant)}>
      {t('generated.components.layout.settingsmaincontent.theme_60c4ba00')}
      <select
        className={inputClass(variant)}
        value={settings.theme}
        onChange={(event) => void onUpdateSettings({ theme: event.target.value as AppSettingsDto['theme'] })}
      >
        {THEME_OPTIONS.map((themeOption) => (
          <option key={themeOption.value} value={themeOption.value}>
            {themeOption.label}
          </option>
        ))}
      </select>
    </label>
  );
};

const LanguageField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  return (
    <label className={fieldClass(variant)}>
      {t('generated.components.layout.settingsmaincontent.language_738d5882')}
      <select
        className={inputClass(variant)}
        value={settings.language}
        onChange={(event) => void onUpdateSettings({ language: event.target.value as 'de' | 'en' })}
      >
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </select>
    </label>
  );
};

const AutoFetchField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  return (
    <label className={fieldClass(variant)}>
      {t('generated.components.layout.settingsmaincontent.auto_fetch_interval_seconds_af13e47c')}
      <input
        className={inputClass(variant)}
        type="number"
        min={10}
        max={300}
        value={Math.floor(settings.autoFetchIntervalMs / 1000)}
        onChange={(event) => {
          const seconds = Math.max(10, Math.min(300, Number(event.target.value) || 60));
          void onUpdateSettings({ autoFetchIntervalMs: seconds * 1000 });
        }}
      />
    </label>
  );
};

const DefaultBranchField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  return (
    <label className={fieldClass(variant)}>
      {t('generated.components.layout.settingsmaincontent.default_branch_889997a3')}
      <input
        className={inputClass(variant)}
        type="text"
        value={settings.defaultBranch}
        onChange={(event) => void onUpdateSettings({ defaultBranch: event.target.value })}
      />
    </label>
  );
};

const CommitTemplateField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  return (
    <label className={fieldClass(variant, true)}>
      {t('generated.components.layout.settingsmaincontent.commit_template_c4f13929')}
      <textarea
        className={inputClass(variant)}
        rows={variant === 'sidebar' ? 3 : 5}
        value={settings.commitTemplate}
        onChange={(event) => void onUpdateSettings({ commitTemplate: event.target.value })}
        style={variant === 'sidebar' ? { resize: 'vertical' } : undefined}
      />
    </label>
  );
};

export const SettingsGeneralSection = ({ settings, onUpdateSettings, variant, onResetLayout }: SettingsSectionProps & { onResetLayout?: () => void }) => {
  const { t } = useI18n();
  const secondaryHistoryLabel =
    variant === 'sidebar'
      ? t('generated.components.layout.sidebar.settingssidebarcontent.show_secondary_history_d3e9e815')
      : t('generated.components.layout.settingsmaincontent.show_secondary_history_all_branches_e9193581');
  const signoffLabel =
    variant === 'sidebar'
      ? t('generated.components.layout.sidebar.settingssidebarcontent.commit_signoff_by_default_e423bed1')
      : t('generated.components.layout.settingsmaincontent.enable_commit_signoff_by_default_fc09a7fe');

  if (variant === 'sidebar') {
    return (
      <div className="ssc-section">
        <div className="ssc-section-title">{t('generated.components.layout.sidebar.containers.settingssidebarnav.general_c71a04d3')}</div>
        <ThemeField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        <LanguageField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        <AutoFetchField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        <DefaultBranchField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        <SettingsSwitch
          variant={variant}
          checked={settings.showSecondaryHistory}
          label={secondaryHistoryLabel}
          onChange={(checked) => void onUpdateSettings({ showSecondaryHistory: checked })}
        />
        <SettingsSwitch
          variant={variant}
          checked={settings.commitSignoffByDefault}
          label={signoffLabel}
          onChange={(checked) => void onUpdateSettings({ commitSignoffByDefault: checked })}
        />
        <CommitTemplateField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
      </div>
    );
  }

  return (
    <div className="settings-general-page">
      <section className="settings-general-section">
        <div className="settings-general-heading">
          <h3>{t('generated.components.layout.settingsmaincontent.appearance_e9b2d451')}</h3>
        </div>
        <div className="settings-general-controls">
          <ThemeField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
          <LanguageField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
          {onResetLayout && (
            <div className="settings-general-actions settings-field--full">
              <button className="staging-tool-btn settings-reset-layout-btn" onClick={onResetLayout}>
                <RotateCcw size={14} />
                <span>{t('generated.components.layout.settingsmaincontent.reset_layout_3308dbf7')}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="settings-general-section">
        <div className="settings-general-heading">
          <h3>{t('generated.components.layout.settingsmaincontent.workflow_3d911688')}</h3>
        </div>
        <div className="settings-general-controls">
          <DefaultBranchField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
          <SettingsSwitch
            variant={variant}
            checked={settings.showSecondaryHistory}
            label={secondaryHistoryLabel}
            onChange={(checked) => void onUpdateSettings({ showSecondaryHistory: checked })}
          />
          <SettingsSwitch
            variant={variant}
            checked={settings.commitSignoffByDefault}
            label={signoffLabel}
            onChange={(checked) => void onUpdateSettings({ commitSignoffByDefault: checked })}
          />
          <CommitTemplateField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        </div>
      </section>

      <section className="settings-general-section">
        <div className="settings-general-heading">
          <h3>{t('generated.components.layout.settingsmaincontent.synchronization_6635b4ca')}</h3>
        </div>
        <div className="settings-general-controls settings-general-controls--single">
          <AutoFetchField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        </div>
      </section>
    </div>
  );
};
