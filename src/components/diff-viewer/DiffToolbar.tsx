import { ChevronLeft, ChevronRight, Columns, Eye, FileText, LayoutList, X } from 'lucide-react';
import type { DiffRequest } from '../../types/diff';
import type { DiffViewMode } from '../../utils/diffParser';
import { useI18n } from '../../i18n';
import { readableSourceLabel } from './diffViewerLabels';

type DiffToolbarProps = {
  request: DiffRequest;
  viewMode: DiffViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<DiffViewMode>>;
  isMarkdownFile: boolean;
  isMarkdownPreviewMode: boolean;
  canRenderText: boolean;
  showBlame: boolean;
  setShowBlame: React.Dispatch<React.SetStateAction<boolean>>;
  isBlameLoading: boolean;
  hunkCount: number;
  activeHunkIndex: number;
  scrollToHunk: (index: number) => void;
  onClose: () => void;
};

export const DiffToolbar: React.FC<DiffToolbarProps> = ({
  request,
  viewMode,
  setViewMode,
  isMarkdownFile,
  isMarkdownPreviewMode,
  canRenderText,
  showBlame,
  setShowBlame,
  isBlameLoading,
  hunkCount,
  activeHunkIndex,
  scrollToHunk,
  onClose,
}) => {
  const { tr } = useI18n();

  return (
    <div className="diff-viewer-toolbar">
      <div className="diff-title-wrap">
        <div className="diff-title">{request.title || request.path}</div>
        <div className="diff-subtitle">{readableSourceLabel(request, tr)} | {request.path}</div>
      </div>

      <div className="diff-toolbar-actions">
        <div className="diff-toggle-group">
          <button
            className={`diff-toggle-btn ${viewMode === 'unified' ? 'active' : ''}`}
            onClick={() => setViewMode('unified')}
            title={tr('Unified Diff', 'Unified diff')}
            disabled={!canRenderText}
          >
            <LayoutList size={14} /> {tr('Unified', 'Unified')}
          </button>
          <button
            className={`diff-toggle-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
            onClick={() => setViewMode('side-by-side')}
            title={tr('Side-by-Side Diff', 'Side-by-side diff')}
            disabled={!canRenderText}
          >
            <Columns size={14} /> {tr('Side-by-Side', 'Side-by-side')}
          </button>
          <button
            className={`diff-toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => setViewMode('preview')}
            title={tr('Markdown-Vorschau', 'Markdown preview')}
            disabled={!isMarkdownFile}
          >
            <FileText size={14} /> {tr('Vorschau', 'Preview')}
          </button>
        </div>

        <button
          className={`diff-toggle-btn ${showBlame ? 'active' : ''}`}
          onClick={() => setShowBlame(!showBlame)}
          title={tr('Git Blame einblenden', 'Show Git Blame')}
          disabled={!canRenderText || isMarkdownPreviewMode}
          style={{ borderRadius: '6px', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          {isBlameLoading ? <span className="spinner-mini" /> : <Eye size={14} />}
          {tr('Blame', 'Blame')}
        </button>

        {!isMarkdownPreviewMode && (
          <div className="diff-nav-group">
            <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex - 1)} disabled={hunkCount === 0}>
              <ChevronLeft size={14} />
            </button>
            <span className="diff-nav-label">{tr('Hunk', 'Hunk')} {hunkCount === 0 ? 0 : activeHunkIndex + 1}/{hunkCount}</span>
            <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex + 1)} disabled={hunkCount === 0}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <button className="diff-close-btn" onClick={onClose} title={tr('Diff schliessen', 'Close diff')}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
