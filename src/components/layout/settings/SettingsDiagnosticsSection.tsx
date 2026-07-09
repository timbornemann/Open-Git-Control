import React from 'react';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';

export const SettingsDiagnosticsSection: React.FC = () => {
  const { t } = useI18n();
  const [diagnosticsState, setDiagnosticsState] = React.useState<{
    loading: boolean;
    message: string | null;
    isError: boolean;
  }>({ loading: false, message: null, isError: false });

  const copyDiagnosticsReport = React.useCallback(async () => {
    if (!appClient.isAvailable()) {
      setDiagnosticsState({
        loading: false,
        message: t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_report_is_not_available_in_this_build_1da3b3a7'),
        isError: true,
      });
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setDiagnosticsState({
        loading: false,
        message: t('generated.components.layout.sidebar.settingssidebarcontent.clipboard_is_not_available_a62a50d3'),
        isError: true,
      });
      return;
    }

    setDiagnosticsState({ loading: true, message: null, isError: false });
    try {
      const result = await appClient.getDiagnosticsReport();
      if (!result.success) {
        setDiagnosticsState({ loading: false, message: result.error, isError: true });
        return;
      }
      if (!result.data.report) {
        setDiagnosticsState({
          loading: false,
          message: t('generated.components.layout.sidebar.settingssidebarcontent.could_not_create_diagnostics_report_34e4b708'),
          isError: true,
        });
        return;
      }

      await navigator.clipboard.writeText(result.data.report);
      setDiagnosticsState({
        loading: false,
        message: t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_report_copied_c5edd6fd'),
        isError: false,
      });
    } catch (error: unknown) {
      setDiagnosticsState({
        loading: false,
        message:
          error instanceof Error ? error.message : t('generated.components.layout.sidebar.settingssidebarcontent.could_not_copy_diagnostics_report_90e044b2'),
        isError: true,
      });
    }
  }, [t]);

  return (
    <div className="ssc-section">
      <div className="ssc-section-title">{t('generated.components.layout.sidebar.settingssidebarcontent.diagnostics_b0b2e360')}</div>
      <div className="ssc-row">
        <button className="staging-tool-btn" onClick={copyDiagnosticsReport} disabled={diagnosticsState.loading}>
          {diagnosticsState.loading
            ? t('generated.components.layout.sidebar.settingssidebarcontent.copying_097f00a2')
            : t('generated.components.layout.sidebar.settingssidebarcontent.copy_diagnostics_report_428a213f')}
        </button>
      </div>
      {diagnosticsState.message && (
        <div className="ssc-hint" style={{ color: diagnosticsState.isError ? 'var(--status-danger)' : undefined }}>
          {diagnosticsState.message}
        </div>
      )}
    </div>
  );
};
