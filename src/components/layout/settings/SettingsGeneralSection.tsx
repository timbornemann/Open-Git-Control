import { Button } from '@/components/ui/Button';
import { RotateCcw } from 'lucide-react';
import type { AppSettingsDto } from '@/types/appDtos';
import { useI18n } from '@/i18n';
import { THEME_OPTIONS } from '../settingsShared';
import { inputClass, SettingsField, SettingsSection, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

const ThemeField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { tr } = useI18n();
  return (
    <SettingsField variant={variant} label={tr('Farbschema', 'Theme')}>
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
    </SettingsField>
  );
};

const LanguageField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  return (
    <SettingsField variant={variant} label={t('generated.components.layout.settingsmaincontent.language_738d5882')}>
      <select
        className={inputClass(variant)}
        value={settings.language}
        onChange={(event) => void onUpdateSettings({ language: event.target.value as 'de' | 'en' })}
      >
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </select>
    </SettingsField>
  );
};

const AutoFetchField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t } = useI18n();
  return (
    <SettingsField variant={variant} label={t('generated.components.layout.settingsmaincontent.auto_fetch_interval_seconds_af13e47c')}>
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
    </SettingsField>
  );
};

const DefaultBranchField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { tr } = useI18n();
  return (
    <SettingsField variant={variant} label={tr('Standardbranch', 'Default branch')}>
      <input
        className={inputClass(variant)}
        type="text"
        value={settings.defaultBranch}
        onChange={(event) => void onUpdateSettings({ defaultBranch: event.target.value })}
      />
    </SettingsField>
  );
};

const CommitTemplateField = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { tr } = useI18n();
  return (
    <SettingsField variant={variant} label={tr('Commit-Vorlage', 'Commit template')} multiline>
      <textarea
        className={inputClass(variant)}
        rows={3}
        value={settings.commitTemplate}
        onChange={(event) => void onUpdateSettings({ commitTemplate: event.target.value })}
        style={variant === 'sidebar' ? { resize: 'vertical' } : undefined}
      />
    </SettingsField>
  );
};

export const SettingsGeneralSection = ({ settings, onUpdateSettings, variant, onResetLayout }: SettingsSectionProps & { onResetLayout?: () => void }) => {
  const { t, tr } = useI18n();
  const secondaryHistoryLabel =
    variant === 'sidebar'
      ? t('generated.components.layout.sidebar.settingssidebarcontent.show_secondary_history_d3e9e815')
      : tr('Verlauf aller Branches anzeigen', 'Show history for all branches');
  const signoffLabel =
    variant === 'sidebar'
      ? t('generated.components.layout.sidebar.settingssidebarcontent.commit_signoff_by_default_e423bed1')
      : tr('Commits standardmäßig mit Sign-off versehen', 'Enable commit sign-off by default');

  return (
    <div className={variant === 'sidebar' ? 'ssc-root' : 'settings-grid'}>
      <SettingsSection group="appearance" variant={variant}>
        <ThemeField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        <LanguageField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
        {onResetLayout && (
          <div className="settings-action-field">
            <span>{tr('Fensteraufteilung', 'Window layout')}</span>
            <Button className="settings-reset-layout-btn" icon={<RotateCcw size={14} />} onClick={onResetLayout}>
              {tr('Layout zurücksetzen', 'Reset layout')}
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection group="workflow" variant={variant}>
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
      </SettingsSection>

      <SettingsSection group="synchronization" variant={variant}>
        <AutoFetchField settings={settings} onUpdateSettings={onUpdateSettings} variant={variant} />
      </SettingsSection>
    </div>
  );
};
