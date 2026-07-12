import React from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { appClient } from '@/services/appClient';
import { FEEDBACK_REPORT_AREAS, type FeedbackReportAreaDto, type FeedbackReportCategoryDto, type FeedbackReportInputDto } from '@/types/feedbackDtos';
import { useI18n } from '@/i18n';

export type FeedbackDialogRequest = {
  category: FeedbackReportCategoryDto;
  source: 'settings' | 'error-toast';
  area?: FeedbackReportAreaDto;
  errorMessage?: string;
  toastId?: number;
};

type Props = {
  request: FeedbackDialogRequest;
  onClose: () => void;
  onReported: (toastId: number | undefined, issue: { issueNumber: number; htmlUrl: string }) => void;
};

const firstLine = (value: string): string =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';

export const FeedbackReportDialog: React.FC<Props> = ({ request, onClose, onReported }) => {
  const { tr } = useI18n();
  const [category, setCategory] = React.useState<FeedbackReportCategoryDto>(request.category);
  const [title, setTitle] = React.useState(() => firstLine(request.errorMessage || '').slice(0, 140));
  const [area, setArea] = React.useState<FeedbackReportAreaDto>(request.area || 'Other');
  const [steps, setSteps] = React.useState('');
  const [expected, setExpected] = React.useState('');
  const [actual, setActual] = React.useState(request.errorMessage || '');
  const [problem, setProblem] = React.useState('');
  const [desiredWorkflow, setDesiredWorkflow] = React.useState('');
  const [proposal, setProposal] = React.useState('');
  const [value, setValue] = React.useState('');
  const [question, setQuestion] = React.useState('');
  const [context, setContext] = React.useState('');
  const [tried, setTried] = React.useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = React.useState(true);
  const [diagnostics, setDiagnostics] = React.useState('');
  const [diagnosticsLoading, setDiagnosticsLoading] = React.useState(false);
  const diagnosticsAttemptedRef = React.useRef(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ issueNumber: number; htmlUrl: string } | null>(null);
  const [fallbackOpened, setFallbackOpened] = React.useState(false);

  React.useEffect(() => {
    if (category !== 'bug' || !includeDiagnostics || diagnosticsAttemptedRef.current || !appClient.isAvailable()) return;
    let active = true;
    diagnosticsAttemptedRef.current = true;
    setDiagnosticsLoading(true);
    void appClient
      .getDiagnosticsReport()
      .then((report) => {
        if (!active) return;
        if (report.success) setDiagnostics(report.data.report);
        else setError(report.error);
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(loadError instanceof Error ? loadError.message : tr('Diagnosebericht konnte nicht geladen werden.', 'Could not load diagnostics report.'));
      })
      .finally(() => {
        if (active) setDiagnosticsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, includeDiagnostics, tr]);

  const isValid = Boolean(
    title.trim() &&
    (category === 'bug'
      ? steps.trim() && expected.trim() && actual.trim()
      : category === 'feature'
        ? problem.trim() && desiredWorkflow.trim() && proposal.trim() && value.trim()
        : question.trim() && context.trim()),
  );

  const buildInput = (): FeedbackReportInputDto => {
    const base = { title, area, source: request.source, submissionMode: 'manual' as const };
    if (category === 'bug') return { ...base, category, steps, expected, actual, ...(includeDiagnostics && diagnostics ? { diagnostics } : {}) };
    if (category === 'feature') return { ...base, category, problem, desiredWorkflow, proposal, value };
    return { ...base, category, question, context, ...(tried.trim() ? { tried } : {}) };
  };

  const submit = async () => {
    if (!isValid || submitting || !appClient.isAvailable()) return;
    setSubmitting(true);
    setError(null);
    try {
      const submission = await appClient.submitFeedbackReport(buildInput());
      if (submission.success) {
        setResult(submission.data);
        onReported(request.toastId, submission.data);
        return;
      }
      if (submission.fallbackUrl) {
        const opened = await appClient.openExternalUrl(submission.fallbackUrl);
        if (!opened.success) {
          setError(opened.error || submission.error);
          return;
        }
        setFallbackOpened(true);
        return;
      }
      setError(submission.error);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : tr('Bericht konnte nicht gesendet werden.', 'Could not submit report.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openCreatedIssue = async () => {
    if (!result) return;
    const opened = await appClient.openExternalUrl(result.htmlUrl);
    if (!opened.success) setError(opened.error || tr('Issue konnte nicht geöffnet werden.', 'Could not open issue.'));
  };

  if (result) {
    return (
      <DialogFrame
        open
        title={tr('Bericht erstellt', 'Report created')}
        onClose={onClose}
        onConfirm={() => void openCreatedIssue()}
        confirmLabel={tr(`Issue #${result.issueNumber} öffnen`, `Open issue #${result.issueNumber}`)}
        cancelLabel={tr('Schließen', 'Close')}
      >
        <p className="dialog-message">{tr('Das GitHub-Issue wurde erfolgreich erstellt.', 'The GitHub issue was created successfully.')}</p>
        {error && <p className="feedback-report-error">{error}</p>}
      </DialogFrame>
    );
  }

  if (fallbackOpened) {
    return (
      <DialogFrame open title={tr('GitHub-Formular geöffnet', 'GitHub form opened')} onClose={onClose} onConfirm={onClose} confirmLabel={tr('Fertig', 'Done')}>
        <p className="dialog-message">
          {tr(
            'Die vorausgefüllte GitHub-Issue-Form wurde im Browser geöffnet. Bitte prüfe die Angaben und sende sie dort ab. Diagnosedaten wurden nicht in die URL übernommen.',
            'The prefilled GitHub issue form was opened in your browser. Review and submit it there. Diagnostics were not included in the URL.',
          )}
        </p>
      </DialogFrame>
    );
  }

  return (
    <DialogFrame
      open
      title={tr('Feedback & Fehlerbericht', 'Feedback & issue report')}
      onClose={onClose}
      onConfirm={() => void submit()}
      onEnter={() => void submit()}
      confirmLabel={submitting ? tr('Wird gesendet…', 'Submitting…') : tr('An GitHub senden', 'Submit to GitHub')}
      confirmDisabled={!isValid || submitting || diagnosticsLoading}
      cancelLabel={tr('Abbrechen', 'Cancel')}
      closeOnBackdrop={false}
    >
      <div className="feedback-report-form">
        <label className="dialog-field">
          <span>{tr('Meldeart', 'Report type')}</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as FeedbackReportCategoryDto)}>
            <option value="bug">{tr('Fehler', 'Bug')}</option>
            <option value="feature">{tr('Idee oder Wunsch', 'Idea or feature')}</option>
            <option value="question">{tr('Frage', 'Question')}</option>
          </select>
        </label>
        <label className="dialog-field">
          <span>{tr('Titel', 'Title')}</span>
          <input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="dialog-field">
          <span>{tr('Betroffener Bereich', 'Affected area')}</span>
          <select value={area} onChange={(event) => setArea(event.target.value as FeedbackReportAreaDto)}>
            {FEEDBACK_REPORT_AREAS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {category === 'bug' && (
          <>
            <ReportTextarea label={tr('Schritte zum Reproduzieren', 'Steps to reproduce')} value={steps} onChange={setSteps} />
            <ReportTextarea label={tr('Erwartetes Verhalten', 'Expected behavior')} value={expected} onChange={setExpected} />
            <ReportTextarea label={tr('Tatsächliches Verhalten', 'Actual behavior')} value={actual} onChange={setActual} />
            <label className="feedback-report-diagnostics-toggle">
              <input type="checkbox" checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} />
              {tr('Diagnoseinformationen anhängen', 'Attach diagnostics')}
            </label>
            {includeDiagnostics && (
              <>
                <p className="feedback-report-privacy-warning">
                  {tr(
                    'Diese Angaben werden öffentlich. Der bereinigte Bericht kann trotzdem lokale Pfade, Repository-Namen oder Dateinamen enthalten. Bitte vor dem Senden prüfen.',
                    'This information will be public. The sanitized report may still contain local paths, repository names, or file names. Review it before submitting.',
                  )}
                </p>
                <ReportTextarea
                  label={diagnosticsLoading ? tr('Diagnose wird geladen…', 'Loading diagnostics…') : tr('Editierbare Diagnose', 'Editable diagnostics')}
                  value={diagnostics}
                  onChange={setDiagnostics}
                  rows={8}
                />
              </>
            )}
          </>
        )}

        {category === 'feature' && (
          <>
            <ReportTextarea label={tr('Problem oder Chance', 'Problem or opportunity')} value={problem} onChange={setProblem} />
            <ReportTextarea label={tr('Gewünschter Ablauf', 'Desired workflow')} value={desiredWorkflow} onChange={setDesiredWorkflow} />
            <ReportTextarea label={tr('Lösungsvorschlag', 'Proposed solution')} value={proposal} onChange={setProposal} />
            <ReportTextarea label={tr('Nutzen', 'User value')} value={value} onChange={setValue} />
          </>
        )}

        {category === 'question' && (
          <>
            <ReportTextarea label={tr('Frage', 'Question')} value={question} onChange={setQuestion} />
            <ReportTextarea label={tr('Kontext', 'Context')} value={context} onChange={setContext} />
            <ReportTextarea label={tr('Bereits versucht (optional)', 'Already tried (optional)')} value={tried} onChange={setTried} />
          </>
        )}
        {error && <p className="feedback-report-error">{error}</p>}
      </div>
    </DialogFrame>
  );
};

const ReportTextarea = ({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) => (
  <label className="dialog-field">
    <span>{label}</span>
    <textarea rows={rows} maxLength={20_000} value={value} onChange={(event) => onChange(event.target.value)} />
  </label>
);
