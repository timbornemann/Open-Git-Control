import { Button } from '@/components/ui/Button';
import { Bug, HelpCircle, Lightbulb } from 'lucide-react';
import { useFeedbackReport } from '@/contexts/FeedbackReportContext';
import { useI18n } from '@/i18n';
import { actionRowClass, hintClass, SettingsSection, type SettingsSectionProps } from './SettingsSectionPrimitives';

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
        <Button icon={<Bug size={13} />} onClick={() => feedback.openManualReport('bug')}>
          {tr('Fehler melden', 'Report bug')}
        </Button>
        <Button icon={<Lightbulb size={13} />} onClick={() => feedback.openManualReport('feature')}>
          {tr('Idee vorschlagen', 'Suggest idea')}
        </Button>
        <Button icon={<HelpCircle size={13} />} onClick={() => feedback.openManualReport('question')}>
          {tr('Frage stellen', 'Ask question')}
        </Button>
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

  return (
    <SettingsSection group="feedback" variant={variant}>
      {content}
    </SettingsSection>
  );
};
