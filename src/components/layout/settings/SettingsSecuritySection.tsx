import { useI18n } from '@/i18n';
import { inputClass, SettingsField, SettingsSection, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsSecuritySection = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t, tr } = useI18n();
  return (
    <div className={variant === 'sidebar' ? 'ssc-root' : 'settings-grid'}>
      <SettingsSection group="safeguards" variant={variant}>
        <SettingsSwitch
          variant={variant}
          checked={settings.confirmDangerousOps}
          label={
            variant === 'sidebar'
              ? t('generated.components.layout.sidebar.settingssidebarcontent.confirm_dangerous_ops_f820c096')
              : t('generated.components.layout.settingsmaincontent.confirm_dangerous_git_operations_29652f4d')
          }
          onChange={(checked) => void onUpdateSettings({ confirmDangerousOps: checked })}
        />
      </SettingsSection>
      <SettingsSection group="secret-scan" variant={variant}>
        <SettingsSwitch
          variant={variant}
          checked={settings.secretScanBeforeCommitEnabled}
          label={tr('Secret-Scan vor Commit', 'Secret scan before commit')}
          onChange={(checked) => void onUpdateSettings({ secretScanBeforeCommitEnabled: checked })}
        />
        <SettingsSwitch
          variant={variant}
          checked={settings.secretScanBeforePushEnabled}
          label={
            variant === 'sidebar'
              ? t('generated.components.layout.sidebar.settingssidebarcontent.secret_scan_before_push_27689746')
              : t('generated.components.layout.settingsmaincontent.enable_secret_scan_before_push_f9ff2883')
          }
          onChange={(checked) => void onUpdateSettings({ secretScanBeforePushEnabled: checked })}
        />
        <SettingsField
          variant={variant}
          label={
            variant === 'sidebar'
              ? t('generated.components.layout.sidebar.settingssidebarcontent.strictness_abada95e')
              : t('generated.components.layout.settingsmaincontent.secret_scan_strictness_34aaf7f3')
          }
        >
          <select
            className={inputClass(variant)}
            value={settings.secretScanStrictness}
            onChange={(event) => void onUpdateSettings({ secretScanStrictness: event.target.value as 'low' | 'medium' | 'high' })}
          >
            <option value="low">
              {variant === 'sidebar'
                ? t('generated.components.layout.sidebar.settingssidebarcontent.low_2022a61e')
                : t('generated.components.layout.settingsmaincontent.low_high_confidence_patterns_only_4d72cd4c')}
            </option>
            <option value="medium">
              {variant === 'sidebar'
                ? t('generated.components.layout.sidebar.settingssidebarcontent.medium_6e6180fd')
                : t('generated.components.layout.settingsmaincontent.medium_recommended_08564bd2')}
            </option>
            <option value="high">
              {variant === 'sidebar'
                ? t('generated.components.layout.sidebar.settingssidebarcontent.high_6d0c6aff')
                : t('generated.components.layout.settingsmaincontent.high_more_hits_more_false_positives_edf2e5b1')}
            </option>
          </select>
        </SettingsField>
      </SettingsSection>
      <SettingsSection group="allowlist" variant={variant}>
        <p>
          {tr(
            'Allowlist-Ausnahmen werden pro Repository unter .Open-Git-Control/secret-scan-allowlist.txt gespeichert. Öffne die Secret-Scan-Allowlist über das Repository-Menü.',
            'Allowlist exceptions are stored per repository in .Open-Git-Control/secret-scan-allowlist.txt. Open the secret-scan allowlist from the repository menu.',
          )}
        </p>
      </SettingsSection>
    </div>
  );
};
