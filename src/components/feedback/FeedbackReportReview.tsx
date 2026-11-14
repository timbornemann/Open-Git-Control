import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import type { FeedbackReportPreviewDto } from '@/types/feedbackDtos';
import { renderMarkdownToSanitizedHtml } from '@/utils/markdownPreview';
import { handleMarkdownPreviewClick } from '@/components/ui/markdownPreviewNavigation';
import '@/styles/markdown-preview.css';

export function FeedbackReportReview({ preview }: { preview: FeedbackReportPreviewDto }) {
  const { tr } = useI18n();
  const html = useMemo(() => renderMarkdownToSanitizedHtml(preview.body, { dataUrls: {}, missingLabel: tr('Bild', 'Image') }), [preview.body, tr]);
  return (
    <div className="feedback-report-review">
      <p className="feedback-report-hint">
        {tr('Diese Meldung wird als öffentliches GitHub-Issue veröffentlicht.', 'This report will be published as a public GitHub issue.')}
      </p>
      <div className="feedback-report-destination" onClick={handleMarkdownPreviewClick}>
        <span>{tr('Ziel', 'Destination')}</span>
        <a href={`${preview.repositoryUrl}/issues`}>timbornemann/Open-Git-Control</a>
      </div>
      <div className="feedback-report-review-title">
        <span>{tr('Titel', 'Title')}</span>
        <strong>{preview.title}</strong>
      </div>
      <p className="feedback-report-hint">
        {preview.delivery === 'browser'
          ? tr(
              'Du setzt die Meldung im vorausgefüllten GitHub-Formular fort. Diagnosedaten werden nicht in die Browser-URL übernommen.',
              'Continue in the prefilled GitHub form. Diagnostics are not included in the browser URL.',
            )
          : preview.diagnosticsIncluded
            ? tr('Diagnosebericht enthalten – die vollständigen Daten stehen unten.', 'Diagnostics included — the complete data is shown below.')
            : tr('Ohne Diagnosebericht.', 'No diagnostics attached.')}
      </p>
      {preview.truncated && (
        <p className="feedback-report-notice" role="status">
          {tr(
            'Für das Browserformular mussten Angaben gekürzt werden. Die folgende Übersicht zeigt die gekürzten Inhalte.',
            'Some details were shortened to fit the browser form. The overview below shows the shortened content.',
          )}
        </p>
      )}
      <article
        className="feedback-report-preview markdown-preview-content"
        aria-label={tr('Vollständiger Meldungsinhalt', 'Complete report content')}
        onClick={handleMarkdownPreviewClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
