import { FileWarning } from 'lucide-react';
import type { DiffRequest } from '@/types/diff';
import type { GitFileBlameLineDto } from '@/types/git';
import { sideBySideRows, type DiffViewMode, type ParsedDiff, type ParsedHunk, type ParsedLine } from '@/utils/diffParser';
import { useDiffSyntaxHighlighting } from '@/hooks/useDiffSyntaxHighlighting';
import { useI18n } from '@/i18n';
import { MAX_RENDER_LINES, MAX_SINGLE_LINE_LENGTH } from './diffViewerConstants';
import { DiffBlameCell } from './DiffBlameCell';
import type { HunkPatchOperation } from './useHunkPatchActions';

type DiffContentPaneProps = {
  request: DiffRequest;
  viewMode: DiffViewMode;
  diffText: string;
  isLoading: boolean;
  error: string | null;
  parsed: ParsedDiff;
  canRenderText: boolean;
  isBinaryDiff: boolean;
  looksBinaryByExt: boolean;
  isTooLarge: boolean;
  sourceTruncated: boolean;
  activeHunkIndex: number;
  setHunkRef: (index: number, element: HTMLDivElement | null) => void;
  scrollToHunk: (index: number) => void;
  isHunkOperationRunning: boolean;
  applyHunk: (hunk: ParsedHunk, fileHeader: string[], op: HunkPatchOperation) => void;
  onRepoChanged?: () => void;
  showBlame: boolean;
  isBlameLoading: boolean;
  blameMap: Map<number, GitFileBlameLineDto>;
  onNavigateToCommit?: (hash: string) => void;
};

