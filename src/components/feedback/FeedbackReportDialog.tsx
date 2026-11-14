import { useRef } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import type { FeedbackReportAreaDto, FeedbackReportCategoryDto } from '@/types/feedbackDtos';
import { FeedbackReportFields } from './FeedbackReportFields';
import { FeedbackReportReview } from './FeedbackReportReview';
import { useFeedbackReportDraft } from './useFeedbackReportDraft';
import { useFeedbackReportDelivery } from './useFeedbackReportDelivery';
import './feedbackReport.css';

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

export function FeedbackReportDialog({ request, onClose, onReported }: Props) {
  const { tr } = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draft = useFeedbackReportDraft(request);
  const delivery = useFeedbackReportDelivery((issue) => onReported(request.toastId, issue));
  const error = delivery.error && (
    <p className="feedback-report-error" role="alert">
      {delivery.error}
    </p>
  );
  if (delivery.result)
    return (
      <DialogFrame
        key="result"
        open
        title={tr('Bericht erstellt', 'Report created')}
        onClose={onClose}
        onConfirm={() => void delivery.openCreatedIssue()}
        confirmDisabled={delivery.busy}
        confirmLabel={tr(`Issue #${delivery.result.issueNumber} öffnen`, `Open issue #${delivery.result.issueNumber}`)}
        cancelLabel={tr('Schließen', 'Close')}
      >
        <p className="dialog-message">{tr('Das GitHub-Issue wurde erfolgreich erstellt.', 'The GitHub issue was created successfully.')}</p>
        {error}
      </DialogFrame>
    );

  if (delivery.fallbackOpened)
    return (
      <DialogFrame
        key="opened"
        open
        title={tr('GitHub-Formular geöffnet', 'GitHub form opened')}
        onClose={onClose}
        onConfirm={onClose}
        confirmLabel={tr('Fertig', 'Done')}
        cancelLabel={tr('Schließen', 'Close')}
      >
        <p className="dialog-message">
          {tr(
            'Das vorausgefüllte Formular wurde im Browser geöffnet. Prüfe die Angaben und sende die Meldung dort ab. Diagnosedaten wurden nicht in die URL übernommen.',
            'The prefilled form was opened in your browser. Review and submit the report there. Diagnostics were not included in the URL.',
          )}
        </p>
      </DialogFrame>
    );

  if (delivery.review)
    return (
      <DialogFrame
        key={`review-${delivery.review.preview.delivery}`}
        open
        title={tr('Meldung überprüfen', 'Review report')}
        onClose={delivery.back}
        cancelDisabled={delivery.busy}
        onConfirm={() => void delivery.submit()}
        confirmDisabled={delivery.busy}
        cancelLabel={tr('Zurück bearbeiten', 'Back to editing')}
        closeOnBackdrop={false}
        confirmLabel={
          delivery.busy
            ? tr('Wird gesendet …', 'Submitting …')
            : delivery.review.preview.delivery === 'browser'
              ? tr('Im Browser fortsetzen', 'Continue in browser')
              : tr('An GitHub senden', 'Submit to GitHub')
        }
      >
        {error}
        <FeedbackReportReview preview={delivery.review.preview} />
      </DialogFrame>
    );

  const review = () => {
    if (draft.valid) void delivery.prepare(draft.input());
  };
  return (
    <DialogFrame
      key="compose"
      open
      title={tr('Feedback & Fehlerbericht', 'Feedback & issue report')}
      onClose={delivery.busy ? () => {} : onClose}
      cancelDisabled={delivery.busy}
      onConfirm={review}
      onEnter={review}
      confirmLabel={delivery.busy ? tr('Übersicht wird erstellt …', 'Preparing review …') : tr('Meldung überprüfen', 'Review report')}
      confirmDisabled={!draft.valid || delivery.busy}
      cancelLabel={tr('Abbrechen', 'Cancel')}
      closeOnBackdrop={false}
      initialFocusRef={inputRef}
    >
      <FeedbackReportFields draft={draft} disabled={delivery.busy} initialFocusRef={inputRef} />
      {error}
    </DialogFrame>
  );
}
