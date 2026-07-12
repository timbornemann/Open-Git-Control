import { useI18n } from '@/i18n';
import { fieldClass, inputClass, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsSecuritySection = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { t, tr } = useI18n();
  const checks = (
    <>
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
      <label className={fieldClass(variant)}>
        {variant === 'sidebar'
          ? t('generated.components.layout.sidebar.settingssidebarcontent.strictness_abada95e')
          : t('generated.components.layout.settingsmaincontent.secret_scan_strictness_34aaf7f3')}
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
      </label>
    </>
  );

  const allowlist = (
    <>
      <label className={fieldClass(variant)}>
        {variant === 'sidebar'
          ? t('generated.components.layout.sidebar.settingssidebarcontent.allowlist_c0b9c2b4')
          : t('generated.components.layout.settingsmaincontent.project_allowlist_for_secret_scan_1a0883fd')}
        <textarea
          className={inputClass(variant)}
          rows={variant === 'sidebar' ? 3 : 8}
          value={settings.secretScanAllowlist}
          onChange={(event) => void onUpdateSettings({ secretScanAllowlist: event.target.value })}
          placeholder={
            variant === 'sidebar'
              ? t('generated.components.layout.sidebar.settingssidebarcontent.path_regex_da8488ca')
              : t('generated.components.layout.settingsmaincontent.one_rule_per_line_e_g_path_docs_example_env_or_regex_dum_ecc58f86')
          }
          style={variant === 'sidebar' ? { resize: 'vertical' } : undefined}
        />
      </label>
      {variant === 'main' && <p>{t('generated.components.layout.settingsmaincontent.allowlist_formats_path_regex_or_plain_text_comment_lines_50352f69')}</p>}
    </>
  );

  if (variant === 'sidebar') {
    return (
      <div className="ssc-section">
        <div className="ssc-section-title">{t('generated.components.layout.sidebar.containers.settingssidebarnav.security_5d4ed0ec')}</div>
        {checks}
        {allowlist}
      </div>
    );
  }

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <h3>{t('generated.components.layout.settingsmaincontent.security_checks_9469a375')}</h3>
        {checks}
      </section>
      <section className="settings-card">
        <h3>{t('generated.components.layout.settingsmaincontent.secret_scan_allowlist_b605de67')}</h3>
        {allowlist}
      </section>
    </div>
  );
};
