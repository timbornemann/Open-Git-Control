import { Bug, HelpCircle, Lightbulb } from 'lucide-react';
import { useFeedbackReport } from '@/contexts/FeedbackReportContext';
import { useI18n } from '@/i18n';
import { actionRowClass, hintClass, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsFeedbackSection = ({ settings, onUpdateSettings, variant }: SettingsSectionProps) => {
  const { tr } = useI18n();
  const feedback = useFeedbackReport();
  const content = (
    <>
      <p className={hintClass(variant)}>
        {tr(
          'Melde Fehler, Ideen oder Fragen direkt an das öffentliche Open-Git-Control-Repository auf GitHub.',
          'Send bugs, ideas, or questions directly to the public Open-Git-Control repository on GitHub.',
        )}
      </p>
      <div className={`${actionRowClass(variant)} feedback-settings-actions`}>
        <button className="staging-tool-btn" onClick={() => feedback.openManualReport('bug')}>
          <Bug size={13} /> {tr('Fehler melden', 'Report bug')}
        </button>
        <button className="staging-tool-btn" onClick={() => feedback.openManualReport('feature')}>
          <Lightbulb size={13} /> {tr('Idee vorschlagen', 'Suggest idea')}
        </button>
        <button className="staging-tool-btn" onClick={() => feedback.openManualReport('question')}>
          <HelpCircle size={13} /> {tr('Frage stellen', 'Ask question')}
        </button>
      </div>
      <SettingsSwitch
        variant={variant}
        compact={variant === 'sidebar'}
        checked={settings.automaticErrorReportsEnabled}
        label={tr('Fehler-Toasts nach Einwilligung automatisch melden', 'Automatically report error toasts after consent')}
        onChange={(checked) => void onUpdateSettings({ automaticErrorReportsEnabled: checked, errorReportConsentShown: true })}
      />
      <p className={hintClass(variant)}>
        {feedback.capability?.directSubmissionAvailable
          ? tr(
              'Direkte Meldungen sind über die aktive GitHub.com-Sitzung verfügbar. Automatische Meldungen enthalten nur redigierte Minimaldaten.',
              'Direct reports are available through the active GitHub.com session. Automatic reports contain only redacted minimal data.',
            )
          : tr(
              'Ohne aktive GitHub.com-Sitzung werden manuelle Meldungen als vorausgefülltes Browserformular geöffnet; automatische Meldungen pausieren.',
              'Without an active GitHub.com session, manual reports open as a prefilled browser form and automatic reports pause.',
            )}
      </p>
    </>
  );

  return variant === 'sidebar' ? (
    <div className="ssc-section">
      <div className="ssc-section-title">{tr('Feedback & Fehlerberichte', 'Feedback & issue reports')}</div>
      {content}
    </div>
  ) : (
    <section className="settings-card settings-card-full">
      <h3>{tr('Feedback & Fehlerberichte', 'Feedback & issue reports')}</h3>
      {content}
    </section>
  );
};
