import { Bug, HelpCircle, Lightbulb } from 'lucide-react';
import { useFeedbackReport } from '@/contexts/FeedbackReportContext';
import { useI18n } from '@/i18n';
import { actionRowClass, hintClass, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsFeedbackSection = ({ variant }: SettingsSectionProps) => {
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
      <p className={hintClass(variant)}>
        {feedback.capability?.directSubmissionAvailable
          ? tr('Direkte Meldungen sind über die aktive GitHub.com-Sitzung verfügbar.', 'Direct reports are available through the active GitHub.com session.')
          : tr(
              'Ohne aktive GitHub.com-Sitzung werden Meldungen als vorausgefülltes Browserformular geöffnet.',
              'Without an active GitHub.com session, reports open as a prefilled browser form.',
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
