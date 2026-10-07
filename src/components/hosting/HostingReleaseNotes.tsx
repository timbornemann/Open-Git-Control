import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import { MarkdownPreviewPane } from '@/components/diff-viewer/MarkdownPreviewPane';
import { handleMarkdownPreviewClick } from '@/components/ui/markdownPreviewNavigation';
import { applyMarkdownPreviewImageDataUrls, renderMarkdownToSanitizedHtml } from '@/utils/markdownPreview';
import '@/styles/markdown-preview.css';

export function HostingReleaseNotes({ body }: { body?: string }) {
  const { tr } = useI18n();
  const html = useMemo(() => applyMarkdownPreviewImageDataUrls(renderMarkdownToSanitizedHtml(body || ''), {}, true), [body]);
  return (
    <div className="hosting-release-notes">
      <MarkdownPreviewPane
        markdownPreview={{ loading: false, error: null, html }}
        onPreviewClick={handleMarkdownPreviewClick}
        emptyMessage={tr('Für diese Version sind keine Release Notes hinterlegt.', 'No release notes are available for this version.')}
      />
    </div>
  );
}
