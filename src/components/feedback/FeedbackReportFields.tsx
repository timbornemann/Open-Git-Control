import type { RefObject } from 'react';
import { Bug, HelpCircle, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useI18n } from '@/i18n';
import { FEEDBACK_DIAGNOSTICS_MAX, FEEDBACK_REPORT_AREAS, FEEDBACK_TEXT_MAX, FEEDBACK_TITLE_MAX, type FeedbackReportAreaDto } from '@/types/feedbackDtos';
import type { FeedbackReportDraft } from './useFeedbackReportDraft';

type Props = { draft: FeedbackReportDraft; disabled: boolean; initialFocusRef: RefObject<HTMLTextAreaElement> };

export function FeedbackReportFields({ draft, disabled, initialFocusRef }: Props) {
  const { tr } = useI18n();
  const message =
    draft.category === 'bug'
      ? {
          label: tr('Was ist passiert?', 'What happened?'),
          placeholder: tr(
            'Beschreibe den Fehler. Wenn möglich: Was hast du gemacht und was sollte stattdessen passieren?',
            'Describe the bug. If possible, mention what you did and what you expected to happen.',
          ),
        }
      : draft.category === 'feature'
        ? {
            label: tr('Deine Idee', 'Your idea'),
            placeholder: tr('Was wünschst du dir oder was könnte einfacher sein?', 'What would you like to see, or what could be easier?'),
          }
        : {
            label: tr('Deine Frage', 'Your question'),
            placeholder: tr(
              'Was möchtest du wissen? Falls hilfreich, beschreibe kurz, was du gerade versuchst.',
              'What would you like to know? If helpful, briefly describe what you are trying to do.',
            ),
          };
  const extra = (field: keyof typeof draft.details, label: string) => (
    <ReportTextarea key={field} label={label} value={draft.details[field]} onChange={(value) => draft.changeDetail(field, value)} disabled={disabled} />
  );

  return (
    <div className="feedback-report-form">
      <SegmentedControl
        ariaLabel={tr('Meldeart', 'Report type')}
        value={draft.category}
        onChange={draft.setCategory}
        disabled={disabled}
        options={[
          {
            value: 'bug',
            label: (
              <>
                <Bug size={14} aria-hidden="true" />
                {tr('Fehler', 'Bug')}
              </>
            ),
          },
          {
            value: 'feature',
            label: (
              <>
                <Lightbulb size={14} aria-hidden="true" />
                {tr('Idee', 'Idea')}
              </>
            ),
          },
          {
            value: 'question',
            label: (
              <>
                <HelpCircle size={14} aria-hidden="true" />
                {tr('Frage', 'Question')}
              </>
            ),
          },
        ]}
      />
      <label className="dialog-field feedback-report-message">
        <span>{message.label}</span>
        <textarea
          ref={initialFocusRef}
          rows={6}
          maxLength={FEEDBACK_TEXT_MAX}
          required
          value={draft.message}
          disabled={disabled}
          placeholder={message.placeholder}
          onChange={(event) => draft.setMessage(event.target.value)}
          aria-describedby="feedback-report-message-help"
        />
      </label>
      <p className="feedback-report-hint" id="feedback-report-message-help">
        {tr(
          'Ein Text genügt. Der Titel entsteht automatisch; vor dem Senden kannst du alles prüfen.',
          'One text is enough. The title is created automatically; you can review everything before sending.',
        )}
      </p>
      <details className="feedback-report-details">
        <summary>{tr('Weitere Angaben (optional)', 'More details (optional)')}</summary>
        <div className="feedback-report-extra-fields">
          <label className="dialog-field">
            <span>{tr('Eigener Titel', 'Custom title')}</span>
            <input
              value={draft.details.title}
              maxLength={FEEDBACK_TITLE_MAX}
              disabled={disabled}
              placeholder={tr('Automatisch aus der ersten Textzeile', 'Automatically taken from the first line')}
              onChange={(event) => draft.changeDetail('title', event.target.value)}
            />
          </label>
          <label className="dialog-field">
            <span>{tr('Betroffener Bereich', 'Affected area')}</span>
            <select value={draft.area} disabled={disabled} onChange={(event) => draft.setArea(event.target.value as FeedbackReportAreaDto)}>
              {FEEDBACK_REPORT_AREAS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {draft.category === 'bug' && (
            <>
              {extra('steps', tr('Schritte zum Reproduzieren', 'Steps to reproduce'))}
              {extra('expected', tr('Erwartetes Verhalten', 'Expected behavior'))}
            </>
          )}
          {draft.category === 'feature' && (
            <>
              {extra('desiredWorkflow', tr('Gewünschter Ablauf', 'Desired workflow'))}
              {extra('proposal', tr('Lösungsvorschlag', 'Proposed solution'))}
              {extra('value', tr('Nutzen', 'User value'))}
            </>
          )}
          {draft.category === 'question' && (
            <>
              {extra('context', tr('Kontext', 'Context'))}
              {extra('tried', tr('Bereits versucht', 'Already tried'))}
            </>
          )}
        </div>
      </details>
      {draft.category === 'bug' && (
        <div className="feedback-report-diagnostics">
          <label className="feedback-report-diagnostics-toggle">
            <input
              type="checkbox"
              checked={draft.includeDiagnostics}
              disabled={disabled}
              onChange={(event) => draft.setIncludeDiagnostics(event.target.checked)}
            />
            {tr('Diagnoseinformationen anhängen', 'Attach diagnostics')}
          </label>
          {draft.includeDiagnostics && (
            <>
              <p className="feedback-report-hint">
                {tr(
                  'Kann lokale Pfade und Repository-Namen enthalten. Du kannst die Daten hier prüfen und bearbeiten.',
                  'May contain local paths and repository names. You can review and edit the data here.',
                )}
              </p>
              {draft.diagnostics.status === 'loading' && (
                <p className="feedback-report-hint" role="status">
                  {tr('Diagnose wird geladen …', 'Loading diagnostics …')}
                </p>
              )}
              {draft.diagnostics.status === 'error' && (
                <>
                  <p className="feedback-report-error" role="alert">
                    {draft.diagnostics.error}
                  </p>
                  <div className="feedback-report-diagnostics-actions">
                    <Button size="xs" variant="ghost" onClick={draft.diagnostics.retry} disabled={disabled}>
                      {tr('Erneut laden', 'Retry')}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => draft.setIncludeDiagnostics(false)} disabled={disabled}>
                      {tr('Ohne Diagnose fortfahren', 'Continue without diagnostics')}
                    </Button>
                  </div>
                </>
              )}
              {draft.diagnostics.status === 'ready' && (
                <details className="feedback-report-details">
                  <summary>{tr('Diagnose ansehen und bearbeiten', 'View and edit diagnostics')}</summary>
                  <ReportTextarea
                    label={tr('Diagnosebericht', 'Diagnostics report')}
                    value={draft.diagnostics.value}
                    onChange={draft.diagnostics.edit}
                    rows={8}
                    maxLength={FEEDBACK_DIAGNOSTICS_MAX}
                    disabled={disabled}
                  />
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReportTextarea({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  maxLength = FEEDBACK_TEXT_MAX,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <label className="dialog-field">
      <span>{label}</span>
      <textarea rows={rows} maxLength={maxLength} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
