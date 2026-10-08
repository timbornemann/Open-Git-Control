import { Button } from '@/components/ui/Button';
import React from 'react';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import { useAppToast } from '@/hooks/useAppToast';
import { ClipboardCopy } from 'lucide-react';
import { SettingsSection, type SettingsLayoutVariant } from './SettingsSectionPrimitives';

export const SettingsDiagnosticsSection: React.FC<{ variant?: SettingsLayoutVariant }> = ({ variant = 'sidebar' }) => {
  const { t } = useI18n();
  const showToast = useAppToast();
  const [isCopying, setIsCopying] = React.useState(false);

  const copyDiagnosticsReport = React.useCallback(async () => {
    if (!appClient.isAvailable()) {
      showToast(t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_report_is_not_available_in_this_build_1da3b3a7'), true);
      return;
    }
    if (!navigator.clipboard?.writeText) {
      showToast(t('generated.components.layout.sidebar.settingssidebarcontent.clipboard_is_not_available_a62a50d3'), true);
      return;
    }

    setIsCopying(true);
    try {
      const result = await appClient.getDiagnosticsReport();
      if (!result.success) {
        showToast(result.error, true);
        return;
      }
      if (!result.data.report) {
        showToast(t('generated.components.layout.sidebar.settingssidebarcontent.could_not_create_diagnostics_report_34e4b708'), true);
        return;
      }

      await navigator.clipboard.writeText(result.data.report);
      showToast(t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_report_copied_c5edd6fd'), false);
    } catch (error: unknown) {
      showToast(
        error instanceof Error ? error.message : t('generated.components.layout.sidebar.settingssidebarcontent.could_not_copy_diagnostics_report_90e044b2'),
        true,
      );
    } finally {
      setIsCopying(false);
    }
  }, [showToast, t]);

  return (
    <SettingsSection group="diagnostics" variant={variant}>
      <div className="settings-inline-actions">
        <Button icon={<ClipboardCopy size={13} />} onClick={copyDiagnosticsReport} disabled={isCopying}>
          {isCopying
            ? t('generated.components.layout.sidebar.settingssidebarcontent.copying_097f00a2')
            : t('generated.components.layout.sidebar.settingssidebarcontent.copy_diagnostics_report_428a213f')}
        </Button>
      </div>
    </SettingsSection>
  );
};
