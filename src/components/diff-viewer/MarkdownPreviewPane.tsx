import { useI18n } from '../../i18n';
import type { MarkdownPreviewState } from './useMarkdownPreview';

type MarkdownPreviewPaneProps = {
  markdownPreview: MarkdownPreviewState;
  onPreviewClick: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export const MarkdownPreviewPane: React.FC<MarkdownPreviewPaneProps> = ({
  markdownPreview,
  onPreviewClick,
}) => {
  const { t } = useI18n();

  return (
    <div className="markdown-preview-scroll">
      {markdownPreview.loading && (
        <div className="markdown-preview-loading">
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              className="skeleton-line"
              style={{
                width: index % 3 === 0 ? '58%' : `${74 - (index % 4) * 8}%`,
                height: index === 0 ? 18 : 11,
                borderRadius: 4,
              }}
            />
          ))}
        </div>
      )}
      {!markdownPreview.loading && markdownPreview.error && (
        <div className="diff-empty-state error">{markdownPreview.error}</div>
      )}
      {!markdownPreview.loading && !markdownPreview.error && markdownPreview.html && (
        <article
          className="markdown-preview-content"
          onClick={onPreviewClick}
          dangerouslySetInnerHTML={{ __html: markdownPreview.html }}
        />
      )}
      {!markdownPreview.loading && !markdownPreview.error && !markdownPreview.html && (
        <div className="diff-empty-state">{t('generated.components.diff_viewer.markdownpreviewpane.markdown_file_is_empty_4443e82a')}</div>
      )}
    </div>
  );
};
