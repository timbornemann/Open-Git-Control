import type { HtmlPreviewState } from './useHtmlPreview';

export const HtmlPreviewPane: React.FC<{ preview: HtmlPreviewState; title: string }> = ({ preview, title }) => {
  if (preview.loading) return <div className="working-file-viewer__html-loading">Preparing isolated preview…</div>;
  if (preview.error) return <div className="working-file-viewer__empty working-file-viewer__empty--error">{preview.error}</div>;

  return (
    <div className="working-file-viewer__html-preview">
      <iframe title={title} className="working-file-viewer__html-frame" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview.document} />
    </div>
  );
};