export const DiffContentPane: React.FC<DiffContentPaneProps> = ({
  request,
  viewMode,
  diffText,
  isLoading,
  error,
  parsed,
  canRenderText,
  isBinaryDiff,
  looksBinaryByExt,
  isTooLarge,
  sourceTruncated,
  activeHunkIndex,
  setHunkRef,
  scrollToHunk,
  isHunkOperationRunning,
  applyHunk,
  onRepoChanged,
  showBlame,
  isBlameLoading,
  blameMap,
  onNavigateToCommit,
}) => {
  const { t, tr } = useI18n();
  const { highlightLine } = useDiffSyntaxHighlighting();

  const renderBlameCell = (line: ParsedLine, prevLine?: ParsedLine, side: 'left' | 'right' = 'right') => (
    <DiffBlameCell
      line={line}
      prevLine={prevLine}
      side={side}
      showBlame={showBlame}
      isBlameLoading={isBlameLoading}
      blameMap={blameMap}
      onNavigateToCommit={onNavigateToCommit}
    />
  );

  const renderUnifiedLine = (line: ParsedLine, key: string, prevLine?: ParsedLine) => {
    const lineClass = line.type === 'add' ? 'diff-line add' : line.type === 'del' ? 'diff-line del' : 'diff-line ctx';

    const gridStyle = showBlame ? { gridTemplateColumns: '220px 52px 52px minmax(0, 1fr)' } : undefined;

    return (
      <div key={key} className={lineClass} style={gridStyle}>
        {renderBlameCell(line, prevLine)}
        <span className="diff-lineno">{line.leftNo ?? ''}</span>
        <span className="diff-lineno">{line.rightNo ?? ''}</span>
        <span className="diff-code" title={line.text}>
          {highlightLine(line.text)}
        </span>
      </div>
    );
  };

  const renderSideBySideLine = (line: ParsedLine, key: string, prevLine?: ParsedLine) => {
    const textStr = line.text || '';
    const sbsGridStyle = showBlame ? { gridTemplateColumns: '180px 52px minmax(0, 1fr)' } : undefined;

    if (line.type === 'context') {
      // A modified line (a deletion paired with an addition) reaches this branch
      // as a single row whose left and right text are joined by the \x1f
      // delimiter from sideBySideRows. Genuine unchanged context has no
      // delimiter. Highlight the two differing sides as deletion/addition so a
      // modified line is not mistaken for an unchanged one.
      const isModifiedLine = textStr.includes('\x1f');
      const [leftText = '', rightText = leftText] = textStr.split('\x1f');
      const leftCellClass = isModifiedLine ? 'diff-sbs-cell del' : 'diff-sbs-cell ctx';
      const rightCellClass = isModifiedLine ? 'diff-sbs-cell add' : 'diff-sbs-cell ctx';
      return (
        <div key={key} className="diff-sbs-row">
          <div className={leftCellClass} style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'left')}
            <span className="diff-lineno">{line.leftNo ?? ''}</span>
            <span className="diff-code" title={leftText}>
              {highlightLine(leftText)}
            </span>
          </div>
          <div className={rightCellClass} style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'right')}
            <span className="diff-lineno">{line.rightNo ?? ''}</span>
            <span className="diff-code" title={rightText}>
              {highlightLine(rightText)}
            </span>
          </div>
        </div>
      );
    }

    if (line.type === 'del') {
      const [leftText = ''] = textStr.split('\x1f');
      return (
        <div key={key} className="diff-sbs-row">
          <div className="diff-sbs-cell del" style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'left')}
            <span className="diff-lineno">{line.leftNo ?? ''}</span>
            <span className="diff-code" title={leftText}>
              {highlightLine(leftText)}
            </span>
          </div>
          <div className="diff-sbs-cell empty" style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'right')}
            <span className="diff-lineno"> </span>
            <span className="diff-code"> </span>
          </div>
        </div>
      );
    }

    const [, rightText = ''] = textStr.split('\x1f');
    return (
      <div key={key} className="diff-sbs-row">
        <div className="diff-sbs-cell empty" style={sbsGridStyle}>
          {renderBlameCell(line, prevLine, 'left')}
          <span className="diff-lineno"> </span>
          <span className="diff-code"> </span>
        </div>
        <div className="diff-sbs-cell add" style={sbsGridStyle}>
          {renderBlameCell(line, prevLine, 'right')}
          <span className="diff-lineno">{line.rightNo ?? ''}</span>
          <span className="diff-code" title={rightText}>
            {highlightLine(rightText)}
          </span>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {Array.from({ length: 10 }).map((_, index) => {
          const isAdd = index % 5 === 1;
          const isDel = index % 5 === 3;
          return (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 1 - index * 0.07 }}>
              <div className="skeleton-line" style={{ width: 28, height: 9, borderRadius: 3, flexShrink: 0, opacity: 0.5 }} />
              <div
                className="skeleton-line"
                style={{
                  height: 9,
                  width: `${30 + ((index * 7) % 55)}%`,
                  borderRadius: 3,
                  background: isAdd ? 'rgba(79,174,148,0.2)' : isDel ? 'rgba(211,93,105,0.2)' : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (error) {
    return <div className="diff-empty-state error">{error}</div>;
  }

  if (!diffText.trim()) {
    return <div className="diff-empty-state">{t('generated.components.diff_viewer.diffcontentpane.no_differences_found_e10fb9f5')}</div>;
  }

  if (!canRenderText) {
    return (
      <div className="diff-empty-state warning">
        <FileWarning size={18} />
        <span>
          {isBinaryDiff || looksBinaryByExt
            ? t('generated.components.diff_viewer.diffcontentpane.binary_file_detected_text_diff_is_not_shown_bcfe2843')
            : t('generated.components.diff_viewer.diffcontentpane.this_file_cannot_be_shown_as_text_diff_e0948ac7')}
        </span>
      </div>
    );
  }

  return (
    <div className="diff-content-scroll">
      {isTooLarge && (
        <div className="diff-large-warning">
          <span>
            {tr(
              `Grosser Diff: ${diffText.split('\n').length.toLocaleString()} Zeilen - Anzeige auf ${MAX_RENDER_LINES.toLocaleString()} Zeilen gekuerzt.`,
              `Large diff: ${diffText.split('\n').length.toLocaleString()} lines - display truncated to ${MAX_RENDER_LINES.toLocaleString()} lines.`,
            )}
          </span>
          {!sourceTruncated && (
            <button
              className="diff-large-warning-copy"
              onClick={() => navigator.clipboard.writeText(diffText)}
              title={t('generated.components.diff_viewer.diffcontentpane.copy_full_diff_to_clipboard_b6bbbdde')}
            >
              {t('generated.components.diff_viewer.diffcontentpane.copy_full_diff_5abd77b2')}
            </button>
          )}
        </div>
      )}

      {parsed.fileHeader.length > 0 && (
        <div className="diff-file-header">
          {parsed.fileHeader.map((line, index) => (
            <div key={`head-${index}`} className="diff-header-line">
              {line}
            </div>
          ))}
        </div>
      )}

      {parsed.hunks.length === 0 && (
        <div className="diff-empty-state">{t('generated.components.diff_viewer.diffcontentpane.no_hunk_data_available_3c3c1467')}</div>
      )}

      {parsed.hunks.map((hunk, hunkIndex) => {
        const rows = viewMode === 'side-by-side' ? sideBySideRows(hunk.rows) : hunk.rows;
        const canStageHunks = !!onRepoChanged && !isTooLarge && (request.source === 'staged' || request.source === 'unstaged');
        return (
          <div key={hunk.id} className={`diff-hunk ${activeHunkIndex === hunkIndex ? 'active' : ''}`} ref={(element) => setHunkRef(hunkIndex, element)}>
            <div className="diff-hunk-header-row">
              <button className="diff-hunk-header" onClick={() => scrollToHunk(hunkIndex)}>
                {hunk.header}
              </button>
              {canStageHunks && (
                <div className="diff-hunk-actions">
                  {request.source === 'unstaged' && (
                    <>
                      <button
                        className="diff-hunk-action-btn"
                        disabled={isHunkOperationRunning}
                        onClick={() => applyHunk(hunk, parsed.fileHeader, 'stage')}
                        title={t('generated.components.diff_viewer.diffcontentpane.stage_this_hunk_c97d4d48')}
                      >
                        {t('generated.components.diff_viewer.diffcontentpane.stage_a304b800')}
                      </button>
                      <button
                        className="diff-hunk-action-btn diff-hunk-action-btn--danger"
                        disabled={isHunkOperationRunning}
                        onClick={() => applyHunk(hunk, parsed.fileHeader, 'discard')}
                        title={t('generated.components.diff_viewer.diffcontentpane.discard_changes_in_this_hunk_b3969326')}
                      >
                        {t('generated.components.diff_viewer.diffcontentpane.discard_23504c1c')}
                      </button>
                    </>
                  )}
                  {request.source === 'staged' && (
                    <button
                      className="diff-hunk-action-btn"
                      disabled={isHunkOperationRunning}
                      onClick={() => applyHunk(hunk, parsed.fileHeader, 'unstage')}
                      title={t('generated.components.diff_viewer.diffcontentpane.unstage_this_hunk_0ac01911')}
                    >
                      {t('generated.components.diff_viewer.diffcontentpane.unstage_80442576')}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={viewMode === 'side-by-side' ? 'diff-sbs-wrap' : 'diff-unified-wrap'}>
              {rows.map((line, lineIndex) => {
                const clippedText = line.text.length > MAX_SINGLE_LINE_LENGTH ? `${line.text.slice(0, MAX_SINGLE_LINE_LENGTH)} ...` : line.text;
                const normalizedLine = { ...line, text: clippedText };
                const key = `${hunk.id}-${lineIndex}`;
                const prevLine = lineIndex > 0 ? rows[lineIndex - 1] : undefined;
                return viewMode === 'side-by-side' ? renderSideBySideLine(normalizedLine, key, prevLine) : renderUnifiedLine(normalizedLine, key, prevLine);
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
