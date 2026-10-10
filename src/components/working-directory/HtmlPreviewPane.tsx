import type { HtmlPreviewState } from './useHtmlPreview';

export const HtmlPreviewPane: React.FC<{ preview: HtmlPreviewState; title: string }> = ({ preview, title }) => {
  if (preview.loading) return <div className="working-file-viewer__html-loading">Preparing isolated preview…</div>;
  if (preview.error && !preview.url) return <div className="working-file-viewer__empty working-file-viewer__empty--error">{preview.error}</div>;

  return (
    <div className="working-file-viewer__html-preview">
      {preview.error && <div className="file-viewer-notice">{preview.error}</div>}
      <iframe title={title} className="working-file-viewer__html-frame" sandbox="allow-scripts" referrerPolicy="no-referrer" src={preview.url || undefined} />
    </div>
  );
};
